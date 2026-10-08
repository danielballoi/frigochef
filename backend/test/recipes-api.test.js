import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createRecipeRepository } from '../src/recipes/recipeRepository.js';
import { testConfig, silentLogger } from './helpers.js';

let app;
beforeAll(async () => {
  const repository = createRecipeRepository();
  await repository.load();
  app = createApp({ config: testConfig({ PANTRY_DEFAULT: 'sale,pepe', MAX_PHOTOS: '5' }), logger: silentLogger, repository });
});

describe('GET /api/config', () => {
  it('espone dispensa predefinita e limiti', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pantryDefault: ['sale', 'pepe'], maxPhotos: 5, maxImageMb: 5, visionTimeoutMs: 90000 });
  });
});

describe('GET /api/ready', () => {
  it('200 con l\'archivio caricato', async () => {
    expect((await request(app).get('/api/ready')).status).toBe(200);
  });
});

describe('GET /api/ingredients', () => {
  it('suggerisce dal vocabolario ("zuc" → zucchine, zucca)', async () => {
    const res = await request(app).get('/api/ingredients').query({ q: 'zuc' });
    expect(res.status).toBe(200);
    const names = res.body.ingredients.map((i) => i.nome);
    expect(names).toContain('zucchine');
    expect(names).toContain('zucca');
    expect(names).not.toContain('pomodoro');
  });

  it('trova anche tramite sinonimi e restituisce il nome canonico', async () => {
    const res = await request(app).get('/api/ingredients').query({ q: 'pomodorin' });
    expect(res.body.ingredients[0].nome).toBe('pomodoro');
  });

  it('rispetta il limite', async () => {
    const res = await request(app).get('/api/ingredients').query({ q: 'a', limit: 3 });
    expect(res.body.ingredients).toHaveLength(3);
  });

  it('senza q restituisce il vocabolario (fino al limite)', async () => {
    const res = await request(app).get('/api/ingredients').query({ limit: 200 });
    expect(res.body.ingredients.length).toBeGreaterThan(100);
  });

  it('400 con parametri non validi', async () => {
    const res = await request(app).get('/api/ingredients').query({ q: 'x'.repeat(41) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('nessun risultato per testo sconosciuto', async () => {
    const res = await request(app).get('/api/ingredients').query({ q: 'xyzxyz' });
    expect(res.body.ingredients).toEqual([]);
  });
});

describe('POST /api/recipes', () => {
  it('restituisce ricette ordinate con gli ingredienti mancanti', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .send({
        ingredients: ['uova', 'Zucchina', 'cipolla', 'parmigiano'],
        pantry: ['sale', 'pepe', "olio d'oliva"],
      });
    expect(res.status).toBe(200);
    expect(res.body.ingredients).toEqual(['uova', 'zucchine', 'cipolla', 'parmigiano']);
    const { recipes } = res.body;
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes.length).toBeLessThanOrEqual(10);
    expect(recipes[0].mancanti).toEqual([]);
    expect(recipes.map((r) => r.id)).toContain('frittata-di-zucchine');
    const missing = recipes.map((r) => r.mancanti.length);
    expect(missing).toEqual([...missing].sort((a, b) => a - b));
    for (const r of recipes) {
      expect(r).toHaveProperty('passaggi');
      expect(r.mancanti.length).toBeLessThanOrEqual(2);
    }
  });

  it('elenca gli ingredienti ignorati perché sconosciuti', async () => {
    const res = await request(app).post('/api/recipes').send({ ingredients: ['uova', 'tartufo'] });
    expect(res.status).toBe(200);
    expect(res.body.ignored).toEqual(['tartufo']);
  });

  it('lista vuota se nulla è realizzabile', async () => {
    const res = await request(app).post('/api/recipes').send({ ingredients: ['tartufo'] });
    expect(res.status).toBe(200);
    expect(res.body.recipes).toEqual([]);
  });

  it.each([
    [{}],
    [{ ingredients: [] }],
    [{ ingredients: 'uova' }],
    [{ ingredients: [42] }],
    [{ ingredients: ['uova'], pantry: 'sale' }],
    [{ ingredients: ['x'.repeat(61)] }],
  ])('400 per corpo non valido %o', async (body) => {
    const res = await request(app).post('/api/recipes').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it.each([
    [{ ingredients: [''] }],
    [{ ingredients: [42] }],
    [{ ingredients: 'uova' }],
  ])('messaggio di errore in italiano per %o', async (body) => {
    const res = await request(app).post('/api/recipes').send(body);
    expect(res.body.error.message).not.toMatch(/invalid|expected|received|too small/i);
    expect(res.body.error.message).toMatch(/non valid|troppo|atteso|attes/i);
  });

  it('400 per JSON non valido', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Content-Type', 'application/json')
      .send('{"ingredients": [');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('archivio non ancora caricato', () => {
  it('503 sulle route che ne hanno bisogno', async () => {
    const notLoaded = createApp({
      config: testConfig(),
      logger: silentLogger,
      repository: createRecipeRepository(),
    });
    const res = await request(notLoaded).post('/api/recipes').send({ ingredients: ['uova'] });
    expect(res.status).toBe(503);
  });

  it('load() fallisce se i dati non sono validi', async () => {
    const repository = createRecipeRepository({
      loadFiles: async () => ({ recipes: [], vocabulary: [{ nome: 'uova', categoria: 'uova', sinonimi: [] }] }),
    });
    await expect(repository.load()).rejects.toThrow(/non valido/);
    expect(repository.isLoaded()).toBe(false);
  });
});
