# Public API reference

Base URL for this deployment: `https://running-readme-api.amtt.workers.dev`.

This is a single-owner service. Reading is public. HTTPS is required for production writes. Every error has `{ "error": { "code": "CODE", "message": "Description." } }`. Error messages do not echo request values or internal details.

## POST /v1/stats

Headers are `Authorization: Bearer <INGEST_TOKEN>` and `Content-Type: application/json` (an optional charset is accepted). The raw body is limited to 1024 bytes. The body must be a JSON object with exactly these required numeric fields, without string coercion:

| Field | Accepted value |
| --- | --- |
| `year` | Integer from 1970 through the current Asia/Tokyo year |
| `distanceMeters` | Finite number from 0 through 100,000,000 inclusive |
| `durationSeconds` | Finite number from 0 through that year's full calendar duration, 31,536,000 seconds or 31,622,400 in a leap year |

Fractional metres and seconds are accepted. Bounds are application policies, not claims about fitness or device accuracy. NaN and Infinity are invalid JSON; parsed overflow such as `1e999` is also rejected. Zero is valid. Unknown properties are rejected.

The server overwrites `running:year:Y` with the validated three-field object. It does not add, keep workout history, or record the ingestion timestamp. HTTP 200 is `{"ok":true,"year":2026,"distanceMeters":125600,"durationSeconds":48600}`. This confirms the put, without assuming immediate global read visibility. Do not send the example as your actual statistics.

For a self-hosted local test, use a separate local token:

```sh
curl http://localhost:8787/v1/stats \
  -H 'Authorization: Bearer replace-with-a-local-development-token-at-least-32-characters' \
  -H 'Content-Type: application/json' \
  --data-binary @examples/stats.json
```

For a real production snapshot, keep the token out of command arguments and shell history. On macOS, this Node command reads the ignored token file and a real aggregate file named `actual-stats.json`:

```sh
node --input-type=module -e 'import {readFileSync} from "node:fs"; const response=await fetch("https://running-readme-api.amtt.workers.dev/v1/stats",{method:"POST",headers:{Authorization:"Bearer "+readFileSync(".secrets/ingest-token.txt","utf8").trim(),"Content-Type":"application/json"},body:readFileSync("actual-stats.json","utf8")}); console.log(response.status,await response.text()); if(!response.ok) process.exitCode=1;'
```

Create that file only from verified actual totals. The iPhone guide performs this upload without a Mac.

## GET /v1/stats

The only accepted query is optional `year=YYYY`, with the same year bounds. Duplicate parameters, blank years, and unknown parameters return 400. The default is the current year in Asia/Tokyo.

```sh
curl https://running-readme-api.amtt.workers.dev/v1/stats
curl 'https://running-readme-api.amtt.workers.dev/v1/stats?year=2026'
```

Registered response is HTTP 200 with exactly `{ "year": 2026, "distanceKm": 125.6, "durationSeconds": 48600 }`. JSON distance is stored metres divided by 1000, without card display rounding. Missing response is HTTP 404 with `STATS_NOT_FOUND`. Registered zero returns 200 with zero values. `Access-Control-Allow-Origin: *` allows public browser GET requests. Responses use `Cache-Control: no-store`. Custom cross-origin preflight requests are not supported.

## GET /running.svg

Queries are optional `year=YYYY` and `theme=light|dark`. The default theme is light. Unknown or duplicate parameters are rejected. Missing data returns HTTP 200 SVG with **Not synced** in both metric fields. It never displays missing data as zero.

Headers include `Content-Type: image/svg+xml; charset=utf-8`, `Cache-Control: no-cache, max-age=0, must-revalidate`, `X-Content-Type-Options: nosniff`, and a restrictive Content Security Policy. The standalone SVG has a 420×124 viewBox, scales at narrow widths, and includes an accessible title and description. Public fields are Running, year, distance, and duration. Distance rounds to one decimal kilometre. Duration floors to full minutes.

```sh
curl 'https://running-readme-api.amtt.workers.dev/running.svg?year=2026&theme=dark'
```

KV and GitHub Camo caches can delay refreshed values independently. See the [README caching limits](../README.md#limits-and-caching).

## GET /health

Returns HTTP 200 and `{"status":"ok"}`, without storage content or credentials. This is Worker liveness. It does not prove KV availability or a recent iPhone sync.

## Errors and methods

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON` | Malformed JSON |
| 400 | `INVALID_STATS` | Body schema rejected |
| 400 | `INVALID_QUERY` | Query rejected |
| 400 or 401 | `UNAUTHORIZED` | Malformed Bearer header (400), missing or wrong token (401) |
| 404 | `STATS_NOT_FOUND` | No aggregate for the selected year |
| 404 | `NOT_FOUND` | Unknown endpoint |
| 405 | `METHOD_NOT_ALLOWED` | Unsupported method, with `Allow` header |
| 413 | `PAYLOAD_TOO_LARGE` | More than 1024 bytes |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | JSON content type required |
| 503 | `SERVICE_UNAVAILABLE` | Missing server Secret, invalid stored value, or internal/storage failure |

Only GET is allowed on `/health` and `/running.svg`. Only GET and POST are allowed on `/v1/stats`. HEAD and OPTIONS are deliberately rejected. Public reads need no token. POST authenticates before reading the body, so an unauthenticated oversized request receives an authentication error first. Do not retry in a tight loop; KV has per-key write limits. Re-send a complete snapshot after resolving a failure.
