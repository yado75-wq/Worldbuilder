import { App, TFile, TFolder } from 'obsidian';
import {
	WorldBuilderSettings,
	WorldInfo,
	TemplateSetInfo,
	FieldDefinition,
	DisplayType,
	FolderRule,
	ValidationIssue,
	PluginState,
} from '../types';

// ── Required files in every template set ─────────────────────────────────────

const REQUIRED_FILES = [
	'world-template.md',
	'folder-rules.md',
	'WorldMeta_Fields.md',
	'Generic_Fields.md',
];

// ── Main entry point ──────────────────────────────────────────────────────────

export async function scanVault(
	app: App,
	settings: WorldBuilderSettings
): Promise<PluginState> {
	const templateSets = await findTemplateSets(app, settings);
	const worlds = await findWorlds(app, templateSets);
	const activeWorld = findActiveWorld(worlds);

	return { activeWorld, worlds, templateSets };
}

// ── World scanning ────────────────────────────────────────────────────────────

async function findWorlds(
	app: App,
	templateSets: TemplateSetInfo[]
): Promise<WorldInfo[]> {
	const worlds: WorldInfo[] = [];

	const indexFiles = app.vault.getFiles().filter(
		f => f.name === '_index.md'
	);

	for (const file of indexFiles) {
		const frontmatter = await readFrontmatter(app, file);
		const tags = collectTags(frontmatter);
		if (!tags.includes('world') && !tags.includes('#world')) continue;

		const folder = file.parent;
		if (!folder) continue;

		// frontmatter is typed as { [key: string]: any } in Obsidian's API
		const rawName: unknown = frontmatter['name'];
		const rawStatus: unknown = frontmatter['status'];
		const rawTemplateSet: unknown = frontmatter['template_set'];

		const templateSetName = typeof rawTemplateSet === 'string'
			? rawTemplateSet
			: 'default';

		// Find matching template set to carry folderRules and worldTemplate
		const templateSet = templateSets.find(ts => ts.name === templateSetName)
			?? templateSets[0];

		worlds.push({
			name: typeof rawName === 'string' ? rawName : folder.name,
			path: folder.path,
			folder,
			indexFile: file,
			status: rawStatus === 'active' ? 'active' : 'inactive',
			templateSet: templateSetName,
			folderRules: templateSet?.folderRules ?? [],
			worldTemplate: templateSet?.worldTemplate ?? [],
		});
	}

	return worlds;
}

function findActiveWorld(worlds: WorldInfo[]): WorldInfo | null {
	return worlds.find(w => w.status === 'active') ?? null;
}

// ── Template set scanning ─────────────────────────────────────────────────────

async function findTemplateSets(
	app: App,
	settings: WorldBuilderSettings
): Promise<TemplateSetInfo[]> {
	const templateSets: TemplateSetInfo[] = [];
	const templatesRoot = `${settings.systemFolder}/${settings.templatesFolder}`;

	const rootFolder = app.vault.getAbstractFileByPath(templatesRoot);
	if (!(rootFolder instanceof TFolder)) return templateSets;

	for (const child of rootFolder.children) {
		if (!(child instanceof TFolder)) continue;
		const setInfo = await buildTemplateSetInfo(app, child);
		templateSets.push(setInfo);
	}

	return templateSets;
}

async function buildTemplateSetInfo(
	app: App,
	folder: TFolder
): Promise<TemplateSetInfo> {
	const issues: ValidationIssue[] = [];
	const folderRules: FolderRule[] = [];
	const worldTemplate: string[] = [];
	const fieldSets: Record<string, FieldDefinition[]> = {};

	// Check required files exist
	for (const required of REQUIRED_FILES) {
		const file = app.vault.getAbstractFileByPath(`${folder.path}/${required}`);
		if (!(file instanceof TFile)) {
			issues.push({
				severity: 'error',
				message: `Missing required file: ${required}`,
			});
		}
	}

	// Parse folder-rules.md
	const rulesFile = app.vault.getAbstractFileByPath(`${folder.path}/folder-rules.md`);
	if (rulesFile instanceof TFile) {
		const raw = await app.vault.read(rulesFile);
		folderRules.push(...parseFolderRules(raw));
	}

	// Parse world-template.md
	const worldTemplateFile = app.vault.getAbstractFileByPath(`${folder.path}/world-template.md`);
	if (worldTemplateFile instanceof TFile) {
		const raw = await app.vault.read(worldTemplateFile);
		worldTemplate.push(...parseLineList(raw));
	}

	// Parse all *_Fields.md files
	const fieldFiles = folder.children.filter(
		(f): f is TFile => f instanceof TFile && f.name.endsWith('_Fields.md')
	);

	for (const file of fieldFiles) {
		const typeName = file.name.replace('_Fields.md', '');
		const raw = await app.vault.read(file);
		fieldSets[typeName] = parseFields(raw);
	}

	// Internal consistency — every rule must have matching _Fields.md
	for (const rule of folderRules) {
		if (rule.targetFolder === '*') continue;
		if (!(rule.entityType in fieldSets)) {
			issues.push({
				severity: 'error',
				message: `folder-rules.md references "${rule.entityType}" but ${rule.entityType}_Fields.md is missing`,
			});
		}
	}

	// Every _Fields.md must have exactly one title field
	for (const [typeName, fields] of Object.entries(fieldSets)) {
		const titleCount = fields.filter(f => f.display === 'title').length;
		if (titleCount === 0) {
			issues.push({
				severity: 'error',
				message: `${typeName}_Fields.md has no title field`,
			});
		} else if (titleCount > 1) {
			issues.push({
				severity: 'error',
				message: `${typeName}_Fields.md has more than one title field`,
			});
		}
	}

	return {
		name: folder.name,
		path: folder.path,
		isValid: issues.filter(i => i.severity === 'error').length === 0,
		issues,
		folderRules,
		worldTemplate,
		fieldSets,
	};
}

