// Importing the built-in kinds first registers the eight kinds of 1.0 before anything reads the registry.
import './builtin-kinds';

export { ANCHOR_COUNT, ANCHOR_RULES, DEFAULT_TOOLS, DRAWING_KINDS, anchorRuleText, isDrawingKind, isFreehandKind, kindDefinition, registerKind, requireKind } from './kind-registry';
export type { AnchorRule, KindDefinition, KindGeometryContext } from './kind-registry';
