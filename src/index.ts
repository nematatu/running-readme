import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { renderCard } from './svg';

export function tokyoYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(now));
}

const yearSchema = z.number().int().min(1970).refine((year) => year <= tokyoYear());
export const annualStats = z.strictObject({
  year: yearSchema,
  distanceMeters: z.number().min(0).max(100_000_000),
  durationSeconds: z.number().min(0).max(31_622_400),
}).refine(({ year, durationSeconds }) => {
  const secondsInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 1000;
  return durationSeconds <= secondsInYear;
});
export type AnnualStats = z.infer<typeof annualStats>;

const readQuery = z.strictObject({
  year: z.string().regex(/^\d{4}$/).transform(Number).pipe(yearSchema).optional(),
});
const svgQuery = readQuery.extend({ theme: z.enum(['light', 'dark']).default('light') });
const app = new Hono<{ Bindings: Env }>();
const errorBody = (code: string, message: string) => ({ error: { code, message } });

app.use('*', async (c, next) => {
  const allowed = new Map([['/health', ['GET']], ['/v1/stats', ['GET', 'POST']], ['/running.svg', ['GET']]]).get(c.req.path);
  if (allowed && !allowed.includes(c.req.method)) {
    c.header('Allow', allowed.join(', '));
    c.res = c.json(errorBody('METHOD_NOT_ALLOWED', 'Method not allowed.'), 405);
  } else {
    await next();
  }
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
});

app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  return c.json(errorBody('SERVICE_UNAVAILABLE', 'Service temporarily unavailable.'), 503);
});

app.get('/health', (c) => c.json({ status: 'ok' }));

app.post('/v1/stats', async (c, next) => {
  if (!c.env.INGEST_TOKEN || c.env.INGEST_TOKEN.length < 32) {
    return c.json(errorBody('SERVICE_UNAVAILABLE', 'Service temporarily unavailable.'), 503);
  }
  const unauthorized = errorBody('UNAUTHORIZED', 'Bearer authentication required.');
  return bearerAuth<{ Bindings: Env }>({
    token: c.env.INGEST_TOKEN,
    noAuthenticationHeader: { message: unauthorized },
    invalidAuthenticationHeader: { message: unauthorized },
    invalidToken: { message: unauthorized },
  })(c, next);
}, async (c, next) => {
  c.req.raw = new Request(c.req.raw);
  c.req.raw.headers.delete('Content-Length');
  await next();
}, bodyLimit({
  maxSize: 1024,
  onError: (c) => c.json(errorBody('PAYLOAD_TOO_LARGE', 'Body exceeds 1024 bytes.'), 413),
}), async (c) => {
  if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return c.json(errorBody('UNSUPPORTED_MEDIA_TYPE', 'Use application/json.'), 415);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errorBody('INVALID_JSON', 'Body must be valid JSON.'), 400);
  }
  const result = annualStats.safeParse(body);
  if (!result.success) return c.json(errorBody('INVALID_STATS', 'Invalid annual statistics.'), 400);
  await c.env.RUNNING_STATS.put(`running:year:${result.data.year}`, JSON.stringify(result.data));
  return c.json({ ok: true, ...result.data });
});

app.get('/v1/stats', async (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  const query = readQuery.safeParse(c.req.query());
  if (!query.success || Object.values(c.req.queries()).some((values) => values.length !== 1)) {
    return c.json(errorBody('INVALID_QUERY', 'Invalid query parameters.'), 400);
  }
  const year = query.data.year ?? tokyoYear();
  const stored: unknown = await c.env.RUNNING_STATS.get(`running:year:${year}`, 'json');
  if (stored === null) return c.json(errorBody('STATS_NOT_FOUND', 'No statistics registered for this year.'), 404);
  const stats = annualStats.parse(stored);
  if (stats.year !== year) throw new Error('Stored year mismatch');
  return c.json({ year, distanceKm: stats.distanceMeters / 1000, durationSeconds: stats.durationSeconds });
});

app.get('/running.svg', async (c) => {
  const query = svgQuery.safeParse(c.req.query());
  if (!query.success || Object.values(c.req.queries()).some((values) => values.length !== 1)) {
    return c.json(errorBody('INVALID_QUERY', 'Invalid query parameters.'), 400);
  }
  const year = query.data.year ?? tokyoYear();
  const stored: unknown = await c.env.RUNNING_STATS.get(`running:year:${year}`, 'json');
  const stats = stored === null ? null : annualStats.parse(stored);
  if (stats && stats.year !== year) throw new Error('Stored year mismatch');
  c.header('Content-Type', 'image/svg+xml; charset=utf-8');
  c.header('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  return c.body(renderCard({ year, stats, theme: query.data.theme }));
});

app.notFound((c) => c.json(errorBody('NOT_FOUND', 'Endpoint not found.'), 404));
export default app;
