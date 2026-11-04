import type { StarlightUserConfig } from '@astrojs/starlight/types';
import starlightLinksValidator from 'starlight-links-validator';
import { SIDEBAR } from './sidebar';

/**
 * The Starlight configuration of the site. The links validator makes `astro build` fail on a link to a page or a heading that does not
 * exist (E09-F01-S01), so CI, which builds every package, stops on a broken link.
 */
export const STARLIGHT_CONFIG: StarlightUserConfig = {
  title: 'Keystone drawing tools',
  description: 'Trend lines, Fibonacci tools and text notes for financial charts, with TypeScript, Vue, React and Angular packages.',
  sidebar: SIDEBAR,
  plugins: [starlightLinksValidator()],
};
