import { describe, it, expect, vi } from 'vitest';
import { createOllamaProvider } from '../src/vision/ollama.js';
import { buildPrompt } from '../src/vision/common.js';
import { createMockProvider } from '../src/vision/mock.js';
import { buildVocabularyIndex, normalizeIngredients } from '../src/recipes/normalize.js';

const vocabulary = [
  { nome: 'pomodoro', categoria: 'verdura', sinonimi: ['pomodori', 'pomodorini'] },
  { nome: 'uova', categoria: 'uova', sinonimi: ['uovo'] },
  { nome: 'latte', categoria: 'latticini', sinonimi: [] },
];
const index = buildVocabularyIndex(vocabulary);
const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function provider(fetch, overrides = {}) {
  return createOllamaProvider({
    url: 'http://ollama.test:11434',
    model: 'qwen3-vl:4b',
    timeoutMs: 1000,
    normalizeIngredients: (names) => normalizeIngredients(names, index),
    fetch,
    ...overrides,
  });
}

describe('provider ollama (Ollama simulato)', () => {
  it('invia immagine in base64, prompt corto, format JSON e risposta limitata', async () => {
    const fetch = vi.fn(async () => jsonResponse({ message: { content: '{"ingredients":["uova"]}' } }));
    await provider(fetch).recognize(image);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://ollama.test:11434/api/chat');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('qwen3-vl:4b');
    expect(body.stream).toBe(false);
    expect(body.format).toMatchObject({ type: 'object', required: ['ingredients'] });
    expect(body.messages[0].images).toEqual([image.toString('base64')]);
    expect(body.messages[0].content).toBe(buildPrompt());
    expect(body.options).toEqual({ temperature: 0, num_predict: 150 });
  });

  it('normalizza i sinonimi, scarta ciò che non è nel vocabolario e toglie i doppioni', async () => {
    const content = JSON.stringify({ ingredients: ['Pomodorini', 'uovo', 'uova', 'caviale', 42, 'pomodori'] });
    const fetch = vi.fn(async () => jsonResponse({ message: { content } }));
    const result = await provider(fetch).recognize(image);
    expect(result).toEqual({ ingredients: ['pomodoro', 'uova'], model: 'qwen3-vl:4b', discarded: ['caviale'] });
  });

  it('accetta anche un array JSON semplice', async () => {
    const fetch = vi.fn(async () => jsonResponse({ message: { content: '["latte"]' } }));
    expect((await provider(fetch).recognize(image)).ingredients).toEqual(['latte']);
  });

  it('504 se il modello supera il timeout', async () => {
    const fetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    }));
    await expect(provider(fetch, { timeoutMs: 20 }).recognize(image)).rejects.toMatchObject({
      status: 504,
      code: 'VISION_TIMEOUT',
    });
  });

  it('502 se Ollama non è raggiungibile', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(provider(fetch).recognize(image)).rejects.toMatchObject({ status: 502, code: 'VISION_UNAVAILABLE' });
  });

  it('502 con messaggio chiaro se il modello non esiste', async () => {
    const fetch = vi.fn(async () => jsonResponse({ error: 'model not found' }, 404));
    await expect(provider(fetch).recognize(image)).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('qwen3-vl:4b'),
    });
  });

  it('502 se la risposta non è JSON valido', async () => {
    const fetch = vi.fn(async () => jsonResponse({ message: { content: 'vedo delle uova' } }));
    await expect(provider(fetch).recognize(image)).rejects.toMatchObject({ status: 502, code: 'VISION_BAD_RESPONSE' });
  });

  it('check: ok se il modello è scaricato', async () => {
    const fetch = vi.fn(async () => jsonResponse({ models: [{ name: 'qwen3-vl:4b' }] }));
    expect(await provider(fetch).check()).toEqual({ ok: true });
    expect(fetch.mock.calls[0][0]).toBe('http://ollama.test:11434/api/tags');
  });

  it('check: non ok se il modello manca o Ollama è spento', async () => {
    const missing = vi.fn(async () => jsonResponse({ models: [{ name: 'llama3:latest' }] }));
    expect((await provider(missing).check()).ok).toBe(false);
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await provider(down).check()).toEqual({ ok: false, reason: 'Ollama non raggiungibile' });
  });

  it('il prompt è corto e non contiene il vocabolario', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('alimenti visibili');
    expect(prompt).not.toContain('pomodoro');
    expect(prompt.length).toBeLessThan(400);
  });
});

describe('provider mock', () => {
  const mock = createMockProvider({ getIngredientNames: () => ['uova', 'latte', 'burro', 'pomodoro', 'zucchine', 'limone'], delayMs: 0 });

  it('restituisce da 3 a 6 ingredienti del vocabolario, senza doppioni', async () => {
    const { ingredients, model } = await mock.recognize(image);
    expect(model).toBe('mock');
    expect(ingredients.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ingredients).size).toBe(ingredients.length);
    for (const name of ingredients) {
      expect(['uova', 'latte', 'burro', 'pomodoro', 'zucchine', 'limone']).toContain(name);
    }
  });

  it('è stabile a parità di foto', async () => {
    expect(await mock.recognize(image)).toEqual(await mock.recognize(image));
  });

  it('check sempre ok', async () => {
    expect(await mock.check()).toEqual({ ok: true });
  });
});
