import { createElement, useEffect, useRef, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { KeystoneTextEditor, useDrawingTools } from 'keystone-financial-tools-react';
import { ACTION_LABELS, CHART_LABEL, createSurface, openStore } from './demo';
import { nextMagnet, statusText } from './toolbar';

// The React page: `useDrawingTools` gives the toolbar, the state and the drawings as plain values; the elements are made with `createElement`, so the page needs no JSX transform.
async function start(): Promise<void> {
  const surface = createSurface();
  const store = await openStore();

  function App(): ReactElement {
    const chart = useRef<HTMLDivElement>(null);
    const { tools, state, toolbar, messages, drawings, textEdit, activate, deactivate, remove, undo, redo, setMagnet } = useDrawingTools(surface.host, { store, magnet: 'off' });
    // The scene is asked for when the overlay is painted, by which time the tools may have been created.
    const toolsRef = useRef(tools);
    toolsRef.current = tools;
    useEffect(() => surface.mount(chart.current as HTMLDivElement, () => toolsRef.current?.getScene() ?? []), []);
    // The tools exist only after the first effect: paint what they hold (the saved drawings) once they do.
    useEffect(() => surface.redraw(), [tools]);

    const action = (id: string, label: string, disabled: boolean, pressed: boolean | undefined, onClick: () => void): ReactElement =>
      createElement('button', { id, type: 'button', disabled, 'aria-pressed': pressed, onClick }, label);

    return createElement(
      'div',
      null,
      createElement(
        'div',
        { id: 'toolbar', role: 'toolbar', 'aria-label': messages['toolbar.label'] },
        ...toolbar.map((entry) =>
          createElement(
            'button',
            {
              key: entry.id,
              id: `tool-${entry.id}`,
              type: 'button',
              disabled: !entry.enabled,
              title: entry.shortcut ?? undefined,
              'aria-pressed': entry.active,
              onClick: () => (entry.active ? deactivate() : activate(entry.id)),
            },
            messages[entry.labelKey]
          )
        ),
        action('undo', ACTION_LABELS.undo, !state.canUndo, undefined, () => undo()),
        action('redo', ACTION_LABELS.redo, !state.canRedo, undefined, () => redo()),
        action('delete', ACTION_LABELS.delete, state.selection.length === 0, undefined, () => remove(state.selection)),
        action('magnet', ACTION_LABELS.magnet, false, state.magnet !== 'off', () => setMagnet(nextMagnet(state.magnet)))
      ),
      createElement(
        'div',
        { id: 'chart', ref: chart, tabIndex: 0, role: 'application', 'aria-label': CHART_LABEL },
        createElement(KeystoneTextEditor, { session: textEdit, label: messages['editor.note'] })
      ),
      createElement('output', { id: 'status', 'aria-live': 'polite' }, statusText(state, drawings.length))
    );
  }

  createRoot(document.getElementById('app') as HTMLElement).render(createElement(App));
}

void start();
