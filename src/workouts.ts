import { annualStats, type RecentWorkout } from './stats';

const numericValue = '(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]{1,6})?';
const distancePattern = new RegExp(`^(${numericValue})\\s*(m|km)$`, 'i');
const durationPattern = new RegExp(`^(${numericValue})\\s*(秒|s|sec|min|分|h|時間)(?:\\s*\\([^()\\r\\n]{0,100}\\))?$`, 'i');
const speedPattern = new RegExp(`^(${numericValue})\\s*(km/h|m/s|mph|mi/h)$`, 'i');
const allowedLabels = new Set([
  'Workout Type', 'Date', 'Duration', 'Distance', 'Identifier', 'End date',
  'Heart rate', 'Active calories', 'Avg Speed',
]);

export class WorkoutTextError extends Error {
  constructor(public readonly code: 'INVALID_WORKOUT_TEXT' | 'NO_RUNNING_DATA' | 'DUPLICATE_WORKOUT' | 'INVALID_STATS') {
    super(code);
  }
}

function quantity(
  value: string | undefined,
  pattern: RegExp,
  units: Readonly<Record<string, number>>,
): { value: number; key: string } {
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
  if (
    !Number.isFinite(timestamp)
    || timestamp > now.getTime()
    || new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 19) !== local
  ) {
    throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
  }
  return { year: Number(year), timestamp };
}

export function aggregateWorkoutText(text: string, year: number, now = new Date()) {
  const normalized = text.replaceAll('\r\n', '\n').replace(/[\u00a0\u202f]/g, ' ').trim();
  if (!normalized.startsWith('Workout Type:')) throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
  const blocks = normalized.split(/(?=^Workout Type:)/m).filter((block) => block.trim());
  if (blocks.length > 10_000) throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
  const seen = new Set<string>();
  const identifiers = new Map<string, string>();
  const runs: (RecentWorkout & { timestamp: number })[] = [];
  for (const block of blocks) {
    const fields = new Map<string, string>();
    for (const line of block.split('\n').filter((line) => line.trim())) {
      const match = line.match(/^([^:]+):[ \t]*(.*)$/);
      if (!match || !allowedLabels.has(match[1]) || fields.has(match[1])) {
        throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
      }
      fields.set(match[1], match[2].trim());
    }
    if (!fields.get('Workout Type')) throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
    if (fields.get('Workout Type') !== 'Running') continue;
    const startTime = startDate(fields.get('Date'), now);
    const distance = quantity(fields.get('Distance'), distancePattern, { m: 1, km: 1000 });
    const duration = quantity(fields.get('Duration'), durationPattern, {
      '秒': 1, s: 1, sec: 1, min: 60, '分': 60, h: 3600, '時間': 3600,
    });
    const speedText = fields.get('Avg Speed');
    const averageSpeedKmh = speedText
      ? quantity(speedText, speedPattern, {
        'km/h': 1_000_000, 'm/s': 3_600_000, mph: 1_609_344, 'mi/h': 1_609_344,
      }).value / 1_000_000
      : null;
    if (distance.value > 100_000_000 || duration.value > 31_622_400) {
      throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
    }
    if (averageSpeedKmh !== null && averageSpeedKmh > 1000) {
      throw new WorkoutTextError('INVALID_WORKOUT_TEXT');
    }
    const fingerprint = `${startTime.timestamp}:${distance.key}:${duration.key}`;
    const identifier = fields.get('Identifier');
    if (identifier) {
      const previous = identifiers.get(identifier);
      if (previous !== undefined && previous !== fingerprint) throw new WorkoutTextError('DUPLICATE_WORKOUT');
      identifiers.set(identifier, fingerprint);
    }
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    if (startTime.year !== year) continue;
    runs.push({
      date: new Date(startTime.timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10),
      distanceMeters: distance.value,
      durationSeconds: duration.value,
      averageSpeedKmh,
      timestamp: startTime.timestamp,
    });
  }
  if (runs.length === 0) throw new WorkoutTextError('NO_RUNNING_DATA');

  const totals = annualStats.safeParse({
    year,
    distanceMeters: runs.reduce((sum, run) => sum + run.distanceMeters, 0),
    durationSeconds: runs.reduce((sum, run) => sum + run.durationSeconds, 0),
  });
  if (!totals.success) throw new WorkoutTextError('INVALID_STATS');

  const recentWorkouts = runs
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5)
    .map(({ date, distanceMeters, durationSeconds, averageSpeedKmh }) => ({
      date, distanceMeters, durationSeconds, averageSpeedKmh,
    }));
  return { ...totals.data, workoutCount: runs.length, recentWorkouts };
}
