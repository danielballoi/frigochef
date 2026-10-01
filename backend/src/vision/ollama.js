import { HttpError } from '../errors.js';

const CHECK_TIMEOUT_MS = 3000;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    ingredients: { type: 'array', items: { type: 'string' } },
  },
  required: ['ingredients'],
};

export function buildPrompt(ingredientNames) {
  return [
    'Guarda la foto dell\'interno di un frigorifero (un ripiano, un cassetto o lo sportello).',
    'Elenca gli alimenti che vedi con certezza, scegliendo i nomi SOLO da questo elenco:',
    ingredientNames.join(', '),
    'Non inventare: se non sei sicuro di un alimento, non metterlo.',
    'Rispondi solo con JSON nel formato {"ingredients": ["nome1", "nome2"]}.',
  ].join('\n');
}

function isAbort(err) {
  return err?.name === 'AbortError' || err?.name === 'TimeoutError';
}

/**
 * Provider che usa l'API HTTP di Ollama (/api/chat) con un modello di visione.
 * `fetch` è iniettabile così i test possono simulare Ollama senza rete.
 */
export function createOllamaProvider({
  url,
  model,
  timeoutMs,
  getIngredientNames,
  normalizeIngredients,
  fetch = globalThis.fetch,
}) {
  const modelMatches = (name) => name === model || name === `${model}:latest`;

  return {
    name: 'ollama',
    model,

    async recognize(imageBuffer, { signal } = {}) {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      let response;
      try {
        response = await fetch(`${url}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: combined,
          body: JSON.stringify({
            model,
            stream: false,
            format: RESPONSE_SCHEMA,
            options: { temperature: 0 },
            messages: [
              {
                role: 'user',
                content: buildPrompt(getIngredientNames()),
                images: [imageBuffer.toString('base64')],
              },
            ],
          }),
        });
      } catch (err) {
        if (timeoutSignal.aborted) {
          throw new HttpError(504, 'VISION_TIMEOUT', 'Il riconoscimento ha impiegato troppo tempo. Riprova.', { cause: err });
        }
        if (isAbort(err)) {
          throw new HttpError(499, 'CLIENT_CLOSED', 'Richiesta annullata.', { cause: err });
        }
        throw new HttpError(502, 'VISION_UNAVAILABLE', 'Il modello di riconoscimento non è raggiungibile.', { cause: err });
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        const message = response.status === 404
          ? `Il modello "${model}" non è disponibile in Ollama.`
          : 'Il modello di riconoscimento ha risposto con un errore.';
        throw new HttpError(502, 'VISION_ERROR', message, { cause: new Error(`${response.status} ${detail.slice(0, 200)}`) });
      }

      let names;
      try {
        const data = await response.json();
        const parsed = JSON.parse(data?.message?.content ?? '');
        names = Array.isArray(parsed) ? parsed : parsed?.ingredients;
        if (!Array.isArray(names)) throw new Error('campo ingredients mancante');
      } catch (err) {
        if (timeoutSignal.aborted) {
          throw new HttpError(504, 'VISION_TIMEOUT', 'Il riconoscimento ha impiegato troppo tempo. Riprova.', { cause: err });
        }
        throw new HttpError(502, 'VISION_BAD_RESPONSE', 'Il modello ha dato una risposta non leggibile. Riprova.', { cause: err });
      }

      const { known } = normalizeIngredients(names.filter((name) => typeof name === 'string'));
      return { ingredients: known, model };
    },

    async check() {
      try {
        const response = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
        if (!response.ok) return { ok: false, reason: `Ollama ha risposto ${response.status}` };
        const data = await response.json();
        const names = (data?.models ?? []).map((m) => m.name ?? m.model);
        if (!names.some(modelMatches)) {
          return { ok: false, reason: `modello "${model}" non scaricato` };
        }
        return { ok: true };
      } catch {
        return { ok: false, reason: 'Ollama non raggiungibile' };
      }
    },
  };
}
