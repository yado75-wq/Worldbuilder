import {TemplateSetInfo} from "./templateSet";
import { WorldInfo } from "./world";
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
// ── Plugin State ──────────────────────────────────────────────────────────────

export interface PluginState {
	activeWorld: WorldInfo | null;
	worlds: WorldInfo[];
	templateSets: TemplateSetInfo[];
}