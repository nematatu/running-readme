import { html } from 'hono/html';
import type { AnnualStats, RecentWorkout } from './stats';

export function renderCard({ year, stats, theme, recentWorkouts = [] }: {
  year: number;
  stats: AnnualStats | null;
  theme: 'light' | 'dark';
  recentWorkouts?: RecentWorkout[];
}): string {
  const colors = theme === 'dark'
    ? { background: '#0d1117', text: '#c9d1d9', muted: '#9198a1' }
    : { background: '#ffffff', text: '#1f2328', muted: '#59636e' };
  const distance = stats
    ? `${(stats.distanceMeters / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
    : 'Not synced';
  const minutes = stats ? Math.floor(stats.durationSeconds / 60) : 0;
  const duration = stats
    ? `${Math.floor(minutes / 60).toLocaleString('en-US')}h ${minutes % 60}m`
    : 'Not synced';
  const height = recentWorkouts.length ? 136 + recentWorkouts.length * 24 : 124;
  const maximumDistance = Math.max(0, ...recentWorkouts.map((workout) => workout.distanceMeters));
  const recentDistance = (recentWorkouts.reduce((sum, workout) => sum + workout.distanceMeters, 0) / 1000)
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = recentWorkouts.map((workout, index) => {
    const seconds = Math.floor(workout.durationSeconds);
    const hours = Math.floor(seconds / 3600);
    const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
    const remainingSeconds = String(seconds % 60).padStart(2, '0');
    const time = `${hours}:${minutes}:${remainingSeconds}`;
    const km = (workout.distanceMeters / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const barWidth = maximumDistance ? 76 * workout.distanceMeters / maximumDistance : 0;
    return html`<g transform="translate(0 ${112 + index * 24})" font-size="12.5">
      <text x="16">${workout.date}</text>
      <text x="208" text-anchor="end">${km} km</text>
      <g aria-hidden="true">
        <rect x="224" y="-8" width="76" height="8" fill="${colors.text}" opacity="0.12"/>
        <rect x="224" y="-8" width="${barWidth}" height="8" fill="${colors.text}"/>
      </g>
      <text x="404" text-anchor="end">${time}</text>
    </g>`;
  });
  return html`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${height}" style="max-width:100%;height:auto" viewBox="0 0 420 ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Running ${year}</title>
  <desc id="desc">Distance: ${distance}. Duration: ${duration}. ${recentWorkouts
    .map((workout) => `${workout.date}: ${workout.distanceMeters / 1000} km, ${workout.durationSeconds} seconds.`)
    .join(' ')} ${recentWorkouts.length ? `Recent total: ${recentDistance} km. Bars compare distances with the longest displayed run, not a goal.` : ''}</desc>
  <rect width="420" height="${height}" fill="${colors.background}"/>
  <g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,Liberation Mono,monospace" fill="${colors.text}">
    <text x="16" y="24" font-size="15" font-weight="600">Running</text>
    <text x="404" y="24" text-anchor="end" fill="${colors.muted}" font-size="12">${year}</text>
    <g fill="${colors.muted}" font-size="11"><text x="16" y="45">Distance</text><text x="224" y="45">Duration</text></g>
    <g font-size="18" font-weight="600"><text x="16" y="66">${distance}</text><text x="224" y="66">${duration}</text></g>
    ${recentWorkouts.length ? html`
      <text x="16" y="90" font-size="11" fill="${colors.muted}">Recent runs</text>
      ${rows}
      <text x="16" y="${height - 16}" font-size="12" fill="${colors.muted}">Recent total</text>
      <text x="404" y="${height - 16}" text-anchor="end" font-size="13" font-weight="600">${recentDistance} km</text>
    ` : ''}
  </g>
</svg>`.toString();
}
