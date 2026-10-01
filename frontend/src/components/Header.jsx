export default function Header({ onReset, showReset }) {
  return (
    <header className="header">
      <a className="skip-link" href="#contenuto">Vai al contenuto</a>
      <h1 className="brand">
        <img src="/favicon.svg" alt="" width="32" height="32" />
        FrigoChef
      </h1>
      {showReset && (
        <button type="button" className="btn btn-small btn-ghost" onClick={onReset}>
          📷 Nuova foto
        </button>
      )}
    </header>
  );
}
