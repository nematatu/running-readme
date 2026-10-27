import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  type AppEnv, authenticateIngest, errorBody, jsonInput, limitBody,
  publicJson, queryInput, requireJson,
} from './http';
import { annualStats, readYearStats, tokyoYear, writeYearStats, yearSchema } from './stats';
import { renderCard } from './svg';
import { aggregateWorkoutText, WorkoutTextError } from './workouts';

const yearQuery = z.strictObject({
  year: z.string().regex(/^\d{4}$/).transform(Number).pipe(yearSchema).default(tokyoYear),
});
const svgQuery = yearQuery.extend({ theme: z.enum(['light', 'dark']).default('light') });
const textUpload = z.strictObject({
  workoutsText: z.string().min(1).max(1_048_576),
  year: yearSchema.default(tokyoYear),
});
const noStats = errorBody('STATS_NOT_FOUND', 'No statistics registered for this year.');

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const allowed = [...new Set(app.routes
    .filter((route) => route.path === c.req.path && route.method !== 'ALL')
    .map((route) => route.method))];
  if (allowed.length && !allowed.includes(c.req.method)) {
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
  if (error instanceof WorkoutTextError) {
    const messages = {
      INVALID_WORKOUT_TEXT: 'Invalid workout text. Check labels, dates, and units.',
      NO_RUNNING_DATA: 'No running records for the selected year. Existing statistics were not changed.',
      DUPLICATE_WORKOUT: 'Conflicting workout records share an Identifier. Check the export.',
      INVALID_STATS: 'Invalid annual statistics.',
    };
    return c.json(errorBody(error.code, messages[error.code]), 400);
  }
  return c.json(errorBody('SERVICE_UNAVAILABLE', 'Service temporarily unavailable.'), 503);
});

app.get('/health', (c) => c.json({ status: 'ok' }));

app.get('/v1/stats', publicJson, queryInput(yearQuery), async (c) => {
  const { year } = c.req.valid('query');
  const stats = await readYearStats(c.env.RUNNING_STATS, year);
  if (!stats) return c.json(noStats, 404);
  return c.json({ year, distanceKm: stats.distanceMeters / 1000, durationSeconds: stats.durationSeconds });
});

app.get('/v1/workouts', publicJson, queryInput(yearQuery), async (c) => {
  const { year } = c.req.valid('query');
  const stats = await readYearStats(c.env.RUNNING_STATS, year);
  if (!stats) return c.json(noStats, 404);
  return c.json({
    year,
    recentTotalDistanceKm: stats.recentWorkouts
      ? stats.recentWorkouts.reduce((sum, workout) => sum + workout.distanceMeters, 0) / 1000
      : null,
    workouts: stats.recentWorkouts?.map(({ date, distanceMeters, durationSeconds, averageSpeedKmh }) => ({
      date, distanceKm: distanceMeters / 1000, durationSeconds, averageSpeedKmh,
    })) ?? null,
  });
});

app.get('/running.svg', queryInput(svgQuery), async (c) => {
  const { year, theme } = c.req.valid('query');
  const stats = await readYearStats(c.env.RUNNING_STATS, year);
  c.header('Content-Type', 'image/svg+xml; charset=utf-8');
  c.header('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  return c.body(renderCard({ year, stats, theme, recentWorkouts: stats?.recentWorkouts }));
});

app.post('/v1/stats',
  authenticateIngest,
  limitBody(1024),
  requireJson,
  jsonInput(annualStats, errorBody('INVALID_STATS', 'Invalid annual statistics.')),
  async (c) => {
    const stats = c.req.valid('json');
    await writeYearStats(c.env.RUNNING_STATS, stats);
    return c.json({ ok: true, ...stats });
  },
);

app.post('/v1/workouts',
  authenticateIngest,
  limitBody(1_048_576),
  requireJson,
  queryInput(z.strictObject({})),
  jsonInput(textUpload, errorBody('INVALID_WORKOUT_TEXT', 'Invalid workout text upload.')),
  async (c) => {
    const { workoutsText, year } = c.req.valid('json');
    const { workoutCount, ...stats } = aggregateWorkoutText(workoutsText, year);
    await writeYearStats(c.env.RUNNING_STATS, stats);
    return c.json({ ok: true, ...stats, workoutCount });
  },
);

app.notFound((c) => c.json(errorBody('NOT_FOUND', 'Endpoint not found.'), 404));
export default app;
