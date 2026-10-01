import pino from 'pino';

/** Logger JSON su standard output (una riga per evento). */
export function createLogger(level = 'info') {
  return pino({
    level,
    base: { service: 'frigochef-backend' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  });
}

/**
 * Middleware: una riga di log per richiesta con metodo, percorso, stato e durata.
 * Le route possono aggiungere campi in res.locals.logFields (es. modello e durata del riconoscimento).
 */
export function requestLogger(logger) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const fields = {
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        ...res.locals.logFields,
      };
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level](fields, 'request');
    });
    next();
  };
}
