import { Router } from 'express';

/**
 * Endpoint di salute per Kubernetes e per la pipeline.
 * - /health: il processo è vivo (non controlla nulla di esterno)
 * - /ready: l'archivio ricette è caricato
 */
export function healthRouter({ isReady }) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/ready', (_req, res) => {
    if (isReady()) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not-ready' });
    }
  });

  return router;
}
