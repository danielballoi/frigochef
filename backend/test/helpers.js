import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';

export function testConfig(env = {}) {
  return loadConfig({ LOG_LEVEL: 'silent', ...env });
}

export const silentLogger = createLogger('silent');
