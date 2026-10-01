import { createMockProvider } from './mock.js';
import { createOllamaProvider } from './ollama.js';

/**
 * Sceglie il provider di visione in base alla configurazione.
 * Interfaccia comune: recognize(imageBuffer, { signal }) → { ingredients, model }, check() → { ok, reason? }
 */
export function createVisionProvider(config, repository, { fetch } = {}) {
  const getIngredientNames = () => repository.getIngredientNames();
  if (config.visionProvider === 'ollama') {
    return createOllamaProvider({
      url: config.ollamaUrl,
      model: config.visionModel,
      timeoutMs: config.visionTimeoutMs,
      getIngredientNames,
      normalizeIngredients: (names) => repository.normalizeIngredients(names),
      fetch,
    });
  }
  return createMockProvider({ getIngredientNames });
}
