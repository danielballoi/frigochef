/** Etichette con ✕ per togliere un elemento. */
export default function Chips({ items, onRemove, label, variant = '' }) {
  return (
    <ul className={`chips ${variant}`} aria-label={label}>
      {items.map((item) => (
        <li key={item} className="chip">
          <span>{item}</span>
          <button type="button" onClick={() => onRemove(item)} aria-label={`Togli ${item}`}>
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
