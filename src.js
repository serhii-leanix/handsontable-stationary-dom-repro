import './style.css';

async function main() {
const params = new URLSearchParams(location.search);
const version = params.get('version') === '18.1.0' ? '18.1.0' : '16.2.0';
const workload = params.get('workload') === 'svg' ? 'svg' : 'cpu';
const versionSelect = document.querySelector('#version');
const workloadSelect = document.querySelector('#workload');
versionSelect.value = version;
workloadSelect.value = workload;
versionSelect.addEventListener('change', () => {
  params.set('version', versionSelect.value);
  location.search = params.toString();
});
workloadSelect.addEventListener('change', () => {
  params.set('workload', workloadSelect.value);
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

function createSvgCell(record, col) {
  const namespace = 'http://www.w3.org/2000/svg';
  const wrapper = document.createElement('span');
  wrapper.className = 'demo-cell';

  const icon = document.createElementNS(namespace, 'svg');
  icon.classList.add('demo-cell__icon');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('aria-hidden', 'true');

  const circle = document.createElementNS(namespace, 'circle');
  circle.setAttribute('cx', '8');
  circle.setAttribute('cy', '8');
  circle.setAttribute('r', '6');

  const check = document.createElementNS(namespace, 'path');
  check.setAttribute('d', 'M5 8.2 7.1 10.3 11.5 5.9');
  icon.append(circle, check);

  const label = document.createElement('span');
  label.className = 'demo-cell__label';
  label.textContent = record.cells[col];

  const status = document.createElement('span');
  status.className = `demo-cell__status demo-cell__status--${record.id % 4}`;
  status.textContent = ['Draft', 'Active', 'Review', 'Archived'][record.id % 4];

  wrapper.append(icon, label, status);
  return wrapper;
}

function expensiveRenderer(instance, td, row, col) {
  metrics.rendererCalls += 1;
  const record = data[row];
  const cached = cellCache.get(td);
  const input = record.cells[col];

  if (cached?.record === record && cached.col === col && cached.input === input) {
    return td;
  }

  metrics.cacheMisses += 1;
  if (workload === 'svg') {
    td.replaceChildren(createSvgCell(record, col));
  } else {
    td.textContent = deriveExpensiveValue(record, col);
  }
  cellCache.set(td, { record, col, input });
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
