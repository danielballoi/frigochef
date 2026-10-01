import Chips from './Chips.jsx';
import IngredientInput from './IngredientInput.jsx';
import PantryPanel from './PantryPanel.jsx';

export default function IngredientsStep({
  ingredients,
  onAdd,
  onRemove,
  pantry,
  pantryDefault,
  onPantryChange,
  onSearch,
  onBackToPhotos,
}) {
  return (
    <section aria-labelledby="titolo-ingredienti">
      <h2 id="titolo-ingredienti" tabIndex={-1}>Cosa c'è nel frigo</h2>
      <p className="small muted">
        Controlla la lista: tocca ✕ per togliere ciò che è sbagliato e aggiungi ciò che manca.
      </p>

      {ingredients.length > 0 ? (
        <Chips items={ingredients} onRemove={onRemove} label="Ingredienti del frigo" />
      ) : (
        <p className="empty">Nessun ingrediente per ora: aggiungine almeno uno.</p>
      )}

      <IngredientInput label="Aggiungi un ingrediente" placeholder="es. zucchine" exclude={ingredients} onAdd={onAdd} />

      <PantryPanel pantry={pantry} pantryDefault={pantryDefault} onChange={onPantryChange} />

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={onSearch}
          disabled={ingredients.length === 0}
        >
          🍳 Cosa cucino?
        </button>
        <button type="button" className="btn btn-link" onClick={onBackToPhotos}>
          ← Torna alle foto
        </button>
      </div>
    </section>
  );
}
