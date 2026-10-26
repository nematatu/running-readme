import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../examples/year-window.js', import.meta.url), 'utf8');
for (const [instant, expected] of [['2026-12-31T14:59:59Z', 2026], ['2026-12-31T15:00:00Z', 2027]]) {
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
  }
  const window = JSON.parse(runInNewContext(source, { Date: FixedDate }));
  assert.equal(window.year, expected);
  assert.equal(window.start, `${expected}-01-01T00:00:00+09:00`);
  assert.equal(new Date(window.now).getTime(), new Date(instant).getTime());
}
console.log('Tokyo shortcut year-window: 2 boundary checks passed.');
