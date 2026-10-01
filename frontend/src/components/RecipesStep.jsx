function MissingBadge({ missing }) {
  if (missing.length === 0) return <span className="tag tag-ok">✓ Hai tutto</span>;
  return <span className="tag tag-missing">Manca: {missing.join(', ')}</span>;
}

export default function RecipesStep({ state, onOpen, onRetry, onBack }) {
  return (
    <section aria-labelledby="titolo-ricette">
      <h2 id="titolo-ricette">Cosa puoi cucinare</h2>

      {state.status === 'loading' && (
        <p role="status" className="waiting-title">
          Cerco le ricette…
        </p>
      )}

      {state.status === 'error' && (
        <div className="error-box" role="alert">
          <p>{state.error}</p>
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Riprova
          </button>
        </div>
      )}

      {state.status === 'done' && state.list.length === 0 && (
        <div className="empty">
          <p>Nessuna ricetta trovata con questi ingredienti.</p>
          <p className="small muted">Prova ad aggiungere qualche ingrediente o a controllare la dispensa.</p>
        </div>
      )}

      {state.status === 'done' && state.list.length > 0 && (
        <ul className="recipe-list">
          {state.list.map((recipe) => (
            <li key={recipe.id}>
              <button type="button" className="recipe-card" onClick={() => onOpen(recipe)}>
                <span className="recipe-name">{recipe.nome}</span>
                <span className="recipe-meta small">
                  ⏱ {recipe.tempoMinuti} min · {recipe.difficolta} · {recipe.porzioni}{' '}
                  {recipe.porzioni === 1 ? 'porzione' : 'porzioni'}
                </span>
                <MissingBadge missing={recipe.mancanti} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button type="button" className="btn btn-link" onClick={onBack}>
          ← Modifica gli ingredienti
        </button>
      </div>
    </section>
  );
}
