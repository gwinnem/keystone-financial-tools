import type { StarlightUserConfig } from '@astrojs/starlight/types';
import starlightLinksValidator from 'starlight-links-validator';
import { createStarlightTypeDocPlugin } from 'starlight-typedoc';
import { API_REFERENCES, typeDocOptions } from './api';
import { SIDEBAR } from './sidebar';

/** One TypeDoc instance for each reference: the plugin that generates its pages and the sidebar group that lists them. */
const API = API_REFERENCES.map((reference) => {
  const [plugin, group] = createStarlightTypeDocPlugin();
  return { plugin: plugin(typeDocOptions(reference)), group };
});

/**
 * The Starlight configuration of the site. The links validator makes `astro build` fail on a link to a page or a heading that does not
 * exist (E09-F01-S01), so CI, which builds every package, stops on a broken link. TypeDoc generates the API reference of every package
 * from its TSDoc, and fails the build for a public export without a comment (E09-F01-S02). The validator comes last so that it also
 * checks the generated pages.
 */
export const STARLIGHT_CONFIG: StarlightUserConfig = {
  title: 'Keystone drawing tools',
  description: 'Trend lines, Fibonacci tools and text notes for financial charts, with TypeScript, Vue, React and Angular packages.',
  sidebar: [...SIDEBAR, { label: 'API reference', items: API.map(({ group }) => group) }],
  plugins: [...API.map(({ plugin }) => plugin), starlightLinksValidator()],
};
