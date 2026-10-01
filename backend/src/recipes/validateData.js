import { z } from 'zod';
import { ingredientKey } from './normalize.js';

export const MIN_RECIPES = 150;

const vocabularySchema = z.array(
  z.object({
    nome: z.string().min(1),
    categoria: z.string().min(1),
    sinonimi: z.array(z.string().min(1)),
  }).strict(),
).min(1);

const recipeSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id in minuscolo con trattini'),
  nome: z.string().min(1),
  categoria: z.enum(['antipasti', 'primi', 'secondi', 'contorni', 'piatti unici', 'dolci']),
  tempoMinuti: z.number().int().positive(),
  porzioni: z.number().int().positive(),
  difficolta: z.enum(['facile', 'media', 'impegnativa']),
  ingredienti: z.array(z.object({
    nome: z.string().min(1),
    quantita: z.string().min(1),
  }).strict()).min(1),
  passaggi: z.array(z.string().min(1)).min(1),
}).strict();

const recipesSchema = z.array(recipeSchema);

function formatIssues(prefix, error) {
  return error.issues.map((issue) => `${prefix}${issue.path.join('.')}: ${issue.message}`);
}

/**
 * Controlla vocabolario e ricette. Restituisce l'elenco degli errori (vuoto se è tutto valido).
 */
export function validateData({ recipes, vocabulary }) {
  const errors = [];

  const vocabResult = vocabularySchema.safeParse(vocabulary);
  if (!vocabResult.success) {
    return formatIssues('ingredients.json ', vocabResult.error);
  }
  const recipesResult = recipesSchema.safeParse(recipes);
  if (!recipesResult.success) {
    return formatIssues('recipes.json ', recipesResult.error);
  }

  // Nomi e sinonimi: ogni chiave deve indicare un solo ingrediente.
  const owner = new Map();
  for (const item of vocabulary) {
    if (item.nome !== item.nome.trim().toLowerCase()) {
      errors.push(`vocabolario: il nome "${item.nome}" deve essere in minuscolo e senza spazi ai lati`);
    }
    for (const term of [item.nome, ...item.sinonimi]) {
      const key = ingredientKey(term);
      const previous = owner.get(key);
      if (previous !== undefined) {
        errors.push(`vocabolario: "${term}" compare più volte (in "${previous}" e in "${item.nome}")`);
      } else {
        owner.set(key, item.nome);
      }
    }
  }
  const names = new Set(vocabulary.map((item) => item.nome));

  if (recipes.length < MIN_RECIPES) {
    errors.push(`ricette: ne servono almeno ${MIN_RECIPES}, trovate ${recipes.length}`);
  }

  const ids = new Set();
  for (const recipe of recipes) {
    if (ids.has(recipe.id)) errors.push(`ricette: id duplicato "${recipe.id}"`);
    ids.add(recipe.id);

    const used = new Set();
    for (const ingredient of recipe.ingredienti) {
      if (!names.has(ingredient.nome)) {
        errors.push(`ricetta "${recipe.id}": ingrediente "${ingredient.nome}" non presente nel vocabolario`);
      }
      if (used.has(ingredient.nome)) {
        errors.push(`ricetta "${recipe.id}": ingrediente "${ingredient.nome}" ripetuto`);
      }
      used.add(ingredient.nome);
    }
  }

  return errors;
}
