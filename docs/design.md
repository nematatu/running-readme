# Running card design

The owner supplied [Hadge](https://github.com/ashtom/hadge) as the visual reference. Its README's [pinned-gist screenshot](https://user-images.githubusercontent.com/70720/140626256-b84c9945-898e-4570-bbdb-deab1ec3ef18.png) was inspected in a browser before implementation. The adopted elements are a blue code-style heading, a gray inset panel, monospace rows, line numbers, distance bars, and a total footer. This is a visual adaptation; the service still uses Shortcuts, Workers, KV, and a fixed SVG URL.

Two local SVG prototypes compared a one-line table with a two-line layout using fictional values. The one-line table was selected for its compact height and closer resemblance to the reference. No reference image, external font, JavaScript, or third-party asset is loaded by the generated SVG.

The heading identifies the selected year. The summary displays that year's complete distance and duration. Up to five recent rows display the full date, distance in kilometres to two decimals, and duration as H:MM:SS. Line numbers are decorative. Each distance bar compares its row with the longest displayed run; it is not a goal or an annual-completion percentage. Zero-distance rows have no filled bar. The footer totals only the displayed runs, matching `recentTotalDistanceKm` from the JSON API.

The intrinsic width remains 420, and the viewBox scales inside narrow README layouts. Light and dark palettes use separate background, panel, border, text, and accent colors. Missing annual data displays **Not synced**. Annual-only data keeps its summary and displays **Recent runs unavailable**. Registered zero values remain zero.

Average Speed remains available through JSON and KV. This visual update does not add it to the card or change phone data access, upload authentication, stored fields, or the public API contract.
