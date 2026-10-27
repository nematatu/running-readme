# running-readme

Publish annual running totals and the latest five runs from Apple Health to your GitHub README. Your iPhone sends the workout text it already generates with Shortcuts and Actions. The Worker aggregates it and stores only annual totals plus up to five recent runs per year, then serves JSON and an SVG card.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://running-readme-api.amtt.workers.dev/running.svg?theme=dark">
  <source media="(prefers-color-scheme: light)" srcset="https://running-readme-api.amtt.workers.dev/running.svg?theme=light">
  <img alt="Annual running distance and duration" src="https://running-readme-api.amtt.workers.dev/running.svg?theme=light" width="420">
</picture>

This live card belongs to this deployment. **Not synced** means no annual aggregate has been registered. It does not mean zero kilometres. Self-host your own Worker to publish your own totals.

[日本語セットアップ](docs/setup-ja.md) · [iPhone text upload](docs/ios-text-upload.md) · [Troubleshooting](docs/ios-shortcuts-troubleshooting.md) · [API reference](docs/api.md) · [Verification](docs/verification.md)

## How it works

```text
Xiaomi Smart Band → Mi Fitness → Apple Health
                                  ↓
                    iPhone Shortcuts + Actions
                    Running · one source · full text export
                                  ↓ authenticated HTTPS POST
                       Cloudflare Worker (parse + annual sum + recent 5)
                                  ↓
                           Workers KV (one key/year)
                                  ↓
                    public JSON API + SVG → GitHub README
```

HealthKit runs on the iPhone, never when someone views your README. The Worker needs no cron, continuously running Mac, paid running API, or daily GitHub commit. The public endpoints remain available when the iPhone is offline.

## Requirements

