// Chiamate al backend: sempre percorsi relativi (/api/...).
// In sviluppo ci pensa il proxy di Vite, in produzione l'Ingress.

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'ERROR' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, options);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('Connessione non riuscita: controlla la rete e riprova.', { code: 'NETWORK' });
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body?.error?.message ?? defaultMessage(response.status);
    throw new ApiError(message, { status: response.status, code: body?.error?.code });
  }
  return body;
}

function defaultMessage(status) {
  if (status === 413) return 'Foto troppo grande.';
  if (status === 429) return 'Troppe richieste: aspetta un minuto e riprova.';
  if (status === 502 || status === 503) return 'Il servizio non è disponibile in questo momento. Riprova tra poco.';
  if (status === 504) return 'Il riconoscimento ha impiegato troppo tempo. Riprova.';
  return `Errore del server (${status}). Riprova.`;
}

export function getConfig({ signal } = {}) {
  return request('/api/config', { signal });
}

export function recognizePhoto(blob, { signal } = {}) {
  const form = new FormData();
  form.append('image', blob, 'ripiano.jpg');
  return request('/api/recognize', { method: 'POST', body: form, signal });
}

export async function suggestIngredients(query, { signal, limit = 8 } = {}) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const body = await request(`/api/ingredients?${params}`, { signal });
  return body.ingredients;
}

export function findRecipes(ingredients, pantry, { signal } = {}) {
  return request('/api/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ingredients, pantry }),
    signal,
  });
}
