import { describe, it, expect } from 'vitest';
import { ingredientKey, buildVocabularyIndex, normalizeIngredients } from '../src/recipes/normalize.js';

const vocabulary = [
  { nome: 'pomodoro', categoria: 'verdura', sinonimi: ['pomodori', 'pomodorini'] },
  { nome: 'zucchine', categoria: 'verdura', sinonimi: ['zucchina'] },
  { nome: "olio d'oliva", categoria: 'dispensa', sinonimi: ['olio extravergine'] },
  { nome: 'baccalà', categoria: 'pesce', sinonimi: [] },
];
const index = buildVocabularyIndex(vocabulary);

describe('ingredientKey', () => {
  it('ignora maiuscole, accenti, spazi e apostrofi tipografici', () => {
    expect(ingredientKey('  Baccalà ')).toBe('baccala');
    expect(ingredientKey('Olio d’Oliva')).toBe("olio d'oliva");
    expect(ingredientKey('olio  d \' oliva')).toBe("olio d'oliva");
  });
});

describe('normalizeIngredients', () => {
  it('converte i sinonimi nel nome del vocabolario', () => {
    expect(normalizeIngredients(['Pomodorini', 'zucchina', 'olio extravergine'], index).known)
      .toEqual(['pomodoro', 'zucchine', "olio d'oliva"]);
  });

  it('toglie i duplicati', () => {
    expect(normalizeIngredients(['pomodori', 'pomodoro', 'POMODORINI'], index).known).toEqual(['pomodoro']);
  });

  it('scarta ciò che non è nel vocabolario', () => {
    const result = normalizeIngredients(['tartufo', 'baccala', ''], index);
    expect(result.known).toEqual(['baccalà']);
    expect(result.unknown).toEqual(['tartufo']);
  });
});
