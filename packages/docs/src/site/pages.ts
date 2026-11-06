/** A page of the site: its slug under `src/content/docs` (no extension) and the name the sidebar shows. */
export interface PageEntry {
  readonly slug: string;
  readonly label: string;
}

/** One getting started page for each package an application can start with. */
export const GETTING_STARTED: readonly PageEntry[] = [
  { slug: 'getting-started/typescript', label: 'TypeScript' },
  { slug: 'getting-started/vue', label: 'Vue' },
  { slug: 'getting-started/react', label: 'React' },
  { slug: 'getting-started/angular', label: 'Angular' },
];

export const GUIDES: readonly PageEntry[] = [
  { slug: 'guides/host', label: 'Implement a host' },
  { slug: 'guides/persistence', label: 'Save and load drawings' },
  { slug: 'guides/toolbar', label: 'Build a toolbar' },
  { slug: 'guides/keyboard', label: 'Keyboard reference' },
  { slug: 'guides/releasing', label: 'Release and publish' },
];

/** One page for each drawing kind, in the order of the core's `DRAWING_KINDS`; the slug ends with the kind. */
export const TOOLS: readonly PageEntry[] = [
  { slug: 'tools/trend-line', label: 'Trend line' },
  { slug: 'tools/horizontal-line', label: 'Horizontal line' },
  { slug: 'tools/rectangle', label: 'Rectangle' },
  { slug: 'tools/fibonacci-retracement', label: 'Fibonacci retracement' },
  { slug: 'tools/fibonacci-arcs', label: 'Fibonacci arcs' },
  { slug: 'tools/fibonacci-fans', label: 'Fibonacci fans' },
  { slug: 'tools/fibonacci-time-zones', label: 'Fibonacci time zones' },
  { slug: 'tools/text-note', label: 'Text note' },
];
