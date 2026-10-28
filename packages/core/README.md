# keystone-financial-tools-core

Framework-neutral core of the Keystone drawing tools: the drawing model, validation, the drawing
store, the saved document format and the `DrawingHost` contract a chart implements.

## API

| Export | Purpose |
|---|---|
| `Anchor`, `Drawing`, `DrawingKind`, `DrawingStyle`, `LineStyle`, `KindOptions`, `FibonacciLevel`, `DrawingPatch`, `JsonValue` | Drawing model (anchors in time, price and y-axis id; style, kind options, `locked`, `hidden`, `zIndex`, `meta`) |
| `ANCHOR_COUNT`, `DRAWING_KINDS`, `isDrawingKind` | The drawing kinds and their anchor counts |
| `isValidAnchor`, `validateDrawing` | Validation; `validateDrawing` returns a list of `DrawingIssue` |
| `validateStyle`, `LINE_STYLES`, `STYLE_LIMITS` | Style validation and its allowed values |
| `DrawingTheme`, `LIGHT_THEME`, `DARK_THEME`, `resolveStyle`, `ResolvedStyle`, `StateStyle`, `HandleStyle` | Theme defaults applied at scene time |
| `validateOptions`, `defaultOptions`, `resolveOptions`, `KIND_OPTION_KEYS`, `MAX_LEVELS`, `MAX_SEQUENCE` | Kind options |
| `DEFAULT_RETRACEMENT_LEVELS`, `DEFAULT_ARC_FAN_LEVELS`, `DEFAULT_TIME_ZONE_SEQUENCE` | Fibonacci defaults |
| `DrawingError` | Thrown for invalid drawings or documents; `issues` says what is wrong |
| `createId`, `createIdGenerator`, `IdSource` | Collision-safe drawing ids (`crypto.randomUUID`, or time + counter + random suffix) |
| `DrawingStore` | `add`, `update`, `remove`, `clear`, `get`, `list`, `subscribe`, `toJSON`, `fromJSON` |
| `DOCUMENT_VERSION`, `DrawingDocument` | The saved document format (version 1) |
| `DrawingHost`, `HostPointerEvent`, `Ohlc` | What a chart supplies for the drawing tools |

Every store change replaces the drawing list (the old list is never mutated) and notifies the
listeners.

## Drawing fields

| Field | Rule | Default |
|---|---|---|
| `id` | Non-empty string, unique within a store; use `createId()` | |
| `kind`, `anchors` | Anchor count per kind (`ANCHOR_COUNT`); all anchors on one `yAxisId` | |
| `text` | String | |
| `style` | See [Style and theme](#style-and-theme) | theme |
| `options` | See [Kind options](#kind-options) | `defaultOptions(kind)` |
| `locked` | Boolean: selectable, but interaction cannot move, resize, edit or delete it | `false` |
| `hidden` | Boolean: left out of the scene and hit-testing | `false` |
| `zIndex` | Finite integer; higher paints on top, ties keep insertion order | `0` |
| `meta` | Plain object of JSON-safe values (no functions, `undefined`, cycles, `NaN`/`Infinity`, dates); round-trips untouched | none |

## Style and theme

| Field | Rule |
|---|---|
| `color`, `fillColor`, `textColor` | Non-empty string (CSS color; the host checks syntax) |
| `lineWidth` | Number from 1 to 10 (CSS px) |
| `lineStyle` | `solid`, `dashed` or `dotted` |
| `fillOpacity` | Number from 0 to 1 |
| `fontSize` | Number from 8 to 72 (CSS px) |

Unknown style keys are rejected. A missing value comes from the theme when the scene is built, not
when the drawing is stored: `resolveStyle(drawing, theme)` merges the drawing's style over the
theme's per-kind defaults over its global defaults. Switching between `LIGHT_THEME` and `DARK_THEME`
(or your own `DrawingTheme`) therefore restyles every drawing that does not override a value. A
theme also holds the hover, selected and locked state styles and the handle style (8 px squares).

```ts
import { DARK_THEME, resolveStyle } from 'keystone-financial-tools-core';

resolveStyle({ kind: 'rectangle', style: { color: '#e91e63' } }, DARK_THEME);
// { color: '#e91e63', fillOpacity: 0.2, lineWidth: 2, lineStyle: 'solid', ... }
```

## Kind options

| Kind | Options (defaults) |
|---|---|
| `trend-line` | `extendLeft` (false), `extendRight` (false) |
| `fibonacci-retracement` | `levels` (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1 shown; 1.272, 1.618, 2.618, 4.236 hidden), `reverse` (false), `extendLeft` (false), `extendRight` (false), `showLabels` (true), `showPrices` (true) |
| `fibonacci-arcs` | `levels` (0.382, 0.5, 0.618), `fullCircles` (false), `showLabels` (true) |
| `fibonacci-fans` | `levels` (0.382, 0.5, 0.618), `showLabels` (true) |
| `fibonacci-time-zones` | `sequence` (0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89), `showLabels` (true) |
| `horizontal-line`, `rectangle`, `text-note` | none |

A level is `{ ratio, visible, color? }`: finite ratios, unique within a drawing, at most 24. A
sequence has at most 32 non-negative integers in strictly ascending order. Options on a kind that
does not use them are rejected. `resolveOptions(kind, options)` fills in the defaults.

## Issue codes

`validateDrawing` returns every issue in a stable order (id, kind, anchors, axis, text, style,
options, locked, hidden, zIndex, meta) and never throws.

| Code | Meaning |
|---|---|
| `KFT-E-SHAPE` | Not an object, or `locked`/`hidden` not a boolean, or `zIndex` not a finite integer |
| `KFT-E-ID` | Missing, empty or duplicate id |
| `KFT-E-KIND` | Unknown kind |
| `KFT-E-ANCHORS` | Anchors missing or the wrong count for the kind |
| `KFT-E-ANCHOR` | An anchor without a finite time and price or a y-axis id |
| `KFT-E-AXIS` | Anchors of one drawing on different y-axes |
| `KFT-E-TEXT` | Text that is not a string |
| `KFT-E-STYLE` | Style that is not a plain object, a value out of range, an unknown line style or an unknown key |
| `KFT-E-OPTIONS` | Options that are not a plain object, a key the kind does not use, a flag that is not a boolean, bad levels or a bad sequence |
| `KFT-E-META` | `meta` is not a plain object, or holds a value that is not JSON-safe (the message names its path, e.g. `meta.a.b[3]`) |
| `KFT-E-MISSING` | Update of a drawing that is not in the store |
| `KFT-E-JSON` | Not a version 1 document |

```ts
import { createId, DrawingStore } from 'keystone-financial-tools-core';

const store = new DrawingStore();
const stop = store.subscribe((drawings) => render(drawings));
store.add({
  id: createId(),
  kind: 'horizontal-line',
  anchors: [{ time: Date.UTC(2026, 9, 28), price: 100, yAxisId: 'price' }],
});
stop();
```
