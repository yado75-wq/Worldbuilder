import { TFile, TFolder } from 'obsidian';
import {TemplateSetInfo} from "./types/templateSet";
import { WorldInfo } from "./types/world";
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