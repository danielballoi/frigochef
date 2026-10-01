// Ingredienti che si trovano spesso in un frigo: il mock ne sceglie alcuni.
const COMMON_FRIDGE = [
  'uova', 'latte', 'burro', 'mozzarella', 'parmigiano', 'yogurt', 'prosciutto cotto',
  'pomodoro', 'zucchine', 'carote', 'peperoni', 'lattuga', 'cipolla', 'limone', 'mela',
  'pollo', 'salsiccia', 'ricotta', 'spinaci', 'funghi', 'panna', 'stracchino', 'pancetta',
  'melanzane', 'sedano', 'basilico', 'prezzemolo', 'tonno', 'olive', 'piselli',
];

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });

/** Piccolo hash per avere risultati stabili a parità di foto. */
function hashBuffer(buffer) {
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(buffer.length / 4096));
  for (let i = 0; i < buffer.length; i += step) {
    hash ^= buffer[i];
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash ^ buffer.length) >>> 0;
}

/**
 * Provider finto: restituisce 3-6 ingredienti plausibili dopo un breve ritardo.
 * Serve per sviluppare e testare senza Ollama.
 */
export function createMockProvider({ getIngredientNames, delayMs = 800 } = {}) {
  return {
    name: 'mock',
    model: 'mock',

    async recognize(imageBuffer, { signal } = {}) {
      if (delayMs > 0) await sleep(delayMs, signal);
      const vocabulary = new Set(getIngredientNames?.() ?? COMMON_FRIDGE);
      const candidates = COMMON_FRIDGE.filter((name) => vocabulary.has(name));
      let seed = hashBuffer(imageBuffer);
      const count = 3 + (seed % 4);
      const picked = new Set();
      while (picked.size < Math.min(count, candidates.length)) {
        seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
        picked.add(candidates[seed % candidates.length]);
      }
      return { ingredients: [...picked], model: 'mock' };
    },

    async check() {
      return { ok: true };
    },
  };
}
