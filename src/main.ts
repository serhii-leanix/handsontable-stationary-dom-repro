import 'zone.js';

import {
  ApplicationRef,
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  EnvironmentInjector,
  NgZone,
  OnDestroy,
  createComponent,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { GridSettings, HotCellRendererComponent, HotTableComponent, HotTableModule } from '@handsontable/angular-wrapper';
import Handsontable from 'handsontable';
import { registerAllModules } from 'handsontable/registry';
import type { BaseRenderer } from 'handsontable/renderers';

registerAllModules();

const params = new URLSearchParams(location.search);
const ROWS = Number(params.get('rows') ?? 114);
const COLUMNS = Number(params.get('cols') ?? 128);
const TABLE_WIDTH = Number(params.get('tableWidth') ?? 3_054);
const TABLE_HEIGHT = Number(params.get('tableHeight') ?? 1_946);
const COLUMN_WIDTH = Number(params.get('columnWidth') ?? 162);
const ROW_HEIGHT = Number(params.get('rowHeight') ?? 36);
const SCROLL_DISTANCE = 1_000;
const SCROLL_DURATION = 2_500;

type RendererMode = 'snapshot' | 'recommended' | 'official';

interface RunMetrics {
  elapsedMs: number;
  rendererCalls: number;
  componentCreations: number;
  longTasks: number;
  longTaskTimeMs: number;
  p95FrameMs: number;
  framesOver50Ms: number;
}

interface CachedCell {
  input: string;
  componentRef: ComponentRef<CachedCellComponent>;
  container: HTMLElement;
}

const counters = { rendererCalls: 0, componentCreations: 0 };

@Component({
  selector: 'app-cached-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="demo-cell">
      <svg class="demo-cell__icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" />
        <path d="M5 8.2 7.1 10.3 11.5 5.9" />
      </svg>
      <span class="demo-cell__label">{{ value() }}</span>
      <span class="demo-cell__status">active</span>
    </span>
  `,
})
class CachedCellComponent {
  readonly value = input.required<string>();
}

@Component({
  selector: 'app-official-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="demo-cell">
      <svg class="demo-cell__icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" />
        <path d="M5 8.2 7.1 10.3 11.5 5.9" />
      </svg>
      <span class="demo-cell__label">{{ value }}</span>
      <span class="demo-cell__status">active</span>
    </span>
  `,
})
class OfficialCellComponent extends HotCellRendererComponent {
  constructor() {
    super();
    counters.componentCreations += 1;
  }
}

@Component({
  selector: 'app-root',
  imports: [HotTableModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Handsontable {{ hotVersion }} Angular renderer</h1>
      <p class="intro">Identical SVG-rich cells, dataset, viewport, and scroll path.</p>

      <nav aria-label="Renderer mode">
        <a href="?mode=snapshot" [class.selected]="mode === 'snapshot'">Legacy HTML snapshot renderer</a>
        <a href="?mode=recommended" [class.selected]="mode === 'recommended'">Recommended cached component renderer</a>
        <a href="?mode=official" [class.selected]="mode === 'official'">Official Angular component renderer</a>
      </nav>

      <section class="toolbar">
        <div><strong>Mode:</strong> {{ modeLabel }}</div>
        <button type="button" (click)="runBenchmark()" [disabled]="running()">
          {{ running() ? progress() : 'Run identical smooth scroll' }}
        </button>
        <button class="secondary" type="button" (click)="resetMetrics()" [disabled]="running()">Reset metrics</button>
      </section>

      <hot-table id="hot" [data]="data" [settings]="settings" />

      <section class="metrics" aria-live="polite">
        <div><span>Elapsed</span><strong>{{ metrics().elapsedMs.toFixed(1) }} ms</strong></div>
        <div><span>Renderer calls</span><strong>{{ metrics().rendererCalls }}</strong></div>
        <div><span>Angular components created</span><strong>{{ metrics().componentCreations }}</strong></div>
        <div><span>p95 frame</span><strong>{{ metrics().p95FrameMs.toFixed(1) }} ms</strong></div>
        <div><span>Frames &gt; 50 ms</span><strong>{{ metrics().framesOver50Ms }}</strong></div>
        <div><span>Long tasks</span><strong>{{ metrics().longTasks }} / {{ metrics().longTaskTimeMs.toFixed(1) }} ms</strong></div>
      </section>
    </main>
  `,
})
class AppComponent implements AfterViewInit, OnDestroy {
  private readonly applicationRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly zone = inject(NgZone);
  private readonly snapshotComponents = new Map<string, ComponentRef<CachedCellComponent>>();
  private snapshotTdState = new WeakMap<HTMLTableCellElement, string>();
  private readonly componentCaches = new Map<HTMLTableElement, Map<string, CachedCell>>();
  private readonly hotTable = viewChild.required(HotTableComponent);

  readonly mode: RendererMode = params.get('mode') === 'snapshot'
    ? 'snapshot'
    : params.get('mode') === 'recommended'
      ? 'recommended'
      : 'official';
  readonly modeLabel = this.mode === 'snapshot'
    ? 'Legacy HTML snapshot renderer'
    : this.mode === 'recommended'
      ? 'Recommended cached component renderer'
      : 'Official Angular component renderer';
  readonly hotVersion = Handsontable.version;

  readonly running = signal(false);
  readonly progress = signal('Running…');
  readonly metrics = signal<RunMetrics>(this.emptyMetrics());
  readonly data = Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: COLUMNS }, (_, column) => `Item ${row + 1}.${column + 1}`),
  );

  private readonly snapshotRenderer: BaseRenderer = (
    instance,
    td,
    row,
    column,
    prop,
    value,
    cellProperties,
  ) => {
    const input = String(value ?? '');
    const state = `${row}:${column}:${input}`;
    if (this.snapshotTdState.get(td) === state) return;

    Handsontable.renderers.TextRenderer(instance, td, row, column, prop, '', cellProperties);
    let componentRef = this.snapshotComponents.get(input);
    if (!componentRef) {
      componentRef = createComponent(CachedCellComponent, {
        environmentInjector: this.environmentInjector,
      });
      componentRef.setInput('value', input);
      componentRef.changeDetectorRef.detectChanges();
      this.snapshotComponents.set(input, componentRef);
      counters.componentCreations += 1;
    }

    td.innerHTML = componentRef.location.nativeElement.innerHTML;
    this.snapshotTdState.set(td, state);
  };

  private readonly cachedComponentRenderer: BaseRenderer = (
    instance,
    td,
    row,
    column,
    prop,
    value,
    cellProperties,
  ) => {
    Handsontable.renderers.BaseRenderer(instance, td, row, column, prop, value, cellProperties);
    const table = td.closest('table');
    if (!table) return;

    let tableCache = this.componentCaches.get(table);
    if (!tableCache) {
      tableCache = new Map();
      this.componentCaches.set(table, tableCache);
    }

    const key = `${instance.toPhysicalRow(row)}:${instance.toPhysicalColumn(column)}`;
    const input = String(value ?? '');
    let cached = tableCache.get(key);
    if (!cached) {
      const componentRef = createComponent(CachedCellComponent, {
        environmentInjector: this.environmentInjector,
      });
      componentRef.setInput('value', input);
      componentRef.changeDetectorRef.detectChanges();
      this.applicationRef.attachView(componentRef.hostView);
      cached = {
        input,
        componentRef,
        container: componentRef.location.nativeElement as HTMLElement,
      };
      tableCache.set(key, cached);
      counters.componentCreations += 1;
    }
    if (cached.input !== input) {
      cached.input = input;
      cached.componentRef.setInput('value', input);
      cached.componentRef.changeDetectorRef.detectChanges();
    }
    if (cached.container.parentNode !== td) {
      td.replaceChildren(cached.container);
    }
  };

  readonly settings: GridSettings = {
    columns: Array.from({ length: COLUMNS }, () => ({
      renderer: this.mode === 'official'
        ? OfficialCellComponent
        : this.mode === 'recommended'
          ? this.cachedComponentRenderer
          : this.snapshotRenderer,
    })),
    colHeaders: true,
    rowHeaders: true,
    width: TABLE_WIDTH,
    height: TABLE_HEIGHT,
    colWidths: COLUMN_WIDTH,
    rowHeights: ROW_HEIGHT,
    autoRowSize: false,
    autoColumnSize: false,
    viewportRowRenderingOffset: 10,
    viewportColumnRenderingOffset: 2,
    afterRenderer: () => {
      counters.rendererCalls += 1;
    },
    afterViewRender: () => {
      if (this.mode === 'recommended') this.sweepDetachedComponents();
    },
    licenseKey: 'non-commercial-and-evaluation',
  };

  ngAfterViewInit(): void {
    (globalThis as typeof globalThis & { __hot?: Handsontable | null }).__hot = this.hotTable().hotInstance;
  }

  async runBenchmark(): Promise<void> {
    const hot = this.hotTable().hotInstance;
    if (!hot || this.running()) {
      return;
    }

    this.running.set(true);
    this.progress.set('Preparing…');
    this.destroySnapshotComponents();
    this.destroyCachedComponents();
    const scrollContainer = hot.rootElement.querySelector<HTMLElement>('.ht_master .wtHolder');
    if (!scrollContainer) {
      this.running.set(false);
      return;
    }
    scrollContainer.scrollTop = 0;
    hot.render();
    await this.nextFrame();
    await this.nextFrame();
    counters.rendererCalls = 0;
    counters.componentCreations = 0;

    const longTaskDurations: number[] = [];
    const observer = typeof PerformanceObserver === 'undefined'
      ? null
      : new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            longTaskDurations.push(entry.duration);
          }
        });
    try {
      observer?.observe({ type: 'longtask', buffered: false });
    } catch {
      // Long Task API is not available in every browser.
    }

    const frameDurations: number[] = [];
    const started = performance.now();

    await this.zone.runOutsideAngular(async () => {
      let previousFrame = started;
      while (true) {
        const now = await this.nextFrameTimestamp();
        frameDurations.push(now - previousFrame);
        previousFrame = now;
        const progress = Math.min(1, (now - started) / SCROLL_DURATION);
        scrollContainer.scrollTop = SCROLL_DISTANCE * progress;
        if (progress >= 1) break;
      }
    });
    await new Promise(resolve => setTimeout(resolve, 250));

    observer?.disconnect();
    this.publishMetrics(started, frameDurations, longTaskDurations);
    this.running.set(false);
    this.progress.set('Running…');
  }

  resetMetrics(): void {
    counters.rendererCalls = 0;
    counters.componentCreations = 0;
    this.metrics.set(this.emptyMetrics());
  }

  private publishMetrics(started: number, frames: number[], longTasks: number[]): void {
    const sortedFrames = [...frames].sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(sortedFrames.length * 0.95) - 1);
    this.metrics.set({
      elapsedMs: performance.now() - started,
      rendererCalls: counters.rendererCalls,
      componentCreations: counters.componentCreations,
      longTasks: longTasks.length,
      longTaskTimeMs: longTasks.reduce((total, duration) => total + duration, 0),
      p95FrameMs: sortedFrames[p95Index] ?? 0,
      framesOver50Ms: frames.filter(duration => duration > 50).length,
    });
  }

  private nextFrame(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  private nextFrameDuration(): Promise<number> {
    const started = performance.now();
    return new Promise(resolve => requestAnimationFrame(() => resolve(performance.now() - started)));
  }

  private nextFrameTimestamp(): Promise<number> {
    return new Promise(resolve => requestAnimationFrame(resolve));
  }

  private emptyMetrics(): RunMetrics {
    return { elapsedMs: 0, rendererCalls: 0, componentCreations: 0, longTasks: 0, longTaskTimeMs: 0, p95FrameMs: 0, framesOver50Ms: 0 };
  }

  private sweepDetachedComponents(): void {
    for (const [table, tableCache] of this.componentCaches) {
      for (const [key, cached] of tableCache) {
        if (!cached.container.isConnected) {
          this.destroyComponent(cached.componentRef);
          tableCache.delete(key);
        }
      }
      if (tableCache.size === 0) this.componentCaches.delete(table);
    }
  }

  private destroyCachedComponents(): void {
    for (const tableCache of this.componentCaches.values()) {
      for (const cached of tableCache.values()) this.destroyComponent(cached.componentRef);
    }
    this.componentCaches.clear();
  }

  private destroySnapshotComponents(): void {
    for (const componentRef of this.snapshotComponents.values()) componentRef.destroy();
    this.snapshotComponents.clear();
    this.snapshotTdState = new WeakMap<HTMLTableCellElement, string>();
  }

  private destroyComponent(componentRef: ComponentRef<CachedCellComponent>): void {
    if (componentRef.hostView.destroyed) return;
    this.applicationRef.detachView(componentRef.hostView);
    componentRef.destroy();
  }

  ngOnDestroy(): void {
    this.destroySnapshotComponents();
    this.destroyCachedComponents();
  }
}

bootstrapApplication(AppComponent).catch(error => console.error(error));
