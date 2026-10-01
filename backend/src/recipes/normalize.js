/**
 * Chiave di confronto per i nomi degli ingredienti:
 * minuscolo, senza accenti, apostrofi uniformi, spazi compattati.
 * "Baccalà", "baccala" e " BACCALÀ " danno la stessa chiave.
 */
export function ingredientKey(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/\s*'\s*/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Indice del vocabolario: chiave normalizzata (nome o sinonimo) → nome canonico.
 */
export function buildVocabularyIndex(vocabulary) {
  const index = new Map();
  for (const item of vocabulary) {
    index.set(ingredientKey(item.nome), item.nome);
    for (const synonym of item.sinonimi) {
      index.set(ingredientKey(synonym), item.nome);
    }
  }
  return index;
}

/**
 * Converte una lista di nomi liberi in nomi del vocabolario, senza doppioni.
 * Restituisce anche i nomi scartati perché non riconosciuti.
 */
export function normalizeIngredients(names, index) {
  const known = [];
  const unknown = [];
  const seen = new Set();
  for (const name of names) {
    const canonical = index.get(ingredientKey(name));
    if (!canonical) {
      if (String(name).trim()) unknown.push(String(name).trim());
      continue;
    }
    if (!seen.has(canonical)) {
      seen.add(canonical);
      known.push(canonical);
    }
  }
  return { known, unknown };
}
