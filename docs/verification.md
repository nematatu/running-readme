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
