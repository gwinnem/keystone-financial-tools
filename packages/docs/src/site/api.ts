import type starlightTypeDoc from 'starlight-typedoc';

/** The options of one `starlight-typedoc` instance. */
export type TypeDocPluginOptions = Parameters<typeof starlightTypeDoc>[0];

/** One generated API reference: the entry file of a package (or of its `/testing` entry) and the TypeScript configuration TypeDoc reads it with. */
export interface ApiReference {
  /** Names the output folder (`api-<id>`) and the sidebar group. */
  readonly id: string;
  /** The label of the sidebar group. */
  readonly label: string;
  /** The entry file, relative to `packages/docs`. TypeDoc reads the sources, so no package has to be built first. */
  readonly entryPoint: string;
  /** The `tsconfig.json` of the package, relative to `packages/docs`: its `paths` and, for Angular, its decorator settings. */
  readonly tsconfig: string;
}

/** The packages whose public API is generated into the site, in sidebar order (E09-F01-S02). */
export const API_REFERENCES: readonly ApiReference[] = [
  { id: 'core', label: 'Core', entryPoint: '../core/src/index.ts', tsconfig: '../core/tsconfig.json' },
  { id: 'core-testing', label: 'Core testing', entryPoint: '../core/src/testing/index.ts', tsconfig: '../core/tsconfig.json' },
  { id: 'typescript', label: 'TypeScript', entryPoint: '../typescript/src/index.ts', tsconfig: '../typescript/tsconfig.json' },
  { id: 'vue', label: 'Vue', entryPoint: '../vue/src/index.ts', tsconfig: '../vue/tsconfig.json' },
  { id: 'react', label: 'React', entryPoint: '../react/src/index.ts', tsconfig: '../react/tsconfig.json' },
  { id: 'angular', label: 'Angular', entryPoint: '../angular/src/public-api.ts', tsconfig: '../angular/tsconfig.json' },
];

/** The folder under `src/content/docs` that holds the generated pages of a reference. Generated at build time, not committed. */
export const API_OUTPUT_PREFIX = 'api-';

/** The kinds of export that must have a TSDoc comment (NFR-DOC-001); members of an interface or class are not checked. */
export const REQUIRED_TO_BE_DOCUMENTED = ['Class', 'Enum', 'Function', 'Interface', 'TypeAlias', 'Variable'] as const;

/**
 * The `starlight-typedoc` options of a reference. A public export without a TSDoc comment is a TypeDoc validation warning, and
 * `treatValidationWarningsAsErrors` makes it stop the build, so the CI step that builds the site fails (E09-F01-S02).
 *
 * @example
 * ```ts
 * const [plugin] = createStarlightTypeDocPlugin();
 * plugin(typeDocOptions(API_REFERENCES[0])); // generates src/content/docs/api-core from ../core/src/index.ts
 * ```
 */
export function typeDocOptions(reference: ApiReference): TypeDocPluginOptions {
  return {
    entryPoints: [reference.entryPoint],
    tsconfig: reference.tsconfig,
    output: `${API_OUTPUT_PREFIX}${reference.id}`,
    sidebar: { label: reference.label, collapsed: true },
    typeDoc: {
      requiredToBeDocumented: [...REQUIRED_TO_BE_DOCUMENTED],
      validation: { notDocumented: true, notExported: false, invalidLink: false },
      treatValidationWarningsAsErrors: true,
    },
  };
}
