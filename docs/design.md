# Running display design

The owner supplied [Hadge](https://github.com/ashtom/hadge) as the visual reference. Its official README screenshot and the linked [statistics generator](https://gist.github.com/ashtom/1cd9602b122082827b38eb79d605ca1a) inform the compact monospace rows, monochrome horizontal distance bars, and total line. The SVG uses these content conventions without reproducing GitHub pinned-Gist borders, icons, blue filenames, code panels, or line numbers. The actual pinned Gist is separate and unchanged.

The display includes the selected year, annual distance and duration, up to five recent runs, and the distance total for those rows. Recent rows contain the full date, distance in kilometres to two decimals, a distance bar, and duration as H:MM:SS. Each bar compares its row to the longest displayed run. It does not show progress toward a goal. A zero-distance row has no filled bar.

The SVG has an intrinsic width of 420 and scales through its viewBox. It uses a system monospace font and a flat background for each theme, without an outer card border or inset code panel. No external assets are loaded. Missing annual data displays **Not synced**. Registered zero values remain zero. Average Speed stays available through JSON and KV.
