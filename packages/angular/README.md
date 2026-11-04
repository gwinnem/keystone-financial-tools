# keystone-financial-tools-angular

Angular adapter for the Keystone drawing tools. It only shows what `keystone-financial-tools-core`
decides (the controller and its state); it has no drawing logic of its own. It works with zone.js and
without it, as everything it offers is a signal (or an observable that carries the same value).

## `KeystoneDrawingToolsService`

Creates the drawing tools for one chart and keeps their state, the drawings and the open note editor
in signals and observables. Provide it on the component that holds the chart, so every chart has its
own and it is destroyed with the chart (`DestroyRef`).

```ts
import { Component, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';
import { KeystoneDrawingToolsService, KeystoneTextEditorComponent } from 'keystone-financial-tools-angular';

@Component({
  selector: 'app-chart',
  imports: [KeystoneTextEditorComponent],
  providers: [KeystoneDrawingToolsService],
  template: `
    <button (click)="tools.activate('trend-line')">Trend line</button>
    <button [disabled]="!tools.state().canUndo" (click)="tools.undo()">Undo</button>
    <span>{{ tools.drawings().length }} drawings</span>
    <div class="chart" style="position: relative">
      <canvas #canvas></canvas>
      <keystone-text-editor [session]="tools.textEdit()" />
    </div>
  `,
})
export class ChartComponent {
  readonly tools = inject(KeystoneDrawingToolsService);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    afterNextRender(() => this.tools.attach(createHostFor(this.canvas().nativeElement), { magnet: 'weak' }));
  }
}
```

| Member | Purpose |
|---|---|
| `attach(host, options?)` | Creates the controller for `host`; the one attached before is destroyed first |
| `detach()` | Destroys the controller and removes its listeners from the host; the store and its drawings stay |
| `tools`, `tools$` | The controller (`getScene()`, `hitTest()`, `on()`), or null until a host is attached |
| `state`, `state$` | The state of the tools, a new object whenever a value in it changes; idle until a host is attached |
| `toolbar`, `toolbar$` | One entry for each tool (`id`, `labelKey`, `group`, `icon`, `shortcut`, `tier`, `active`, `enabled`); the same array until an entry changes (`toolbar$` emits only then), disabled until a host is attached |
| `drawings`, `drawings$` | The drawings of the store |
| `textEdit`, `textEdit$` | The note editor that is open, or null |
| `store` | The store the tools draw into: the one in the options, otherwise one that belongs to the service |
| `activate`, `deactivate`, `select`, `clearSelection`, `remove`, `undo`, `redo`, `setMagnet`, `setTheme`, `setOptions` | The controller's actions; they do nothing (and `undo` and `redo` give false) until a host is attached |

- `options` are those of `createDrawingTools`. They are read when `attach` creates the controller;
  change them later with `setMagnet`, `setTheme` and `setOptions`.
- `editText` left out gives the default text editor (show it with `KeystoneTextEditorComponent`), a
  function replaces it and `false` means no editor. A host that has its own `editText` always wins.
- Every observable emits the current value on subscribe and completes when the service is destroyed.
- A toolbar: render a button for each entry of `toolbar()` and call `activate(tool.id)`. Alt with T, H, R,
  F or N chooses a tool (change them with the `shortcuts` option, `null` turns one off), and Ctrl or Cmd
  with Z undoes. `enabled` follows the `tools` option. `TOOL_CATALOG` and the types `ToolbarEntry`,
  `ToolCatalogEntry`, `ToolGroup`, `ToolTier` and `ShortcutOptions` are exported from this package.

  ```html
  @for (tool of tools.toolbar(); track tool.id) {
    <button [disabled]="!tool.enabled" [attr.aria-pressed]="tool.active" [title]="tool.shortcut ?? ''" (click)="tools.activate(tool.id)">{{ tool.id }}</button>
  }
  ```

## `KeystoneTextEditorComponent`

`<keystone-text-editor [session]="tools.textEdit()" />` shows a textarea at the position of the note
being edited. Place it inside the chart's positioned element. Ctrl or Cmd with Enter confirms, Escape
cancels and leaving the textarea confirms. Keys and pointer events stop at the textarea, so they do
not reach the chart. The text is never read as HTML. It has the accessible name `Note text`; set
`label` to change it. Focus moves into the textarea and goes back when it closes, unless the user has
moved it to something else. To use your own editor, leave the component out and show `textEdit()`
yourself, calling `confirm` or `cancel` on the session.

## `KeystoneDrawingService`

Provided in root; starts with an empty `DrawingStore`.

| Member | Purpose |
|---|---|
| `store` | The attached store; change drawings through it |
| `drawings$` | The current drawings; emits the list on subscribe and on every change |
| `attach(store)` | Follows another store (for example one loaded from saved drawings) |
