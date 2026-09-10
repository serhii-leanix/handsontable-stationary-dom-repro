# Handsontable official Angular renderer benchmark

This reproduction compares the official Angular cell renderer in Handsontable 16.2 and 18.1.
The application source, Angular 20.3, cell component, data, geometry, and vertical scroll are identical;
only `handsontable` and `@handsontable/angular-wrapper` change.

- [Handsontable 16.2 StackBlitz](https://stackblitz.com/github/serhii-leanix/handsontable-stationary-dom-repro/tree/feature/LUN-516-angular-renderer-16-benchmark?startScript=start)
- [Handsontable 18.1 StackBlitz](https://stackblitz.com/github/serhii-leanix/handsontable-stationary-dom-repro/tree/feature/LUN-516-angular-renderer-repro?startScript=start)

Each table has 114 rows and 128 explicitly configured columns. The viewport is 3054×1946 px,
with 162 px columns, 36 px rows, a row rendering offset of 10, and a column rendering offset of 2.
Each cell is an `OnPush` Angular component extending `HotCellRendererComponent`; it contains a native
SVG, a text label, and a status badge. There is no synthetic CPU work.

The page exposes three renderer modes:

- `snapshot`: a simplified version of the legacy application renderer, caching detached Angular
  components and copying their HTML into each physical cell;
- `recommended`: the maintainer-recommended live component-container cache, keyed by table and
  physical cell coordinates, moved only when necessary, and destroyed after leaving the viewport;
- `official`: the renderer provided by `@handsontable/angular-wrapper`.

Click **Run identical smooth scroll** to animate `scrollTop` from 0 to 1000 over 2.5 seconds. The page
reports renderer calls, Angular component creations, frame durations, and long tasks.

## Representative production-build results

The table below contains medians from five automated runs using the same Chromium viewport.

| Metric | Pure JS, HoT 18.1 | Angular, HoT 16.2 | Angular, HoT 18.1 |
| --- | ---: | ---: | ---: |
| Renderer calls | 1,575 | 1,575 | 1,575 |
| Script | 56 ms | 969 ms | 136 ms |
| Long-task time | 82 ms | 1,005 ms | 195 ms |
| Longest task | 76 ms | 967 ms | 148 ms |
| p95 frame | 41.6 ms | 33.5 ms¹ | 58.3 ms |

¹ The 16.2 p95 is deceptively low because a single 0.6–1.6 second task blocks animation-frame delivery.
The maximum frame and long-task duration show the stall.

In a fresh forward run with 3,129 renderer calls, 16.2 created 3,129 Angular components. The 18.1
wrapper created only 231 while growing the physical viewport pool, and subsequent warmed runs added none.
This confirms that 18.1's renderer reuse fixes the 16.2 component churn, while the official Angular path
still costs more than the equivalent pure-JavaScript renderer.

## Local use

```sh
npm install
npm start
```
