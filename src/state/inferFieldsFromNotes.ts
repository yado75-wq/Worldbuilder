/**
 * Pure helpers: aggregate entity frontmatter across worlds → draft FieldDefinitions.
 * Used by Suggest-fields (new template set); never writes the vault.
 */

import { FieldDefinition } from '../formkit';

/** Frontmatter keys that are never template fields. */
export const RESERVED_FM_KEYS = new Set([
	'tags',
	'position',
	'cssclasses',
	'aliases',
]);

export interface NoteFrontmatterSample {
	/** World path (for debugging / counts only). */
	worldPath: string;
	/** Note path. */
	path: string;
	/** Normalized entity type tag (lowercase). */
	typeTag: string;
	frontmatter: Record<string, unknown>;
}

export interface KeyStats {
	key: string;
	/** Notes that had this key present (non-null). */
	presentCount: number;
	/** Notes scanned for this type. */
	noteCount: number;
	/** Best-effort value shape votes. */
	shapes: {
		text: number;
		link: number;
		/** YAML list of non-link scalars */
		list: number;
		/** YAML list where items are [[wikilinks]] */
		listLink: number;
		number: number;
	};
	/**
	 * Basenames extracted from [[wikilink]] values (single or list).
	 * Used in a second pass to resolve linkTypes from target notes' tags.
	 */
	linkTargetBasenames: string[];
}

export interface InferredTypeDraft {
	/** Display / file stem, e.g. Character */
	typeName: string;
	noteCount: number;
	keys: KeyStats[];
	/** Draft fields from notes only (no merge with baseline yet). */
	fields: FieldDefinition[];
}

function isWikilinkString(value: string): boolean {
	const t = value.trim();
	return t.startsWith('[[') && t.includes(']]');
}

/** Extract display basename from [[path|alias]] or [[Name]]. */
export function parseWikilinkBasename(raw: string): string | null {
	const t = raw.trim();
	const m = t.match(/^\[\[([^\]]+)\]\]$/);
	if (!m?.[1]) return null;
	let inner = m[1].trim();
	// alias
	const pipe = inner.indexOf('|');
	if (pipe !== -1) inner = inner.slice(0, pipe).trim();
	// path → last segment
	const slash = inner.lastIndexOf('/');
	if (slash !== -1) inner = inner.slice(slash + 1).trim();
	return inner || null;
}

function extractLinkBasenames(value: unknown): string[] {
	const out: string[] = [];
	if (typeof value === 'string' && isWikilinkString(value)) {
		const b = parseWikilinkBasename(value);
		if (b) out.push(b);
		return out;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			if (typeof item === 'string' && isWikilinkString(item)) {
				const b = parseWikilinkBasename(item);
				if (b) out.push(b);
			}
		}
	}
	return out;
}

type ShapeKind = keyof KeyStats['shapes'];

function classifyValue(value: unknown): ShapeKind | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number' && !Number.isNaN(value)) return 'number';
	if (typeof value === 'boolean') return 'text';
	if (Array.isArray(value)) {
		if (value.length === 0) return 'list';
		const stringItems = value.filter((v): v is string => typeof v === 'string');
		if (stringItems.length === value.length && stringItems.every(isWikilinkString)) {
			return 'listLink';
		}
		if (stringItems.length === value.length) return 'list';
		return 'list';
	}
	if (typeof value === 'string') {
		if (isWikilinkString(value)) return 'link';
		if (
			value.trim() !== '' &&
			!Number.isNaN(Number(value)) &&
			/^-?\d+(\.\d+)?$/.test(value.trim())
		) {
			return 'number';
		}
		return 'text';
	}
	return 'text';
}

