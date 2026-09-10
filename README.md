# Handsontable 16.2 vs 18.1 rendering reproduction

This reproduction isolates two independent costs in a 5,000-row × 40-column virtualized table:

1. **Component-container movement.** It implements the record-and-column keyed container cache
   recommended by the Handsontable maintainer and measures how often the cached DOM still has
   to be moved into a stationary `TD`.
2. **Nested headers.** It compares no nested headers, many realistic groups of three, and one
   three-column group placed only at the right edge.

There is no synthetic CPU workload. Every cache miss creates realistic DOM: a wrapper, native
SVG icon, text label, and status badge.

[Open the combined StackBlitz reproduction](https://stackblitz.com/github/serhii-leanix/handsontable-stationary-dom-repro/tree/feature/LUN-516-combined-performance-repro?startScript=start)

## Controls

- **Handsontable:** run exactly the same configuration on 16.2 or 18.1.
- **Scenario:**
  - `Vertical: component movement` isolates the renderer/component-container behavior.
  - `2D: nested-header cost` repeats that path at both horizontal edges and traverses all columns.
- **Nested headers:** disabled, many groups of three, or one group of three at the far right.

Every selector reloads the page so each measurement starts with a fresh Handsontable instance.

## Result 1: component-container movement

Vertical scenario with nested headers disabled, across three fresh-page runs:

| Version | Renderer calls | DOM rebuilds | Cached DOM moves | p95 frame | Elapsed |
| --- | ---: | ---: | ---: | ---: | ---: |
| 16.2 | 64,240 | 13,519 | 13,519 | 19.6–20.0 ms | 3,031–3,222 ms |
| 18.1 | 62,689 | 12,199 | 62,689 | 24.1–25.1 ms | 4,021–4,187 ms |

The maintainer's record-keyed recipe removes the rebuild difference: 18.1 creates slightly
fewer containers than 16.2. It does not remove positional DOM movement; 18.1 moves cached
containers about **4.6× more often** in this scenario.

## Result 2: nested headers

2D scenario using the recommended record-and-column cache, one fresh-page run:

| Version | Nested-header configuration | Max rendered columns | DOM rebuilds | Cached DOM moves | p95 frame | Elapsed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 16.2 | Off | 12 | 27,560 | 36,405 | 19.8 ms | 6,718 ms |
| 16.2 | Groups of 3 | 14 | 29,920 | 36,220 | 19.8 ms | 6,981 ms |
| 16.2 | One trailing group | 12 | 27,520 | 36,060 | 19.8 ms | 6,663 ms |
| 18.1 | Off | 13 | 25,005 | 136,865 | 24.0 ms | 8,790 ms |
| 18.1 | Groups of 3 | 15 | 28,164 | 147,803 | 25.7 ms | 9,308 ms |
| 18.1 | One trailing group | 15 | 24,965 | 133,929 | 24.6 ms | 8,799 ms |

The realistic nested-header configurations do **not** force all 40 columns into the DOM. The
counter reports the actual maximum. Groups of three expand the rendered range modestly; the
single trailing group affects the viewport only when the benchmark reaches the right edge.

## How metrics are collected

- Browser viewport: 1,280 × 900; table height: 540 px; column width: 130 px.
- Vertical path: row 0 → 1,200 → 0 in 8-row steps.
- 2D path: vertical round trip at the left edge, horizontal traversal to the right edge, another
  vertical round trip, then horizontal traversal back.
- One `requestAnimationFrame` is awaited after every scroll step.
- Renderer calls and DOM rebuilds are counted directly inside the custom renderer.
- Rendered columns/rows come from Handsontable's `countRenderedCols()` and
  `countRenderedRows()` APIs.
- Frame timings use `requestAnimationFrame`; long tasks use the browser Long Tasks API.
- Exact timings are hardware-dependent. Renderer, rebuild, move, and rendered-column counts are
  the more stable architectural signals.

## Relevant upstream changes

- [Position-based DOM reuse](https://github.com/handsontable/handsontable/pull/12844)
- [Removal of delta rendering in favor of stationary DOM](https://github.com/handsontable/handsontable/pull/13020)
- [NestedHeaders right-edge viewport expansion](https://github.com/handsontable/handsontable/pull/12783)
- [Our upstream report and maintainer response](https://github.com/handsontable/handsontable/issues/13446)

## Local use

```sh
npm install
npm start
```
