import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createRecipeRepository } from '../src/recipes/recipeRepository.js';
import { createMockProvider } from '../src/vision/mock.js';
import { createVisionProvider } from '../src/vision/index.js';
import { HttpError } from '../src/errors.js';
import { detectImageType } from '../src/routes/recognize.js';
import { testConfig, silentLogger } from './helpers.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)]);

let repository;
beforeAll(async () => {
  repository = createRecipeRepository();
  await repository.load();
});

function makeApp({ vision, env = {} } = {}) {
  const config = testConfig(env);
  return createApp({
    config,
    logger: silentLogger,
    repository,
    vision: vision ?? createMockProvider({ getIngredientNames: () => repository.getIngredientNames(), delayMs: 0 }),
  });
}

const fakeVision = (recognize, check = async () => ({ ok: true })) => ({ name: 'fake', model: 'fake-model', recognize, check });

describe('POST /api/recognize', () => {
  it('riconosce gli ingredienti da una foto JPEG (mock)', async () => {
    const res = await request(makeApp()).post('/api/recognize').attach('image', JPEG, { filename: 'frigo.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.model).toBe('mock');
    expect(typeof res.body.durationMs).toBe('number');
    expect(res.body.ingredients.length).toBeGreaterThan(0);
    const names = new Set(repository.getIngredientNames());
    for (const name of res.body.ingredients) expect(names.has(name)).toBe(true);
  });

  it.each([['png', PNG, 'image/png'], ['webp', WEBP, 'image/webp']])('accetta %s', async (_n, buffer, contentType) => {
    const res = await request(makeApp()).post('/api/recognize').attach('image', buffer, { filename: 'x', contentType });
    expect(res.status).toBe(200);
  });

  it('400 se manca la foto', async () => {
    const res = await request(makeApp()).post('/api/recognize').field('altro', 'x');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IMAGE_REQUIRED');
  });

  it('400 se la foto è in un campo diverso', async () => {
    const res = await request(makeApp()).post('/api/recognize').attach('foto', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
  });

  it('413 se la foto è troppo grande', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(1024 * 1024 + 10)]);
    const res = await request(makeApp({ env: { MAX_IMAGE_MB: '1' } }))
      .post('/api/recognize')
      .attach('image', big, { filename: 'big.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(413);
    expect(res.body.error.message).toContain('1 MB');
  });

  it('415 se il tipo dichiarato non è un\'immagine supportata', async () => {
    const res = await request(makeApp()).post('/api/recognize').attach('image', Buffer.from('ciao'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(415);
  });

  it('415 se il contenuto non è davvero un\'immagine', async () => {
    const res = await request(makeApp()).post('/api/recognize').attach('image', Buffer.from('non sono un jpeg'), { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it.each([
    [504, 'VISION_TIMEOUT'],
    [502, 'VISION_UNAVAILABLE'],
  ])('propaga l\'errore %i del modello', async (status, code) => {
    const vision = fakeVision(async () => {
      throw new HttpError(status, code, 'messaggio');
    });
    const res = await request(makeApp({ vision })).post('/api/recognize').attach('image', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(status);
    expect(res.body.error).toEqual({ code, message: 'messaggio' });
  });

  it('500 generico per errori imprevisti, senza dettagli interni', async () => {
    const vision = fakeVision(async () => {
      throw new Error('segreto interno');
    });
    const res = await request(makeApp({ vision })).post('/api/recognize').attach('image', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(500);
    expect(res.body.error.message).not.toContain('segreto');
  });

  it('passa al provider il contenuto della foto', async () => {
    const recognize = vi.fn(async () => ({ ingredients: ['uova'], model: 'fake-model' }));
    await request(makeApp({ vision: fakeVision(recognize) })).post('/api/recognize').attach('image', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(recognize.mock.calls[0][0].equals(JPEG)).toBe(true);
  });

  it('429 oltre il limite di richieste al minuto', async () => {
    const app = makeApp({ env: { RATE_LIMIT_PER_MIN: '2' } });
    const send = () => request(app).post('/api/recognize').attach('image', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const res = await send();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('GET /api/health/model', () => {
  it('200 con il provider mock', async () => {
    const res = await request(makeApp()).get('/api/health/model');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', provider: 'mock' });
  });

  it('503 se il modello non risponde', async () => {
    const vision = fakeVision(async () => ({}), async () => ({ ok: false, reason: 'Ollama non raggiungibile' }));
    const res = await request(makeApp({ vision })).get('/api/health/model');
    expect(res.status).toBe(503);
    expect(res.body.reason).toBe('Ollama non raggiungibile');
  });

  it('con provider ollama interroga /api/tags (Ollama simulato)', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ models: [{ name: 'qwen3-vl:2b' }] })));
    const config = testConfig({ VISION_PROVIDER: 'ollama', VISION_MODEL: 'qwen3-vl:2b' });
    const vision = createVisionProvider(config, repository, { fetch });
    const app = createApp({ config, logger: silentLogger, repository, vision });
    const res = await request(app).get('/api/health/model');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: 'ollama', model: 'qwen3-vl:2b' });
  });
});

describe('detectImageType', () => {
  it('riconosce i formati dai primi byte', () => {
    expect(detectImageType(JPEG)).toBe('image/jpeg');
    expect(detectImageType(PNG)).toBe('image/png');
    expect(detectImageType(WEBP)).toBe('image/webp');
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
  });
});