- Node.js 22.13.0 or later, npm, Git, and a Cloudflare account with Workers and KV access.
- An iPhone with Apple Health workouts, Shortcuts, and [Actions](https://sindresorhus.com/actions).
- Permission for Actions to read workouts. On this user's device, Mi Fitness syncing and Actions Find Workout retrieval were already confirmed by the user. This repository does not implement wearable connectivity.

Runtime dependencies are Hono and Zod. Development uses Wrangler, TypeScript, Vitest, and Cloudflare's current Workers Vitest plugin. Versions are pinned in `package-lock.json`.

For development, start with the [code structure and library choices](docs/architecture.md). Routes use typed Hono middleware; statistics schemas and KV handling have one owner.

## Deploy your own instance

```sh
git clone https://github.com/nematatu/running-readme.git
cd running-readme
npm ci
cp .dev.vars.example .dev.vars
npm run types
npm run check
npx wrangler login
npx wrangler whoami
npx wrangler kv namespace create RUNNING_STATS
```

Edit `wrangler.jsonc`. Choose your Worker name and replace the included deployment's KV `id` with the new namespace ID. Namespace IDs are public configuration, not credentials. Do not use `--remote` for local tests.

Create a private local token file and register it without printing the value:

```sh
mkdir -p .secrets
chmod 700 .secrets
node --input-type=module -e 'import {randomBytes} from "node:crypto"; import {writeFileSync} from "node:fs"; writeFileSync(".secrets/ingest-token.txt",randomBytes(32).toString("hex")+"\n",{mode:0o600,flag:"wx"});'
npx wrangler secret put INGEST_TOKEN < .secrets/ingest-token.txt
npm run deploy
npm run smoke -- https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev
```

If Wrangler asks to create the new Worker while registering its Secret, confirm creation. Deploy outputs the actual URL. Replace the URLs in your card and iPhone shortcut with your URL. Keep `.dev.vars` as a separate development token. Never paste the production token into an issue, README, screenshot, workflow, or shared shortcut.

Cloudflare Workers and KV usage follows [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/). No extra service or plan upgrade is required by this application. Public traffic can exceed included usage; this project does not impose a billing cap.

## Embed this deployment

Copy this into a GitHub README. Omitting `year` follows the current year in **Asia/Tokyo**, including after New Year.

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://running-readme-api.amtt.workers.dev/running.svg?theme=dark">
  <source media="(prefers-color-scheme: light)" srcset="https://running-readme-api.amtt.workers.dev/running.svg?theme=light">
  <img alt="Annual running distance and duration" src="https://running-readme-api.amtt.workers.dev/running.svg?theme=light" width="420">
</picture>
```

For a fixed archive, add `&amp;year=2026` to all three image URLs. The image uses a responsive SVG viewBox and no external font, image, CSS, or script.

The [display](docs/design.md) uses Hadge-inspired monospace rows, distance bars, and a recent-distance total. Annual distance and duration remain above the rows. It does not reproduce GitHub pinned-Gist borders, icons, filenames, or line numbers.

## API

| Request | Purpose | Authentication |
| --- | --- | --- |
| `POST /v1/workouts` | Parse a complete workout-text snapshot and replace annual totals plus recent five | Bearer `INGEST_TOKEN` |
| `GET /v1/workouts?year=2026` | Read up to five recent runs, their total distance, and supplied average speeds | None |
| `POST /v1/stats` | Replace a complete yearly aggregate | Bearer `INGEST_TOKEN` |
| `GET /v1/stats?year=2026` | Read public yearly JSON | None |
| `GET /running.svg?year=2026&theme=dark` | Render the card | None |
| `GET /health` | Return `{"status":"ok"}` | None |

The recommended upload is `{ "workoutsText": "Workout Type: Running\nDate: ...\nDuration: ...\nDistance: ..." }`, with each record beginning on a new `Workout Type:` line. Supply complete Running history from one source. The server selects the current Tokyo year by default. See [the phone guide](docs/ios-text-upload.md).

`GET /v1/workouts` adds `recentTotalDistanceKm` for its returned rows and nullable `averageSpeedKmh` per row. Speed comes from the supplied Actions Average Speed property, with unit normalization only. Existing rows without that property return `null`; an updated iPhone sync stores the native value.

The original aggregate-only endpoint remains supported. Send `{ "year": 2026, "distanceMeters": 125600, "durationSeconds": 48600 }`. These are fictional example values, never seeded into production. GET returns `{ "year": 2026, "distanceKm": 125.6, "durationSeconds": 48600 }`. Missing data returns HTTP 404 with `STATS_NOT_FOUND`; a registered zero returns HTTP 200 with zeros. Unknown fields, unknown or repeated query parameters, non-finite numbers, negative values, unsupported methods, and oversized bodies are rejected. See [the complete public contract](docs/api.md).

## iPhone setup

A [complete Cherri workflow](shortcuts/upload-running-readme.cherri) queries all workouts, selects Running records, builds the text, and posts it using Actions Keychain. Its [build and device setup guide](docs/cherri.md) explains the exported Actions metadata adapter. Compilation, graph checks, and native private signing passed; iPhone import and execution remain unverified. The owner-specific signed file stays local and is not a public release asset.

Follow the [Japanese text-upload guide](docs/ios-text-upload.md). Disable the 15-item query limit and replace manual **Choose from List** with **Repeat with Each**. Build a five-line text including `Avg Speed` for each Running workout, combine the repeat results with newlines, and set that text as the JSON body field `workoutsText`. No iPhone year-window calculation or summation is needed. The API calculates the requested Tokyo year's totals and sorts its latest five runs. Store the token with Actions Keychain and run manually before adding a daily 22:00 automation.

The [original on-device aggregation guide](docs/ios-shortcuts.md) remains available for `POST /v1/stats`, including manually confirmed zero years. That endpoint replaces the whole value with an aggregate and clears any recent-run details.

The iPhone workflow has not been executed on the user's device by this project. HealthKit access while locked and unattended shortcut execution are not guaranteed. Empty uploads and snapshots without Running records in the target year are rejected because HealthKit can conceal denied read access as an empty result. A genuine zero year can be sent after a manual permission and filter check.

## Security and privacy

At `running:year:Y`, the Worker stores `{year, distanceMeters, durationSeconds}` and, for text uploads, up to five recent runs with date, distance, duration, and optional average speed. This reflects the owner’s explicit choice to publish those recent runs. Re-sending replaces the value, without addition. Complete workout history is processed only within the upload request. The original text, older individual workouts, exact start times, IDs, GPS, heart rate, and calories are not persisted. Omit unneeded metrics from the phone text. Other legacy metric lines are accepted but discarded. `Avg Speed` is stored as nullable `averageSpeedKmh` for each retained recent run, using the supplied Actions property rather than recalculating it from distance and duration.

Annual totals and recent run data are public. The SVG can pass through GitHub's image proxy; average speed is exposed through the JSON API. A single deployment represents one person's totals. There is no account system. Possession of the ingestion token grants overwrite access to every accepted year. Rotate it if exposed. Cloudflare still processes normal network metadata; this is not anonymous hosting.

The Worker uses strict Zod boundary validation, streamed body limits of 1024 bytes for aggregate uploads and 1MiB for workout-text uploads, Hono's timing-safe Bearer comparison, generic errors, and Hono HTML escaping for SVG text. Secrets belong in Workers Secrets, not configuration. `.secrets`, `.dev.vars`, local storage, logs, and test artifacts are ignored. Worker application observability is disabled to avoid request logging. The code logs neither body nor token.

## Limits and caching

- Workers KV is eventually consistent. Both values and missing lookups can remain stale for **60 seconds or more** across locations. A successful POST means KV accepted the write, not that every reader sees it yet. See [Cloudflare's consistency description](https://developers.cloudflare.com/kv/concepts/how-kv-works/).
- SVG sends `Cache-Control: no-cache, max-age=0, must-revalidate`, following [GitHub's advice for changing images](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-anonymized-urls). Camo can still delay README refresh. This project promises no refresh deadline. Open the [direct SVG](https://running-readme-api.amtt.workers.dev/running.svg) or [JSON](https://running-readme-api.amtt.workers.dev/v1/stats) to distinguish storage delay from GitHub caching. The linked troubleshooting guide explains infrequent Camo purging. No cache-purge cron or daily commit is needed.
- Annual card totals round kilometres to one decimal and floor duration to complete minutes. Recent rows show kilometres to two decimals and duration as H:MM:SS, flooring fractional seconds. JSON retains metres divided by 1000 and parsed seconds.
- Start Date assigns a whole workout to a year. Workouts crossing midnight on New Year are not split. A run synced after 22:00 appears on the next successful sync.
- A successful upload does not prove all Health records were included. A 15-record limit or manual selection can overwrite a complete annual value with a partial one. Upload the full snapshot, never chunks.
- Text dates use `YYYY/MM/DD HH:mm[:ss]` and are interpreted as Asia/Tokyo. Numeric text supports correctly grouped commas and up to six decimal places. Unsupported formats are rejected rather than guessed.
- One iPhone should send one annual snapshot at a time. Concurrent snapshots are last-write-wins. Retry a failed complete snapshot manually; there is no server job or automatic retry queue.
- The text parser counts identical normalized start-date/distance/duration fingerprints once, including equivalent units and different IDs. A repeated Identifier with conflicting values rejects the upload. Distinct real runs with identical fingerprints are indistinguishable and are merged. Different values from multiple sources can still represent the same exercise; select one verified source when these occur.
- Shortcuts time-of-day automations follow device time. Keep the phone in the Tokyo time zone for 22:00 JST. Health authorization, locked-device protection, device shutdown, connectivity, and iOS execution restrictions can prevent a run.

## Development

```sh
npm ci
cp .dev.vars.example .dev.vars
npm run types
npm run check
npm run dev
```

Tests run in local workerd with local KV. CI runs checks and a dry-run build, and has no production token or deploy job. `npm run smoke -- URL` performs read-only and rejected-auth requests, with zero authenticated writes. Optional [browser checks and screenshots](docs/verification.md) use Playwright without adding it to runtime dependencies.

Source is deliberately small. `src/index.ts` owns HTTP validation and KV. `src/workouts.ts` parses text, normalizes units, and chooses recent runs without retaining the original export. `src/svg.ts` renders a pure card. `test/api.test.ts` exercises the endpoints. `examples/year-window.js` is the tested Tokyo date expression used by the shortcut.

## License

[MIT](LICENSE).
