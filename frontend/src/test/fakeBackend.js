import { vi } from 'vitest';

export const VOCABULARY = [
  { nome: 'burro', categoria: 'latticini' },
  { nome: 'latte', categoria: 'latticini' },
  { nome: 'pomodoro', categoria: 'verdura' },
  { nome: 'uova', categoria: 'uova' },
  { nome: 'zucca', categoria: 'verdura' },
  { nome: 'zucchine', categoria: 'verdura' },
  { nome: 'sale', categoria: 'erbe e spezie' },
  { nome: 'pepe', categoria: 'erbe e spezie' },
];

export const RECIPES = [
  {
    id: 'frittata-di-zucchine',
    nome: 'Frittata di zucchine',
    categoria: 'secondi',
    tempoMinuti: 25,
    porzioni: 4,
    difficolta: 'facile',
    ingredienti: [
      { nome: 'uova', quantita: '6' },
      { nome: 'zucchine', quantita: '2' },
      { nome: 'sale', quantita: 'q.b.' },
    ],
    passaggi: ['Cuoci le zucchine.', 'Aggiungi le uova.'],
    mancanti: [],
  },
  {
    id: 'pasta-burro-e-parmigiano',
    nome: 'Pasta burro e parmigiano',
    categoria: 'primi',
    tempoMinuti: 15,
    porzioni: 2,
    difficolta: 'facile',
    ingredienti: [
      { nome: 'pasta', quantita: '200 g' },
      { nome: 'burro', quantita: '40 g' },
      { nome: 'parmigiano', quantita: '50 g' },
    ],
    passaggi: ['Cuoci la pasta.'],
    mancanti: ['parmigiano'],
  },
];

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Legge il nome della foto originale dal JPEG finto prodotto dal mock di resizeToJpeg. */
export async function photoName(init) {
  const blob = init.body.get('image');
  const text = await blob.text();
  return text.replace(/^jpeg:/, '');
}

/**
 * Sostituisce fetch con un backend finto.
 * `recognize(name, init)` decide la risposta per ogni foto.
 */
export function installFakeBackend({
  config = { maxPhotos: 8, maxImageMb: 5, pantryDefault: ['sale', 'pepe'], visionTimeoutMs: 90000 },
  recognize = async () => json({ ingredients: ['uova'], model: 'mock', durationMs: 5 }),
  recipes = async () => json({ recipes: RECIPES, ingredients: [], ignored: [] }),
} = {}) {
  const fetch = vi.fn(async (url, init = {}) => {
    const path = String(url);
    if (path === '/api/config') return json(config);
    if (path.startsWith('/api/ingredients')) {
      const q = new URL(path, 'http://test').searchParams.get('q') ?? '';
      const items = VOCABULARY.filter((item) => item.nome.startsWith(q.toLowerCase()));
      return json({ ingredients: items });
    }
    if (path === '/api/recognize') return recognize(await photoName(init), init);
    if (path === '/api/recipes') return recipes(JSON.parse(init.body), init);
    return json({ error: { code: 'NOT_FOUND', message: 'Risorsa non trovata.' } }, 404);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

export const photo = (name) => new File([`foto ${name}`], name, { type: 'image/jpeg' });
