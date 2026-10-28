# keystone-financial-tools-vue

Vue 3 composable for the Keystone drawing tools.

`useDrawings(store?)` returns `{ store, drawings }`: `drawings` is a ref with the current list,
replaced on every store change. Without a store argument it creates an empty one. The subscription
ends when the component (effect scope) is disposed.

```vue
<script setup lang="ts">
import { useDrawings } from 'keystone-financial-tools-vue';

const { store, drawings } = useDrawings();
</script>

<template>
  <p>{{ drawings.length }} drawings</p>
</template>
```
