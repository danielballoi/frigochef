import { createMockProvider } from './mock.js';
import { createOllamaProvider } from './ollama.js';
import { createGeminiProvider } from './gemini.js';

/**
 * Sceglie il provider di visione in base alla configurazione.
 * Interfaccia comune: recognize(imageBuffer, { signal }) → { ingredients, model }, check() → { ok, reason? }
 */
export function createVisionProvider(config, repository, { fetch } = {}) {
  const getIngredientNames = () => repository.getIngredientNames();
  const normalizeIngredients = (names) => repository.normalizeIngredients(names);
  if (config.visionProvider === 'gemini') {
    return createGeminiProvider({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
      timeoutMs: config.visionTimeoutMs,
      normalizeIngredients,
      fetch,
    });
  }
  if (config.visionProvider === 'ollama') {
    return createOllamaProvider({
      url: config.ollamaUrl,
      model: config.visionModel,
      timeoutMs: config.visionTimeoutMs,
      normalizeIngredients,
      fetch,
    });
  }
  return createMockProvider({ getIngredientNames });
}
