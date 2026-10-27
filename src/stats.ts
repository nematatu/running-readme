import { z } from 'zod';

export function tokyoYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(now));
}

export const yearSchema = z.number().int().min(1970).refine((year) => year <= tokyoYear());

export const annualStats = z.strictObject({
  year: yearSchema,
  distanceMeters: z.number().min(0).max(100_000_000),
  durationSeconds: z.number().min(0).max(31_622_400),
}).refine(({ year, durationSeconds }) => {
  const secondsInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 1000;
  return durationSeconds <= secondsInYear;
});
export type AnnualStats = z.infer<typeof annualStats>;

export const recentWorkout = z.strictObject({
  date: z.iso.date(),
  distanceMeters: z.number().min(0).max(100_000_000),
  durationSeconds: z.number().min(0).max(31_622_400),
  averageSpeedKmh: z.number().min(0).max(1000).nullable().default(null),
});
export type RecentWorkout = z.infer<typeof recentWorkout>;

const storedStats = annualStats
  .safeExtend({ recentWorkouts: z.array(recentWorkout).max(5).optional() })
  .refine((stats) => stats.recentWorkouts?.every(
    (workout) => workout.date.startsWith(`${stats.year}-`),
  ) ?? true);
type StoredStats = z.infer<typeof storedStats>;

export async function readYearStats(kv: KVNamespace, year: number) {
  const stored: unknown = await kv.get(`running:year:${year}`, 'json');
  if (stored === null) return null;
  const stats = storedStats.parse(stored);
  if (stats.year !== year) throw new Error('Stored year mismatch');
  return stats;
}

export function writeYearStats(kv: KVNamespace, stats: StoredStats) {
  return kv.put(`running:year:${stats.year}`, JSON.stringify(stats));
}
