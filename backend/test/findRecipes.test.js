import { describe, it, expect } from 'vitest';
import { findRecipes } from '../src/recipes/findRecipes.js';

const recipe = (id, ingredients) => ({
  id,
  nome: id,
  categoria: 'primi',
  tempoMinuti: 10,
  porzioni: 2,
  difficolta: 'facile',
  ingredienti: ingredients.map((nome) => ({ nome, quantita: 'q.b.' })),
  passaggi: ['...'],
});

const recipes = [
  recipe('due-mancanti', ['uova', 'zucchine', 'cipolla', 'guanciale', 'pecorino', 'pasta']),
  recipe('un-mancante', ['uova', 'zucchine', 'parmigiano']),
  recipe('completa-poco-frigo', ['uova', 'sale']),
  recipe('completa-molto-frigo', ['uova', 'zucchine', 'cipolla', 'sale']),
  recipe('tre-mancanti', ['uova', 'zucchine', 'cipolla', 'a', 'b', 'c']),
  recipe('solo-dispensa', ['pasta', "olio d'oliva", 'aglio']),
  recipe('poco-pertinente', ['uova', 'fragole', 'panna']),
];

describe('findRecipes', () => {
  const result = findRecipes(recipes, {
    fridge: ['uova', 'zucchine', 'cipolla'],
    pantry: ['sale', 'pasta', "olio d'oliva"],
  });
  const ids = result.map((r) => r.id);

  it('ordina per mancanti e poi per ingredienti del frigo usati', () => {
    expect(ids).toEqual(['completa-molto-frigo', 'completa-poco-frigo', 'un-mancante', 'due-mancanti']);
  });

  it('indica gli ingredienti mancanti e quelli presi dal frigo', () => {
    const byId = Object.fromEntries(result.map((r) => [r.id, r]));
    expect(byId['completa-molto-frigo'].mancanti).toEqual([]);
    expect(byId['un-mancante'].mancanti).toEqual(['parmigiano']);
    expect(byId['due-mancanti'].mancanti).toEqual(['guanciale', 'pecorino']);
    expect(byId['due-mancanti'].dalFrigo).toEqual(['uova', 'zucchine', 'cipolla']);
  });

  it('esclude ricette con più di 2 mancanti', () => {
    expect(ids).not.toContain('tre-mancanti');
  });

  it('esclude ricette che non usano nulla del frigo', () => {
    expect(ids).not.toContain('solo-dispensa');
  });

  it('esclude ricette che mancano di più di quanto usano dal frigo', () => {
    expect(ids).not.toContain('poco-pertinente');
  });

  it('considera la dispensa come disponibile', () => {
    const withPantry = findRecipes(recipes, { fridge: ['uova'], pantry: ['sale'] });
    expect(withPantry.map((r) => r.id)).toEqual(['completa-poco-frigo']);
    const noPantry = findRecipes(recipes, { fridge: ['uova'], pantry: [] });
    expect(noPantry).toEqual([]);
  });

  it('restituisce al massimo 10 ricette', () => {
    const many = Array.from({ length: 30 }, (_, i) => recipe(`r${i}`, ['uova']));
    expect(findRecipes(many, { fridge: ['uova'], pantry: [] })).toHaveLength(10);
  });
});
