export default function RecipeDetail({ recipe, onBack }) {
  const missing = new Set(recipe.mancanti);

  return (
    <article aria-labelledby="titolo-ricetta" className="recipe-detail">
      <button type="button" className="btn btn-link" onClick={onBack}>
        ← Torna alle ricette
      </button>
      <h2 id="titolo-ricetta">{recipe.nome}</h2>
      <p className="recipe-meta">
        <span>⏱ {recipe.tempoMinuti} minuti</span>
        <span>👥 {recipe.porzioni} {recipe.porzioni === 1 ? 'porzione' : 'porzioni'}</span>
        <span>📊 {recipe.difficolta}</span>
        <span className="muted">{recipe.categoria}</span>
      </p>

      <h3>Ingredienti</h3>
      <ul className="ingredient-list">
        {recipe.ingredienti.map((item) => (
          <li key={item.nome} className={missing.has(item.nome) ? 'is-missing' : undefined}>
            <span className="ingredient-name">{item.nome}</span>
            <span className="muted"> — {item.quantita}</span>
            {missing.has(item.nome) && <span className="tag tag-missing">manca</span>}
          </li>
        ))}
      </ul>

      <h3>Preparazione</h3>
      <ol className="steps">
        {recipe.passaggi.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
    </article>
  );
}
