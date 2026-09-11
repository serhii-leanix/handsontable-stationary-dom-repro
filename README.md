# Handsontable PR #13467 merge-aware recycling experiment

This StackBlitz uses the preview packages from Handsontable PR #13467 and compares its normal
`mergeCells` fallback with a proof-of-concept that keeps stationary row recycling enabled.

- [Open the StackBlitz](https://stackblitz.com/github/serhii-leanix/handsontable-stationary-dom-repro/tree/feature/LUN-516-angular-renderer-pr-13467?startScript=start)
- [Handsontable PR #13467](https://github.com/handsontable/handsontable/pull/13467)

For the representative stress case select:

- `Official Angular component renderer`;
- either `PR + onChange + mergeCells fallback` or `Experimental merge-aware recycling`;
- `Rich Angular cell`;
- `56 merges`.

The rich cell contains multiple SVG and nested HTML elements, but no synthetic CPU loop. The dense
profile contains 56 non-overlapping real 2 × 2 merges distributed through the data. Both scenarios use
the same 114 × 128 dataset, 3054 × 1946 viewport, and 2.5-second vertical scroll.

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
| Renderer calls | 3,108 | 760 |
| Angular components created | 189 | 231 |
| p95 frame | 16.8 ms | 16.8 ms |
| Frames over 50 ms | 2 | 2 |
| Long tasks | 2 / 353 ms | 2 / 139 ms |

The fallback blocks animation long enough to skip more intermediate virtual bands, which explains its
lower component-creation count. The prototype reduces renderer calls by about 76% and total long-task
time by about 61%.

DOM state was compared against the unmodified fallback while scrolling through rows
0 → 20 → 40 → 60 → 80 → 100 → 60 → 20 → 0. All common rendered logical cells had identical text,
`rowspan`, `colspan`, and visibility state.

## Local use

```sh
npm install
npm start
```
