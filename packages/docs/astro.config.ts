import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import { STARLIGHT_CONFIG } from './src/site/config';

export default defineConfig({
  integrations: [starlight(STARLIGHT_CONFIG)],
});
