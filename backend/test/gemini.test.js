import { describe, it, expect, vi } from 'vitest';
import { createGeminiProvider } from '../src/vision/gemini.js';
import { buildPrompt } from '../src/vision/common.js';
import { buildVocabularyIndex, normalizeIngredients } from '../src/recipes/normalize.js';

// Gemini SIMULATO: nessuna chiamata di rete.
const vocabulary = [
  { nome: 'yogurt', categoria: 'latticini', sinonimi: ['yogurt greco'] },
  { nome: 'uova', categoria: 'uova', sinonimi: ['uovo'] },
  { nome: 'maionese', categoria: 'condimenti', sinonimi: [] },
];
const index = buildVocabularyIndex(vocabulary);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const KEY = 'chiave-finta-di-test';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const answer = (text, extra = {}) => jsonResponse({
  candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP', ...extra }],
});

const apiError = (status, error) => jsonResponse({ error: { code: status, ...error } }, status);

function provider(fetch, overrides = {}) {
  return createGeminiProvider({
    apiKey: KEY,
    model: 'gemini-3.5-flash-lite',
    timeoutMs: 1000,
    normalizeIngredients: (names) => normalizeIngredients(names, index),
    baseUrl: 'https://gemini.test',
    fetch,
    ...overrides,
  });
}

