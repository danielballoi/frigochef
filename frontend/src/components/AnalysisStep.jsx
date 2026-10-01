const STATUS_TEXT = {
  pending: 'In attesa',
  running: 'Analisi in corso…',
  done: 'Fatto',
  failed: 'Non riuscita',
};

export default function AnalysisStep({ shelves, currentShelfId, running, onRetry, onRetryAll, onContinue }) {
  const total = shelves.length;
  const currentIndex = shelves.findIndex((shelf) => shelf.id === currentShelfId);
  const failed = shelves.filter((shelf) => shelf.analysis === 'failed');
  const found = new Set(shelves.flatMap((shelf) => (shelf.analysis === 'done' ? shelf.ingredients : [])));

  return (
    <section aria-labelledby="titolo-analisi">
      <h2 id="titolo-analisi">Analisi delle foto</h2>

      {running && (
        <div className="waiting" role="status" aria-live="polite">
          <div className="fridge-anim" aria-hidden="true">
            <span />
          </div>
          <p className="waiting-title">Sto guardando nel frigo…</p>
          {currentIndex >= 0 && (
            <p>
              Ripiano {currentIndex + 1} di {total}…
            </p>
          )}
          <p className="small muted">Può volerci fino a un minuto per foto.</p>
        </div>
      )}

      <ul className="analysis-list">
        {shelves.map((shelf, index) => (
          <li key={shelf.id} className={`analysis-item is-${shelf.analysis}`}>
            {shelf.previewUrl && <img src={shelf.previewUrl} alt="" className="thumb" />}
            <div className="analysis-body">
              <strong>Ripiano {index + 1}</strong>
              <span className="small">{STATUS_TEXT[shelf.analysis] ?? ''}</span>
              {shelf.analysis === 'done' && (
                <span className="small muted">
                  {shelf.ingredients.length > 0 ? shelf.ingredients.join(', ') : 'nessun ingrediente riconosciuto'}
                </span>
              )}
              {shelf.analysis === 'failed' && (
                <span className="small error-text" role="alert">
                  {shelf.analysisError}
                </span>
              )}
            </div>
            {shelf.analysis === 'failed' && !running && (
              <button
                type="button"
                className="btn btn-small btn-secondary"
                onClick={() => onRetry(shelf.id)}
                aria-label={`Riprova il ripiano ${index + 1}`}
              >
                Riprova
              </button>
            )}
          </li>
        ))}
      </ul>

      {!running && failed.length > 0 && (
        <div className="actions">
          {failed.length > 1 && (
            <button type="button" className="btn btn-secondary btn-block" onClick={onRetryAll}>
              Riprova tutte le foto non riuscite
            </button>
          )}
          <button type="button" className="btn btn-primary btn-block" onClick={onContinue}>
            {found.size === 1 ? 'Continua con 1 ingrediente trovato' : `Continua con ${found.size} ingredienti trovati`}
          </button>
        </div>
      )}
    </section>
  );
}
