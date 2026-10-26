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
    ? { background: '#0d1117', border: '#30363d', text: '#c9d1d9', muted: '#9198a1', accent: '#58a6ff', panel: '#161b22' }
    : { background: '#ffffff', border: '#d1d9e0', text: '#1f2328', muted: '#59636e', accent: '#0969da', panel: '#f6f8fa' };
  const distance = stats ? `${(stats.distanceMeters / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km` : 'Not synced';
  const minutes = stats ? Math.floor(stats.durationSeconds / 60) : 0;
  const duration = stats ? `${Math.floor(minutes / 60).toLocaleString('en-US')}h ${minutes % 60}m` : 'Not synced';
  const height = recentWorkouts.length ? 160 + recentWorkouts.length * 24 : 124;
  const maximumDistance = Math.max(0, ...recentWorkouts.map((workout) => workout.distanceMeters));
  const recentDistance = (recentWorkouts.reduce((sum, workout) => sum + workout.distanceMeters, 0) / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = recentWorkouts.map((workout, index) => {
    const seconds = Math.floor(workout.durationSeconds);
    const time = `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const km = (workout.distanceMeters / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const barWidth = maximumDistance ? 60 * workout.distanceMeters / maximumDistance : 0;
    return html`<g transform="translate(0 ${124 + index * 24})" font-size="12.5"><text x="28" fill="${colors.muted}" aria-hidden="true">${index + 1}</text><text x="48">${workout.date}</text><text x="224" text-anchor="end">${km} km</text><g aria-hidden="true"><rect x="236" y="-7" width="60" height="6" fill="${colors.border}"/><rect x="236" y="-7" width="${barWidth}" height="6" fill="${colors.text}"/></g><text x="392" text-anchor="end">${time}</text></g>`;
  });
  return html`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${height}" style="max-width:100%;height:auto" viewBox="0 0 420 ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Running ${year}</title>
  <desc id="desc">Distance: ${distance}. Duration: ${duration}. ${recentWorkouts.map((workout) => `${workout.date}: ${workout.distanceMeters / 1000} km, ${workout.durationSeconds} seconds.`).join(' ')} ${recentWorkouts.length ? `Recent total: ${recentDistance} km. Bars compare distances with the longest displayed run, not a goal.` : ''}</desc>
  <rect x="0.5" y="0.5" width="419" height="${height - 1}" rx="8" fill="${colors.background}" stroke="${colors.border}"/>
  <g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" fill="${colors.text}">
    <path d="M23 20h13v14H23z M28 24l-3 3 3 3 M31 24l3 3-3 3" fill="none" stroke="${colors.muted}" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"/>
    <text x="48" y="30" fill="${colors.accent}" font-size="15" font-weight="600">year-to-date running</text>
    <text x="398" y="30" text-anchor="end" fill="${colors.muted}" font-size="12">${year}</text>
    <g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,Liberation Mono,monospace">
      <text x="22" y="60" font-size="12">Distance ${distance}  Duration ${duration}</text>
      <rect x="16" y="80" width="388" height="${height - 96}" rx="6" fill="${colors.panel}"/>
      ${recentWorkouts.length ? html`<text x="28" y="101" font-size="11" fill="${colors.muted}">Recent runs</text>${rows}<text x="48" y="${height - 32}" font-size="12" fill="${colors.muted}">Recent total</text><text x="392" y="${height - 32}" text-anchor="end" font-size="13">${recentDistance} km</text>` : html`<text x="28" y="99" font-size="11" fill="${colors.muted}">${stats ? 'Recent runs unavailable' : 'Not synced'}</text>`}
    </g>
  </g>
</svg>`.toString();
}
