import { HttpError } from '../errors.js';
import { detectImageType } from '../routes/recognize.js';
import { buildPrompt, isAbort, parseIngredientNames } from './common.js';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

// Più largo di Ollama (3 s): è un servizio su Internet e il primo collegamento TLS può superare i 3 s.
const CHECK_TIMEOUT_MS = 5000;

// Margine ampio: una risposta tipica è di 30-60 token.
const MAX_OUTPUT_TOKENS = 512;

// Ragionamento al minimo: per elencare alimenti non serve e allunga i tempi.
// I modelli che non accettano "minimal" vengono richiamati con il loro valore predefinito.
const THINKING_LEVEL = 'minimal';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ingredients: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['ingredients'],
};

/** Secondi suggeriti da Gemini in un 429 (RetryInfo.retryDelay, es. "37s"), se presenti. */
function retryDelaySeconds(error) {
  const delay = error?.details?.find((d) => d.retryDelay)?.retryDelay;
  const seconds = Number.parseFloat(delay);
  return Number.isFinite(seconds) ? Math.ceil(seconds) : null;
}

function isInvalidKey(status, error) {
  if (status === 401 || status === 403) return true;
  return status === 400 && (error?.details ?? []).some((d) => d.reason === 'API_KEY_INVALID');
}

function apiError(status, error, model) {
  const cause = new Error(`${status} ${error?.status ?? ''} ${String(error?.message ?? '').slice(0, 200)}`);
  if (status === 429) {
    const seconds = retryDelaySeconds(error);
    const wait = seconds ? `tra ${seconds} secondi` : 'tra qualche minuto';
    return new HttpError(429, 'VISION_QUOTA', `Limite del piano gratuito di Gemini raggiunto. Riprova ${wait}.`, { cause });
  }
  if (isInvalidKey(status, error)) {
    return new HttpError(502, 'VISION_AUTH', 'Il servizio di riconoscimento non è configurato correttamente (chiave Gemini non valida).', { cause });
  }
  if (status === 404) {
    return new HttpError(502, 'VISION_ERROR', `Il modello "${model}" non è disponibile in Gemini.`, { cause });
  }
  if (status === 500 || status === 503) {
    return new HttpError(503, 'VISION_BUSY', 'Il servizio di riconoscimento è sovraccarico. Riprova tra poco.', { cause });
  }
  return new HttpError(502, 'VISION_ERROR', 'Il modello di riconoscimento ha risposto con un errore.', { cause });
}

const rejectsThinkingLevel = (status, error) => status === 400 && /thinking/i.test(String(error?.message));

/**
 * Provider che usa l'API REST di Google Gemini (generateContent).
 * La chiave viaggia solo nell'header x-goog-api-key, mai nell'URL né nei log.
 * `fetch` è iniettabile così i test possono simulare Gemini senza rete.
 */
export function createGeminiProvider({
  apiKey,
  model,
  timeoutMs,
  normalizeIngredients,
  baseUrl = GEMINI_BASE_URL,
  fetch = globalThis.fetch,
}) {
  const modelUrl = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}`;
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
  let useThinkingLevel = true;

  const requestBody = (imageBuffer) => JSON.stringify({
    contents: [
      {
        parts: [
          { text: buildPrompt() },
          // La route accetta solo JPEG, PNG e WebP; JPEG è il caso normale (il telefono riconverte).
          { inline_data: { mime_type: detectImageType(imageBuffer) ?? 'image/jpeg', data: imageBuffer.toString('base64') } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      ...(useThinkingLevel ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL } } : {}),
    },
  });

  return {
    name: 'gemini',
    model,

    async recognize(imageBuffer, { signal } = {}) {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      const call = () => fetch(`${modelUrl}:generateContent`, {
        method: 'POST',
        headers,
        signal: combined,
        body: requestBody(imageBuffer),
      });

      let response;
      let data;
      try {
        response = await call();
        data = await response.json().catch(() => null);
        if (useThinkingLevel && rejectsThinkingLevel(response.status, data?.error)) {
          useThinkingLevel = false;
          response = await call();
          data = await response.json().catch(() => null);
        }
      } catch (err) {
        if (timeoutSignal.aborted) {
          throw new HttpError(504, 'VISION_TIMEOUT', 'Il riconoscimento ha impiegato troppo tempo. Riprova.', { cause: err });
        }
        if (isAbort(err)) {
          throw new HttpError(499, 'CLIENT_CLOSED', 'Richiesta annullata.', { cause: err });
        }
        throw new HttpError(502, 'VISION_UNAVAILABLE', 'Il servizio di riconoscimento non è raggiungibile.', { cause: err });
      }

      if (!response.ok) throw apiError(response.status, data?.error, model);

      let names;
      try {
        const candidate = data?.candidates?.[0];
        if (!candidate) {
          throw new Error(`nessuna risposta (blocco: ${data?.promptFeedback?.blockReason ?? 'sconosciuto'})`);
        }
        const text = (candidate.content?.parts ?? []).map((part) => part.text ?? '').join('');
        try {
          names = parseIngredientNames(text);
        } catch (err) {
          throw new Error(`finishReason ${candidate.finishReason}: ${err.message}`, { cause: err });
        }
      } catch (err) {
        throw new HttpError(502, 'VISION_BAD_RESPONSE', 'Il modello ha dato una risposta non leggibile. Riprova.', { cause: err });
      }

      const { known, unknown } = normalizeIngredients(names);
      // `discarded`: nomi del modello assenti dal vocabolario (per log e valutazione, non per l'API)
      return { ingredients: known, model, discarded: unknown };
    },

    /** Controlla chiave e modello leggendo i metadati del modello: non consuma la quota di analisi. */
    async check() {
      try {
        const response = await fetch(modelUrl, { headers, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
        if (response.ok) return { ok: true };
        const data = await response.json().catch(() => null);
        if (isInvalidKey(response.status, data?.error)) return { ok: false, reason: 'chiave GEMINI_API_KEY non valida' };
        if (response.status === 404) return { ok: false, reason: `modello "${model}" non disponibile in Gemini` };
        return { ok: false, reason: `Gemini ha risposto ${response.status}` };
      } catch {
        return { ok: false, reason: 'Gemini non raggiungibile' };
      }
    },
  };
}
