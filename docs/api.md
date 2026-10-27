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

Headers include `Content-Type: image/svg+xml; charset=utf-8`, `Cache-Control: no-cache, max-age=0, must-revalidate`, `X-Content-Type-Options: nosniff`, and a restrictive Content Security Policy. The standalone SVG has a 420px-wide viewBox, scales at narrow widths, and includes an accessible title and description. Height is 124px without recent rows and grows when recent rows are available. Public fields are Running, year, aggregate distance and duration, plus the latest five dates, distances, and durations when supplied through the text endpoint. Distance rounds to one decimal kilometre. Duration floors to full minutes.

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
| 413 | `PAYLOAD_TOO_LARGE` | More than the endpoint body limit |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | JSON content type required |
| 503 | `SERVICE_UNAVAILABLE` | Missing server Secret, invalid stored value, or internal/storage failure |

Only GET is allowed on `/health` and `/running.svg`. Only GET and POST are allowed on `/v1/stats`. HEAD and OPTIONS are deliberately rejected. Public reads need no token. POST authenticates before reading the body, so an unauthenticated oversized request receives an authentication error first. Do not retry in a tight loop; KV has per-key write limits. Re-send a complete snapshot after resolving a failure.

## POST /v1/workouts

Recommended for an iPhone that already generates a workout memo. Same Bearer authentication and JSON content type as `/v1/stats`. The actual streamed body limit is **1,048,576 bytes (1MiB)**, independently of Content-Length. No query parameters are accepted.

```json
{
  "workoutsText": "Workout Type: Running\nDate: 2026/01/15 07:30\nDuration: 900秒\nDistance: 2,500 m"
}
```

This is a fictional example, not a production upload. `workoutsText` is a nonempty string. Optional numeric `year` uses the existing bounds; omitting it chooses the current Tokyo year. Unknown body properties are rejected. Supply the complete snapshot, not a newly added run or a selected subset. A partial snapshot replaces the complete annual value; the API cannot detect omitted records. Disable iPhone query limits and manual selection.

Each block begins at a new `Workout Type:` line. Labels are case-sensitive. Blank lines between records are optional. Up to 10,000 blocks are accepted, subject to the byte limit.

| Label | Value |
| --- | --- |
| `Workout Type` | `Running` is aggregated; other types are skipped |
| `Date` | `YYYY/MM/DD HH:mm` or `YYYY/MM/DD HH:mm:ss`, always interpreted as Asia/Tokyo; real, non-future calendar date required |
| `Duration` | Nonnegative decimal with unit `秒`, `s`, `sec`, `min`, `分`, `h`, or `時間`; optional parenthesized human-readable suffix is ignored |
| `Distance` | Nonnegative decimal followed by `m` or `km` |
| `Avg Speed` | Optional supplied average speed with `km/h`, `m/s`, `mph`, or `mi/h`; normalized to km/h, range 0–1000; missing or blank becomes `null` |
| `Identifier` | Optional private deduplication ID, not persisted |

Commas must form groups of three digits. Decimal separator is `.` and up to six fractional digits are supported. Equivalent decimal units use exact integer-scaled keys for duplicate detection, avoiding binary floating-point discrepancies. Parsed values and annual totals are bounded by the existing aggregate policies. The annual sum is represented as a JSON number.

Legacy `End date`, `Heart rate`, and `Active calories` lines are accepted and discarded. Omit these on the phone. Duplicate labels, unknown labels, malformed Running entries, and missing metrics reject the whole upload before KV is written. Repeated normalized start-date/distance/duration fingerprints count once, including equivalent units and different IDs. A repeated Identifier with a different fingerprint rejects the whole upload as `DUPLICATE_WORKOUT`, preserving existing data. Distinct real runs with identical fingerprints are indistinguishable and are merged. Different values from multiple sources can still represent the same exercise, so select one verified source when these occur.

Running entries are assigned by their full Start Date in Tokyo. Only the selected year's totals and its latest five Running entries are retained. Other years in the same export are not updated. One KV put replaces the selected year's value. Stored fields are `year`, `distanceMeters`, `durationSeconds`, and `recentWorkouts`, an array of at most five `{date: "YYYY-MM-DD", distanceMeters, durationSeconds, averageSpeedKmh}` objects in descending Start Date order. Exact start times are used in memory for sorting and discarded before storage. IDs and original text are not retained. These five dates, distances, durations, and average speeds are public by the owner's choice.

HTTP 200 returns `{"ok":true,"year":2026,"distanceMeters":2500,"durationSeconds":900,"workoutCount":1,"recentWorkouts":[{"date":"2026-01-15","distanceMeters":2500,"durationSeconds":900,"averageSpeedKmh":null}]}`. `workoutCount` counts unique target-year fingerprints in the uploaded input; it is not proof of full Health coverage. Repeating the same complete upload does not add to the total.

Additional 400 codes are `INVALID_WORKOUT_TEXT`, `NO_RUNNING_DATA` (no target-year Running records), and `DUPLICATE_WORKOUT` (one Identifier has conflicting values). Empty or target-year-empty uploads never clear a saved year. A genuine empty year requires manually confirmed zero via `POST /v1/stats`. The original aggregate endpoint remains supported and clears recent-run details when it replaces the value.

`averageSpeedKmh` uses the supplied `Avg Speed` value with unit normalization only. It is never inferred from distance/duration. Old KV rows without the field are read as `null` without rewriting storage; the next updated phone upload stores the property. Speed does not change the existing duplicate fingerprint. For duplicate fingerprints, the first record’s speed is retained, including a missing value.

## GET /v1/workouts

Public endpoint. Optional `year=YYYY` uses the same bounds and Tokyo default as `/v1/stats`. Unknown/repeated queries are rejected. Response headers include public GET CORS and no-store.

HTTP 200 returns `{ "year": 2026, "recentTotalDistanceKm": 2.5, "workouts": [{ "date": "2026-01-15", "distanceKm": 2.5, "durationSeconds": 900, "averageSpeedKmh": 13.506 }] }` with up to five rows for that year. This is a fictional example. `recentTotalDistanceKm` sums the returned rows’ metres before converting to km. It is not the annual total. With fewer than five runs, only those returned runs contribute. Explicit empty recent rows return zero. A legacy aggregate saved through `/v1/stats` has both `workouts: null` and `recentTotalDistanceKm: null`, meaning recent details have not been uploaded. Missing annual data returns HTTP 404 with `STATS_NOT_FOUND`.

SVG includes these same date/distance/duration rows beneath the aggregate when available, as a date, distance, and duration table. A footer totals only the displayed runs. Height is dynamic and the original responsive width is retained. See [the design reference and display rules](design.md). Annual JSON `/v1/stats` retains its original three-field response for compatibility. Both GET and POST are allowed on `/v1/workouts`; HEAD and OPTIONS are rejected. KV/Camo consistency limits remain unchanged.
