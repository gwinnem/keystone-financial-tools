export type {
  Anchor,
  ChangeOptions,
  DocumentScope,
  Drawing,
  DrawingDocument,
  DrawingDocumentV1,
  DrawingIssue,
  DrawingIssueCode,
  DrawingKind,
  DrawingListener,
  DrawingPatch,
  DrawingStyle,
  FibonacciLevel,
  JsonValue,
  KindOptions,
  LineStyle,
  StoreChange,
  StoreOperation,
} from './types';
export type { DrawingCursor, DrawingHost, HostKeyEvent, HostPointerEvent, Modifiers, NearestBar, Ohlc, Point, PointerPhase, PointerType, Rect, TextEditRequest } from './host';
export { HOST_API_VERSION } from './host';
export { assertHost, REQUIRED_HOST_MEMBERS, validateHost } from './host-check';
export { Disposables } from './disposables';
export type { HostHandlers } from './host-connection';
export { connectHost } from './host-connection';
export { anchorToPoint, pointToAnchor } from './projection';
export type { ArcShape, DrawingGeometry, GeometryOptions, GeometryPart, HandlePoint, LabelShape, LineShape, PriceFormatter, RectShape, Shape, TextShape } from './geometry/types';
export { geometryOf } from './geometry/index';
export { TEXT_CHAR_WIDTH, TEXT_LINE_HEIGHT } from './geometry/boxes';
export { formatPrice } from './geometry/lines';
export type { GeometryCacheOptions } from './hit/geometry-cache';
export { GeometryCache } from './hit/geometry-cache';
export type { HitPart, HitResult, HitTestOptions } from './hit/hit-test';
export { HIT_TOLERANCE, hitTest } from './hit/hit-test';
export type { FibonacciItem, FibonacciKind, HandlesItem, ItemState, PreviewItem, ResolvedFibonacciOptions, SceneItem, SceneOptions, ShapeItem } from './scene/types';
export { buildScene, SNAP_INDICATOR_RADIUS } from './scene/build';
export { SceneCache } from './scene/scene-cache';
export type { Gesture, GestureBase, GestureOptions } from './interaction/gesture';
export { GestureRecogniser } from './interaction/gesture';
export type { InteractionContext, InteractionEffect, InteractionInput, InteractionResult, InteractionState } from './interaction/types';
export { IDLE_STATE } from './interaction/types';
export { reduceInteraction } from './interaction/machine';
export type { PlacementInput, PlacementProgress, PlacementResult } from './interaction/placement';
export { lockAngle, PLACEMENT_START, placementPreview, placementSnap, reducePlacement, ZERO_LENGTH_PX } from './interaction/placement';
export type { MagnetMode, SnapResult } from './interaction/snap';
export { effectiveMagnet, snapAnchor, WEAK_MAGNET_PX } from './interaction/snap';
export { cursorFor, CursorSync } from './interaction/cursor';
export { DUPLICATE_OFFSET_PX, duplicateDrawing } from './interaction/duplicate';
export type { MovedDrawing } from './interaction/move';
export {
  constrainAngle,
  constrainMove,
  dragHandle,
  handleSnap,
  KEYBOARD_CURSOR_INSET_PX,
  keyboardCursorStart,
  moveDrawings,
  moveKeyboardCursor,
  nudgeAnchors,
  SHIFT_STEP_FACTOR,
} from './interaction/move';
export type { TextEditorKeyAction, TextEditorKeyEvent, TextEditorListener, TextEditSession } from './text-editor';
export { shouldRestoreFocus, TEXT_EDITOR_LABEL, TextEditor, textEditorKeyAction } from './text-editor';
export type {
  DrawingTools,
  DrawingToolsBlocked,
  DrawingToolsError,
  DrawingToolsErrorSource,
  DrawingToolsEventName,
  DrawingToolsEvents,
  DrawingToolsOptions,
  DrawingToolsRuntimeOptions,
  DrawingToolsState,
} from './controller';
export { createDrawingTools } from './controller';
export { ANCHOR_COUNT, DRAWING_KINDS, isDrawingKind } from './kinds';
export { isValidAnchor, validateDrawing } from './validate';
export { DrawingError } from './errors';
export type { IdSource } from './ids';
export { createId, createIdGenerator } from './ids';
export type { DrawingStoreOptions } from './store';
export { DrawingStore } from './store';
export { DOCUMENT_VERSION, migrateV1ToV2, readDocument, SUPPORTED_DOCUMENT_VERSIONS } from './migrations';
export type { ImportMode, ImportOptions, ImportReport } from './import';
export { importDocument } from './import';
export type { DrawingCommand } from './commands';
export { applyCommand, composeCommands, createCommand, invertCommand } from './commands';
export type { HistoryOptions, HistoryState, HistoryTransaction } from './history';
export { History } from './history';
export { LINE_STYLES, STYLE_LIMITS, validateStyle } from './style';
export type { DrawingTheme, HandleStyle, ResolvedStyle, StateStyle } from './theme';
export { DARK_THEME, LIGHT_THEME, resolveStyle } from './theme';
export { DEFAULT_ARC_FAN_LEVELS, DEFAULT_RETRACEMENT_LEVELS, DEFAULT_TIME_ZONE_SEQUENCE, defaultOptions, KIND_OPTION_KEYS, MAX_LEVELS, MAX_SEQUENCE, resolveOptions, validateOptions } from './options';
