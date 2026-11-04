# keystone-financial-tools-docs

The documentation site of the Keystone drawing tools, built with Astro and Starlight.

## Pages

The pages are Markdown files in `src/content/docs`:

- `getting-started/`: one page each for TypeScript, Vue, React and Angular.
- `guides/`: the host guide, the persistence guide and the keyboard reference.
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

## Not yet here

The generated API reference (E09-F01-S02) and the live tool examples (E09-F01-S03).
