import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { testConfig, silentLogger } from './helpers.js';

function appWith(repository) {
  return createApp({ config: testConfig(), logger: silentLogger, repository });
}

describe('GET /api/health', () => {
  it('risponde 200 anche senza archivio', async () => {
    const res = await request(appWith(undefined)).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('imposta gli header di sicurezza', async () => {
    const res = await request(appWith(undefined)).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('GET /api/ready', () => {
  it('503 se l\'archivio non è caricato', async () => {
    const res = await request(appWith({ isLoaded: () => false })).get('/api/ready');
    expect(res.status).toBe(503);
  });

  it('200 quando l\'archivio è caricato', async () => {
    const res = await request(appWith({ isLoaded: () => true })).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });
});

describe('percorsi sconosciuti', () => {
  it('404 in JSON', async () => {
    const res = await request(appWith(undefined)).get('/api/non-esiste');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
