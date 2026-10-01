// La dispensa resta salvata nel telefono (localStorage), se il browser lo permette.
const KEY = 'frigochef.pantry.v1';

export function loadPantry() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
  } catch {
    return null;
  }
}

export function savePantry(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function clearPantry() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // niente da fare: senza localStorage la dispensa vale solo per questa sessione
  }
}
