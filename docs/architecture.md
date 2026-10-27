# Code structure

Start with [`src/index.ts`](../src/index.ts). Each route declares its HTTP policies, then reads typed input through `c.req.valid()`. The handler performs the operation named by the endpoint: read statistics, aggregate workouts, save a snapshot, or render SVG.

| Module | Owns |
| --- | --- |
| `index.ts` | Routes, request schemas, and public responses |
| `http.ts` | Shared authentication, byte limits, JSON parsing, and input validation middleware |
| `stats.ts` | Statistics schemas, Tokyo year, and the KV storage format |
| `workouts.ts` | Workout-text parsing, unit normalization, duplicate detection, and annual aggregation |
| `svg.ts` | Rendering validated statistics |

An upload passes authentication, the body limit, media-type checks, and input validation before its handler runs. The workout upload also rejects query parameters before parsing JSON. These are ordered Hono middleware, so the route shows which policies apply.

Zod supplies the input and stored-data types. JSON and query validation each happen once at their HTTP boundary. The workout parser validates its text records and final annual totals before returning a snapshot. Saving accepts typed statistics. Reading from KV validates its external JSON once and restores defaults for older records.

## Library choices

The structure follows [Hono's validation guide](https://hono.dev/docs/guides/validation) and [official examples](https://github.com/honojs/examples/tree/main/pages-stack). Query validation uses Hono's built-in `validator`, which passes repeated query parameters as arrays. Zod rejects those arrays without a second manual query check.

The official [`@hono/zod-validator`](https://github.com/honojs/middleware/tree/main/packages/zod-validator) was also considered. It uses Hono's JSON parser, whose malformed-JSON response and Content-Type handling differ from this API's existing contract. A small shared JSON middleware preserves that contract, stores the validated result, and carries its inferred type to `c.req.valid('json')`. No dependency was added.

The method guard derives supported methods from Hono's registered routes. It preserves the API's existing rejection of `HEAD`; Hono's built-in method-not-allowed middleware includes `HEAD` for `GET` routes. Missing statistics remain a JSON 404 and an SVG **Not synced** response, explicitly handled by their routes.
