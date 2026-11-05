import { createApp, defineComponent, h, onBeforeUnmount, onMounted, ref, type VNode } from 'vue';
import { KeystoneLiveRegion, KeystoneTextEditor, useDrawingTools } from 'keystone-financial-tools-vue';
import { ACTION_LABELS, CHART_LABEL, createSurface, openStore } from './demo';
import { nextMagnet, statusText } from './toolbar';

// The Vue page: `useDrawingTools` gives the toolbar, the state and the drawings as refs; the template is a render function, so the page needs no plugin.
async function start(): Promise<void> {
  const surface = createSurface();
  const store = await openStore();

  const App = defineComponent({
    setup() {
      const chart = ref<HTMLElement | null>(null);
      const drawingTools = useDrawingTools(surface.host, { store, magnet: 'off' });
      const { tools, state, toolbar, messages, drawings, textEdit, announcement } = drawingTools;
      let unmount: (() => void) | undefined;
      onMounted(() => {
        unmount = surface.mount(chart.value as HTMLElement, () => tools.getScene());
      });
      onBeforeUnmount(() => unmount?.());

      const action = (id: string, label: string, disabled: boolean, pressed: boolean | undefined, onClick: () => void): VNode =>
        h('button', { id, type: 'button', disabled, 'aria-pressed': pressed === undefined ? undefined : String(pressed), onClick }, label);

      return () =>
        h('div', [
          h('div', { id: 'toolbar', role: 'toolbar', 'aria-label': messages['toolbar.label'] }, [
            ...toolbar.value.map((entry) =>
              h(
                'button',
                {
                  key: entry.id,
                  id: `tool-${entry.id}`,
                  type: 'button',
                  disabled: !entry.enabled,
                  title: entry.shortcut ?? undefined,
                  'aria-pressed': String(entry.active),
                  onClick: () => (entry.active ? drawingTools.deactivate() : drawingTools.activate(entry.id)),
                },
                messages[entry.labelKey]
              )
            ),
            action('undo', ACTION_LABELS.undo, !state.value.canUndo, undefined, () => drawingTools.undo()),
            action('redo', ACTION_LABELS.redo, !state.value.canRedo, undefined, () => drawingTools.redo()),
            action('delete', ACTION_LABELS.delete, state.value.selection.length === 0, undefined, () => drawingTools.remove(state.value.selection)),
            action('magnet', ACTION_LABELS.magnet, false, state.value.magnet !== 'off', () => drawingTools.setMagnet(nextMagnet(state.value.magnet))),
          ]),
          h('div', { id: 'chart', ref: chart, tabindex: 0, role: 'application', 'aria-label': CHART_LABEL }, [h(KeystoneTextEditor, { session: textEdit.value, label: messages['editor.note'] })]),
          // The status line is not a live region: the announcements are (the two would say everything twice).
          h('output', { id: 'status', 'aria-live': 'off' }, statusText(state.value, drawings.value.length)),
          h(KeystoneLiveRegion, { id: 'announcer', message: announcement.value }),
        ]);
    },
  });

  createApp(App).mount('#app');
}

void start();
