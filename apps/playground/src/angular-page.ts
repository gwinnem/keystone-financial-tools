// The Angular page, compiled in the browser (JIT): the packages are used from source, which has no Angular build step, so the compiler comes along.
import '@angular/compiler';
import { Component, ElementRef, InjectionToken, ViewChild, computed, inject, type AfterViewInit, type OnDestroy } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { KeystoneDrawingToolsService, KeystoneLiveRegionComponent, KeystoneTextEditorComponent } from 'keystone-financial-tools-angular';
import type { DrawingStore, ToolbarEntry } from 'keystone-financial-tools-angular';
import { ACTION_LABELS, CHART_LABEL, createSurface, openStore, type Surface } from './demo';
import { nextMagnet, statusText } from './toolbar';

/** What the page component needs from outside: the chart surface and the store loaded from localStorage. */
interface Demo {
  readonly surface: Surface;
  readonly store: DrawingStore;
}

const DEMO = new InjectionToken<Demo>('demo');

@Component({
  selector: 'app-root',
  imports: [KeystoneTextEditorComponent, KeystoneLiveRegionComponent],
  providers: [KeystoneDrawingToolsService],
  template: `
    <div id="toolbar" role="toolbar" [attr.aria-label]="tools.messages()['toolbar.label']">
      @for (entry of tools.toolbar(); track entry.id) {
        <button type="button" [id]="'tool-' + entry.id" [disabled]="!entry.enabled" [attr.aria-pressed]="entry.active" [attr.title]="entry.shortcut" (click)="toggle(entry)">
          {{ tools.messages()[entry.labelKey] }}
        </button>
      }
      <button type="button" id="undo" [disabled]="!tools.state().canUndo" (click)="tools.undo()">{{ labels.undo }}</button>
      <button type="button" id="redo" [disabled]="!tools.state().canRedo" (click)="tools.redo()">{{ labels.redo }}</button>
      <button type="button" id="delete" [disabled]="tools.state().selection.length === 0" (click)="tools.remove(tools.state().selection)">{{ labels.delete }}</button>
      <button type="button" id="magnet" [attr.aria-pressed]="tools.state().magnet !== 'off'" (click)="tools.setMagnet(nextMagnet(tools.state().magnet))">{{ labels.magnet }}</button>
    </div>
    <div id="chart" #chart tabindex="0" role="application" [attr.aria-label]="chartLabel">
      <keystone-text-editor [session]="tools.textEdit()" [label]="tools.messages()['editor.note']" />
    </div>
    <output id="status" aria-live="off">{{ status() }}</output>
    <keystone-live-region id="announcer" [message]="tools.announcement()" />
  `,
})
class AppComponent implements AfterViewInit, OnDestroy {
  readonly tools = inject(KeystoneDrawingToolsService);
  private readonly demo = inject(DEMO);
  readonly labels = ACTION_LABELS;
  readonly chartLabel = CHART_LABEL;
  readonly nextMagnet = nextMagnet;
  readonly status = computed(() => statusText(this.tools.state(), this.tools.drawings().length));
  @ViewChild('chart', { static: true }) private chart!: ElementRef<HTMLElement>;
  private unmount: (() => void) | undefined;

  ngAfterViewInit(): void {
    this.tools.attach(this.demo.surface.host, { store: this.demo.store, magnet: 'off' });
    this.unmount = this.demo.surface.mount(this.chart.nativeElement, () => this.tools.tools()?.getScene() ?? []);
  }

  ngOnDestroy(): void {
    this.unmount?.();
  }

  toggle(entry: ToolbarEntry): void {
    if (entry.active) this.tools.deactivate();
    else this.tools.activate(entry.id);
  }
}

async function start(): Promise<void> {
  const surface = createSurface();
  const store = await openStore();
  await bootstrapApplication(AppComponent, { providers: [{ provide: DEMO, useValue: { surface, store } satisfies Demo }] });
}

void start();
