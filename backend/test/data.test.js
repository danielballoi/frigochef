import { describe, it, expect, beforeAll } from 'vitest';
import { readDataFiles } from '../src/recipes/recipeRepository.js';
import { validateData, MIN_RECIPES } from '../src/recipes/validateData.js';

describe('archivio ricette reale', () => {
  let data;
  beforeAll(async () => {
    data = await readDataFiles();
  });

  it('è valido', () => {
    expect(validateData(data)).toEqual([]);
  });

  it(`contiene almeno ${MIN_RECIPES} ricette`, () => {
    expect(data.recipes.length).toBeGreaterThanOrEqual(MIN_RECIPES);
  });

  it('il vocabolario contiene la dispensa predefinita', () => {
    const names = new Set(data.vocabulary.map((item) => item.nome));
    for (const item of ['sale', 'pepe', "olio d'oliva", 'zucchero', 'pasta', 'riso', 'farina', 'aceto', 'acqua']) {
      expect(names.has(item), item).toBe(true);
    }
  });
});

describe('validateData', () => {
  const vocabulary = [
    { nome: 'pomodoro', categoria: 'verdura', sinonimi: ['pomodori'] },
    { nome: 'pasta', categoria: 'dispensa', sinonimi: ['spaghetti'] },
  ];
  const recipe = {
    id: 'pasta-al-pomodoro',
    nome: 'Pasta al pomodoro',
    categoria: 'primi',
    tempoMinuti: 20,
    porzioni: 2,
    difficolta: 'facile',
    ingredienti: [{ nome: 'pasta', quantita: '200 g' }, { nome: 'pomodoro', quantita: '3' }],
    passaggi: ['Cuoci.'],
  };
  const many = (r) => Array.from({ length: MIN_RECIPES }, (_, i) => ({ ...r, id: `${r.id}-${i}` }));

  it('accetta dati corretti', () => {
    expect(validateData({ vocabulary, recipes: many(recipe) })).toEqual([]);
  });

  it('segnala id duplicati', () => {
    const recipes = many(recipe);
    recipes[1].id = recipes[0].id;
    expect(validateData({ vocabulary, recipes }).join()).toMatch(/id duplicato/);
  });

  it('segnala ingredienti fuori vocabolario', () => {
    const bad = { ...recipe, ingredienti: [{ nome: 'tartufo', quantita: '1' }] };
    expect(validateData({ vocabulary, recipes: many(bad) }).join()).toMatch(/"tartufo" non presente/);
  });

  it('segnala sinonimi duplicati, anche con accenti diversi', () => {
    const dup = [...vocabulary, { nome: 'pelati', categoria: 'verdura', sinonimi: ['Pomodorì'] }];
    expect(validateData({ vocabulary: dup, recipes: many(recipe) }).join()).toMatch(/compare più volte/);
  });

  it('segnala un sinonimo uguale al nome di un altro ingrediente', () => {
    const dup = [...vocabulary, { nome: 'sugo', categoria: 'verdura', sinonimi: ['pasta'] }];
    expect(validateData({ vocabulary: dup, recipes: many(recipe) }).join()).toMatch(/"pasta" compare più volte/);
  });

  it('segnala una struttura non valida', () => {
    const bad = { ...recipe, difficolta: 'difficilissima' };
    expect(validateData({ vocabulary, recipes: many(bad) }).length).toBeGreaterThan(0);
  });

  it('segnala troppe poche ricette', () => {
    expect(validateData({ vocabulary, recipes: [recipe] }).join()).toMatch(/almeno/);
  });
});
