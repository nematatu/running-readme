# Verification record

Development began on 2026-10-25. Publication checks resumed on 2026-10-26. User iPhone access is unavailable to the development agent.

## Local executable checks

`npm run check` runs strict TypeScript checks, 52 tests in Cloudflare's real local workerd environment with local KV, and two Node assertion checks at the Tokyo New Year boundary. Test data is fictional and isolated from production.

Tests cover successful writes and reads, missing and zero, overwrite idempotence, different years, absent and wrong tokens, missing server Secret, malformed JSON, finite numeric types and limits, leap-year duration, negative values, extra fields, malformed/repeated queries, unsupported methods, media type, streamed 1024-byte body limits including a falsely short Content-Length, generic storage errors, SVG MIME and themes, text formatting, and rejected XML injection inputs. Authentication error headers are asserted.

`npx wrangler deploy --dry-run` builds the real Worker bundle. `npm audit` reported zero vulnerabilities after updating the dev-only transitive undici and Zod versions through overrides. This is the audit result at development time, not a future security guarantee.

A separate Node date test is intentionally excluded from the Workers test glob. During development it was initially picked up by Vitest and failed because workerd does not see arbitrary host files. The test configuration was corrected and the complete check passed afterward. No production test records were written.

## Real browser rendering

`scripts/render-check.mjs` uses Playwright and Chromium. Playwright is optional development tooling, not a runtime dependency. It accepts `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` to reuse installed tools. With a local server, it requires `LOCAL_TEST_TOKEN` and writes only when the hostname is localhost or 127.0.0.1. For any other origin it performs reads only.

The local run captured 13 views: a missing year and sample, zero, and maximum values in both themes at 420px and 320px. It asserts valid XML, absence of overflow, and all text bounding boxes inside the viewBox. Screenshots were visually inspected, including the sample light card and maximum dark mobile card.

The production run captured four views of the actual **Not synced** state, both themes at 420px and 320px. These are not populated screenshots or actual health data. The light and mobile dark screenshots were visually inspected.

To reproduce with a locally installed Playwright:

```sh
npm install --no-save playwright
npx playwright install chromium
npm run dev
# In another terminal, set LOCAL_TEST_TOKEN to your local development token.
node scripts/render-check.mjs http://127.0.0.1:8787 artifacts/render
node scripts/render-check.mjs https://running-readme-api.amtt.workers.dev artifacts/production
```

Optional tooling is not required to deploy or run the service. Do not use the production token in a local rendering test.

## Production checks

Deployment version initially verified: `19d0cb11-cb5d-431c-8e21-f7a86489abe6`.

Live origin: https://running-readme-api.amtt.workers.dev

`npm run smoke -- https://running-readme-api.amtt.workers.dev` succeeded. It checked health 200, JSON 404 with `STATS_NOT_FOUND`, SVG 200 for default/light/dark with the correct MIME and cache header, rejection of missing/wrong token with 401, and unsupported DELETE with 405. It made zero authenticated production writes.

Wrangler listed `RUNNING_STATS` bound to the dedicated KV namespace, `INGEST_TOKEN` as a secret_text binding, and an empty remote KV key list. Local synthetic fixtures were never copied to production. `GET /v1/stats` traverses the real KV binding before returning the missing state.

Origin SVG responses declare `no-cache, max-age=0, must-revalidate`. This is separate from KV's own eventual consistency and Camo caching. Production stored-user-data rendering and successful iPhone ingestion remain unverified until the user performs the initial sync.

The read-only production smoke check and full local test suite passed again on 2026-10-26 before publication. Local evidence files include `artifacts/production/smoke-2026-10-26.json`, `deployments.txt`, `kv-keys.json`, and `secret-names.json`. These artifacts remain ignored by Git and contain no token value.

## Independent review

A separate review inspected the application, tests, library source, and configuration. Its two accepted findings were fixed before final delivery: actual body bytes must be counted even with a short Content-Length, and authentication errors need the common cache and nosniff headers. Regression assertions pass. No application comments or type suppressions needed removal. That reviewer could not independently run workerd under its sandbox's localhost restriction; the primary agent ran the executable suite with the required permission.

## iPhone verification boundary

The user has reported that Mi Fitness workouts are in Apple Health and Actions Find Workout returns them. The development agent has not operated the iPhone, granted Health access, populated the device Keychain, imported a signed shortcut, run an iOS automation, or verified a locked-device sync. The action metadata and official-document evidence are recorded in the iPhone guide. Do not describe the workflow as fully automatic until successful device runs have been observed.

