import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateData } from './validateData.js';
import { buildVocabularyIndex, ingredientKey, normalizeIngredients } from './normalize.js';

export const DEFAULT_DATA_DIR = fileURLToPath(new URL('../../data/', import.meta.url));

export async function readDataFiles(dataDir = DEFAULT_DATA_DIR) {
  const [recipesText, vocabularyText] = await Promise.all([
    readFile(path.join(dataDir, 'recipes.json'), 'utf8'),
    readFile(path.join(dataDir, 'ingredients.json'), 'utf8'),
  ]);
  return { recipes: JSON.parse(recipesText), vocabulary: JSON.parse(vocabularyText) };
}

/**
 * Unico punto di accesso all'archivio ricette e al vocabolario.
 * Oggi legge file JSON; domani potrà leggere da un database
 * mantenendo la stessa interfaccia.
 */
export function createRecipeRepository({ dataDir = DEFAULT_DATA_DIR, loadFiles = readDataFiles } = {}) {
  let recipes = [];
  let vocabulary = [];
  let index = new Map();
  let loaded = false;

  return {
    async load() {
      const data = await loadFiles(dataDir);
      const errors = validateData(data);
      if (errors.length > 0) {
        throw new Error(`Archivio ricette non valido:\n${errors.slice(0, 20).join('\n')}`);
      }
      recipes = data.recipes;
      vocabulary = data.vocabulary;
      index = buildVocabularyIndex(vocabulary);
      loaded = true;
      return { recipes: recipes.length, ingredients: vocabulary.length };
    },

    isLoaded() {
      return loaded;
    },

    getRecipes() {
      return recipes;
    },

    getVocabulary() {
      return vocabulary;
    },

    /** Nomi canonici, utili per il prompt del modello di visione. */
    getIngredientNames() {
      return vocabulary.map((item) => item.nome);
    },

    normalizeIngredients(names) {
      return normalizeIngredients(names, index);
    },

    /**
     * Suggerimenti per l'autocompletamento: prima chi inizia con il testo,
     * poi chi lo contiene; cerca anche tra i sinonimi.
     */
    searchIngredients(query, limit = 10) {
      const q = ingredientKey(query ?? '');
      if (!q) {
        return vocabulary.slice(0, limit).map(({ nome, categoria }) => ({ nome, categoria }));
      }
      const scored = [];
      for (const item of vocabulary) {
        let best = Infinity;
        for (const [rank, term] of [item.nome, ...item.sinonimi].entries()) {
          const key = ingredientKey(term);
          const isName = rank === 0 ? 0 : 1;
          if (key.startsWith(q)) best = Math.min(best, isName);
          else if (key.split(' ').some((word) => word.startsWith(q))) best = Math.min(best, 2 + isName);
          else if (key.includes(q)) best = Math.min(best, 4 + isName);
        }
        if (best !== Infinity) scored.push({ item, best });
      }
      scored.sort((a, b) => a.best - b.best || a.item.nome.localeCompare(b.item.nome, 'it'));
      return scored.slice(0, limit).map(({ item }) => ({ nome: item.nome, categoria: item.categoria }));
    },
  };
}
