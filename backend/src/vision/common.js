// Parti comuni ai provider che interrogano un modello vero (ollama, gemini).

// Prompt corto e SENZA vocabolario: l'elenco di 141 nomi costava ~1500 token di prompt
// (minuti su CPU) e i modelli piccoli finivano per ricopiarlo. Il confronto con il
// vocabolario (nomi e sinonimi) lo fa il backend, che scarta ciò che non riconosce.
export function buildPrompt() {
  return [
    'Questa è la foto dell\'interno di un frigorifero.',
    'Elenca gli alimenti visibili, con il nome generico in italiano (senza marca), uno per voce.',
    'Non inventare: se non sei sicuro, non metterlo.',
    'Rispondi solo con JSON: {"ingredients": ["nome1", "nome2"]}.',
  ].join('\n');
}

export function isAbort(err) {
  return err?.name === 'AbortError' || err?.name === 'TimeoutError';
}

/** Estrae i nomi dal JSON del modello: {"ingredients": [...]} oppure un array semplice. */
export function parseIngredientNames(text) {
  const parsed = JSON.parse(text ?? '');
  const names = Array.isArray(parsed) ? parsed : parsed?.ingredients;
  if (!Array.isArray(names)) throw new Error('campo ingredients mancante');
  return names.filter((name) => typeof name === 'string');
}
