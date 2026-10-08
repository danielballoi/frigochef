import { z } from 'zod';

// Messaggi di validazione in italiano: arrivano all'utente (errori 400) e nei log di avvio.
z.config(z.locales.it());

export { z };
