import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { aggregateWorkoutText } from '../src/workouts';

const token = 'test-only-token-not-a-production-secret-12345';
const year = 2026;
const block = (date = `${year}/01/15 07:30`, distance = '2,500 m', duration = '900秒 (15 min : 00 sec)') => `Workout Type: Running\nDate: ${date}\nDuration: ${duration}\nDistance: ${distance}`;
const upload = (body: unknown, authorization = `Bearer ${token}`) => app.request('https://example.test/v1/workouts', {
  method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}, env);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
  for (const key of (await env.RUNNING_STATS.list()).keys) await env.RUNNING_STATS.delete(key.name);
});

afterEach(() => vi.useRealTimers());

describe('workout memo upload', () => {
  it('sums complete input on the server, ignores other years and stores only aggregate fields', async () => {
    const text = `${block()}\nEnd date: ${year}/01/15 07:45\nHeart rate: 160 bpm\nActive calories: 200\nAvg Speed: 10 km/h\n\n${block(`${year}/01/16 07:30`, '1.5 km', '10 min')}\n\n${block(`${year - 1}/01/15 07:30`)}`;
    const response = await upload({ workoutsText: text });
    expect(response.status).toBe(200);
    const expectedRecent = [
      { date: `${year}-01-16`, distanceMeters: 1500, durationSeconds: 600 },
      { date: `${year}-01-15`, distanceMeters: 2500, durationSeconds: 900 },
    ];
    expect(await response.json()).toEqual({ ok: true, year, distanceMeters: 4000, durationSeconds: 1500, workoutCount: 2, recentWorkouts: expectedRecent });
    expect((await env.RUNNING_STATS.list()).keys.map((key) => key.name)).toEqual([`running:year:${year}`]);
    expect(await env.RUNNING_STATS.get(`running:year:${year}`, 'json')).toEqual({ year, distanceMeters: 4000, durationSeconds: 1500, recentWorkouts: expectedRecent });
    const raw = await env.RUNNING_STATS.get(`running:year:${year}`);
    expect(raw).not.toMatch(/Heart|calories|Speed|07:30|Identifier/);
    expect(await (await app.request('https://example.test/v1/stats', undefined, env)).json()).toEqual({ year, distanceKm: 4, durationSeconds: 1500 });
  });
  it('replaces a snapshot without adding on resend, supports explicit archive year', async () => {
    await upload({ workoutsText: block() });
    await upload({ workoutsText: block() });
    expect(await env.RUNNING_STATS.get(`running:year:${year}`, 'json')).toEqual({ year, distanceMeters: 2500, durationSeconds: 900, recentWorkouts: [{ date: `${year}-01-15`, distanceMeters: 2500, durationSeconds: 900 }] });
    const response = await upload({ year: 2024, workoutsText: block('2024/02/29 08:01:02', '1,001.5 m', '1.5 h') });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, year: 2024, distanceMeters: 1001.5, durationSeconds: 5400, workoutCount: 1, recentWorkouts: [{ date: '2024-02-29', distanceMeters: 1001.5, durationSeconds: 5400 }] });
  });
  it('accepts CRLF, nonbreaking unit spaces, optional IDs, and registered zero metrics', async () => {
    const response = await upload({ workoutsText: `${block(undefined, '0\u00a0m', '0\u202fs')}\nIdentifier: local-example-id`.replaceAll('\n', '\r\n') });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, year, distanceMeters: 0, durationSeconds: 0, workoutCount: 1, recentWorkouts: [{ date: `${year}-01-15`, distanceMeters: 0, durationSeconds: 0 }] });
  });
  it('uses Tokyo local year boundaries', () => {
    expect(aggregateWorkoutText(`${block('2025/12/31 23:59')}\n\n${block('2026/01/01 00:00')}`, 2026, new Date('2026-02-01T00:00:00Z')).workoutCount).toBe(1);
  });
  it('rejects missing target-year records without clearing prior totals', async () => {
    await upload({ workoutsText: block() });
    const response = await upload({ workoutsText: block(`${year - 1}/01/15 07:30`) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'NO_RUNNING_DATA', message: 'No running records for the selected year. Existing statistics were not changed.' } });
    expect(await env.RUNNING_STATS.get(`running:year:${year}`, 'json')).toEqual({ year, distanceMeters: 2500, durationSeconds: 900, recentWorkouts: [{ date: `${year}-01-15`, distanceMeters: 2500, durationSeconds: 900 }] });
  });
  it.each([
    {}, { workoutsText: '' }, { workoutsText: [] }, { workoutsText: block(), extra: true },
    { workoutsText: block(), year: '2026' }, { workoutsText: block(), year: 1969 }, { workoutsText: block(), year: 9999 },
  ])('rejects bad envelope %j', async (input) => expect((await upload(input)).status).toBe(400));
  it.each([
    'not a workout', block(undefined, '-1 m'), block(undefined, '1,00 m'), block(undefined, '1e3 m'),
    block(undefined, 'Infinity m'), block(undefined, '100000001 m'), block(undefined, '2 miles'),
    block(undefined, '1.0000001 m'), block(undefined, undefined, '-1 s'), block(undefined, undefined, 'NaN秒'),
    block(undefined, undefined, '31622401秒'), block(undefined, undefined, '15:00'),
    block('2025/02/29 08:00'), block('2026/13/01 08:00'), block('2026/01/01 24:00'), block('2099/01/01 08:00'),
    block('2026-01-01T08:00:00Z'), block().replace('Distance: 2,500 m', ''),
    `${block()}\nDistance: 1 m`, `${block()}\nUnknown: hidden`, `${block()}\n<script>hidden</script>`,
  ])('rejects malformed export before any write %s', async (workoutsText) => {
    const response = await upload({ workoutsText });
    expect(response.status).toBe(400);
    expect((await env.RUNNING_STATS.list()).keys).toHaveLength(0);
    expect(await response.text()).not.toContain('hidden');
  });
  it('rejects all writes if a later Running record is malformed', async () => {
    const response = await upload({ workoutsText: `${block()}\n\n${block(`${year}/01/16 07:30`, 'bad')}` });
    expect(response.status).toBe(400);
    expect((await env.RUNNING_STATS.list()).keys).toHaveLength(0);
  });
  it.each([
    `${block()}\n\n${block()}`,
    `${block()}\nIdentifier: same-id\n\n${block(`${year}/01/16 07:30`)}\nIdentifier: same-id`,
    `${block(undefined, '1.001 km', '1.5 min')}\n\n${block(undefined, '1,001 m', '90 s')}`,
  ])('rejects duplicate records including equivalent decimal units %s', async (workoutsText) => {
    const response = await upload({ workoutsText });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'DUPLICATE_WORKOUT', message: 'Duplicate workout records. Select one Health source and check the export.' } });
    expect((await env.RUNNING_STATS.list()).keys).toHaveLength(0);
  });
  it('can accept more than 15 records and skips non-running activity', async () => {
    const records = Array.from({ length: 16 }, (_, index) => block(`${year}/01/${String(index + 1).padStart(2, '0')} 07:30`));
    records.push('Workout Type: Walking');
    const response = await upload({ workoutsText: records.join('\n\n') });
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ ok: true, year, distanceMeters: 40000, durationSeconds: 14400, workoutCount: 16 });
    expect(responseBody).toHaveProperty('recentWorkouts', [16, 15, 14, 13, 12].map((day) => ({ date: `${year}-01-${day}`, distanceMeters: 2500, durationSeconds: 900 })));
    const published = await app.request('https://example.test/v1/workouts', undefined, env);
    expect(await published.json()).toEqual({ year, workouts: [16, 15, 14, 13, 12].map((day) => ({ date: `${year}-01-${day}`, distanceKm: 2.5, durationSeconds: 900 })) });
    const svg = await (await app.request('https://example.test/running.svg', undefined, env)).text();
    expect(svg).toContain('Recent runs');
    expect(svg).toContain(`${year}-01-16`);
    expect(svg).not.toContain(`${year}-01-11`);
    expect(svg).toContain('0:15:00');
  });
  it('checks the final aggregate bounds and count cap', async () => {
    expect((await upload({ workoutsText: `${block(undefined, '60000000 m')}\n\n${block(`${year}/01/16 07:30`, '60000000 m')}` })).status).toBe(400);
    expect((await upload({ workoutsText: 'Workout Type: Walking\n'.repeat(10_001) })).status).toBe(400);
  });
  it.each(['', 'Bearer wrong-token', 'Basic xyz'])('requires the same authentication (%s)', async (authorization) => {
    const response = await upload({ workoutsText: block() }, authorization);
    expect([400, 401]).toContain(response.status);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await env.RUNNING_STATS.list()).keys).toHaveLength(0);
  });
  it('bounds actual bytes even with a falsely short content length', async () => {
    const response = await app.request('https://example.test/v1/workouts', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': '5' }, body: ' '.repeat(1_048_577) }, env);
    expect(response.status).toBe(413);
  });
  it('distinguishes missing recent data from a legacy aggregate without records', async () => {
    expect((await app.request('https://example.test/v1/workouts', undefined, env)).status).toBe(404);
    await env.RUNNING_STATS.put(`running:year:${year}`, JSON.stringify({ year, distanceMeters: 0, durationSeconds: 0 }));
    expect(await (await app.request('https://example.test/v1/workouts', undefined, env)).json()).toEqual({ year, workouts: null });
    expect((await app.request('https://example.test/v1/workouts?year=abc', undefined, env)).status).toBe(400);
  });
  it('checks JSON, media type, queries and wrong methods', async () => {
    expect((await app.request('https://example.test/v1/workouts', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' }, env)).status).toBe(415);
    expect((await app.request('https://example.test/v1/workouts', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{' }, env)).status).toBe(400);
    expect((await app.request('https://example.test/v1/workouts?year=2025', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ workoutsText: block() }) }, env)).status).toBe(400);
    for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      const response = await app.request('https://example.test/v1/workouts', { method }, env);
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, POST');
    }
  });
});
