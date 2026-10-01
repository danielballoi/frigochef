/** Unisce più liste di ingredienti senza doppioni (ignorando maiuscole e spazi), mantenendo l'ordine. */
export function mergeUnique(...lists) {
  const seen = new Set();
  const result = [];
  for (const list of lists) {
    for (const item of list ?? []) {
      const name = String(item).trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      result.push(name);
    }
  }
  return result;
}
