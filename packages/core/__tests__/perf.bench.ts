import { test } from 'vitest';
import { createDrawingTools } from '../src/controller';
import { DrawingStore } from '../src/store';
import { createMockHost } from '../src/testing/mock-host';
import type { Drawing } from '../src/types';
import { benchDrawings } from './bench-drawings';
import { benchShapeDrawings } from './bench-shapes';
import { A } from './controller-rig';

// The time budgets of NFR-PERF-001..003, measured through the controller with 500 drawings on the mock host. The test names start with the
// requirement id: packages/budgets (`bench:check`) fails CI when any task of such a test has a mean above its budget or a run is more than
// 20% slower than the recorded baseline. Run them with `pnpm --filter keystone-financial-tools-core bench`, which writes the JSON report to
// `reports/bench/results.json`. Keep a test per budget, and rename a test only together with `PERF_BUDGETS` and the baseline.
const DRAWINGS = benchDrawings(500, 11);

function setup(extra: readonly Drawing[] = []) {
  const host = createMockHost();
  const tools = createDrawingTools(host, { store: new DrawingStore([...DRAWINGS, ...extra]) });
  return { host, tools };
}

test('NFR-PERF-001 getScene() with 500 drawings', async ({ bench }) => {
  const { host, tools } = setup();
  tools.getScene();
  let direction = 1;
  await bench('after a viewport change', () => {
    // A scroll of one pixel to and fro keeps every drawing visible and forces the geometry and the scene to be built again.
    host.scroll(direction);
    direction = -direction;
    tools.getScene();
  }).run();
  tools.destroy();
});

test('NFR-PERF-002 hitTest() with 500 drawings', async ({ bench }) => {
  const { tools } = setup();
  tools.hitTest(400, 200);
  await bench('a point in the middle of the plot', () => {
    tools.hitTest(400, 200);
  }).run();
  await bench('a point that hits nothing', () => {
    tools.hitTest(799, 399);
  }).run();
  tools.destroy();
  // FR-TOOL-037: 500 drawings of polylines, polygons, ellipses, curves, arrowheads and glyphs, which are measured on flattened copies.
  const shapes = setup(benchShapeDrawings(500, 13)).tools;
  shapes.hitTest(400, 200);
  await bench('a point in the middle of the plot, 500 drawings of the new shapes', () => {
    shapes.hitTest(400, 200);
  }).run();
  shapes.destroy();
});

test('NFR-PERF-003 pointer move during a drag with 500 drawings', async ({ bench }) => {
  const target: Drawing = { id: 'target', kind: 'trend-line', anchors: [A(100, 200), A(300, 100)], zIndex: 100 };
  const { host, tools } = setup([target]);
  tools.select([target.id]);
  // The middle of the selected trend line, which is on top of the others.
  host.pointer('down', 200, 150);
  let far = false;
  await bench('a move of the selected trend line', () => {
    far = !far;
    host.pointer('move', far ? 260 : 230, far ? 190 : 170);
  }).run();
  host.pointer('up', 230, 170);
  tools.destroy();
});
