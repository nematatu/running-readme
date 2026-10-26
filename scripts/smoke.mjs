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
for (const authorization of [null, 'Bearer invalid-token']) {
  const rejected = await fetch(`${origin}/v1/stats`, {
    method: 'POST', headers: authorization ? { Authorization: authorization } : {},
  });
  assert.equal(rejected.status, 401);
  assert.equal((await rejected.json()).error.code, 'UNAUTHORIZED');
}
assert.equal((await fetch(`${origin}/v1/stats`, { method: 'DELETE' })).status, 405);
console.log(JSON.stringify({ origin, health: 'ok', stats: stats.status, svg: '3 variants ok', protected: true, productionWrites: 0 }, null, 2));
