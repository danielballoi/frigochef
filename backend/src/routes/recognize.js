import { Router } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../errors.js';

const UNSUPPORTED = 'Formato non valido: usa una foto JPEG, PNG o WebP.';

/** Riconosce il formato dai primi byte, senza fidarsi del Content-Type dichiarato. */
export function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export function modelHealthRouter({ vision }) {
  const router = Router();
  router.get('/health/model', async (_req, res) => {
    const result = await vision.check();
    const body = { provider: vision.name, model: vision.model };
    if (result.ok) {
      res.json({ status: 'ok', ...body });
    } else {
      res.status(503).json({ status: 'unavailable', ...body, reason: result.reason });
    }
  });
  return router;
}

export function recognizeRouter({ config, vision }) {
  const router = Router();

  // L'immagine resta solo in memoria: multer non scrive mai su disco.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxImageBytes, files: 1, fields: 5, parts: 6 },
    fileFilter: (_req, file, cb) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        return cb(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', UNSUPPORTED));
      }
      cb(null, true);
    },
  }).single('image');

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: config.rateLimitPerMin,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new HttpError(429, 'TOO_MANY_REQUESTS', 'Troppe richieste: aspetta un minuto e riprova.'));
    },
  });

  const parseUpload = (req, res, next) => {
    upload(req, res, (err) => {
      if (!err) return next();
      if (err instanceof HttpError) return next(err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new HttpError(413, 'IMAGE_TOO_LARGE', `Foto troppo grande: massimo ${config.maxImageMb} MB.`));
        }
        return next(new HttpError(400, 'INVALID_UPLOAD', 'Invia una sola foto nel campo "image".'));
      }
      next(new HttpError(400, 'INVALID_UPLOAD', 'Caricamento della foto non riuscito.'));
    });
  };

  router.post('/recognize', limiter, parseUpload, async (req, res) => {
    const file = req.file;
    if (!file) {
      throw new HttpError(400, 'IMAGE_REQUIRED', 'Manca la foto: inviala nel campo "image".');
    }
    if (!detectImageType(file.buffer)) {
      throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', UNSUPPORTED);
    }

    // Se il telefono chiude la connessione, smettiamo di aspettare il modello.
    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableFinished) controller.abort();
    };
    res.on('close', onClose);

    const start = performance.now();
    try {
      const result = await vision.recognize(file.buffer, { signal: controller.signal });
      const durationMs = Math.round(performance.now() - start);
      res.locals.logFields = { model: result.model, recognitionMs: durationMs, ingredientsFound: result.ingredients.length };
      res.json({ ingredients: result.ingredients, model: result.model, durationMs });
    } catch (err) {
      res.locals.logFields = { model: vision.model, recognitionMs: Math.round(performance.now() - start) };
      if (controller.signal.aborted) return; // il client se n'è andato: nessuna risposta da inviare
      throw err;
    } finally {
      res.off('close', onClose);
    }
  });

  return router;
}
