function FileButton({ label, ariaLabel, capture, onPick, className = 'btn btn-secondary' }) {
  return (
    <label className={className}>
      <input
        type="file"
        accept="image/*"
        {...(capture ? { capture: 'environment' } : {})}
        className="visually-hidden"
        aria-label={ariaLabel}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          onPick(file);
        }}
      />
      <span aria-hidden="true">{label}</span>
    </label>
  );
}

/** `canRemoveEmpty`: un riquadro vuoto si può togliere solo se non è l'unico. */
export default function ShelfCard({ label, shelf, onPick, onRemove, canRemoveEmpty = true }) {
  const hasPhoto = shelf.status === 'ready' && shelf.previewUrl;

  return (
    <article className="shelf" aria-label={label}>
      <h3 className="shelf-title">{label}</h3>

      <div className="shelf-preview">
        {hasPhoto && <img src={shelf.previewUrl} alt={`Foto del ${label.toLowerCase()}`} />}
        {shelf.status === 'empty' && <span className="muted">Nessuna foto</span>}
        {shelf.status === 'processing' && (
          <span className="muted" role="status">
            Preparo la foto…
          </span>
        )}
        {shelf.status === 'error' && (
          <span className="error-text" role="alert">
            {shelf.error}
          </span>
        )}
      </div>

      <div className="shelf-buttons">
        {hasPhoto ? (
          <>
            <FileButton label="🔄 Rifai" ariaLabel={`Rifai la foto del ${label}`} capture onPick={onPick} />
            <button type="button" className="btn btn-ghost" onClick={onRemove} aria-label={`Togli ${label}`}>
              ✕ Togli
            </button>
          </>
        ) : (
          <>
            <FileButton
              label="📷 Scatta"
              ariaLabel={`Scatta una foto del ${label}`}
              capture
              onPick={onPick}
              className="btn btn-primary"
            />
            <FileButton label="🖼️ Galleria" ariaLabel={`Scegli dalla galleria per ${label}`} onPick={onPick} />
            {canRemoveEmpty && (
              <button type="button" className="btn btn-ghost btn-icon" onClick={onRemove} aria-label={`Togli ${label}`}>
                ✕
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
