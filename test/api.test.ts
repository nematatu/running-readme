import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app, { annualStats, tokyoYear } from '../src/index';

const token = 'test-only-token-not-a-production-secret-12345';
const year = tokyoYear();
const sample = { year, distanceMeters: 125600, durationSeconds: 48600 };
const request = (path: string, init?: RequestInit) => app.request(`https://example.test${path}`, init, env);
const post = (value: unknown, authorization = `Bearer ${token}`) => request('/v1/stats', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authorization }, body: JSON.stringify(value),
});

beforeEach(async () => {
  vi.restoreAllMocks();
  for (const key of (await env.RUNNING_STATS.list()).keys) await env.RUNNING_STATS.delete(key.name);
});

describe('annual statistics', () => {
  it('stores only the annual aggregate and exposes converted public JSON', async () => {
    const saved = await post(sample);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ ok: true, ...sample });
    expect(await env.RUNNING_STATS.get(`running:year:${year}`, 'json')).toEqual(sample);
    const response = await request('/v1/stats');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ year, distanceKm: 125.6, durationSeconds: 48600 });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
  it('overwrites rather than adds, keeps different years separate, and accepts zero', async () => {
    await post(sample);
    await post(sample);
    await post({ ...sample, year: year - 1, distanceMeters: 500 });
    expect(await (await request('/v1/stats')).json()).toEqual({ year, distanceKm: 125.6, durationSeconds: 48600 });
    expect(await (await request(`/v1/stats?year=${year - 1}`)).json()).toEqual({ year: year - 1, distanceKm: 0.5, durationSeconds: 48600 });
    expect((await post({ year, distanceMeters: 0, durationSeconds: 0 })).status).toBe(200);
    expect(await (await request('/v1/stats')).json()).toEqual({ year, distanceKm: 0, durationSeconds: 0 });
  });
  it('distinguishes missing data from zero', async () => {
    const response = await request('/v1/stats');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: 'STATS_NOT_FOUND', message: 'No statistics registered for this year.' } });
  });
  it.each(['', 'Bearer wrong-token', 'Basic abc'])('rejects unauthorized requests (%s)', async (authorization) => {
    const response = await post(sample, authorization);
    expect([400, 401]).toContain(response.status);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await response.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Bearer authentication required.' } });
    expect((await env.RUNNING_STATS.list()).keys).toHaveLength(0);
  });
  it('fails closed when the secret is absent', async () => {
    const response = await app.request('https://example.test/v1/stats', { method: 'POST' }, { ...env, INGEST_TOKEN: '' });
    expect(response.status).toBe(503);
  });
  it.each([
    { ...sample, distanceMeters: -1 }, { ...sample, durationSeconds: -1 },
    { ...sample, distanceMeters: 100_000_001 }, { ...sample, durationSeconds: 31_622_401 },
    { ...sample, year: 1969 }, { ...sample, year: year + 1 }, { ...sample, year: 2025.5 },
    { ...sample, distanceMeters: '1000' }, { ...sample, durationSeconds: null },
    { ...sample, distanceMeters: null }, { ...sample, extra: 'secret' },
    { ...sample, year: 2025, durationSeconds: 31_536_001 }, {}, [], null,
  ])('rejects invalid body %j', async (value) => expect((await post(value)).status).toBe(400));
  it.each([NaN, Infinity, -Infinity])('rejects non-finite schema values %s', (value) => {
    expect(annualStats.safeParse({ ...sample, distanceMeters: value }).success).toBe(false);
    expect(annualStats.safeParse({ ...sample, durationSeconds: value }).success).toBe(false);
  });
  it.each(['{', '{"year":NaN}', '{"distanceMeters":Infinity}', '{"distanceMeters":1e999}'])('rejects malformed or non-finite JSON %s', async (body) => {
    const response = await request('/v1/stats', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body });
    expect(response.status).toBe(400);
  });
  it('accepts fractional units and leap year bounds', async () => {
    expect((await post({ year: 2024, distanceMeters: 0.5, durationSeconds: 31_622_400 })).status).toBe(200);
  });
  it('bounds streaming payloads and checks content type', async () => {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    expect((await request('/v1/stats', { method: 'POST', headers, body: ' '.repeat(1025) })).status).toBe(413);
    expect((await request('/v1/stats', { method: 'POST', headers: { ...headers, 'Content-Length': '1025' }, body: ' '.repeat(1025) })).status).toBe(413);
    expect((await request('/v1/stats', { method: 'POST', headers: { ...headers, 'Content-Length': '10' }, body: JSON.stringify(sample) + ' '.repeat(1025) })).status).toBe(413);
    expect((await request('/v1/stats', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' })).status).toBe(415);
  });
  it.each(['?year=', '?year=abc', '?year=2026.0', '?year=1969', '?year=9999', '?year=2025&year=2024', '?theme=<script>', '?foo=bar'])('rejects invalid stats query %s', async (query) => {
    expect((await request(`/v1/stats${query}`)).status).toBe(400);
  });
  it('uses Tokyo year across UTC new year boundary', () => {
    expect(tokyoYear(new Date('2026-12-31T14:59:59Z'))).toBe(2026);
    expect(tokyoYear(new Date('2026-12-31T15:00:00Z'))).toBe(2027);
  });
  it('returns generic errors without leaked storage details', async () => {
    await env.RUNNING_STATS.put(`running:year:${year}`, '{"token":"private"}');
    const response = await request('/v1/stats');
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
  });
  it.each(['/health', '/running.svg', '/v1/stats'])('rejects unsupported methods on %s', async (path) => {
    for (const method of ['DELETE', 'PUT', 'PATCH', 'OPTIONS', 'HEAD']) {
      const response = await request(path, { method });
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toContain('GET');
    }
  });
  it('keeps health minimal and unknown route errors consistent', async () => {
    expect(await (await request('/health')).json()).toEqual({ status: 'ok' });
    expect((await request('/not-found')).status).toBe(404);
  });
});

describe('SVG', () => {
  it.each(['light', 'dark'])('returns accessible %s SVG with correct MIME and cache policy', async (theme) => {
    await post(sample);
    const response = await request(`/running.svg?theme=${theme}`);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toContain('no-cache');
    const svg = await response.text();
    expect(svg).toContain('125.6 km');
    expect(svg).toContain('13h 30m');
    expect(svg).toContain('viewBox="0 0 420 124"');
    expect(svg).toContain(theme === 'dark' ? '#0d1117' : '#ffffff');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('>Running</text>');
    expect(svg).toContain('ui-monospace');
    expect(svg).not.toMatch(/year-to-date running|rx=|stroke=|fill="#0969da"|fill="#58a6ff"/);
    expect(svg).not.toMatch(/<script|foreignObject|href=|onload=/i);
  });
  it('shows Not synced for missing data, literal zero for registered zero', async () => {
    const svg = await (await request('/running.svg')).text();
    expect(svg).toContain('Not synced');
    expect(svg).not.toContain('0.0 km');
    await post({ year, distanceMeters: 0, durationSeconds: 0 });
    const zero = await (await request('/running.svg')).text();
    expect(zero).toContain('0.0 km');
    expect(zero).toContain('0h 0m');
  });
  it('renders recent rows and their distance total without a pinned-gist preview', async () => {
    await env.RUNNING_STATS.put(`running:year:${year}`, JSON.stringify({ ...sample, recentWorkouts: [
      { date: `${year}-01-16`, distanceMeters: 2500, durationSeconds: 900, averageSpeedKmh: 10 },
      { date: `${year}-01-15`, distanceMeters: 500, durationSeconds: 120, averageSpeedKmh: 15 },
    ] }));
    const svg = await (await request('/running.svg')).text();
    expect(svg).toContain('viewBox="0 0 420 184"');
    expect(svg).toContain(`${year}-01-16`);
    expect(svg).toContain('0:15:00');
    expect(svg).toContain('0:02:00');
    expect(svg).toContain('Recent total');
    expect(svg).toContain('3.00 km');
    expect(svg).toContain('width="15.2" height="8"');
    expect(svg).toContain('Bars compare distances with the longest displayed run, not a goal.');
    expect(svg).toContain('ui-monospace');
    expect(svg).not.toMatch(/year-to-date running|rx=|stroke=|fill="#0969da"|fill="#58a6ff"/);
    expect(svg).not.toContain('averageSpeed');
    expect(svg).not.toMatch(/<script|foreignObject|href=|onload=/i);
  });
  it('renders registered zero-distance recent rows', async () => {
    await env.RUNNING_STATS.put(`running:year:${year}`, JSON.stringify({ year, distanceMeters: 0, durationSeconds: 0, recentWorkouts: [
      { date: `${year}-01-16`, distanceMeters: 0, durationSeconds: 0 },
    ] }));
    const svg = await (await request('/running.svg?theme=dark')).text();
    expect(svg).toContain('viewBox="0 0 420 160"');
    expect(svg).toContain('0.00 km');
    expect(svg).toContain('width="0" height="8"');
    expect(svg).not.toMatch(/NaN|Infinity|Not synced/);
  });
  it.each(['?theme=%22%3E%3Cscript%3E', '?year=%3Csvg%3E', '?theme=dark&theme=light', '?label=%3Cscript%3E'])('rejects XML injection query %s', async (query) => {
    const response = await request(`/running.svg${query}`);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('<script>');
  });
});