## Published GitHub README and Camo

On 2026-10-26, commit `52321602aa1f00bcec6ce2a45a36b269bc205864` was pushed to the public repository. Its [GitHub Actions run](https://github.com/nematatu/running-readme/actions/runs/40284740648) passed dependency installation, type generation, type checks, the complete test suite, and a Wrangler dry-run build on Ubuntu. No production deployment Secret is present in CI.

The existing [profile README](https://github.com/nematatu/nematatu) was preserved and a marked `picture` block was appended in [commit 6721018](https://github.com/nematatu/nematatu/commit/6721018ec13f0292ad0db820f90804c8e17d5f3b). An API reread confirmed the full new content matched the expected original plus the card.

Real Chromium opened both published repository READMEs. For both light and dark system preferences, the image decoded at intrinsic size 420×124 and the selected `currentSrc` was the corresponding light or dark Camo URL. Both Camo responses were HTTP 200 with `Content-Type: image/svg+xml; charset=utf-8`, `Cache-Control: no-cache, max-age=0, must-revalidate`, `Age: 0`, and `X-Cache: MISS` during these observations. The rendered card screenshots were visually inspected. Local evidence is `artifacts/github/results-desktop.json` and the card PNGs.

These observations prove successful display and the response policy at that time. They do not measure a future real-data update delay or guarantee immediate Camo refresh. No fictional value was submitted to production to test cache invalidation.

The actual [GitHub profile page](https://github.com/nematatu) was also checked with a 375px viewport in both colour schemes. The card rendered at 293px wide inside the profile content, with a loaded 420×124 source image. Evidence is `artifacts/github/results.json`, `nematatu-light-card.png`, and `nematatu-dark-card.png`.

## Text upload and recent-five update, 2026-10-26

The owner requested sending existing workout memo text rather than calculating annual sums on the iPhone, and explicitly chose to publish annual totals plus the recent five dates/distances/durations. The new authenticated text-upload endpoint and public recent-run endpoint are `/v1/workouts`. Only the requested year's aggregate and up to five date-only rows persist in the same KV value. The annual JSON contract remains compatible. Full history, exact clock times, identifiers, and legacy extra metrics are not persisted.

The updated suite passed 97 Workers tests plus the two existing Tokyo helper assertions and both TypeScript checks. New tests exercise the text envelope, labels, commas, units, calendar validity, future dates, Tokyo year boundary, optional legacy lines, malformed later records preventing any write, target-year-empty input preserving existing data, more than 15 records, exact decimal equivalent-unit duplicate detection, optional IDs, shared authentication, actual-byte size limits, recent-five sorting/capping/public conversion, legacy aggregates without recent data, and new-route method/query validation. The new date-sensitive tests fix the clock to avoid January fixture failures on future CI dates.

The owner-supplied memo format was also submitted to the local Worker only. Its parsed distance and seconds matched the supplied values. The actual personal sample was not added to a tracked fixture, screenshot, or production test request. Public `examples/workouts.txt` and tests use fictional records.

Real Chromium passed 17 local card captures in `artifacts/text-upload-render/results.json`, including four recent-five light/dark and 320px views at extreme accepted values. These are fictional local fixtures. Light and mobile-dark recent cards were visually inspected. The drawing check now compares rendered bounding rectangles, because untransformed local text boxes do not account for SVG row-group translation.

Two independent design/code passes reviewed the JSON text approach, shared authentication, validation order, aggregate-only API compatibility, minimal recent-row retention, and safe SVG rendering. One finding about floating-point duplicate keys was fixed with integer-scaled decimal normalization and a regression test. No additional runtime dependency was added.

The API cannot verify that the iPhone supplied all records. A limited query or manual selection can still replace a complete annual total with an incomplete one. The new phone guide explicitly requires Limit off, Repeat with Each, a single source, and no chunked uploads. iPhone execution, locked-device automation, and refresh delay after a real production upload remain unverified.

Production deployment version for the text/recent-five update is `a7b35879-db08-4065-8515-dd8a25296eec`. The updated production smoke check succeeded for both public JSON endpoints, all three SVG URLs, and missing/wrong-token protection on both POST routes. Both JSON endpoints returned the expected unregistered 404 at verification time. The remote KV list remained empty. Four production browser captures of this actual unregistered state passed in `artifacts/text-upload-production/results.json`; no authenticated production test write was made. Local synthetic recent-five screenshots are not production data.
