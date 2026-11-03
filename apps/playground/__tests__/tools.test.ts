import { describe, expect, it, vi } from 'vitest';
import { createDrawingTools, type Drawing, type HostPointerEvent, type PointerPhase } from 'keystone-financial-tools-core';
import { BAR_INTERVAL_MS, generateBars } from '../src/data';
import { createPlotHost } from '../src/plot-host';

const BARS = generateBars(100);

function setup() {
  const onRender = vi.fn();
  const host = createPlotHost({ width: 800, height: 400, bars: BARS, barInterval: BAR_INTERVAL_MS, onRender });
  const tools = createDrawingTools(host);
  const pointer = (phase: PointerPhase, x: number, y: number): void => {
    const event: HostPointerEvent = { phase, x, y, pointerType: 'mouse', button: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
    host.dispatchPointer(event);
  };
  const click = (x: number, y: number): void => {
    pointer('move', x, y);
    pointer('down', x, y);
    pointer('up', x, y);
  };
  return { host, tools, onRender, click };
}

// The drawing tools on the playground host, driven the way the DOM layer drives them.
describe('the drawing tools on the playground host', () => {
  it('places a trend line with two clicks, at the times and prices under the pointer', () => {
    const { host, tools, click } = setup();
    let placed: readonly Drawing[] = [];
    tools.on('change', (change) => {
      placed = change.drawings;
    });
    tools.activate('trend-line');
    click(host.timeToX(BARS[20].time), host.priceToY(BARS[20].close, 'price'));
    click(host.timeToX(BARS[40].time), host.priceToY(BARS[40].close, 'price'));
    expect(placed).toHaveLength(1);
    const [first, second] = placed[0].anchors;
    expect(placed[0].kind).toBe('trend-line');
    expect([first.yAxisId, second.yAxisId]).toStrictEqual(['price', 'price']);
    expect(first.time).toBeCloseTo(BARS[20].time, 3);
    expect(second.time).toBeCloseTo(BARS[40].time, 3);
    expect(first.price).toBeCloseTo(BARS[20].close, 6);
    expect(second.price).toBeCloseTo(BARS[40].close, 6);
  });

  it('asks the host to redraw after an action', () => {
    const { tools, onRender } = setup();
    tools.activate('rectangle');
    expect(onRender).toHaveBeenCalled();
  });

  it('removes the drawing again with undo', () => {
    const { host, tools, click } = setup();
    const changes: number[] = [];
    tools.on('change', (change) => changes.push(change.drawings.length));
    tools.activate('trend-line');
    click(host.timeToX(BARS[10].time), 100);
    click(host.timeToX(BARS[30].time), 200);
    expect(changes).toStrictEqual([1]);
    expect(tools.undo()).toBe(true);
    expect(changes).toStrictEqual([1, 0]);
  });
});
