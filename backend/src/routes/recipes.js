import { Router } from 'express';
import { z } from '../zod.js';
import { HttpError } from '../errors.js';
import { findRecipes } from '../recipes/findRecipes.js';

const ingredientName = z.string().trim().min(1).max(60);

const recipesBody = z.object({
  ingredients: z.array(ingredientName).min(1, 'Serve almeno un ingrediente.').max(100),
  pantry: z.array(ingredientName).max(100).default([]),
});

const ingredientsQuery = z.object({
  q: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(10),
});

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
      .join('; ');
    throw new HttpError(400, 'INVALID_INPUT', message);
  }
  return result.data;
}

export function recipesRouter({ repository }) {
  const router = Router();

  router.get('/ingredients', (req, res) => {
    const { q, limit } = parse(ingredientsQuery, req.query);
    res.json({ ingredients: repository.searchIngredients(q, limit) });
  });

  router.post('/recipes', (req, res) => {
    const body = parse(recipesBody, req.body ?? {});
    const fridge = repository.normalizeIngredients(body.ingredients);
    const pantry = repository.normalizeIngredients(body.pantry);
    const recipes = findRecipes(repository.getRecipes(), {
      fridge: fridge.known,
      pantry: pantry.known,
    });
    res.json({
      recipes,
      ingredients: fridge.known,
      ignored: [...fridge.unknown, ...pantry.unknown],
    });
  });

  return router;
}