function humanizeKey(key: string): string {
	if (!key) return key;
	const spaced = key
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Aggregate key statistics for one entity type from note samples.
 */
export function aggregateKeyStats(
	samples: readonly NoteFrontmatterSample[],
	typeTagLower: string
): KeyStats[] {
	const forType = samples.filter(s => s.typeTag === typeTagLower);
	const noteCount = forType.length;
	if (noteCount === 0) return [];

	const byKey = new Map<string, KeyStats>();

	for (const sample of forType) {
		for (const [key, value] of Object.entries(sample.frontmatter)) {
			if (RESERVED_FM_KEYS.has(key)) continue;
			if (value === null || value === undefined) continue;
			if (typeof value === 'string' && value.trim() === '') continue;

			let stats = byKey.get(key);
			if (!stats) {
				stats = {
					key,
					presentCount: 0,
					noteCount,
					shapes: { text: 0, link: 0, list: 0, listLink: 0, number: 0 },
					linkTargetBasenames: [],
				};
				byKey.set(key, stats);
			}
			stats.presentCount += 1;
			const shape = classifyValue(value);
			if (shape) stats.shapes[shape] += 1;

			for (const b of extractLinkBasenames(value)) {
				if (!stats.linkTargetBasenames.includes(b)) {
					stats.linkTargetBasenames.push(b);
				}
			}
		}
	}

	for (const stats of byKey.values()) {
		stats.noteCount = noteCount;
	}

	return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Resolve ordered unique entity type stems for link targets.
 * basenameToTypes: map note basename → display type names (from their tags / field sets).
 */
export function resolveLinkTypesFromTargets(
	basenames: readonly string[],
	basenameToTypes: ReadonlyMap<string, readonly string[]>
): string[] {
	const ordered: string[] = [];
	const seen = new Set<string>();
	for (const b of basenames) {
		const types = basenameToTypes.get(b) ?? basenameToTypes.get(b.toLowerCase());
		if (!types) continue;
		for (const t of types) {
			const key = t.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			ordered.push(t);
		}
	}
	return ordered;
}

/**
 * Conservative FieldDefinition from key stats (notes only).
 * @param linkTypesOverride — from second pass (resolved target note types)
 */
export function fieldFromKeyStats(
	stats: KeyStats,
	linkTypesOverride?: readonly string[]
): FieldDefinition {
	const { key, presentCount, noteCount, shapes } = stats;
	const ratio = noteCount > 0 ? presentCount / noteCount : 0;
	const mandatory = key === 'name' && ratio >= 0.8;

	const display =
		key === 'name' || key === 'title' ? ('title' as const) : ('property' as const);

	const totalShape =
		shapes.text +
			shapes.link +
			shapes.list +
			shapes.listLink +
			shapes.number || 1;
	const linkShare = shapes.link / totalShape;
	const listLinkShare = shapes.listLink / totalShape;
	const listShare = shapes.list / totalShape;
	const numberShare = shapes.number / totalShape;

	const linkTypes = linkTypesOverride ? [...linkTypesOverride] : [];

	// List of [[wikilinks]] → multiselect:link (not text)
	if (listLinkShare >= 0.5 && shapes.listLink >= shapes.list) {
		return {
			key,
			label: humanizeKey(key),
			mandatory,
			type: 'multiselect',
			display,
			multiKind: 'link',
			linkTypes,
			linkFolder: linkTypes[0],
			linkFallback: linkTypes[1],
		};
	}

	// Single wikilink field
	if (linkShare >= 0.6 && shapes.link >= shapes.list && shapes.link >= shapes.listLink) {
		return {
			key,
			label: humanizeKey(key),
			mandatory,
			type: 'link',
			display,
			linkTypes,
			linkFolder: linkTypes[0],
			linkFallback: linkTypes[1],
		};
	}

	if (listShare >= 0.6) {
		return {
			key,
			label: humanizeKey(key),
			mandatory,
			type: 'multiselect',
			display,
			multiKind: 'text',
			options: [],
		};
	}

	if (numberShare >= 0.8 && shapes.number >= 2) {
		return {
			key,
			label: humanizeKey(key),
			mandatory,
			type: 'text',
			display,
		};
	}

	return {
		key,
		label: humanizeKey(key),
		mandatory,
		type: 'text',
		display,
	};
}

export function fieldsFromKeyStats(
	keys: readonly KeyStats[],
	/**
	 * Optional second-pass map: frontmatter key → resolved link type stems.
	 */
	linkTypesByKey?: ReadonlyMap<string, readonly string[]>
): FieldDefinition[] {
	const fields = keys.map(stats =>
		fieldFromKeyStats(stats, linkTypesByKey?.get(stats.key))
	);
	// At most one title: prefer name
	let titleSeen = false;
	for (const f of fields) {
		if (f.display !== 'title') continue;
		if (!titleSeen) {
			titleSeen = true;
			continue;
		}
		f.display = 'property';
		f.mandatory = false;
	}
	const nameField = fields.find(f => f.key === 'name');
	if (nameField) {
		for (const f of fields) {
			if (f !== nameField && f.display === 'title') f.display = 'property';
		}
		nameField.display = 'title';
	}
	return fields;
}

/**
 * Add-only merge: baseline fields kept in order; new keys appended from inferred.
 * Never removes or changes type of an existing key in v1.
 */
export function mergeFieldsAddOnly(
	baseline: readonly FieldDefinition[],
	inferred: readonly FieldDefinition[]
): FieldDefinition[] {
	const keys = new Set(baseline.map(f => f.key));
	const result = baseline.map(f => ({ ...f }));
	for (const f of inferred) {
		if (keys.has(f.key)) continue;
		keys.add(f.key);
		result.push({ ...f });
	}
	return result;
}

/**
 * Serialize fields to *_Fields.md body (pipe format matching parseFieldsWithIssues).
 */
export function serializeFieldsFile(fields: readonly FieldDefinition[]): string {
	const lines: string[] = [];
	for (const f of fields) {
		const mode = f.mandatory ? 'mandatory' : 'optional';
		const typeCol = serializeTypeColumn(f);
		lines.push(`${f.key} | ${f.label} | ${mode} | ${typeCol} | ${f.display}`);
	}
	return lines.length > 0 ? lines.join('\n') + '\n' : '';
}

function serializeTypeColumn(f: FieldDefinition): string {
	if (f.type === 'select') {
		const opts = (f.options ?? []).map(o => `"${o.replace(/"/g, '\\"')}"`).join(',');
		return `select:${opts}`;
	}
	if (f.type === 'multiselect') {
		if (f.multiKind === 'link') {
			const chain = (f.linkTypes ?? []).join('>');
			return chain ? `multiselect:link:${chain}` : 'multiselect:link:';
		}
		const opts = (f.options ?? []).map(o => `"${o.replace(/"/g, '\\"')}"`).join(',');
		return opts ? `multiselect:text:${opts}` : 'multiselect:text:';
	}
	if (f.type === 'link') {
		const chain = (f.linkTypes ?? []).join('>');
		return chain ? `link:${chain}` : 'link:';
	}
	if (f.type === 'timeframe') {
		return 'timeframe';
	}
	return 'text';
}

/**
 * Build drafts for each typeTag present in samples.
 * typeNameByTag: optional map tag → preferred stem casing (from folder-rules / fieldSets).
 * basenameToTypes: second pass — note basename → entity type display names for link resolution.
 */
export function inferDraftsByType(
	samples: readonly NoteFrontmatterSample[],
	typeNameByTag: Record<string, string> = {},
	basenameToTypes?: ReadonlyMap<string, readonly string[]>
): InferredTypeDraft[] {
	const tags = new Set(samples.map(s => s.typeTag));
	const drafts: InferredTypeDraft[] = [];

	for (const tag of [...tags].sort()) {
		const keys = aggregateKeyStats(samples, tag);
		const linkTypesByKey = new Map<string, string[]>();
		if (basenameToTypes) {
			for (const stats of keys) {
				if (stats.linkTargetBasenames.length === 0) continue;
				const types = resolveLinkTypesFromTargets(
					stats.linkTargetBasenames,
					basenameToTypes
				);
				if (types.length > 0) linkTypesByKey.set(stats.key, types);
			}
		}
		const fields = fieldsFromKeyStats(keys, linkTypesByKey);
		const noteCount = samples.filter(s => s.typeTag === tag).length;
		drafts.push({
			typeName: typeNameByTag[tag] ?? tag,
			noteCount,
			keys,
			fields,
		});
	}

	return drafts;
}

// ── Folder rules from note placement ──────────────────────────────────────────

export interface FolderRuleSuggestion {
	entityType: string;
	/** Concrete first-level folder or '*' */
	targetFolder: string;
	supportCount: number;
	noteCount: number;
	supportRatio: number;
	/** Winning first segment before threshold (null if all at world root) */
	topFolder: string | null;
}

/**
 * First path segment under the world root, or null if the note sits in the world root.
 * Skips segments that start with "_".
 */
export function relativeFirstSegment(worldPath: string, notePath: string): string | null {
	const root = worldPath.replace(/\\/g, '/').replace(/\/+$/, '');
	const full = notePath.replace(/\\/g, '/');
	if (!full.startsWith(root + '/') && full !== root) return null;
	const rel = full.slice(root.length).replace(/^\//, '');
	const segments = rel.split('/').filter(Boolean);
	if (segments.length < 2) {
		// only filename → world root
		return null;
	}
	const first = segments[0]!;
	if (first.startsWith('_')) return null;
	return first;
}

/**
 * If ≥ minRatio of notes (and ≥ minNotes) share the same first-level folder → that folder.
 * Otherwise '*'.
 */
export function suggestFolderTarget(
	placements: readonly { worldPath: string; path: string }[],
	minRatio = 0.8,
	minNotes = 2
): Omit<FolderRuleSuggestion, 'entityType'> {
	const uniquePaths = [...new Set(placements.map(p => `${p.worldPath}\0${p.path}`))];
	const noteCount = uniquePaths.length;
	if (noteCount === 0) {
		return {
			targetFolder: '*',
			supportCount: 0,
			noteCount: 0,
			supportRatio: 0,
			topFolder: null,
		};
	}

	const counts = new Map<string, number>();
	for (const key of uniquePaths) {
		const [worldPath, path] = key.split('\0') as [string, string];
		const seg = relativeFirstSegment(worldPath, path);
		if (seg === null) continue; // world root — counts toward noteCount only
		counts.set(seg, (counts.get(seg) ?? 0) + 1);
	}

	let topFolder: string | null = null;
	let topCount = 0;
	for (const [folder, n] of counts) {
		if (n > topCount) {
			topCount = n;
			topFolder = folder;
		}
	}

	const supportCount = topFolder ? topCount : 0;
	const supportRatio = noteCount > 0 ? supportCount / noteCount : 0;

	if (
		topFolder &&
		noteCount >= minNotes &&
		supportRatio >= minRatio
	) {
		return {
			targetFolder: topFolder,
			supportCount,
			noteCount,
			supportRatio,
			topFolder,
		};
	}

	return {
		targetFolder: '*',
		supportCount,
		noteCount,
		supportRatio,
		topFolder,
	};
}

/**
 * Merge inferred rules into existing folder-rules.md body.
 * Types in `updates` replace matching entity-type lines (case-insensitive); others kept.
 * New types are appended.
 */
export function mergeFolderRulesContent(
	existingRaw: string,
	updates: readonly { entityType: string; targetFolder: string }[]
): string {
	const updateByLower = new Map(
		updates.map(u => [u.entityType.toLowerCase(), u] as const)
	);
	const seen = new Set<string>();
	const out: string[] = [];

	for (const line of existingRaw.split(/\r?\n/)) {
		const cleaned = line.replace(/^[-*]\s*/, '').trim();
		if (!cleaned || cleaned.startsWith('#')) {
			out.push(line);
			continue;
		}
		const parts = cleaned.split('|').map(s => s.trim());
		const entityType = parts[0];
		if (!entityType || parts.length < 2) {
			out.push(line);
			continue;
		}
		const lower = entityType.toLowerCase();
		const upd = updateByLower.get(lower);
		if (upd) {
			out.push(`- ${upd.entityType} | ${upd.targetFolder}`);
			seen.add(lower);
		} else {
			out.push(line.startsWith('-') || line.startsWith('*') ? line : `- ${cleaned}`);
		}
	}

	for (const u of updates) {
		if (seen.has(u.entityType.toLowerCase())) continue;
		out.push(`- ${u.entityType} | ${u.targetFolder}`);
	}

	// Trim trailing empty lines, ensure final newline
	while (out.length > 0 && out[out.length - 1]?.trim() === '') out.pop();
	return out.length > 0 ? out.join('\n') + '\n' : '';
}
