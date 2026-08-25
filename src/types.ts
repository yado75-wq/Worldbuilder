import { TFile, TFolder } from 'obsidian';
import { FieldDefinition } from './types/fields';
// ── Settings ──────────────────────────────────────────────────────────────────

export interface WorldBuilderSettings {
	systemFolder: string;       // fixed: _system
	templatesFolder: string;    // fixed: templates
	defaultTemplateSet: string; // default template set for new worlds
}

export const DEFAULT_SETTINGS: WorldBuilderSettings = {
	systemFolder: '_system',
	templatesFolder: 'templates',
	defaultTemplateSet: 'defaults',
};

// ── World ─────────────────────────────────────────────────────────────────────

export interface WorldInfo {
	name: string;
	path: string;
	folder: TFolder;
	indexFile: TFile;
	status: 'active' | 'inactive';
	templateSet: string;
	folderRules: FolderRule[];
	worldTemplate: string[];
}

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



// ── Folder Rules ──────────────────────────────────────────────────────────────

export interface FolderRule {
	entityType: string;
	targetFolder: string;
}

// ── Entities ──────────────────────────────────────────────────────────────────

export interface EntityInfo {
	type: string;
	file: TFile;
	name: string;
	worldRoot: string;
}


// ── Context Menu ──────────────────────────────────────────────────────────────

export type MenuContext =
	| { type: 'vault-root' }
	| { type: 'world-root';     world: WorldInfo }
	| { type: 'entity-folder';  world: WorldInfo; entityType: string; folder: TFolder }
	| { type: 'entity-file';    world: WorldInfo; entityType: string; file: TFile }
	| { type: 'index-file';     world: WorldInfo }
	| { type: 'generic-folder'; world: WorldInfo; folder: TFolder }
	| { type: 'template-set';   templateSet: TemplateSetInfo }
	| { type: 'unknown' };

// ── Plugin State ──────────────────────────────────────────────────────────────

export interface PluginState {
	activeWorld: WorldInfo | null;
	worlds: WorldInfo[];
	templateSets: TemplateSetInfo[];
}