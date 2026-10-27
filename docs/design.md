# Running card design

The card displays the selected year, annual distance and duration, up to five recent runs, and the distance total for those rows. Recent rows contain the full date, distance in kilometres to two decimals, and duration as H:MM:SS.

The owner requested removal of the pinned-Gist preview only. The card keeps the statistics and table and removes the code icon, blue Gist-style heading, inset code panel, line numbers, and distance bars. The actual pinned Gist is separate and remains unchanged.

The original simple statistics-card structure was informed by [GitHub Readme Stats](https://github.com/anuraghazra/github-readme-stats). The adopted structure has a heading above labeled statistics in a compact bordered card. Its public README and local reference captures were inspected. The earlier [Hadge](https://github.com/ashtom/hadge) preview styling is no longer used.

The SVG has an intrinsic width of 420 and scales through its viewBox. It uses system fonts, light and dark palettes, and no external assets. Missing annual data displays **Not synced**. Registered zero values remain zero. Average Speed stays available through JSON and KV.
