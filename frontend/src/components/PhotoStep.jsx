import ShelfCard from './ShelfCard.jsx';

export default function PhotoStep({ shelves, maxPhotos, onAdd, onPick, onRemove, onAnalyze, onManual }) {
  const readyCount = shelves.filter((shelf) => shelf.status === 'ready').length;
  const processing = shelves.some((shelf) => shelf.status === 'processing');
  const atLimit = shelves.length >= maxPhotos;

  return (
    <section aria-labelledby="titolo-foto">
      <h2 id="titolo-foto" tabIndex={-1}>Fotografa il frigo</h2>
      <p className="hint">💡 Fotografa ogni ripiano da vicino, anche cassetti e sportello.</p>

      <ol className="shelves">
        {shelves.map((shelf, index) => (
          <li key={shelf.id}>
            <ShelfCard
              label={`Ripiano ${index + 1}`}
              shelf={shelf}
              canRemoveEmpty={shelves.length > 1}
              onPick={(file) => onPick(shelf.id, file)}
              onRemove={() => onRemove(shelf.id)}
            />
          </li>
        ))}
      </ol>

      <button type="button" className="btn btn-secondary btn-block" onClick={onAdd} disabled={atLimit}>
        + Aggiungi ripiano
      </button>
      {atLimit && <p className="small muted">Hai raggiunto il massimo di {maxPhotos} foto.</p>}

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={onAnalyze}
          disabled={readyCount === 0 || processing}
        >
          {readyCount > 1 ? `Analizza ${readyCount} foto` : 'Analizza'}
        </button>
        <button type="button" className="btn btn-link" onClick={onManual}>
          Preferisco scrivere gli ingredienti a mano
        </button>
      </div>
    </section>
  );
}
