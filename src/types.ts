import { TFile, TFolder } from 'obsidian';

// ── Settings ─────────────────────────────────────────────────────────────────

export interface WorldBuilderSettings {
	systemFolder: string;       // default: "_system"
	templatesFolder: string;    // default: "templates"
	scriptsFolder: string;      // default: "scripts"
}

export const DEFAULT_SETTINGS: WorldBuilderSettings = {
	systemFolder: '_system',
	templatesFolder: 'templates',
	scriptsFolder: 'scripts',
};

// ── World ─────────────────────────────────────────────────────────────────────

export interface WorldInfo {
	name: string;               // display name from frontmatter or folder name
	path: string;               // vault-relative path to world root folder
	folder: TFolder;            // TFolder reference
	indexFile: TFile;           // _index.md TFile reference
	status: 'active' | 'inactive';
	templateSet: string;        // name of template set used by this world
}

// ── Template Sets ─────────────────────────────────────────────────────────────

export interface TemplateSetInfo {
	name: string;               // folder name under _system/templates/
	path: string;               // full vault-relative path
	isValid: boolean;
	issues: ValidationIssue[];
	folderRules: FolderRule[];
	worldTemplate: string[];    // subfolder names from world-template.md
	fieldSets: Record<string, FieldDefinition[]>; // entityType → fields
}

export interface ValidationIssue {
	severity: 'error' | 'warning';
	message: string;
}

// ── Fields ────────────────────────────────────────────────────────────────────

export interface FieldDefinition {
	key: string;                // camelCase identifier
	label: string;              // human-readable label
	mandatory: boolean;         // only title field actually blocks submit
	type: FieldType;
	display: DisplayType;
	options?: string[];         // for select: type
	linkFolder?: string;        // for link: type primary folder
	linkFallback?: string;      // for link:Primary>Fallback type
}

export type FieldType = 'text' | 'link' | 'select';
export type DisplayType = 'title' | 'property' | 'section';

// ── Folder Rules ──────────────────────────────────────────────────────────────

export interface FolderRule {
	entityType: string;
	targetFolder: string;       // '*' means ask user
}

// ── Entities ──────────────────────────────────────────────────────────────────

export interface EntityInfo {
	type: string;               // e.g. "Character"
	file: TFile;
	name: string;               // from frontmatter or filename
	worldRoot: string;          // vault-relative path to world root
}

// ── Forms ─────────────────────────────────────────────────────────────────────

export interface FormResult {
	data: Record<string, string | null>;
}

// ── Context Menu ──────────────────────────────────────────────────────────────

export type MenuContext =
	| { type: 'vault-root' }
	| { type: 'world-root';         world: WorldInfo }
	| { type: 'entity-folder';      world: WorldInfo; entityType: string }
	| { type: 'entity-file';        world: WorldInfo; entityType: string; file: TFile }
	| { type: 'index-file';         world: WorldInfo }
	| { type: 'generic-folder' }
	| { type: 'unknown' };

// ── Plugin State ──────────────────────────────────────────────────────────────

export interface PluginState {
	activeWorld: WorldInfo | null;
	worlds: WorldInfo[];
	templateSets: TemplateSetInfo[];
}
