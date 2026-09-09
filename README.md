# Handsontable stationary DOM scroll reproduction

Minimal reproduction for the custom-renderer scroll regression introduced by stationary
positional DOM reuse.

Open the [StackBlitz reproduction](https://stackblitz.com/github/serhii-leanix/handsontable-stationary-dom-repro),
choose a Handsontable version, and click **Run smooth scroll**. Compare:

- custom renderer calls;
- expensive cache misses;
- long tasks and their total duration;
- total elapsed time for the same round-trip scroll.

The workload selector offers two renderer variants:

- **Synthetic CPU** keeps the original deterministic hash calculation used by the issue.
- **SVG DOM** removes the artificial CPU loop and builds realistic cell DOM: a wrapper,
  native SVG icon, text label, and status badge.

The custom renderer models an application that associates expensive derived UI state with
the rendered `TD` and source row. Handsontable 16.2's coordinate-aware node movement keeps
those associations useful. Handsontable 18.1's stationary positional reuse makes the same
DOM nodes represent changing source rows, producing repeated expensive cache misses.

The optional `:has()` toggle represents the host-page invalidation case that motivated the
stationary DOM implementation. The request is not to remove that strategy, but to provide a
supported opt-in delta/coordinate-aware strategy for applications dominated by expensive
custom renderers.

## Example result

One automated run in headless Chrome on the same machine and viewport produced:

| Version | Renderer calls | Expensive cache misses | p95 scroll frame | Frames >50 ms | Long-task time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 16.2.0 | 7,204 | 1,530 | 47.3 ms | 0 | 0 ms |
| 18.1.0 | 6,230 | 6,230 | 83.9 ms | 89 | 5,800 ms |

Exact timings are hardware-dependent. The invariant signal is the cache-miss ratio: with
stationary positional nodes, every rendered cell represents changing source data while
scrolling, so every renderer invocation becomes an expensive miss.

## Local use

```sh
npm install
npm run dev
```