// ── Parsers ───────────────────────────────────────────────────────────────────

async function readFrontmatter(app: App, file: TFile): Promise<Record<string, unknown>> {
	const cache = app.metadataCache.getFileCache(file);
	const cachedFrontmatter = cache?.frontmatter;
	const content = await app.vault.read(file);
	const parsed = parseFrontmatter(content);
	return { ...(cachedFrontmatter ?? {}), ...parsed };
}

function collectTags(frontmatter: Record<string, unknown>): string[] {
	const raw = frontmatter.tags;
	if (Array.isArray(raw)) {
		return raw.map(value => typeof value === 'string' ? value : '').filter(Boolean);
	}
	if (typeof raw === 'string') {
		return [raw];
	}
	return [];
}

function parseFrontmatter(content: string): Record<string, unknown> {
	const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
	if (!match?.[1]) return {};

	const result: Record<string, unknown> = {};
	const lines = match[1].split('\n');

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]?.trim();
		if (!line || line.startsWith('#') || !line.includes(':')) continue;

		const [rawKey, ...rest] = line.split(':');
		const key = rawKey?.trim();
		const valueText = rest.join(':').trim();
		if (!key) continue;

		if (!valueText) {
			const listItems: string[] = [];
			for (let next = index + 1; next < lines.length; next++) {
				const item = lines[next]?.trim();
				if (!item) continue;
				if (!item.startsWith('- ')) {
					index = next - 1;
					break;
				}
				listItems.push(stripQuotes(item.slice(2).trim()));
				index = next;
			}
			if (listItems.length > 0) {
				result[key] = listItems;
			}
			continue;
		}

		result[key] = stripQuotes(valueText);
	}

	return result;
}

function stripQuotes(value: string): string {
	const trimmed = value.trim();
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function parseLineList(raw: string): string[] {
	return raw
		.split('\n')
		.map(line => line.replace(/^[-*]\s*/, '').trim())
		.filter(line => line.length > 0);
}

function parseFolderRules(raw: string): FolderRule[] {
	const rules: FolderRule[] = [];

	for (const line of raw.split('\n')) {
		const cleaned = line.replace(/^[-*]\s*/, '').trim();
		if (!cleaned) continue;

		const parts = cleaned.split('|').map(s => s.trim());
		const entityType = parts[0];
		const targetFolder = parts[1];

		if (!entityType || !targetFolder) continue;

		rules.push({ entityType, targetFolder });
	}

	return rules;
}

function parseFields(raw: string): FieldDefinition[] {
	const fields: FieldDefinition[] = [];

	for (const line of raw.split('\n')) {
		const cleaned = line.replace(/^[-*]\s*/, '').trim();
		if (!cleaned) continue;

		const parts = cleaned.split('|').map(s => s.trim());
		const key      = parts[0];
		const label    = parts[1];
		const mode     = parts[2];
		const typeRaw  = parts[3];
		const displayRaw = parts[4];

		if (!key || !label || !mode || !typeRaw) continue;

		const display = isDisplayType(displayRaw) ? displayRaw : 'property';
		const field = buildFieldDefinition(key, label, mode, typeRaw, display);
		fields.push(field);
	}

	return fields;
}

function isDisplayType(value: string | undefined): value is DisplayType {
	return value === 'title' || value === 'property' || value === 'section';
}

function buildFieldDefinition(
	key: string,
	label: string,
	mode: string,
	typeRaw: string,
	display: DisplayType
): FieldDefinition {
	const mandatory = mode.toLowerCase() === 'mandatory';

	if (typeRaw.startsWith('select:')) {
		return {
			key, label, mandatory, display,
			type: 'select',
			options: typeRaw.slice(7).split(',').map(s => s.trim()),
		};
	}

	if (typeRaw.startsWith('link:')) {
		const spec = typeRaw.slice(5);
		const parts = spec.split('>').map(s => s.trim());
		const primary = parts[0];
		const fallback = parts[1];

		if (!primary) {
			return { key, label, mandatory, display, type: 'text' };
		}

		return {
			key, label, mandatory, display,
			type: 'link',
			linkFolder: primary,
			linkFallback: fallback,
		};
	}

	return { key, label, mandatory, display, type: 'text' };
}
