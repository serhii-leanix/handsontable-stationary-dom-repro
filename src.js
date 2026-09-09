import './style.css';

async function main() {
const params = new URLSearchParams(location.search);
const version = params.get('version') === '18.1.0' ? '18.1.0' : '16.2.0';
const versionSelect = document.querySelector('#version');
versionSelect.value = version;
versionSelect.addEventListener('change', () => {
  params.set('version', versionSelect.value);
  location.search = params.toString();
});

const module = version === '18.1.0'
  ? await import('handsontable18')
  : await import('handsontable16');

if (version === '18.1.0') {
  await import('handsontable18/styles/handsontable.css');
} else {
  await import('handsontable16/dist/handsontable.full.css');
}

const Handsontable = module.default;
const ROWS = 5_000;
const COLS = 40;
const data = Array.from({ length: ROWS }, (_, row) => ({
  id: row,
  cells: Array.from({ length: COLS }, (_, col) => `R${row + 1} · C${col + 1}`),
}));

const metrics = {
  rendererCalls: 0,
  cacheMisses: 0,
  longTasks: 0,
  longTaskTime: 0,
  frameTimes: [],
};
let runStartedAt = 0;
const cellCache = new WeakMap();

function deriveExpensiveValue(record, col) {
  let hash = 2166136261;
  const source = `${record.id}:${col}:${record.cells[col]}`;
  // Deliberately CPU-heavy deterministic work, representative of rich custom renderers.
  for (let repeat = 0; repeat < 40_000; repeat += 1) {
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${record.cells[col]} · ${hash >>> 0}`;
}

function expensiveRenderer(instance, td, row, col) {
  metrics.rendererCalls += 1;
  const record = data[row];
  const cached = cellCache.get(td);

  if (cached?.record === record && cached.col === col) {
    td.textContent = cached.value;
    return td;
  }

  metrics.cacheMisses += 1;
  const value = deriveExpensiveValue(record, col);
  cellCache.set(td, { record, col, value });
  td.textContent = value;
  return td;
}

const hot = new Handsontable(document.querySelector('#hot'), {
  data,
  width: '100%',
  height: 540,
  rowHeaders: true,
  colHeaders: true,
  colWidths: 130,
  rowHeights: 28,
  viewportRowRenderingOffset: 10,
  viewportColumnRenderingOffset: 2,
  licenseKey: 'non-commercial-and-evaluation',
  cells: () => ({ renderer: expensiveRenderer }),
});

const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    metrics.longTasks += 1;
    metrics.longTaskTime += entry.duration;
  }
  updateMetrics();
});
observer.observe({ type: 'longtask', buffered: true });

document.querySelector('#has-css').addEventListener('change', (event) => {
  document.body.classList.toggle('with-has-css', event.target.checked);
});

document.querySelector('#reset').addEventListener('click', resetMetrics);
document.querySelector('#run').addEventListener('click', runSmoothScroll);

function resetMetrics() {
  metrics.rendererCalls = 0;
  metrics.cacheMisses = 0;
  metrics.longTasks = 0;
  metrics.longTaskTime = 0;
  metrics.frameTimes = [];
  runStartedAt = 0;
  performance.clearResourceTimings();
  updateMetrics();
}

async function runSmoothScroll() {
  const button = document.querySelector('#run');
  const scrollContainer = hot.rootElement.querySelector('.ht_master .wtHolder');
  button.disabled = true;
  scrollContainer.scrollTop = 0;
  await nextFrames(2);
  resetMetrics();
  runStartedAt = performance.now();

  for (let row = 0; row <= 1_200; row += 8) {
    scrollContainer.scrollTop = row * 28;
    metrics.frameTimes.push(await nextFrameDuration());
  }
  for (let row = 1_200; row >= 0; row -= 8) {
    scrollContainer.scrollTop = row * 28;
    metrics.frameTimes.push(await nextFrameDuration());
  }

  updateMetrics(performance.now() - runStartedAt);
  button.disabled = false;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function nextFrameDuration() {
  const startedAt = performance.now();
  return new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now() - startedAt)));
}

async function nextFrames(count) {
  for (let index = 0; index < count; index += 1) await nextFrame();
}

function updateMetrics(elapsed = runStartedAt ? performance.now() - runStartedAt : 0) {
  const sortedFrames = [...metrics.frameTimes].sort((left, right) => left - right);
  const p95Frame = sortedFrames[Math.floor(sortedFrames.length * 0.95)] ?? 0;
  document.querySelector('#renderer-calls').textContent = metrics.rendererCalls.toLocaleString();
  document.querySelector('#cache-misses').textContent = metrics.cacheMisses.toLocaleString();
  document.querySelector('#long-tasks').textContent = metrics.longTasks.toLocaleString();
  document.querySelector('#long-task-time').textContent = `${Math.round(metrics.longTaskTime).toLocaleString()} ms`;
  document.querySelector('#p95-frame').textContent = `${p95Frame.toFixed(1)} ms`;
  document.querySelector('#slow-frames').textContent = metrics.frameTimes.filter((duration) => duration > 50).length.toLocaleString();
  document.querySelector('#elapsed').textContent = `${Math.round(elapsed).toLocaleString()} ms`;
}

updateMetrics();
}

main();
