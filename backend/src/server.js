import { loadConfig, ConfigError } from './config.js';
import { createLogger } from './logger.js';
import { createApp } from './app.js';
import { createRecipeRepository } from './recipes/recipeRepository.js';
import { createVisionProvider } from './vision/index.js';

const SHUTDOWN_TIMEOUT_MS = 5000;

function start() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger(config.logLevel);
  const repository = createRecipeRepository();
  const vision = createVisionProvider(config, repository);
  const app = createApp({ config, logger, repository, vision });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, visionProvider: config.visionProvider, visionModel: vision.model }, 'server avviato');
  });

  // Chiave non valida o modello inesistente: lo si scopre subito nei log, senza bloccare l'avvio
  // (la rete può mancare solo per poco; /api/health/model ripete il controllo).
  if (config.visionProvider !== 'mock') {
    vision.check().then((result) => {
      if (result.ok) logger.info({ visionModel: vision.model }, 'modello di visione raggiungibile');
      else logger.warn({ visionModel: vision.model, reason: result.reason }, 'modello di visione non pronto');
    });
  }

  repository
    .load()
    .then((counts) => logger.info(counts, 'archivio ricette caricato'))
    .catch((err) => {
      logger.fatal({ err: err.message }, 'impossibile caricare l\'archivio ricette');
      process.exit(1);
    });

  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'arresto in corso');

    const forceExit = setTimeout(() => {
      logger.warn('arresto forzato: connessioni ancora aperte');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close((err) => {
      if (err) {
        logger.error({ err: err.message }, 'errore durante la chiusura');
        process.exit(1);
      }
      logger.info('server chiuso');
      process.exit(0);
    });
    server.closeIdleConnections();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
