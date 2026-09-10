import './style.css';

async function main() {
const params = new URLSearchParams(location.search);
const version = params.get('version') === '18.1.0' ? '18.1.0' : '16.2.0';
const scenario = params.get('scenario') === 'headers' ? 'headers' : 'rebuild';
const nestedHeadersMode = ['off', 'groups-of-3', 'trailing-group'].includes(params.get('nestedHeaders'))
  ? params.get('nestedHeaders')
  : 'off';
const versionSelect = document.querySelector('#version');
const scenarioSelect = document.querySelector('#scenario');
const nestedHeadersSelect = document.querySelector('#nested-headers');
versionSelect.value = version;
scenarioSelect.value = scenario;
nestedHeadersSelect.value = nestedHeadersMode;
versionSelect.addEventListener('change', () => {
  params.set('version', versionSelect.value);
  location.search = params.toString();
});
scenarioSelect.addEventListener('change', () => {
  params.set('scenario', scenarioSelect.value);
  location.search = params.toString();
});
nestedHeadersSelect.addEventListener('change', () => {
  params.set('nestedHeaders', nestedHeadersSelect.value);
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
  containerMoves: 0,
  maxRenderedColumns: 0,
  maxRenderedCells: 0,
};
let runStartedAt = 0;
let recordCache = new WeakMap();

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
  const input = record.cells[col];

  let rowCache = recordCache.get(record);
  if (!rowCache) {
    rowCache = new Map();
    recordCache.set(record, rowCache);
  }

  let cached = rowCache.get(col);
  if (!cached || cached.input !== input) {
    cached = { input, container: createSvgCell(record, col) };
    rowCache.set(col, cached);
    metrics.cacheMisses += 1;
  }

  if (td.childNodes.length !== 1 || td.firstChild !== cached.container) {
    td.replaceChildren(cached.container);
    metrics.containerMoves += 1;
  }
  return td;
}

function createNestedHeaders(mode) {
  if (mode === 'off') return false;
  const leafHeaders = Array.from({ length: COLS }, (_, col) => `Column ${col + 1}`);
  if (mode === 'trailing-group') {
    return [
      [...Array.from({ length: COLS - 3 }, (_, col) => `Column ${col + 1}`), { label: 'Trailing group', colspan: 3 }],
      leafHeaders,
    ];
  }

  const groups = [];
  for (let start = 0; start < COLS; start += 3) {
    const size = Math.min(3, COLS - start);
    groups.push(size === 1 ? `Column ${start + 1}` : { label: `Group ${Math.floor(start / 3) + 1}`, colspan: size });
  }
  return [groups, leafHeaders];
}

let hot;
hot = new Handsontable(document.querySelector('#hot'), {
  data,
  width: '100%',
  height: 540,
  rowHeaders: true,
  colHeaders: true,
  columns: Array.from({ length: COLS }, (_, col) => ({ data: `cells.${col}` })),
  colWidths: 130,
  rowHeights: 28,
  viewportRowRenderingOffset: 10,
  viewportColumnRenderingOffset: 2,
  nestedHeaders: createNestedHeaders(nestedHeadersMode),
  licenseKey: 'non-commercial-and-evaluation',
  cells: () => ({ renderer: expensiveRenderer }),
  afterRender: updateDomStats,
});

const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    metrics.longTasks += 1;
    metrics.longTaskTime += entry.duration;
  }
  updateMetrics();
});
observer.observe({ type: 'longtask', buffered: true });

document.querySelector('#reset').addEventListener('click', resetMetrics);
document.querySelector('#run').addEventListener('click', runSmoothScroll);

function resetMetrics() {
  metrics.rendererCalls = 0;
  metrics.cacheMisses = 0;
  metrics.longTasks = 0;
  metrics.longTaskTime = 0;
  metrics.frameTimes = [];
  metrics.containerMoves = 0;
  metrics.maxRenderedColumns = 0;
  metrics.maxRenderedCells = 0;
  recordCache = new WeakMap();
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

  if (scenario === 'rebuild') {
    observer.disconnect();
    updateMetrics(performance.now() - runStartedAt);
    button.disabled = false;
    return;
  }

  for (let column = 0; column < COLS; column += 1) {
    scrollContainer.scrollLeft = column * 130;
    metrics.frameTimes.push(await nextFrameDuration());
  }
  for (let row = 0; row <= 1_200; row += 8) {
    scrollContainer.scrollTop = row * 28;
    metrics.frameTimes.push(await nextFrameDuration());
  }
  for (let row = 1_200; row >= 0; row -= 8) {
    scrollContainer.scrollTop = row * 28;
    metrics.frameTimes.push(await nextFrameDuration());
  }
  for (let column = COLS - 1; column >= 0; column -= 1) {
    scrollContainer.scrollLeft = column * 130;
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
  document.querySelector('#container-moves').textContent = metrics.containerMoves.toLocaleString();
  document.querySelector('#long-tasks').textContent = metrics.longTasks.toLocaleString();
  document.querySelector('#long-task-time').textContent = `${Math.round(metrics.longTaskTime).toLocaleString()} ms`;
  document.querySelector('#p95-frame').textContent = `${p95Frame.toFixed(1)} ms`;
  document.querySelector('#slow-frames').textContent = metrics.frameTimes.filter((duration) => duration > 50).length.toLocaleString();
  document.querySelector('#elapsed').textContent = `${Math.round(elapsed).toLocaleString()} ms`;
  updateDomStats();
}

function updateDomStats() {
  const renderedColumns = hot?.countRenderedCols() ?? 0;
  const renderedCells = renderedColumns * (hot?.countRenderedRows() ?? 0);
  metrics.maxRenderedColumns = Math.max(metrics.maxRenderedColumns, renderedColumns);
  metrics.maxRenderedCells = Math.max(metrics.maxRenderedCells, renderedCells);
  document.querySelector('#rendered-columns').textContent = metrics.maxRenderedColumns.toLocaleString();
  document.querySelector('#rendered-cells').textContent = metrics.maxRenderedCells.toLocaleString();
}

updateMetrics();
}

main();
