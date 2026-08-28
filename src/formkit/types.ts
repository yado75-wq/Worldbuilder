// ── Fields ────────────────────────────────────────────────────────────────────
export type FieldType = 'text' | 'link' | 'select' | 'timeframe' | 'multiselect';
export type DisplayType = 'title' | 'property' | 'section';


export interface FieldDefinition {
    key: string;
    label: string;
    mandatory: boolean;
    type: FieldType;
    display: DisplayType;
    options?: string[];
    /**  folder-oriented; prefer linkTypes. Still set to linkTypes[0] for one release. */
    linkFolder?: string;
    linkFallback?: string;
    /** Entity type names for link:Type1>Type2>… */
    linkTypes?: string[];
    /** For type === 'multiselect': fixed strings vs entity links. */
    multiKind?: 'text' | 'link';
}

export interface LinkCandidateGroup {
	entityType: string;
	/** Sorted A–Z; empty array → UI shows non-selectable "empty" placeholder. */
	names: string[];
}

// ── Forms ─────────────────────────────────────────────────────────────────────

export interface FormResult {
	data: Record<string, string | string[] | null>;
}