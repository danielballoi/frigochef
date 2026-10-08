import { z } from './zod.js';

export const DEFAULT_PANTRY = "sale,pepe,olio d'oliva,zucchero,pasta,riso,farina,aceto,acqua";

const intInRange = (name, min, max, fallback) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === '') return fallback;
      if (!/^\d+$/.test(value)) {
        ctx.addIssue({ code: 'custom', message: `${name} deve essere un numero intero` });
        return z.NEVER;
      }
      const n = Number(value);
      if (n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: `${name} deve essere tra ${min} e ${max}` });
        return z.NEVER;
      }
      return n;
    });

const withDefault = (schema, fallback) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === '' ? fallback : value))
    .pipe(schema);

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

const envSchema = z.object({
  PORT: intInRange('PORT', 1, 65535, 3000),
  VISION_PROVIDER: withDefault(z.enum(['mock', 'ollama', 'gemini']), 'mock'),
  OLLAMA_URL: withDefault(z.url({ protocol: /^https?$/ }), 'http://localhost:11434'),
  VISION_MODEL: withDefault(z.string().min(1), 'qwen3-vl:4b'),
  GEMINI_API_KEY: withDefault(z.string(), ''),
  GEMINI_MODEL: withDefault(
    z.string().regex(/^[a-z0-9][a-z0-9.-]*$/, 'GEMINI_MODEL deve essere un nome di modello, es. gemini-3.5-flash-lite'),
    DEFAULT_GEMINI_MODEL,
  ),
  VISION_TIMEOUT_MS: intInRange('VISION_TIMEOUT_MS', 1000, 600000, 90000),
  MAX_IMAGE_MB: intInRange('MAX_IMAGE_MB', 1, 50, 5),
  MAX_PHOTOS: intInRange('MAX_PHOTOS', 1, 20, 8),
  PANTRY_DEFAULT: withDefault(z.string(), DEFAULT_PANTRY),
  RATE_LIMIT_PER_MIN: intInRange('RATE_LIMIT_PER_MIN', 1, 10000, 20),
  LOG_LEVEL: withDefault(
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
    'info',
  ),
}).superRefine((e, ctx) => {
  if (e.VISION_PROVIDER === 'gemini' && !e.GEMINI_API_KEY) {
    ctx.addIssue({ code: 'custom', path: ['GEMINI_API_KEY'], message: 'GEMINI_API_KEY è obbligatoria con VISION_PROVIDER=gemini' });
  }
});

export class ConfigError extends Error {
  constructor(issues) {
    super(`Configurazione non valida:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

export function parsePantry(value) {
  const items = value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(items)];
}

/**
 * Legge la configurazione dalle variabili d'ambiente.
 * Lancia ConfigError con un messaggio leggibile se un valore non è valido.
 */
export function loadConfig(env = process.env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const field = issue.path.join('.');
      return issue.message.startsWith(field) ? issue.message : `${field}: ${issue.message}`;
    });
    throw new ConfigError(issues);
  }
  const e = result.data;
  const config = {
    port: e.PORT,
    visionProvider: e.VISION_PROVIDER,
    ollamaUrl: e.OLLAMA_URL.replace(/\/+$/, ''),
    visionModel: e.VISION_MODEL,
    geminiModel: e.GEMINI_MODEL,
    visionTimeoutMs: e.VISION_TIMEOUT_MS,
    maxImageMb: e.MAX_IMAGE_MB,
    maxImageBytes: e.MAX_IMAGE_MB * 1024 * 1024,
    maxPhotos: e.MAX_PHOTOS,
    pantryDefault: parsePantry(e.PANTRY_DEFAULT),
    rateLimitPerMin: e.RATE_LIMIT_PER_MIN,
    logLevel: e.LOG_LEVEL,
  };
  // Segreto non enumerabile: resta fuori da JSON.stringify, dai log e dagli spread della config.
  Object.defineProperty(config, 'geminiApiKey', { value: e.GEMINI_API_KEY, enumerable: false });
  return Object.freeze(config);
}
