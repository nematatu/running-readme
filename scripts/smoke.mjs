import assert from 'node:assert/strict';

const origin = process.argv[2];
assert(origin && new URL(origin).protocol.startsWith('http'), 'Usage: npm run smoke -- https://worker.example');
const health = await fetch(`${origin}/health`);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: 'ok' });
const stats = await fetch(`${origin}/v1/stats`);
assert([200, 404].includes(stats.status));
const body = await stats.json();
if (stats.status === 404) assert.equal(body.error.code, 'STATS_NOT_FOUND');
else {
  assert.deepEqual(Object.keys(body).sort(), ['distanceKm', 'durationSeconds', 'year']);
  assert(Number.isFinite(body.distanceKm) && body.distanceKm >= 0);
  assert(Number.isFinite(body.durationSeconds) && body.durationSeconds >= 0);
}
for (const query of ['', '?theme=light', '?theme=dark']) {
  const svg = await fetch(`${origin}/running.svg${query}`);
  assert.equal(svg.status, 200);
  assert.match(svg.headers.get('content-type'), /^image\/svg\+xml; charset=utf-8$/);
  assert.match(svg.headers.get('cache-control'), /no-cache/);
  const xml = await svg.text();
  assert.match(xml, /<svg[\s>]/);
  assert.match(xml, /<\/svg>$/);
  assert(!/<script|foreignObject|onload=/i.test(xml));
  if (stats.status === 404) assert.match(xml, /Not synced/);
}
const workouts = await fetch(`${origin}/v1/workouts`);
assert([200, 404].includes(workouts.status));
const recent = await workouts.json();
if (workouts.status === 404) assert.equal(recent.error.code, 'STATS_NOT_FOUND');
else {
  assert.deepEqual(Object.keys(recent).sort(), ['workouts', 'year']);
  assert(recent.workouts === null || (Array.isArray(recent.workouts) && recent.workouts.length <= 5));
  for (const run of recent.workouts || []) assert.deepEqual(Object.keys(run).sort(), ['date', 'distanceKm', 'durationSeconds']);
}
for (const path of ['/v1/stats', '/v1/workouts']) {
  for (const authorization of [null, 'Bearer invalid-token']) {
    const rejected = await fetch(`${origin}${path}`, {
      method: 'POST', headers: authorization ? { Authorization: authorization } : {},
    });
    assert.equal(rejected.status, 401);
    assert.equal((await rejected.json()).error.code, 'UNAUTHORIZED');
  }
  assert.equal((await fetch(`${origin}${path}`, { method: 'DELETE' })).status, 405);
}
console.log(JSON.stringify({ origin, health: 'ok', stats: stats.status, recentWorkouts: workouts.status, svg: '3 variants ok', protected: true, productionWrites: 0 }, null, 2));
