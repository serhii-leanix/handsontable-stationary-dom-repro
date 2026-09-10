# Handsontable Angular renderer comparison

This reproduction compares two ways of rendering the same SVG-rich Angular cell with
Handsontable 18.1:

- **HTML snapshot renderer** creates and caches detached Angular components, then copies
  their rendered HTML into Handsontable cells.
- **Official Angular component renderer** passes a `HotCellRendererComponent` directly to
  `@handsontable/angular-wrapper`.

Open the [StackBlitz reproduction](https://stackblitz.com/github/serhii-leanix/handsontable-stationary-dom-repro/tree/feature/LUN-516-angular-renderer-repro?startScript=start),
select either mode, and click **Run identical smooth scroll**. Both modes use the same
5,000-row, 40-column dataset, viewport, cell template, and scroll path.

The page reports elapsed time, renderer calls, Angular component creations, p95 frame
duration, frames over 50 ms, and long tasks.

## Observed results

Representative browser runs produced:

| Renderer | Elapsed | Renderer calls | Angular components created | p95 frame | Frames >50 ms | Long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HTML snapshot | 4,241–4,446 ms | 59,400 | 8,892 | 17.8–20.6 ms | 1–2 | 1 |
| Official Angular component | 3,266 ms | 59,400 | 54 | 12.6 ms | 0 | 0 |

Exact timings depend on the browser and hardware. The stable signal is the amount of
renderer and Angular component work performed for the identical scroll.

## Local use

```sh
npm install
npm start
```
