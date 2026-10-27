import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import app from '../src/index';

const headers = {
  Authorization: 'Bearer test-only-token-not-a-production-secret-12345',
  'Content-Type': 'application/json',
};

const upload = (path: string, contentType = 'application/json') => app.request(
  `https://example.test${path}`,
  { method: 'POST', headers: { ...headers, 'Content-Type': contentType }, body: '{' },
  env,
);

describe('HTTP boundary contract', () => {
  it('checks media type before query and JSON syntax', async () => {
    const response = await upload('/v1/workouts?extra=1', 'text/plain');
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use application/json.' },
    });
  });

  it('rejects workout upload queries before parsing JSON', async () => {
    const response = await upload('/v1/workouts?extra=1');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'INVALID_QUERY', message: 'Invalid query parameters.' },
    });
  });

  it.each(['/v1/stats', '/v1/workouts'])('keeps JSON syntax errors consistent on %s', async (path) => {
    const response = await upload(path, 'APPLICATION/JSON; custom parameter');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'INVALID_JSON', message: 'Body must be valid JSON.' },
    });
  });

  it.each(['/v1/stats', '/v1/workouts', '/running.svg'])('rejects repeated year parameters on %s', async (path) => {
    const response = await app.request(`https://example.test${path}?year=2026&year=2026`, undefined, env);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'INVALID_QUERY', message: 'Invalid query parameters.' },
    });
  });
});
