---
title: Keystone drawing tools
description: Trend lines, Fibonacci tools and text notes for financial charts, with TypeScript, Vue, React and Angular packages.
template: splash
hero:
  tagline: Interactive drawing tools for financial charts. Place, snap, select, edit and save drawings, in TypeScript, Vue, React or Angular.
  actions:
    - text: Get started
      link: /getting-started/typescript/
      icon: right-arrow
    - text: Implement a host
      link: /guides/host/
      variant: minimal
---

The drawing tools add trend lines, horizontal lines, rectangles, Fibonacci tools and text notes to a chart. They cover the whole workflow: placing anchors with the pointer or the keyboard, magnet snapping, selecting, moving and resizing, undo and redo, and saving drawings.

Drawings are stored in chart coordinates (time, price and y-axis), never in pixels, so they survive zoom, scroll and layout changes.

## How it fits together

- `keystone-financial-tools-core` holds all the logic: the drawing model, the store, the undo history, the interaction engine and the controller.
- `keystone-financial-tools-typescript`, `keystone-financial-tools-vue`, `keystone-financial-tools-react` and `keystone-financial-tools-angular` are thin adapters. They show what the core decides and add no logic of their own.
- A chart takes part by implementing the [host contract](/guides/host/). The tools never depend on a chart package.

## Where to start

- Pick your framework: [TypeScript](/getting-started/typescript/), [Vue](/getting-started/vue/), [React](/getting-started/react/) or [Angular](/getting-started/angular/).
- Connect your chart with the [host guide](/guides/host/).
- Keep drawings between sessions with the [persistence guide](/guides/persistence/).
- Look up every key in the [keyboard reference](/guides/keyboard/).
- Read about each tool, beginning with the [trend line](/tools/trend-line/).
