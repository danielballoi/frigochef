import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import { installFakeBackend, json, photo } from './test/fakeBackend.js';

// Registro condiviso: serve a verificare l'ordine "ridimensiona → invia".
const events = vi.hoisted(() => []);

vi.mock('./image.js', () => ({
  resizeToJpeg: vi.fn(async (file) => {
    events.push(`resize:${file.name}`);
    return new Blob([`jpeg:${file.name}`], { type: 'image/jpeg' });
  }),
}));

beforeEach(() => {
  events.length = 0;
});

async function addPhoto(user, shelfNumber, name) {
  const input = await screen.findByLabelText(`Scatta una foto del Ripiano ${shelfNumber}`);
  await user.upload(input, photo(name));
  await screen.findByAltText(`Foto del ripiano ${shelfNumber}`);
}

const chipNames = () =>
  within(screen.getByRole('list', { name: 'Ingredienti del frigo' }))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('span').textContent);

describe('foto e analisi', () => {
  it('ridimensiona ogni foto prima di inviarla', async () => {
    installFakeBackend({
      recognize: async (name) => {
        events.push(`send:${name}`);
        return json({ ingredients: ['uova'], model: 'mock', durationMs: 1 });
      },
    });
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText(/Fotografa ogni ripiano da vicino, anche cassetti e sportello/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analizza' })).toBeDisabled();

    await addPhoto(user, 1, 'a.jpg');
    await user.click(screen.getByRole('button', { name: 'Analizza' }));

    await screen.findByRole('heading', { name: "Cosa c'è nel frigo" });
    expect(events).toEqual(['resize:a.jpg', 'send:a.jpg']);
  });

  it('usa input con fotocamera posteriore e galleria', async () => {
    installFakeBackend();
    render(<App />);
    const camera = screen.getByLabelText('Scatta una foto del Ripiano 1');
    expect(camera).toHaveAttribute('accept', 'image/*');
    expect(camera).toHaveAttribute('capture', 'environment');
    const gallery = screen.getByLabelText('Scegli dalla galleria per Ripiano 1');
    expect(gallery).not.toHaveAttribute('capture');
  });

  it('aggiunge ripiani fino a MAX_PHOTOS e ricompatta la numerazione quando se ne toglie uno', async () => {
    installFakeBackend({ config: { maxPhotos: 3, maxImageMb: 5, pantryDefault: [] } });
    const user = userEvent.setup();
    render(<App />);

    const add = screen.getByRole('button', { name: '+ Aggiungi ripiano' });
    await waitFor(() => expect(add).toBeEnabled());
    await user.click(add);
    await user.click(add);
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual([
      'Ripiano 1',
      'Ripiano 2',
      'Ripiano 3',
    ]);
    await waitFor(() => expect(add).toBeDisabled());
    expect(screen.getByText('Hai raggiunto il massimo di 3 foto.')).toBeInTheDocument();
    await user.click(add);
    expect(screen.getAllByRole('article')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Togli Ripiano 2' }));
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Ripiano 1', 'Ripiano 2']);
    expect(add).toBeEnabled();
  });

  it('analizza più foto una alla volta e unisce le liste senza doppioni', async () => {
    const results = { 'a.jpg': ['uova', 'latte'], 'b.jpg': ['latte', 'burro'], 'c.jpg': ['uova', 'pomodoro'] };
    let inFlight = 0;
    let maxInFlight = 0;
    const order = [];
    installFakeBackend({
      config: { maxPhotos: 3, maxImageMb: 5, pantryDefault: [] },
      recognize: async (name) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        order.push(name);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return json({ ingredients: results[name], model: 'mock', durationMs: 5 });
      },
    });
    const user = userEvent.setup();
    render(<App />);

    const add = screen.getByRole('button', { name: '+ Aggiungi ripiano' });
    await user.click(add);
    await user.click(add);
    await addPhoto(user, 1, 'a.jpg');
    await addPhoto(user, 2, 'b.jpg');
    await addPhoto(user, 3, 'c.jpg');

    await user.click(screen.getByRole('button', { name: 'Analizza 3 foto' }));
    await screen.findByRole('heading', { name: "Cosa c'è nel frigo" });

    expect(order).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(maxInFlight).toBe(1);
    expect(chipNames()).toEqual(['uova', 'latte', 'burro', 'pomodoro']);
  });

  it('mostra l\'avanzamento "Ripiano N di M"', async () => {
    let release;
    installFakeBackend({
      recognize: () =>
        new Promise((resolve) => {
          release = () => resolve(json({ ingredients: ['uova'], model: 'mock', durationMs: 1 }));
        }),
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '+ Aggiungi ripiano' }));
    await addPhoto(user, 1, 'a.jpg');
    await addPhoto(user, 2, 'b.jpg');
    await user.click(screen.getByRole('button', { name: 'Analizza 2 foto' }));

    expect(await screen.findByText('Sto guardando nel frigo…')).toBeInTheDocument();
    expect(await screen.findByText('Ripiano 1 di 2…')).toBeInTheDocument();
    release();
    expect(await screen.findByText('Ripiano 2 di 2…')).toBeInTheDocument();
    release();
    await screen.findByRole('heading', { name: "Cosa c'è nel frigo" });
  });

  it('una foto fallita non blocca le altre e si può riprovare', async () => {
    let attemptsB = 0;
    installFakeBackend({
      recognize: async (name) => {
        if (name === 'b.jpg' && attemptsB++ === 0) {
          return json({ error: { code: 'VISION_TIMEOUT', message: 'Il riconoscimento ha impiegato troppo tempo. Riprova.' } }, 504);
        }
        const map = { 'a.jpg': ['uova'], 'b.jpg': ['burro'], 'c.jpg': ['latte'] };
        return json({ ingredients: map[name], model: 'mock', durationMs: 1 });
      },
    });
    const user = userEvent.setup();
    render(<App />);
    const add = screen.getByRole('button', { name: '+ Aggiungi ripiano' });
    await user.click(add);
    await user.click(add);
    await addPhoto(user, 1, 'a.jpg');
    await addPhoto(user, 2, 'b.jpg');
    await addPhoto(user, 3, 'c.jpg');
    await user.click(screen.getByRole('button', { name: 'Analizza 3 foto' }));

    const retry = await screen.findByRole('button', { name: 'Riprova il ripiano 2' });
    expect(screen.getByText('Il riconoscimento ha impiegato troppo tempo. Riprova.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continua con 2 ingredienti trovati' })).toBeInTheDocument();

    await user.click(retry);
    await screen.findByRole('heading', { name: "Cosa c'è nel frigo" });
    expect(chipNames()).toEqual(['uova', 'latte', 'burro']);
  });

  it('se una foto non si può leggere lo dice chiaramente', async () => {
    const { resizeToJpeg } = await import('./image.js');
    resizeToJpeg.mockRejectedValueOnce(new Error("Non riesco a leggere questa foto. Prova a scattarla di nuovo o scegline un'altra."));
    installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await user.upload(screen.getByLabelText('Scatta una foto del Ripiano 1'), photo('rotta.heic'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Non riesco a leggere questa foto');
    expect(screen.getByRole('button', { name: 'Analizza' })).toBeDisabled();
  });
});

describe('ingredienti, dispensa e ricette', () => {
  async function goManual(user) {
    await user.click(screen.getByRole('button', { name: 'Preferisco scrivere gli ingredienti a mano' }));
    await screen.findByRole('heading', { name: "Cosa c'è nel frigo" });
  }

  it('aggiunge con i suggerimenti e toglie con ✕', async () => {
    installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await goManual(user);

    expect(screen.getByRole('button', { name: '🍳 Cosa cucino?' })).toBeDisabled();

    const input = screen.getByRole('combobox', { name: 'Aggiungi un ingrediente' });
    await user.type(input, 'zuc');
    await user.click(await screen.findByRole('option', { name: /zucchine/ }));
    expect(chipNames()).toEqual(['zucchine']);

    await user.type(input, 'uova{Enter}');
    await waitFor(() => expect(chipNames()).toEqual(['zucchine', 'uova']));

    await user.type(input, 'caviale{Enter}');
    expect(await screen.findByText('"caviale" non è nell\'archivio degli ingredienti.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Togli zucchine' }));
    expect(chipNames()).toEqual(['uova']);
    expect(screen.getByRole('button', { name: '🍳 Cosa cucino?' })).toBeEnabled();
  });

  it('salva la dispensa nel telefono e la usa nella ricerca', async () => {
    const fetch = installFakeBackend();
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await goManual(user);

    const pantry = screen.getByRole('list', { name: 'Ingredienti della dispensa' });
    await waitFor(() => expect(within(pantry).getAllByRole('listitem')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Togli pepe' }));
    const pantryInput = screen.getByRole('combobox', { name: 'Aggiungi alla dispensa' });
    await user.type(pantryInput, 'burro{Enter}');
    await waitFor(() => expect(JSON.parse(localStorage.getItem('frigochef.pantry.v1'))).toEqual(['sale', 'burro']));

    unmount();
    render(<App />);
    await goManual(user);
    const restored = screen.getByRole('list', { name: 'Ingredienti della dispensa' });
    expect(within(restored).getAllByRole('listitem').map((li) => li.querySelector('span').textContent)).toEqual([
      'sale',
      'burro',
    ]);

    await user.type(screen.getByRole('combobox', { name: 'Aggiungi un ingrediente' }), 'uova{Enter}');
    await waitFor(() => expect(chipNames()).toEqual(['uova']));
    await user.click(screen.getByRole('button', { name: '🍳 Cosa cucino?' }));
    await screen.findByText('Frittata di zucchine');
    const call = fetch.mock.calls.find(([url]) => url === '/api/recipes');
    expect(JSON.parse(call[1].body)).toEqual({ ingredients: ['uova'], pantry: ['sale', 'burro'] });
  });

  it('funziona anche se localStorage non è disponibile', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await goManual(user);
    await waitFor(() => screen.getByRole('button', { name: 'Togli pepe' }));
    await user.click(screen.getByRole('button', { name: 'Togli pepe' }));
    expect(screen.queryByRole('button', { name: 'Togli pepe' })).not.toBeInTheDocument();
  });

  it('mostra l\'errore con "Riprova" e poi le ricette con il dettaglio', async () => {
    let calls = 0;
    installFakeBackend({
      recipes: async () => {
        calls += 1;
        if (calls === 1) return json({ error: { code: 'INTERNAL_ERROR', message: 'Errore interno del server.' } }, 500);
        const { RECIPES } = await import('./test/fakeBackend.js');
        return json({ recipes: RECIPES });
      },
    });
    const user = userEvent.setup();
    render(<App />);
    await goManual(user);
    await user.type(screen.getByRole('combobox', { name: 'Aggiungi un ingrediente' }), 'uova{Enter}');
    await waitFor(() => expect(chipNames()).toEqual(['uova']));
    await user.click(screen.getByRole('button', { name: '🍳 Cosa cucino?' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Errore interno del server.');
    await user.click(screen.getByRole('button', { name: 'Riprova' }));

    const first = await screen.findByRole('button', { name: /Frittata di zucchine/ });
    expect(first).toHaveTextContent('Hai tutto');
    expect(screen.getByRole('button', { name: /Pasta burro e parmigiano/ })).toHaveTextContent('Manca: parmigiano');

    await user.click(screen.getByRole('button', { name: /Pasta burro e parmigiano/ }));
    expect(screen.getByRole('heading', { name: 'Pasta burro e parmigiano' })).toBeInTheDocument();
    expect(screen.getByText('manca')).toBeInTheDocument();
    expect(screen.getByText('Cuoci la pasta.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '← Torna alle ricette' }));
    expect(screen.getByRole('heading', { name: 'Cosa puoi cucinare' })).toBeInTheDocument();
  });

  it('nessuna ricetta: messaggio e suggerimento', async () => {
    installFakeBackend({ recipes: async () => json({ recipes: [] }) });
    const user = userEvent.setup();
    render(<App />);
    await goManual(user);
    await user.type(screen.getByRole('combobox', { name: 'Aggiungi un ingrediente' }), 'latte{Enter}');
    await waitFor(() => expect(chipNames()).toEqual(['latte']));
    await user.click(screen.getByRole('button', { name: '🍳 Cosa cucino?' }));
    expect(await screen.findByText('Nessuna ricetta trovata con questi ingredienti.')).toBeInTheDocument();
    expect(screen.getByText(/Prova ad aggiungere qualche ingrediente/)).toBeInTheDocument();
  });

  it('"Nuova foto" riporta all\'inizio', async () => {
    installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await goManual(user);
    await user.type(screen.getByRole('combobox', { name: 'Aggiungi un ingrediente' }), 'uova{Enter}');
    await waitFor(() => expect(chipNames()).toEqual(['uova']));
    await user.click(screen.getByRole('button', { name: '📷 Nuova foto' }));
    expect(screen.getByRole('heading', { name: 'Fotografa il frigo' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });
});

describe('accessibilità', () => {
  it('a ogni cambio di schermata il focus va sul titolo', async () => {
    installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Preferisco scrivere gli ingredienti a mano' }));
    expect(await screen.findByRole('heading', { name: "Cosa c'è nel frigo" })).toHaveFocus();
  });
});

describe('privacy', () => {
  it('mostra l\'informativa sulle foto', () => {
    installFakeBackend();
    render(<App />);
    expect(screen.getByText(/le foto vengono inviate a Google Gemini per l'analisi; FrigoChef non le salva/)).toBeInTheDocument();
  });
});
