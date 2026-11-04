import type { StarlightUserConfig } from '@astrojs/starlight/types';
import { GETTING_STARTED, GUIDES, TOOLS } from './pages';

/** The navigation of the site: every page of `pages.ts`, in three groups. */
export const SIDEBAR: NonNullable<StarlightUserConfig['sidebar']> = [
  { label: 'Getting started', items: [...GETTING_STARTED] },
  { label: 'Guides', items: [...GUIDES] },
  { label: 'Tools', items: [...TOOLS] },
];
