# Handsontable PR #13467 merge-aware recycling validation

This StackBlitz uses the preview packages rebuilt from Handsontable PR #13467 at commit
`074037d07c`. Merge-aware row recycling is implemented upstream; this reproduction does not patch
Handsontable locally.

- [Open the StackBlitz](https://stackblitz.com/github/serhii-leanix/handsontable-stationary-dom-repro/tree/feature/LUN-516-angular-renderer-pr-13467?startScript=start)
- [Handsontable PR #13467](https://github.com/handsontable/handsontable/pull/13467)
- [Issue #13446](https://github.com/handsontable/handsontable/issues/13446)

For the representative stress case select:

- `Official Angular component renderer`;
- `PR + onChange + mergeCells`;
- `Rich Angular cell`;
- `19 expanded groups`.

The rich cell contains multiple SVG and nested HTML elements, but no synthetic CPU loop. The data
models the Inventory expanded-relation layout: a source row followed by two synthetic relation rows.
Three relation columns remain independent, while every non-relation column spans the three-row group.
Across 19 groups and 40 columns, this produces 703 real `rowspan: 3, colspan: 1` merges. Every scenario
uses the same 114-row dataset, 3054 × 1946 table viewport, and 2.5-second vertical scroll.

## Upstream merge-aware result

Medians from five automated Chrome runs with the official Angular renderer and rich cells:

| Metric | `always` + mergeCells | `onChange` + mergeCells |
| --- | ---: | ---: |
| Renderer calls | 3,192 | 1,692 |
| Angular components created | 252 | 252 |
| p95 frame | 16.8 ms | 16.8 ms |
| Frames over 50 ms | 2 | 2 |
| Long tasks | 2 / 249 ms | 2 / 176 ms |

The upstream implementation reduces renderer calls by about 47% and long-task time by about 29%. It
matches the 1,692 renderer calls previously measured with the local proof of concept. The remaining
calls include the cells entering the viewport and merge-managed cells, which remain viewport-bound.

## Renderer comparison on the updated build

All modes below use `renderMode: 'onChange'`, the same dense merge profile, and the upstream
merge-aware implementation:

| Metric | Legacy HTML snapshot | Coordinate-keyed component cache | Official Angular renderer |
| --- | ---: | ---: | ---: |
| Renderer calls | 1,692 | 1,692 | 1,692 |
| Angular components created | 279 | 1,098 | 252 |
| p95 frame | 16.8 ms | 16.8 ms | 16.8 ms |
| Frames over 50 ms | 0 | 1 | 2 |
| Long tasks | 1 / 64 ms | 2 / 131 ms | 2 / 176 ms |

The official renderer keeps its live component pool bounded by the physical viewport. The
coordinate-keyed cache accumulates components for logical cells visited during the scroll, which is
why it creates substantially more components in this scenario. The legacy snapshot remains cheapest
for this simplified cell, while the official renderer has the safer lifecycle behavior for a real
table with many unique and substantially more complex Angular cells.

DOM state was compared between `always` and `onChange` while scrolling through rows
0 → 20 → 40 → 60 → 80 → 100 → 60 → 20 → 0. All common rendered logical cells had identical text,
`rowspan`, `colspan`, and visibility state.

## Local use

```sh
npm install
npm start
```
