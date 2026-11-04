// The allow-list of the parity test (FR-FW-050, AR-5): the exports of the core that the Vue, React and Angular packages do not re-export.
// Everything else the core exports is re-exported by all three, so an application imports the whole public API from its framework package.

/** The wrapper of an export of the core in each framework package. */
export interface Wrappers {
  readonly vue: string;
  readonly react: string;
  readonly angular: string;
}

const TOOLS: Wrappers = { vue: 'useDrawingTools', react: 'useDrawingTools', angular: 'KeystoneDrawingToolsService' };

/**
 * Exports of the core that the framework packages wrap instead of re-exporting: the name of the wrapper in each package, which the parity
 * test finds in the package.
 */
export const WRAPPED: Readonly<Record<string, Wrappers>> = {
  // `undo`, `redo` and the `canUndo` and `canRedo` of the state are the history.
  History: TOOLS,
  HistoryState: TOOLS,
  // `tools.hitTest(x, y)` and `tools.getScene()` are these two.
  hitTest: TOOLS,
  buildScene: TOOLS,
};

const ENGINE = 'The engine behind createDrawingTools: the tools drive it, and a chart integration that needs it uses the core directly.';

const ENGINE_EXPORTS = [
  'applyCommand',
  'composeCommands',
  'constrainAngle',
  'constrainMove',
  'connectHost',
  'createCommand',
  'cursorFor',
  'CursorSync',
  'Disposables',
  'dragHandle',
  'DrawingCommand',
  'duplicateDrawing',
  'DUPLICATE_OFFSET_PX',
  'effectiveMagnet',
  'GeometryCache',
  'GeometryCacheOptions',
  'geometryOf',
  'Gesture',
  'GestureBase',
  'GestureRecogniser',
  'handleSnap',
  'HistoryTransaction',
  'HitTestOptions',
  'HIT_TOLERANCE',
  'HostHandlers',
  'IDLE_STATE',
  'InteractionContext',
  'InteractionEffect',
  'InteractionInput',
  'InteractionResult',
  'invertCommand',
  'KEYBOARD_CURSOR_INSET_PX',
  'keyboardCursorStart',
  'lockAngle',
  'moveDrawings',
  'MovedDrawing',
  'moveKeyboardCursor',
  'nudgeAnchors',
  'PlacementInput',
  'PlacementProgress',
  'PlacementResult',
  'PLACEMENT_START',
  'placementPreview',
  'placementSnap',
  'reduceInteraction',
  'reducePlacement',
  'SceneCache',
  'SceneOptions',
  'SHIFT_STEP_FACTOR',
  'snapAnchor',
  'SnapResult',
  'SNAP_INDICATOR_RADIUS',
  'TEXT_CHAR_WIDTH',
  'TEXT_LINE_HEIGHT',
  'WEAK_MAGNET_PX',
  'ZERO_LENGTH_PX',
];

/** Exports of the core that no framework package re-exports, each with the reason. */
export const EXCEPTIONS: Readonly<Record<string, string>> = Object.fromEntries(ENGINE_EXPORTS.map((name) => [name, ENGINE]));
