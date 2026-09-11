# Handsontable PR #13467 merge-aware recycling experiment

This StackBlitz uses the preview packages from Handsontable PR #13467 and compares its normal
`mergeCells` fallback with a proof-of-concept that keeps stationary row recycling enabled.

- [Open the StackBlitz](https://stackblitz.com/github/serhii-leanix/handsontable-stationary-dom-repro/tree/feature/LUN-516-angular-renderer-pr-13467?startScript=start)
- [Handsontable PR #13467](https://github.com/handsontable/handsontable/pull/13467)

For the representative stress case select:

- `Official Angular component renderer`;
- either `PR + onChange + mergeCells fallback` or `Experimental merge-aware recycling`;
- `Rich Angular cell`;
- `19 expanded groups`.

The rich cell contains multiple SVG and nested HTML elements, but no synthetic CPU loop. The data
models the Inventory expanded-relation layout: a source row followed by two synthetic relation rows.
Three relation columns remain independent, while every non-relation column spans the three-row group.
Across 19 groups and 40 columns, this produces 703 real `rowspan: 3, colspan: 1` merges. Both scenarios
use the same 114-row dataset, 3054 × 1946 viewport, and 2.5-second vertical scroll.

## Proof-of-concept

`MergeCells` still uses its existing multi-pass measured layout. The patch only allows the stationary
row band and `TR` rotation to remain active. Ordinary cells keep their stable paint identity, while
merged anchors and covered cells retain the viewport-dependent identity and are repainted as the
virtual window changes.

The prototype identifies merge-managed cells from their current DOM state. This is sufficient for the
reproduction, but a production implementation should expose the information explicitly from the merge
plugin instead of inspecting `rowspan`, `colspan`, and `display`.

## Representative results

Medians from five automated Chromium runs:

| Metric | PR merge fallback | Merge-aware prototype |
| --- | ---: | ---: |
| Renderer calls | 3,192 | 1,692 |
| Angular components created | 252 | 252 |
| p95 frame | 16.8 ms | 16.8 ms |
| Frames over 50 ms | 2 | 2 |
| Long tasks | 2 / 315 ms | 2 / 193 ms |

The prototype reduces renderer calls by about 47% and total long-task time by about 39%. The gain is
smaller than with sparse rectangular merges because the Inventory-shaped profile intentionally places
most non-relation cells inside vertically merged groups.

DOM state was compared against the unmodified fallback while scrolling through rows
0 → 20 → 40 → 60 → 80 → 100 → 60 → 20 → 0. All common rendered logical cells had identical text,
`rowspan`, `colspan`, and visibility state.

## Local use

```sh
npm install
npm start
```
