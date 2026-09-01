import { App, TFile, TFolder } from 'obsidian';
import { TemplateSetInfo } from '../types/templateSet';
import { WorldInfo } from '../types/world';
import {
	WorldBuilderSettings,	
	PluginState,
} from '../types/runtime';
import {
	parseFieldsWithIssues,
	parseFolderRulesWithIssues,
} from './ParseTemplateLines';

// ── Required files in every template set ─────────────────────────────────────

const REQUIRED_FILES = [	
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

		// Leading "_" on the world folder → user domain (archived); ignore entirely.
		if (folder.name.startsWith('_')) continue;

		const rawName: unknown = frontmatter['name'];
		const rawStatus: unknown = frontmatter['status'];
		const rawTemplateSet: unknown = frontmatter['template_set'];

		const templateSetName = typeof rawTemplateSet === 'string'
			? rawTemplateSet
			: 'defaults';

		const templateSet = templateSets.find(ts => ts.name === templateSetName);

		worlds.push({
			name: typeof rawName === 'string' ? rawName : folder.name,
			path: folder.path,
			folder,
			indexFile: file,
			status: rawStatus === 'active' ? 'active' : 'inactive',
			templateSet: templateSetName,			
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
	const issues: TemplateSetInfo['issues'] = [];
	const folderRules: TemplateSetInfo['folderRules'] = [];
	const worldTemplate: string[] = [];
	const fieldSets: TemplateSetInfo['fieldSets'] = {};

	for (const required of REQUIRED_FILES) {
		const file = app.vault.getAbstractFileByPath(`${folder.path}/${required}`);
		if (!(file instanceof TFile)) {
			issues.push({
				severity: 'error',
				kind: 'missing-file',
				file: required,
				message: `Missing required file: ${required}`,
			});
		}
	}

	const rulesFile = app.vault.getAbstractFileByPath(`${folder.path}/folder-rules.md`);
	if (rulesFile instanceof TFile) {
		const raw = await app.vault.read(rulesFile);
		const parsed = parseFolderRulesWithIssues(raw, 'folder-rules.md');
		folderRules.push(...parsed.rules);
		issues.push(...parsed.issues);

		if (folderRules.length === 0) {
			issues.push({
				severity: 'info',
				kind: 'empty-folder-rules',
				file: 'folder-rules.md',
				message:
					'folder-rules.md has no rules; entity folders will not be suggested from rules (types still use * placement where applicable).',
			});
		}
	} else {
		issues.push({
			severity: 'info',
			kind: 'empty-folder-rules',
			file: 'folder-rules.md',
			message:
				'folder-rules.md is missing; all entity types use * placement (create anywhere under the world).',
		});
	}

	const worldTemplateFile = app.vault.getAbstractFileByPath(`${folder.path}/world-template.md`);
	if (worldTemplateFile instanceof TFile) {
		const raw = await app.vault.read(worldTemplateFile);
		worldTemplate.push(...parseLineList(raw));

		if (worldTemplate.length === 0) {
			issues.push({
				severity: 'info',
				kind: 'empty-world-template',
				file: 'world-template.md',
				message:
					'world-template.md has no folders; new worlds will not get a default subfolder tree.',
			});
		}
	} else {
		issues.push({
			severity: 'info',
			kind: 'empty-world-template',
			file: 'world-template.md',
			message:
				'world-template.md is missing; new worlds will not get a default subfolder tree.',
		});
	}

	const fieldFiles = folder.children.filter(
		(f): f is TFile => f instanceof TFile && f.name.endsWith('_Fields.md')
	);

	for (const file of fieldFiles) {
		const typeName = file.name.replace('_Fields.md', '');
		const raw = await app.vault.read(file);
		const parsed = parseFieldsWithIssues(raw, file.name);
		fieldSets[typeName] = parsed.fields;
		issues.push(...parsed.issues);
	}

	for (const rule of folderRules) {
		if (rule.targetFolder === '*') continue;
		if (!(rule.entityType in fieldSets)) {
			issues.push({
				severity: 'error',
				kind: 'missing-fields-for-rule',
				file: 'folder-rules.md',
				message: `folder-rules.md references "${rule.entityType}" but ${rule.entityType}_Fields.md is missing`,
			});
		}
	}

	for (const [typeName, fields] of Object.entries(fieldSets)) {
		const titleCount = fields.filter(f => f.display === 'title').length;
		const fieldsFile = `${typeName}_Fields.md`;
		if (titleCount === 0) {
			issues.push({
				severity: 'error',
				kind: 'no-title',
				file: fieldsFile,
				message: `${fieldsFile} has no title field`,
			});
		} else if (titleCount > 1) {
			issues.push({
				severity: 'error',
				kind: 'multiple-title',
				file: fieldsFile,
				message: `${fieldsFile} has more than one title field`,
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

// ── Frontmatter helpers (world index only) ────────────────────────────────────

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
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
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