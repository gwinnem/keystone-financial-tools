# keystone-financial-tools-docs

The documentation site of the Keystone drawing tools, built with Astro and Starlight.

## Pages

The pages are Markdown files in `src/content/docs`:

- `getting-started/`: one page each for TypeScript, Vue, React and Angular.
- `guides/`: the host guide, the persistence guide, the keyboard reference (with the keyboard-only walkthrough of every tool and the screen-reader announcements) and *Release and publish*, the maintainer's checklist for a release and for the manual publish to npm (E09-F04).
- `tools/`: one page for each drawing kind (trend line, horizontal line, rectangle, the four Fibonacci tools and the text note).

To add a page, create the file with a `title` and a `description` and add it to `src/site/pages.ts`; the
sidebar is built from that list. The tests fail for a page that is not listed, a listed page that does
not exist, a tool page without the options of its kind, and a keyboard table that differs from
`src/site/shortcuts.ts`.

## Commands

```bash
pnpm --filter keystone-financial-tools-docs dev          # http://localhost:4321
pnpm --filter keystone-financial-tools-docs build        # fails on a broken link
pnpm --filter keystone-financial-tools-docs preview
pnpm --filter keystone-financial-tools-docs test
pnpm --filter keystone-financial-tools-docs test:coverage
pnpm --filter keystone-financial-tools-docs test:mutation
```

The build needs Node 22.23.4+ or 24 (Astro 7).

## Broken links

`starlight-links-validator` runs while the site is built. A link to a page or a heading that does not
exist stops `astro build`, and so the `Build all packages` step of the CI `verify` job. Link to pages
with an absolute path and a trailing slash, for example `/guides/host/`.

## API reference

The API reference of every package is generated from its TSDoc by TypeDoc (`starlight-typedoc`) while the site is
built: one group in the sidebar for each of the core, the core's `/testing` entry, TypeScript, Vue, React and
Angular. `src/site/api.ts` lists them (entry file, `tsconfig.json`, label); to add a package, add a line there.
TypeDoc reads the sources, so no package has to be built first. The pages go to `src/content/docs/api-<id>/` and
are not committed (`.gitignore`); `pnpm --filter keystone-financial-tools-docs clean` removes them.

A public class, enum, function, interface, type alias or variable without a TSDoc comment is a TypeDoc validation
warning, and the options treat it as an error: `astro build` (and `astro check`) fails and with it the CI step that
builds every package (NFR-DOC-001). Members of an interface or class are not checked. The generated pages are
checked by the links validator like the written ones.

## Live examples

The page of each tool has a *Try it* section with an `<iframe>` of the playground's embed page,
`/playground/embed.html?tool=<kind>`: the chart with only that tool enabled and already active, plus Undo,
Redo, Delete and Magnet. It is the same chart as the demo pages, so it works with the mouse, the keyboard and
touch. The `build` and `dev` scripts first run `pnpm --filter keystone-financial-tools-playground build:embed`,
which builds only the embed page (base `/playground/`) into `public/playground/`; that folder is generated and
not committed. The playground is a `devDependency`, so Turborepo builds it before the docs and rebuilds the docs
when it changes. A tool page without the section fails the tests.
