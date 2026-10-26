# Card UI references

README structure reviewed on 2026-10-25; the maintainer’s theme-gallery image visually reviewed on 2026-10-26. Reference choice follows the user's requirement to examine an established public UI before designing the card.

## GitHub Readme Stats

Primary source: https://github.com/anuraghazra/github-readme-stats

GitHub API reported 79,851 stars during development. This is an observed repository star count, not a verified user count, customer rating, or guarantee of service quality. The README provides public stat-card examples, theme parameters, and a `picture` example for light/dark selection. The maintainer’s [theme-gallery image](https://res.cloudinary.com/anuraghazra/image/upload/v1595174536/grs-themes_l4ynja.png), linked from the official README, is saved locally as `artifacts/reference/maintainer-card-themes.png`. The live demo endpoint displayed a loading state during capture, so it was not used as proof of the finished reference UI.

Adopted elements are a compact rounded bordered SVG card, a heading above metrics, system font fallback, restrained colours, URL-selected themes, and a `picture` wrapper. The requested running card has exactly two metric columns. No third-party card code, icon, animation, custom theme options, or remote asset is copied.

GitHub's primary announcement describing the native picture feature: https://github.blog/changelog/2022-05-19-specify-theme-context-for-images-in-markdown-beta/

The actual embedding is verified on the published repository README, independently of the local SVG tests. GitHub image-proxy response headers and their observed cache policy are recorded in `verification.md`. We do not infer cache refresh guarantees from a single fetch.

## Recent-run rows

For the owner-approved recent five rows, the existing GitHub Readme Stats card remains the frame. The [GitHub Primer DataTable](https://primer.style/product/components/data-table/) public component reference was also inspected on 2026-10-26. Adopted elements are a header row, aligned date and numeric columns, restrained dividers, and consistent row spacing. This SVG does not add an interactive table, sort controls, pagination, or a UI dependency. No claim about Primer user counts or ratings is made.
