# keystone-financial-tools-react

React hook for the Keystone drawing tools.

`useDrawings(store?)` returns `{ store, drawings }` and re-renders the component on every store
change. Without a store argument it creates an empty one and keeps it across renders; passing a
different store switches to it.

```tsx
import { useDrawings } from 'keystone-financial-tools-react';

export function DrawingCount(): JSX.Element {
  const { drawings } = useDrawings();
  return <p>{drawings.length} drawings</p>;
}
```
