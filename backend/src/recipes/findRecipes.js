export const MAX_RESULTS = 10;
export const MAX_MISSING = 2;

/**
 * Cerca le ricette realizzabili (RF-05).
 *
 * Disponibili = frigo + dispensa. Si tengono le ricette con al massimo 2 ingredienti mancanti.
 * Per evitare proposte poco utili, una ricetta deve usare almeno un ingrediente del frigo e,
 * se le manca qualcosa, usarne dal frigo più di quanti ne manchino
 * (es. con solo "limone" non si propone "fragole con panna").
 * Ordine: meno mancanti, poi più ingredienti del frigo usati, poi meno ingredienti in totale, poi nome.
 */
export function findRecipes(recipes, { fridge, pantry }, { limit = MAX_RESULTS, maxMissing = MAX_MISSING } = {}) {
  const fridgeSet = new Set(fridge);
  const available = new Set([...fridge, ...pantry]);

  const matches = [];
  for (const recipe of recipes) {
    const names = recipe.ingredienti.map((ingredient) => ingredient.nome);
    const missing = names.filter((name) => !available.has(name));
    if (missing.length > maxMissing) continue;
    const fromFridge = names.filter((name) => fridgeSet.has(name));
    if (fromFridge.length === 0) continue;
    if (missing.length > 0 && fromFridge.length <= missing.length) continue;
    matches.push({ recipe, missing, fromFridge });
  }

  matches.sort(
    (a, b) =>
      a.missing.length - b.missing.length ||
      b.fromFridge.length - a.fromFridge.length ||
      a.recipe.ingredienti.length - b.recipe.ingredienti.length ||
      a.recipe.nome.localeCompare(b.recipe.nome, 'it'),
  );

  return matches.slice(0, limit).map(({ recipe, missing, fromFridge }) => ({
    ...recipe,
    mancanti: missing,
    dalFrigo: fromFridge,
  }));
}
