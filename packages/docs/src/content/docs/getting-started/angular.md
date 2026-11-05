---
title: Angular
description: Use the drawing tools in an Angular chart with KeystoneDrawingToolsService, with signals or observables.
---

`keystone-financial-tools-angular` has a service and a text editor component. The service keeps the state of the tools in signals and observables and has no drawing logic of its own. It works with zone.js and zoneless.

## Install

The packages are published to npm by hand at release time. Until the first release they are private: inside this repository, add `"keystone-financial-tools-angular": "workspace:*"` to your package.

## Use the service

Provide `KeystoneDrawingToolsService` on the component of the chart, so every chart has its own service and it is destroyed with the chart. Call `attach` with a chart that implements the [host contract](/guides/host/).

```ts
import { AfterViewInit, Component, inject, input } from '@angular/core';
import { KeystoneDrawingToolsService, KeystoneTextEditorComponent, type DrawingHost } from 'keystone-financial-tools-angular';

@Component({
  selector: 'app-chart',
  imports: [KeystoneTextEditorComponent],
  providers: [KeystoneDrawingToolsService],
  template: `
    <button (click)="tools.activate('trend-line')">Trend line</button>
    <button [disabled]="!tools.state().canUndo" (click)="tools.undo()">Undo</button>
    <span>{{ tools.drawings().length }} drawings</span>
    <keystone-text-editor [session]="tools.textEdit()" />
  `,
})
export class ChartComponent implements AfterViewInit {
  readonly host = input.required<DrawingHost>();
  readonly tools = inject(KeystoneDrawingToolsService);

  ngAfterViewInit(): void {
    this.tools.attach(this.host(), { magnet: 'weak' });
  }
}
```

## What you get

- Signals `tools` (the controller, `null` until `attach`), `state`, `toolbar`, `drawings` and `textEdit`, and the observables `tools$`, `state$`, `toolbar$`, `drawings$` and `textEdit$`. The observables emit the current value on subscribe and complete when the service is destroyed.
- The actions `activate`, `deactivate`, `select`, `clearSelection`, `remove`, `undo`, `redo`, `setMagnet`, `setTheme` and `setOptions`. Before `attach` the state is idle and the actions do nothing.
- `attach(host, options?)` destroys the controller it had, so one service can move to another host. `detach()` releases the host and keeps the drawings. The service also detaches when it is destroyed.
- `options` are those of `createDrawingTools` and are read when `attach` runs; change them later with `setTheme`, `setMagnet` and `setOptions`.

## Text notes

`KeystoneTextEditorComponent` is a textarea at the position of the note being edited. Place it inside the element that holds the chart. Ctrl or Cmd with Enter confirms, Escape cancels and leaving the textarea confirms. Pass `editText` in the options to use your own editor, or `editText: false` for none. A host that has its own `editText` always wins.

## Build a toolbar

`toolbar` has one entry for each tool with its `active` and `enabled` flags and its shortcut. It is the same array until an entry changes, and every entry is disabled until `attach`. `toolbar$` emits only when an entry changes.

Put it in the template of the component that provides the service, next to the chart:

```html
<div role="toolbar" aria-label="Drawing tools">
  @for (tool of tools.toolbar(); track tool.id) {
    <button [disabled]="!tool.enabled" [attr.aria-pressed]="tool.active" [title]="tool.shortcut ?? ''" (click)="tools.activate(tool.id)">{{ tool.id }}</button>
  }
</div>
```

Alt with T, H, R, F or N chooses a tool, and Ctrl or Cmd with Z undoes. The [toolbar guide](/guides/toolbar/) has the catalog and the `shortcuts` option.

## Try the demo

The playground in `apps/playground` has this page as a working chart with two panes, zoom and scroll, a toolbar built from `toolbar()`, undo and redo, the magnet and drawings that survive a reload. Run `pnpm --filter keystone-financial-tools-playground dev` and open `http://localhost:4173/angular.html`; the code is in `apps/playground/src/angular-page.ts`. The same page exists for [TypeScript](/getting-started/typescript/), [Vue](/getting-started/vue/) and [React](/getting-started/react/).

## Next

- [Implement a host](/guides/host/) for your chart.
- [Save and load drawings](/guides/persistence/) with a repository.
- [Build a toolbar](/guides/toolbar/) from the tool catalog.
- The [keyboard reference](/guides/keyboard/) lists every key.
- Each tool has a page, for example the [trend line](/tools/trend-line/).
