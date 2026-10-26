(() => {
  const now = new Date();
  const year = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCFullYear();
  return JSON.stringify({ year, start: `${year}-01-01T00:00:00+09:00`, now: now.toISOString() });
})()
