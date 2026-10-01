/** Errore con stato HTTP e messaggio pensato per l'utente (in italiano). */
export class HttpError extends Error {
  constructor(status, code, message, options) {
    super(message, options);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function notFoundHandler(_req, _res, next) {
  next(new HttpError(404, 'NOT_FOUND', 'Risorsa non trovata.'));
}

export function errorHandler(logger) {
  // Express riconosce il gestore degli errori dai 4 argomenti.
  return (err, req, res, _next) => {
    let status = err.status ?? err.statusCode ?? 500;
    let code = err.code ?? 'INTERNAL_ERROR';
    let message = err.message;

    if (err.type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_JSON';
      message = 'Il corpo della richiesta non è JSON valido.';
    } else if (err.type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Richiesta troppo grande.';
    } else if (!(err instanceof HttpError) && status >= 500) {
      message = 'Errore interno del server.';
      code = 'INTERNAL_ERROR';
    }

    if (status >= 500) {
      logger.error({ err: { name: err.name, message: err.message, code: err.code }, path: req.path }, 'errore');
    }
    res.status(status).json({ error: { code, message } });
  };
}
