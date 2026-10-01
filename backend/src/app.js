import express from 'express';
import helmet from 'helmet';
import { requestLogger } from './logger.js';
import { errorHandler, notFoundHandler, HttpError } from './errors.js';
import { healthRouter } from './routes/health.js';
import { configRouter } from './routes/config.js';
import { recipesRouter } from './routes/recipes.js';
import { modelHealthRouter, recognizeRouter } from './routes/recognize.js';

/**
 * Crea l'applicazione Express. Le dipendenze arrivano da fuori,
 * così i test possono sostituirle.
 */
export function createApp({ config, logger, repository, vision }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(requestLogger(logger));
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.use(healthRouter({ isReady: () => Boolean(repository?.isLoaded()) }));
  if (vision) api.use(modelHealthRouter({ vision }));
  api.use(configRouter({ config }));

  // Le route seguenti hanno bisogno dell'archivio caricato.
  api.use((_req, _res, next) => {
    if (!repository?.isLoaded()) {
      return next(new HttpError(503, 'NOT_READY', 'Il servizio si sta avviando, riprova tra poco.'));
    }
    next();
  });
  api.use(recipesRouter({ repository }));
  if (vision) api.use(recognizeRouter({ config, vision }));
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
