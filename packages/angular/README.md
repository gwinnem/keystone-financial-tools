# keystone-financial-tools-angular

Angular service for the Keystone drawing tools.

`KeystoneDrawingService` (provided in root) starts with an empty `DrawingStore`.

| Member | Purpose |
|---|---|
| `store` | The attached store; change drawings through it |
| `drawings$` | The current drawings; emits the list on subscribe and on every change |
| `attach(store)` | Follows another store (for example one loaded from saved drawings) |

```ts
import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { KeystoneDrawingService } from 'keystone-financial-tools-angular';

@Component({
  selector: 'app-drawing-count',
  imports: [AsyncPipe],
  template: `<p>{{ (drawings.drawings$ | async)?.length }} drawings</p>`,
})
export class DrawingCountComponent {
  readonly drawings = inject(KeystoneDrawingService);
}
```
