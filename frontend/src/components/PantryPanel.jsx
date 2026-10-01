import Chips from './Chips.jsx';
import IngredientInput from './IngredientInput.jsx';
import { mergeUnique } from '../ingredients.js';

/** Dispensa (RF-04): ingredienti considerati sempre disponibili, salvati nel telefono. */
export default function PantryPanel({ pantry, pantryDefault, onChange }) {
  const isDefault =
    pantry.length === pantryDefault.length && pantry.every((item, index) => item === pantryDefault[index]);

  return (
    <details className="panel">
      <summary>
        La tua dispensa <span className="badge">{pantry.length}</span>
      </summary>
      <p className="small muted">
        Questi ingredienti li consideriamo sempre disponibili. Togli quelli che non hai e aggiungi quelli che hai
        sempre in casa.
      </p>
      <Chips
        items={pantry}
        label="Ingredienti della dispensa"
        variant="chips-pantry"
        onRemove={(name) => onChange(pantry.filter((item) => item !== name))}
      />
      <IngredientInput
        label="Aggiungi alla dispensa"
        placeholder="es. burro"
        exclude={pantry}
        onAdd={(name) => onChange(mergeUnique(pantry, [name]))}
      />
      {!isDefault && (
        <button type="button" className="btn btn-link" onClick={() => onChange([...pantryDefault])}>
          Ripristina la dispensa predefinita
        </button>
      )}
    </details>
  );
}
