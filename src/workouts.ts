import { z } from 'zod';

export const recentWorkout = z.strictObject({
  date: z.iso.date(),
  distanceMeters: z.number().min(0).max(100_000_000),
  durationSeconds: z.number().min(0).max(31_622_400),
});
export type RecentWorkout = z.infer<typeof recentWorkout>;

const numericValue = '(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]{1,6})?';
const distancePattern = new RegExp(`^(${numericValue})\\s*(m|km)$`, 'i');
const durationPattern = new RegExp(`^(${numericValue})\\s*(秒|s|sec|min|分|h|時間)(?:\\s*\\([^()\\r\\n]{0,100}\\))?$`, 'i');
const allowedLabels = new Set(['Workout Type', 'Date', 'Duration', 'Distance', 'Identifier', 'End date', 'Heart rate', 'Active calories', 'Avg Speed']);

export class WorkoutTextError extends Error {
  constructor(public readonly code: 'INVALID_WORKOUT_TEXT' | 'NO_RUNNING_DATA' | 'DUPLICATE_WORKOUT') {
    super(code);
  }
}

function quantity(value: string | undefined, pattern: RegExp, units: Readonly<Record<string, number>>): { value: number; key: string } {
  const match = value?.match(pattern);
  if (!match) throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
  const decimal = match[1].replaceAll(',', '');
  if (!Number.isFinite(Number(decimal))) throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
  const [whole, fraction = ''] = decimal.split('.');
  let unscaled = BigInt(whole + fraction) * BigInt(units[match[2].toLowerCase()]);
  let scale = fraction.length;
  while (scale > 0 && unscaled % 10n === 0n) {
    unscaled /= 10n;
    scale--;
  }
  return { value: Number(unscaled) / 10 ** scale, key: `${unscaled}e-${scale}` };
}

function startDate(value: string | undefined, now: Date): { year: number; timestamp: number } {
  const match = value?.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
  const [, year, month, day, hour, minute, second = '00'] = match;
  const local = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const date = new Date(`${local}+09:00`);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp) || timestamp > now.getTime() || new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 19) !== local) {
    throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
  }
  return { year: Number(year), timestamp };
}

export function aggregateWorkoutText(text: string, year: number, now = new Date()) {
  const normalized = text.replaceAll('\r\n', '\n').replace(/[\u00a0\u202f]/g, ' ').trim();
  if (!normalized.startsWith('Workout Type:')) throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
  const blocks = normalized.split(/(?=^Workout Type:)/m).filter((block) => block.trim());
  if (blocks.length > 10_000) throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
  let distanceMeters = 0;
  let durationSeconds = 0;
  let workoutCount = 0;
  const seen = new Set<string>();
  const runs: (RecentWorkout & { timestamp: number })[] = [];
  for (const block of blocks) {
    const fields = new Map<string, string>();
    for (const line of block.split('\n').filter((line) => line.trim())) {
      const match = line.match(/^([^:]+):[ \t]*(.*)$/);
      if (!match || !allowedLabels.has(match[1]) || fields.has(match[1])) throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
      fields.set(match[1], match[2].trim());
    }
    if (!fields.get('Workout Type')) throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
    if (fields.get('Workout Type') !== 'Running') continue;
    const start = startDate(fields.get('Date'), now);
    const distance = quantity(fields.get('Distance'), distancePattern, { m: 1, km: 1000 });
    const duration = quantity(fields.get('Duration'), durationPattern, { '秒': 1, s: 1, sec: 1, min: 60, '分': 60, h: 3600, '時間': 3600 });
    if (distance.value > 100_000_000 || duration.value > 31_622_400) throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
    const fingerprint = `${start.timestamp}:${distance.key}:${duration.key}`;
    const identifier = fields.get('Identifier');
    if (seen.has(fingerprint) || (identifier && seen.has(`id:${identifier}`))) throw new WorkoutTextError('DUPLICATE_WORKOUT');
    seen.add(fingerprint);
    if (identifier) seen.add(`id:${identifier}`);
    if (start.year !== year) continue;
    distanceMeters += distance.value;
    durationSeconds += duration.value;
    workoutCount++;
    runs.push({ date: new Date(start.timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10), distanceMeters: distance.value, durationSeconds: duration.value, timestamp: start.timestamp });
  }
  if (workoutCount === 0) throw new WorkoutTextError('NO_RUNNING_DATA');
  const recentWorkouts = runs.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5).map(({ date, distanceMeters, durationSeconds }) => ({ date, distanceMeters, durationSeconds }));
  return { year, distanceMeters, durationSeconds, workoutCount, recentWorkouts };
}
