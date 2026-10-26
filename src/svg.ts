import { html } from 'hono/html';
import type { AnnualStats } from './index';
import type { RecentWorkout } from './workouts';

export function renderCard({ year, stats, theme, recentWorkouts = [] }: {
  year: number;
  stats: AnnualStats | null;
  theme: 'light' | 'dark';
  recentWorkouts?: RecentWorkout[];
}): string {
  const colors = theme === 'dark'
    ? { background: '#0d1117', border: '#30363d', text: '#f0f6fc', muted: '#9198a1' }
    : { background: '#ffffff', border: '#d1d9e0', text: '#1f2328', muted: '#59636e' };
  const distance = stats ? `${(stats.distanceMeters / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km` : 'Not synced';
  const minutes = stats ? Math.floor(stats.durationSeconds / 60) : 0;
  const duration = stats ? `${Math.floor(minutes / 60).toLocaleString('en-US')}h ${minutes % 60}m` : 'Not synced';
  const height = recentWorkouts.length ? 188 + recentWorkouts.length * 24 : 124;
  const rows = recentWorkouts.map((workout, index) => {
    const seconds = Math.floor(workout.durationSeconds);
    const time = `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const km = (workout.distanceMeters / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return html`<g transform="translate(0 ${184 + index * 24})" font-size="13"><text x="22">${workout.date}</text><text x="260" text-anchor="end">${km} km</text><text x="398" text-anchor="end">${time}</text></g>`;
  });
  return html`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${height}" style="max-width:100%;height:auto" viewBox="0 0 420 ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Running ${year}</title>
  <desc id="desc">Distance: ${distance}. Duration: ${duration}. ${recentWorkouts.map((workout) => `${workout.date}: ${workout.distanceMeters / 1000} km, ${workout.durationSeconds} seconds.`).join(" ")}</desc>
  <rect x="0.5" y="0.5" width="419" height="${height - 1}" rx="8" fill="${colors.background}" stroke="${colors.border}"/>
  <g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" fill="${colors.text}">
    <text x="22" y="30" font-size="16" font-weight="600">Running</text>
    <text x="398" y="30" text-anchor="end" fill="${colors.muted}" font-size="13">${year}</text>
    <g fill="${colors.muted}" font-size="12"><text x="22" y="59">Distance</text><text x="222" y="59">Duration</text></g>
    <g font-size="24" font-weight="600"><text x="22" y="94">${distance}</text><text x="222" y="94">${duration}</text></g>
    ${recentWorkouts.length ? html`<path d="M22 116H398" stroke="${colors.border}"/><text x="22" y="140" font-size="13" font-weight="600">Recent runs</text><g fill="${colors.muted}" font-size="11"><text x="22" y="160">Date</text><text x="260" y="160" text-anchor="end">Distance</text><text x="398" y="160" text-anchor="end">Duration</text></g>${rows}` : ''}
  </g>
</svg>`.toString();
}
