import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import playground from './vite.config';

const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// The build the docs site serves: only the embed page, under /playground/, into the public folder of packages/docs. It has the aliases of
// the playground build, so it runs against the sources of the packages. The docs `build` and `dev` scripts run it first.
export default defineConfig({
  resolve: playground.resolve,
  base: '/playground/',
  build: {
    target: 'es2022',
    outDir: source('../../packages/docs/public/playground'),
    emptyOutDir: true,
    rollupOptions: { input: { embed: source('embed.html') } },
  },
});
