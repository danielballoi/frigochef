import express from 'express';
import helmet from 'helmet';
import { requestLogger } from './logger.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { healthRouter } from './routes/health.js';

/**
 * Crea l'applicazione Express. Le dipendenze arrivano da fuori,
 * così i test possono sostituirle.
 */
export function createApp({ config, logger, repository }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(requestLogger(logger));
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.use(healthRouter({ isReady: () => Boolean(repository?.isLoaded()) }));
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  app.locals.config = config;
  return app;
}
