import { loadConfig, ConfigError } from './config.js';
import { createLogger } from './logger.js';
import { createApp } from './app.js';

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
  const app = createApp({ config, logger });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'server avviato');
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
