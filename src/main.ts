import 'zone.js';

import {
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
import { GridSettings, HotCellRendererComponent, HotTableComponent } from '@handsontable/angular-wrapper';
import Handsontable from 'handsontable';
import { registerAllModules } from 'handsontable/registry';
import type { BaseRenderer } from 'handsontable/renderers';

registerAllModules();

const ROWS = 5_000;
const COLUMNS = 40;
const SCROLL_ROWS = 1_200;
const SCROLL_STEP = 8;

type RendererMode = 'snapshot' | 'official';

interface RunMetrics {
  elapsedMs: number;
  rendererCalls: number;
  componentCreations: number;
  longTasks: number;
  longTaskTimeMs: number;
  p95FrameMs: number;
  framesOver50Ms: number;
}

const counters = { rendererCalls: 0, componentCreations: 0 };

@Component({
  selector: 'app-snapshot-cell',
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
class SnapshotCellComponent {
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
  imports: [HotTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Handsontable Angular renderer comparison</h1>
      <p class="intro">Identical SVG-rich cells, dataset, viewport, and scroll path.</p>

      <nav aria-label="Renderer mode">
        <a href="?mode=snapshot" [class.selected]="mode === 'snapshot'">HTML snapshot renderer</a>
        <a href="?mode=official" [class.selected]="mode === 'official'">Official Angular component renderer</a>
      </nav>

      <section class="toolbar">
        <div><strong>Mode:</strong> {{ modeLabel }}</div>
        <button type="button" (click)="runBenchmark()" [disabled]="running()">
          {{ running() ? progress() : 'Run identical smooth scroll' }}
        </button>
        <button class="secondary" type="button" (click)="resetMetrics()" [disabled]="running()">Reset metrics</button>
      </section>

      <hot-table [settings]="settings" />

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
class AppComponent implements OnDestroy {
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly zone = inject(NgZone);
  private readonly componentCache = new Map<string, ComponentRef<SnapshotCellComponent>>();
  private tdState = new WeakMap<HTMLTableCellElement, string>();
  private readonly hotTable = viewChild.required(HotTableComponent);

  readonly mode: RendererMode = new URLSearchParams(location.search).get('mode') === 'official'
    ? 'official'
    : 'snapshot';
  readonly modeLabel = this.mode === 'official'
    ? 'Official Angular component renderer'
    : 'HTML snapshot renderer';

  readonly running = signal(false);
  readonly progress = signal('Running…');
  readonly metrics = signal<RunMetrics>(this.emptyMetrics());

  private readonly snapshotRenderer: BaseRenderer = (
    instance,
    td,
    row,
    column,
    prop,
    value,
    cellProperties,
  ) => {
    const text = String(value ?? '');
    const state = `${row}:${column}:${text}`;
    if (this.tdState.get(td) === state) {
      return;
    }
    Handsontable.renderers.TextRenderer(instance, td, row, column, prop, '', cellProperties);

    let componentRef = this.componentCache.get(text);
    if (!componentRef) {
      componentRef = createComponent(SnapshotCellComponent, {
        environmentInjector: this.environmentInjector,
      });
      componentRef.setInput('value', text);
      componentRef.changeDetectorRef.detectChanges();
      this.componentCache.set(text, componentRef);
      counters.componentCreations += 1;
    }

    td.innerHTML = componentRef.location.nativeElement.innerHTML;
    this.tdState.set(td, state);
  };

  readonly settings: GridSettings = {
    data: Array.from({ length: ROWS }, (_, row) =>
      Array.from({ length: COLUMNS }, (_, column) => `Item ${row + 1}.${column + 1}`),
    ),
    columns: Array.from({ length: COLUMNS }, () => ({
      renderer: this.mode === 'official' ? OfficialCellComponent : this.snapshotRenderer,
    })),
    colHeaders: true,
    rowHeaders: true,
    width: '100%',
    height: 540,
    colWidths: 180,
    rowHeights: 34,
    autoRowSize: false,
    autoColumnSize: false,
    afterRenderer: () => {
      counters.rendererCalls += 1;
    },
    licenseKey: 'non-commercial-and-evaluation',
  };

  async runBenchmark(): Promise<void> {
    const hot = this.hotTable().hotInstance;
    if (!hot || this.running()) {
      return;
    }

    this.running.set(true);
    this.progress.set('Preparing…');
    for (const componentRef of this.componentCache.values()) {
      componentRef.destroy();
    }
    this.componentCache.clear();
    this.tdState = new WeakMap<HTMLTableCellElement, string>();
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
      const path: number[] = [];
      for (let row = 0; row <= SCROLL_ROWS; row += SCROLL_STEP) path.push(row);
      for (let row = SCROLL_ROWS - SCROLL_STEP; row >= 0; row -= SCROLL_STEP) path.push(row);

      for (let index = 0; index < path.length; index += 1) {
        scrollContainer.scrollTop = path[index] * 28;
        frameDurations.push(await this.nextFrameDuration());
        if (index % 10 === 0) {
          this.progress.set(`Running ${index + 1}/${path.length}…`);
          this.publishMetrics(started, frameDurations, longTaskDurations);
        }
      }
    });

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

  private emptyMetrics(): RunMetrics {
    return { elapsedMs: 0, rendererCalls: 0, componentCreations: 0, longTasks: 0, longTaskTimeMs: 0, p95FrameMs: 0, framesOver50Ms: 0 };
  }

  ngOnDestroy(): void {
    for (const componentRef of this.componentCache.values()) {
      componentRef.destroy();
    }
  }
}

bootstrapApplication(AppComponent).catch(error => console.error(error));