describe('provider gemini (Gemini simulato)', () => {
  it('invia prompt corto, immagine inline, schema JSON e chiave solo nell\'header', async () => {
    const fetch = vi.fn(async () => answer('{"ingredients":["uova"]}'));
    await provider(fetch).recognize(jpeg);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://gemini.test/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(url).not.toContain(KEY);
    expect(init.headers['x-goog-api-key']).toBe(KEY);
    const body = JSON.parse(init.body);
    const [text, image] = body.contents[0].parts;
    expect(text.text).toBe(buildPrompt());
    expect(image.inline_data).toEqual({ mime_type: 'image/jpeg', data: jpeg.toString('base64') });
    expect(body.generationConfig).toMatchObject({
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: { required: ['ingredients'] },
      thinkingConfig: { thinkingLevel: 'minimal' },
    });
  });

  it('normalizza con i sinonimi, scarta ciò che non è nel vocabolario e toglie i doppioni', async () => {
    const fetch = vi.fn(async () => answer('{"ingredients":["Yogurt greco","uovo","uova","bevanda",7]}'));
    expect(await provider(fetch).recognize(jpeg)).toEqual({
      ingredients: ['yogurt', 'uova'],
      model: 'gemini-3.5-flash-lite',
      discarded: ['bevanda'],
    });
  });

  it('unisce le parti di testo della risposta', async () => {
    const fetch = vi.fn(async () => jsonResponse({
      candidates: [{ content: { parts: [{ text: '{"ingredients":' }, { text: '["maionese"]}' }] } }],
    }));
    expect((await provider(fetch).recognize(jpeg)).ingredients).toEqual(['maionese']);
  });

  it('se il modello non accetta il livello di ragionamento riprova una volta senza, e lo ricorda', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(apiError(400, { status: 'INVALID_ARGUMENT', message: 'Thinking level MINIMAL is not supported for this model.' }))
      .mockResolvedValueOnce(answer('{"ingredients":["uova"]}'))
      .mockResolvedValueOnce(answer('{"ingredients":["uova"]}'));
    const gemini = provider(fetch);
    expect((await gemini.recognize(jpeg)).ingredients).toEqual(['uova']);
    expect(JSON.parse(fetch.mock.calls[1][1].body).generationConfig.thinkingConfig).toBeUndefined();
    await gemini.recognize(jpeg);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetch.mock.calls[2][1].body).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('429: limite del piano gratuito con messaggio chiaro e attesa suggerita', async () => {
    const fetch = vi.fn(async () => apiError(429, {
      status: 'RESOURCE_EXHAUSTED',
      message: 'You exceeded your current quota',
      details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '36.4s' }],
    }));
    await expect(provider(fetch).recognize(jpeg)).rejects.toMatchObject({
      status: 429,
      code: 'VISION_QUOTA',
      message: 'Limite del piano gratuito di Gemini raggiunto. Riprova tra 37 secondi.',
    });
  });

  it('429 senza attesa suggerita', async () => {
    const fetch = vi.fn(async () => apiError(429, { status: 'RESOURCE_EXHAUSTED' }));
    await expect(provider(fetch).recognize(jpeg)).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining('tra qualche minuto'),
    });
  });

  it.each([
    [400, { status: 'INVALID_ARGUMENT', message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] }],
    [403, { status: 'PERMISSION_DENIED' }],
  ])('chiave non valida (%i): 502 VISION_AUTH senza mostrare la chiave', async (status, error) => {
    const fetch = vi.fn(async () => apiError(status, error));
    const err = await provider(fetch).recognize(jpeg).catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: 'VISION_AUTH' });
    expect(err.message).not.toContain(KEY);
    expect(String(err.cause.message)).not.toContain(KEY);
  });

  it('modello inesistente: 502 con il nome del modello', async () => {
    const fetch = vi.fn(async () => apiError(404, { status: 'NOT_FOUND' }));
    await expect(provider(fetch).recognize(jpeg)).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('gemini-3.5-flash-lite'),
    });
  });

  it('Gemini sovraccarico: 503 VISION_BUSY', async () => {
    const fetch = vi.fn(async () => apiError(503, { status: 'UNAVAILABLE' }));
    await expect(provider(fetch).recognize(jpeg)).rejects.toMatchObject({ status: 503, code: 'VISION_BUSY' });
  });

  it('504 se Gemini supera il timeout', async () => {
    const fetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    }));
    await expect(provider(fetch, { timeoutMs: 20 }).recognize(jpeg)).rejects.toMatchObject({
      status: 504,
      code: 'VISION_TIMEOUT',
    });
  });

  it('499 se il client annulla', async () => {
    const controller = new AbortController();
    const fetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    }));
    const pending = provider(fetch).recognize(jpeg, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 499, code: 'CLIENT_CLOSED' });
  });

  it('502 se Gemini non è raggiungibile', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(provider(fetch).recognize(jpeg)).rejects.toMatchObject({ status: 502, code: 'VISION_UNAVAILABLE' });
  });

  it.each([
    ['testo non JSON', answer('vedo delle uova')],
    ['risposta troncata', answer('{"ingredients":["uova",', { finishReason: 'MAX_TOKENS' })],
    ['richiesta bloccata', jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } })],
  ])('502 VISION_BAD_RESPONSE: %s', async (_label, response) => {
    const fetch = vi.fn(async () => response);
    await expect(provider(fetch).recognize(jpeg)).rejects.toMatchObject({ status: 502, code: 'VISION_BAD_RESPONSE' });
  });

  it('check: legge i metadati del modello (nessuna analisi consumata)', async () => {
    const fetch = vi.fn(async () => jsonResponse({ name: 'models/gemini-3.5-flash-lite' }));
    expect(await provider(fetch).check()).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://gemini.test/v1beta/models/gemini-3.5-flash-lite');
    expect(init.headers['x-goog-api-key']).toBe(KEY);
  });

  it('check: chiave non valida, modello mancante, rete giù', async () => {
    const badKey = vi.fn(async () => apiError(400, { details: [{ reason: 'API_KEY_INVALID' }] }));
    expect(await provider(badKey).check()).toEqual({ ok: false, reason: 'chiave GEMINI_API_KEY non valida' });
    const missing = vi.fn(async () => apiError(404, { status: 'NOT_FOUND' }));
    expect((await provider(missing).check()).reason).toContain('non disponibile');
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await provider(down).check()).toEqual({ ok: false, reason: 'Gemini non raggiungibile' });
  });
});
