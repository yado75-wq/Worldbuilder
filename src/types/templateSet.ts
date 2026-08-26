
import { FolderRule } from "./folderRule";
import { FieldDefinition } from "./fields";
// ── Template Sets ─────────────────────────────────────────────────────────────

export interface TemplateSetInfo {
	name: string;
	path: string;
	isValid: boolean;
	issues: ValidationIssue[];
	folderRules: FolderRule[];
	worldTemplate: string[];
	fieldSets: Record<string, FieldDefinition[]>;
}

export type ValidationIssueKind =
	| 'missing-file'
	| 'no-title'
	| 'multiple-title'
	| 'missing-fields-for-rule'
	| 'duplicate-field-key'
	| 'duplicate-folder-rule'
	| 'malformed-line'
	| 'unknown-link-type'
	| 'empty-folder-rules'
	| 'empty-world-template'
	| 'other';
export interface ValidationIssue {
	severity: 'error' | 'warning' | 'info';
	kind: ValidationIssueKind;
	message: string;
	/** Template-set-relative file name, e.g. Character_Fields.md */
	file?: string;
	/** 1-based line in that file, when known */
	line?: number;
}

/** Single-line text for settings / logs. */
export function formatValidationIssue(issue: ValidationIssue): string {
	const loc =
		issue.file && issue.line != null
			? `${issue.file}:${issue.line}`
			: issue.file
				? issue.file
				: undefined;
	const head = loc ? `[${issue.kind}] ${loc}: ` : `[${issue.kind}] `;
	return `${head}${issue.message}`;
}