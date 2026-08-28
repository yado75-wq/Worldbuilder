// src/formkit/index.ts

// ── Field / form types ───────────────────────────────────────────────────────
export type {
	FieldDefinition,
	FieldType,
	DisplayType,
	FormResult,
	LinkCandidateGroup,
} from './types';

// ── UI ───────────────────────────────────────────────────────────────────────
export { InputModal } from './ui/InputModal';
export { EntityFormModal, type EntityFormModalOptions } from './ui/EntityFormModal';
export {
	MultiselectPickerModal,
	type MultiselectPickerOptions,
} from './ui/MultiselectPickerModal';

// ── Timeframe syntax (pure) ──────────────────────────────────────────────────
export type { Timepoint, TimeframeValue, ParseResult } from './time/TimeframeSyntax';
// adjust path if files sit at formkit root instead of formkit/time/
export {
	parseTimepoint,
	parseTimeframeValue,
	serializeTimepoint,
	serializeTimeframeValue,
} from './time/TimeframeSyntax';

// ── Timeframe widget state (pure) ────────────────────────────────────────────
export type { TimepointInput, TimeframeFieldInput } from './time/TimeframeWidgetState';
export {
	emptyTimepointInput,
	emptyTimeframeFieldInput,
	composeTimeframeValue,
	decomposeTimeframeValue,
} from './time/TimeframeWidgetState';