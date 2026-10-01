import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom non implementa gli URL degli oggetti: bastano dei segnaposto.
let counter = 0;
URL.createObjectURL = vi.fn(() => `blob:test/${++counter}`);
URL.revokeObjectURL = vi.fn();
window.scrollTo = vi.fn();

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    // ignorato
  }
});
