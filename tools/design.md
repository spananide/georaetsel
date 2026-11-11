# Design: "Abreißkalender" (read before touching any CSS)

The site is a tear-off day calendar. Every day is a new sheet; the puzzles are what is printed on it. Print look: paper, ink, four flat print inks. Not a web-app look.

## Forbidden (hard rules)
- gradients, glow, blur/glass, box-shadows, text-shadows
- pill shapes: border-radius above 4px (only true round dots/holes may be 50%)
- emoji in the UI, icon-in-circle, identical rounded card grids, centered hero + three feature cards
- uppercase micro-labels everywhere (uppercase only for the tiny "Blatt"/"Nr." style labels, max one per section)
- coloured left borders, drop-shadow "elevation", opacity-faded text as hierarchy
- hard-coded colours in component CSS: use tokens only (exception: one-off art inside SVG glyphs)

## Allowed
2px ink borders and rules, flat solid fills, square cells with 0-3px radius, one slightly rotated rubber stamp (-4deg), functional motion only (tile flip, dive, stamp press 180ms), always behind `prefers-reduced-motion: no-preference`.

## Fonts (self-hosted, `/georaetsel/assets/fonts/`, loaded by common.css)
- Display: `Bricolage Grotesque` (variable, 700-800), tight: `letter-spacing: -0.02em; line-height: 1`. Headings, game names, big numerals.
- Body/UI: `Atkinson Hyperlegible Next` (variable, 400-700). Everything else. Buttons 600.
- `font-variant-numeric: tabular-nums` on clock, counters, scores.
- Scale: 0.8125 small, 1 body, 1.125 lead, 1.5 h3, 2.25 game name (clamp up to 3), 5-8rem date numeral.

## Tokens (names are fixed, game CSS already uses them)
| token | light | dark | role |
|---|---|---|---|
| `--page` | #f4efe3 | #1d1b18 | paper |
| `--panel` | #fbf8f0 | #26231f | raised paper (dialogs, inputs) |
| `--sea` | #e8e1d0 | #2d2a25 | sunk paper (empty cells, wells) |
| `--ink` | #1b1a17 | #f3eee2 | text, rules, borders |
| `--soft` | #5c574b | #b5ae9e | secondary text (>= 4.5:1 on --page) |
| `--line` | #1b1a17 | #f3eee2 | = ink, borders are strong |
| `--rule` | #cfc7b3 | #3d3a33 | hairline only inside lists/grids (never for text) |
| `--warn` | #b8321f | #ff6a50 | errors |
| `--hoch` | #d8402a | #ff6a50 | red ink |
| `--blau` | #2c4fd0 | #6f8cff | blue ink |
| `--huegel` | #f0b323 | #ffc93d | yellow ink |
| `--tief` | #1f8c5a | #46c487 | green ink |
| `--hoch-ink --blau-ink --huegel-ink --tief-ink` | text colour on that ink: `#fff` for red/blue/green, `#1b1a17` for yellow (dark theme: `#1b1a17` for all four) |

Theme: light is the `:root` default; dark applies under `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])` and under `:root[data-theme="dark"]`. Both blocks must hold the same dark values.

## Components (class names stay; only the look changes)
- `.wordmark`: display 800, 2.25-3rem, ink. `.back-link`: small text link, underline on hover, no arrow icon, text "← Alle Spiele" stays.
- `.tabs` / `.tab-btn`: plain text tabs, 2px ink rule under the whole row, active tab has a 4px ink underline (`aria-current="page"`), inactive uses `--soft`. No boxes, no pills.
- `.btn`: rectangular, 2px ink border, radius 2px, min-height 44px, weight 600. `.btn-primary` solid ink with page-coloured text; `.btn-secondary` transparent with ink border. Hover/active: invert or translate 1px, no shadow.
- `.search-input`: 2px ink border, radius 0, `--panel` background.
- `.result-btn`: row with 1px `--rule` bottom border, no box.
- `dialog`: `--panel`, 2px ink border, radius 0, no backdrop blur, backdrop `rgb(0 0 0 / .5)`.
- `.toast`: ink background, page text, radius 2px.
- `.clock`: tabular figures in display font, no border, no pill; plain text with a 2px ink underline.
- `.icon-btn`: unchanged size (44px), square, 2px ink outline on hover.
- Focus: `outline: 3px solid var(--blau); outline-offset: 2px` (visible in both themes).
- Boards: square cells with 2px ink borders (grid lines may be 1px `--rule` inside), flat fills from the ink tokens.

## Layout
Left-aligned, asymmetrical. Page column max 640px (hub 720px). Sections separated by 2px ink rules, not by cards or gaps with shadows.
