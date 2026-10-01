import { describe, it, expect } from 'vitest';
import { loadConfig, ConfigError, parsePantry } from '../src/config.js';

describe('loadConfig', () => {
  it('usa i valori predefiniti se le variabili mancano', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      port: 3000,
      visionProvider: 'mock',
      ollamaUrl: 'http://localhost:11434',
      visionModel: 'qwen3-vl:4b',
      visionTimeoutMs: 90000,
      maxImageMb: 5,
      maxImageBytes: 5 * 1024 * 1024,
      maxPhotos: 8,
      rateLimitPerMin: 20,
      logLevel: 'info',
    });
    expect(config.pantryDefault).toEqual([
      'sale', 'pepe', "olio d'oliva", 'zucchero', 'pasta', 'riso', 'farina', 'aceto', 'acqua',
    ]);
  });

  it('legge i valori dalle variabili', () => {
    const config = loadConfig({
      PORT: '8080',
      VISION_PROVIDER: 'ollama',
      OLLAMA_URL: 'http://ollama:11434/',
      VISION_MODEL: 'qwen3-vl:2b',
      VISION_TIMEOUT_MS: '30000',
      MAX_IMAGE_MB: '3',
      MAX_PHOTOS: '4',
      PANTRY_DEFAULT: 'Sale, pepe ,,sale',
      RATE_LIMIT_PER_MIN: '5',
      LOG_LEVEL: 'debug',
    });
    expect(config).toMatchObject({
      port: 8080,
      visionProvider: 'ollama',
      ollamaUrl: 'http://ollama:11434',
      visionModel: 'qwen3-vl:2b',
      visionTimeoutMs: 30000,
      maxImageBytes: 3 * 1024 * 1024,
      maxPhotos: 4,
      pantryDefault: ['sale', 'pepe'],
      rateLimitPerMin: 5,
      logLevel: 'debug',
    });
  });

  it('tratta le stringhe vuote come valori mancanti', () => {
    expect(loadConfig({ PORT: '', VISION_PROVIDER: '' })).toMatchObject({ port: 3000, visionProvider: 'mock' });
  });

  it.each([
    [{ PORT: 'abc' }, 'PORT'],
    [{ PORT: '70000' }, 'PORT'],
    [{ VISION_PROVIDER: 'openai' }, 'VISION_PROVIDER'],
    [{ OLLAMA_URL: 'non-un-url' }, 'OLLAMA_URL'],
    [{ OLLAMA_URL: 'ftp://ollama' }, 'OLLAMA_URL'],
    [{ VISION_TIMEOUT_MS: '-1' }, 'VISION_TIMEOUT_MS'],
    [{ MAX_IMAGE_MB: '0' }, 'MAX_IMAGE_MB'],
    [{ MAX_PHOTOS: '1.5' }, 'MAX_PHOTOS'],
    [{ RATE_LIMIT_PER_MIN: 'tanti' }, 'RATE_LIMIT_PER_MIN'],
    [{ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL'],
  ])('rifiuta %o con un messaggio che nomina la variabile', (env, name) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
    try {
      loadConfig(env);
    } catch (err) {
      expect(err.message).toContain(name);
    }
  });

  it('elenca tutti gli errori insieme', () => {
    try {
      loadConfig({ PORT: 'x', MAX_PHOTOS: '0' });
      expect.unreachable();
    } catch (err) {
      expect(err.issues).toHaveLength(2);
    }
  });
});

describe('parsePantry', () => {
  it('normalizza, toglie vuoti e doppioni', () => {
    expect(parsePantry(' Olio d\'oliva ,SALE,, sale ')).toEqual(["olio d'oliva", 'sale']);
  });
});
