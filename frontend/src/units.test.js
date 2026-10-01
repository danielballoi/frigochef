import { describe, it, expect, vi } from 'vitest';
import { loadPantry, savePantry } from './pantry.js';
import { mergeUnique } from './ingredients.js';
import { ApiError, findRecipes, recognizePhoto } from './api.js';

describe('dispensa', () => {
  it('salva e rilegge da localStorage', () => {
    expect(loadPantry()).toBeNull();
    expect(savePantry(['sale', 'olio d\'oliva'])).toBe(true);
    expect(loadPantry()).toEqual(['sale', "olio d'oliva"]);
  });

  it('ignora dati non validi', () => {
    localStorage.setItem('frigochef.pantry.v1', '{rotto');
    expect(loadPantry()).toBeNull();
    localStorage.setItem('frigochef.pantry.v1', '[1,2]');
    expect(loadPantry()).toBeNull();
  });

  it('non si rompe se localStorage lancia eccezioni', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadPantry()).toBeNull();
    expect(savePantry(['sale'])).toBe(false);
  });
});

describe('mergeUnique', () => {
  it('unisce senza doppioni mantenendo l\'ordine', () => {
    expect(mergeUnique(['uova', 'latte'], ['Latte', 'burro'], [' uova '], undefined)).toEqual(['uova', 'latte', 'burro']);
  });
});

describe('api', () => {
  it('usa percorsi relativi e invia la foto nel campo "image"', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ingredients: [] })));
    vi.stubGlobal('fetch', fetch);
    await recognizePhoto(new Blob(['x'], { type: 'image/jpeg' }));
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/recognize');
    expect(init.body.get('image')).toBeInstanceOf(Blob);
  });

  it('trasforma le risposte di errore in ApiError con il messaggio del server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'X', message: 'Messaggio' } }), { status: 400 })));
    await expect(findRecipes(['uova'], [])).rejects.toMatchObject({ name: 'ApiError', status: 400, message: 'Messaggio' });
  });

  it('messaggio chiaro se la rete non risponde', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    const error = await findRecipes(['uova'], []).catch((err) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toMatch(/Connessione non riuscita/);
  });

  it('messaggio predefinito se il server non manda JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(findRecipes(['uova'], [])).rejects.toMatchObject({ message: expect.stringMatching(/non è disponibile/) });
  });
});
