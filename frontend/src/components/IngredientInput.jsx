import { useEffect, useId, useState } from 'react';
import { suggestIngredients } from '../api.js';

const DEBOUNCE_MS = 200;

/**
 * Campo di aggiunta con suggerimenti dal vocabolario (es. "zuc" → "zucchine").
 * Si possono aggiungere solo ingredienti che esistono nell'archivio.
 */
export default function IngredientInput({ label, placeholder, onAdd, exclude = [] }) {
  const id = useId();
  const listId = `${id}-lista`;
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [active, setActive] = useState(-1);
  const [message, setMessage] = useState('');

  const excluded = new Set(exclude.map((item) => item.toLowerCase()));
  const visible = suggestions.filter((item) => !excluded.has(item.nome.toLowerCase()));

  useEffect(() => {
    const query = text.trim();
    if (!query) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      suggestIngredients(query, { signal: controller.signal })
        .then((items) => {
          setSuggestions(items);
          setActive(-1);
        })
        .catch(() => {
          // I suggerimenti sono un aiuto: se non arrivano, si può comunque confermare con Invio.
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  const choose = (name) => {
    onAdd(name);
    setText('');
    setSuggestions([]);
    setActive(-1);
    setMessage('');
  };

  const submit = async (event) => {
    event.preventDefault();
    const query = text.trim();
    if (!query) return;
    if (active >= 0 && visible[active]) {
      choose(visible[active].nome);
      return;
    }
    try {
      const items = await suggestIngredients(query, { limit: 5 });
      const exact = items.find((item) => item.nome.toLowerCase() === query.toLowerCase());
      const match = exact ?? items[0];
      if (match) choose(match.nome);
      else setMessage(`"${query}" non è nell'archivio degli ingredienti.`);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const onKeyDown = (event) => {
    if (visible.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % visible.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index <= 0 ? visible.length - 1 : index - 1));
    } else if (event.key === 'Escape') {
      setSuggestions([]);
      setActive(-1);
    }
  };

  const open = text.trim() !== '' && visible.length > 0;

  return (
    <form className="ingredient-input" onSubmit={submit} role="search">
      <label htmlFor={id}>{label}</label>
      <div className="input-row">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="done"
          placeholder={placeholder}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setMessage('');
            if (!event.target.value.trim()) setSuggestions([]);
          }}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="btn btn-secondary" disabled={!text.trim()}>
          Aggiungi
        </button>
      </div>
      <ul id={listId} role="listbox" className="suggestions" hidden={!open} aria-label="Suggerimenti">
        {open &&
          visible.map((item, index) => (
            <li
              key={item.nome}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'active' : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item.nome)}
            >
              {item.nome}
              <span className="small muted"> · {item.categoria}</span>
            </li>
          ))}
      </ul>
      {message && (
        <p className="small error-text" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
