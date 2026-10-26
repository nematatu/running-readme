import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.argv[2] || 'http://127.0.0.1:8787';
const output = process.argv[3] || 'artifacts/render';
const local = ['localhost', '127.0.0.1'].includes(new URL(origin).hostname);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
await mkdir(output, { recursive: true });
const page = await browser.newPage();
const results = [];
async function capture(name, theme, width, year) {
  await page.setViewportSize({ width, height: 200 });
  await page.goto(`${origin}/running.svg?theme=${theme}${year ? `&year=${year}` : ''}`);
  const result = await page.evaluate(() => {
    const svg = document.querySelector('svg');
    const text = [...document.querySelectorAll('svg text')];
    return {
      validXML: !document.querySelector('parsererror'),
      svg: !!svg,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      textWithinViewBox: text.every((element) => {
        const box = element.getBBox();
        return box.x >= 0 && box.x + box.width <= 420 && box.y >= 0 && box.y + box.height <= 124;
      }),
      text: svg?.textContent,
    };
  });
  assert(result.validXML && result.svg && !result.overflow && result.textWithinViewBox, JSON.stringify(result));
  await page.locator('svg').screenshot({ path: `${output}/${name}.png` });
  results.push({ name, width, ...result });
}
try {
  if (local) {
    const devToken = process.env.LOCAL_TEST_TOKEN;
    assert(devToken, 'Set LOCAL_TEST_TOKEN to the local .dev.vars value. Never use the production token.');
    const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date()));
    await capture('local-missing', 'light', 420, 1970);
    for (const [name, distanceMeters, durationSeconds] of [['sample', 125600, 48600], ['zero', 0, 0], ['maximum', 100000000, 31536000]]) {
      const response = await fetch(`${origin}/v1/stats`, {
        method: 'POST', headers: { Authorization: `Bearer ${devToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, distanceMeters, durationSeconds }),
      });
      assert.equal(response.status, 200);
      for (const theme of ['light', 'dark']) {
        await capture(`local-${name}-${theme}`, theme, 420);
        await capture(`local-${name}-${theme}-mobile`, theme, 320);
      }
    }
  } else {
    for (const theme of ['light', 'dark']) {
      await capture(`production-${theme}`, theme, 420);
      await capture(`production-${theme}-mobile`, theme, 320);
    }
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(`Rendered and checked ${results.length} SVG views at ${origin}. Screenshots: ${output}`);
} finally {
  await browser.close();
}
