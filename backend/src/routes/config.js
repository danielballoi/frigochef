import { Router } from 'express';

/** Configurazione utile al frontend: dispensa predefinita e limiti. */
export function configRouter({ config }) {
  const router = Router();

  router.get('/config', (_req, res) => {
    res.json({
      pantryDefault: config.pantryDefault,
      maxPhotos: config.maxPhotos,
      maxImageMb: config.maxImageMb,
      visionTimeoutMs: config.visionTimeoutMs,
    });
  });

  return router;
}
