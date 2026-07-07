import { TFile, TFolder } from 'obsidian';

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

export interface ValidationIssue {
	severity: 'error' | 'warning';
	message: string;
}

// ── Fields ────────────────────────────────────────────────────────────────────

export interface FieldDefinition {
	key: string;
	label: string;
	mandatory: boolean;
	type: FieldType;
	display: DisplayType;
	options?: string[];
	linkFolder?: string;
	linkFallback?: string;
}

export type FieldType = 'text' | 'link' | 'select';
export type DisplayType = 'title' | 'property' | 'section';

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

// ── Forms ─────────────────────────────────────────────────────────────────────

export interface FormResult {
	data: Record<string, string | null>;
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
