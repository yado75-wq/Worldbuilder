import {
	DisplayType,
	FieldDefinition,	
} from '../types/fields';

import {	
	FolderRule,
	ValidationIssue,
} from '../types';

export interface ParseFieldsResult {
	fields: FieldDefinition[];
	issues: ValidationIssue[];
}

export interface ParseFolderRulesResult {
	rules: FolderRule[];
	issues: ValidationIssue[];
}

function isDisplayType(value: string | undefined): value is DisplayType {
	return value === 'title' || value === 'property' || value === 'section';
}

/**
 * Parse "Fire","Ice","Storm" (optional spaces). Returns null if not a valid quoted list.
 */
function parseQuotedStringList(raw: string): string[] | null {
	const s = raw.trim();
	if (!s) return [];
	const options: string[] = [];
	const re = /"((?:\\.|[^"\\])*)"/g;
	let match: RegExpExecArray | null;
	let lastEnd = 0;
	while ((match = re.exec(s)) !== null) {
		const between = s.slice(lastEnd, match.index).trim();
		if (between !== '' && between !== ',') {
			return null;
		}
		options.push((match[1] ?? '').replace(/\\"/g, '"'));
		lastEnd = match.index + match[0].length;
	}
	if (options.length === 0) return null;
	const tail = s.slice(lastEnd).trim();
	if (tail !== '' && tail !== ',') return null;
	return options;
}

function buildFieldDefinition(
	key: string,
	label: string,
	mode: string,
	typeRaw: string,
	display: DisplayType
): FieldDefinition {
	const mandatory = mode.toLowerCase() === 'mandatory';
	const trimmed = typeRaw.trim();

	if (trimmed.toLowerCase().startsWith('select:')) {
		const payload = trimmed.slice(trimmed.indexOf(':') + 1);
		const options = parseQuotedStringList(payload);
		return {
			key,
			label,
			mandatory,
			display,
			type: 'select',
			options: options ?? [],
		};
	}

	if (trimmed.toLowerCase().startsWith('multiselect:')) {
		const after = trimmed.slice(trimmed.indexOf(':') + 1);
		const kindSep = after.indexOf(':');
		const kind = (kindSep === -1 ? after : after.slice(0, kindSep)).trim().toLowerCase();
		const payload = kindSep === -1 ? '' : after.slice(kindSep + 1).trim();

		if (kind === 'text') {
			const options = parseQuotedStringList(payload);
			return {
				key,
				label,
				mandatory,
				display,
				type: 'multiselect',
				multiKind: 'text',
				options: options ?? [],
			};
		}

		if (kind === 'link') {
			const linkTypes = payload.split('>').map(p => p.trim()).filter(Boolean);
			return {
				key,
				label,
				mandatory,
				display,
				type: 'multiselect',
				multiKind: 'link',
				linkTypes,
				linkFolder: linkTypes[0],
				linkFallback: linkTypes[1],
			};
		}

		// Unknown / timeframe / etc. — still emit a multiselect shell; issues added in vocabulary
		return {
			key,
			label,
			mandatory,
			display,
			type: 'multiselect',
			multiKind: 'text',
			options: [],
		};
	}

	if (trimmed.toLowerCase().startsWith('link:')) {
		const spec = trimmed.slice(trimmed.indexOf(':') + 1);
		const linkTypes = spec.split('>').map(p => p.trim()).filter(Boolean);
		if (linkTypes.length === 0) {
			return { key, label, mandatory, display, type: 'text' };
		}
		return {
			key,
			label,
			mandatory,
			display,
			type: 'link',
			linkTypes,
			linkFolder: linkTypes[0],
			linkFallback: linkTypes[1],
		};
	}

	if (trimmed === 'timeframe' || trimmed.toLowerCase().startsWith('timeframe:')) {
		const spec = trimmed.toLowerCase().startsWith('timeframe:')
			? trimmed.slice(trimmed.indexOf(':') + 1)
			: '';
		const parts = spec.split('>').map(p => p.trim()).filter(Boolean);
		const primary = parts[0];
		const fallback = parts[1];
		return {
			key,
			label,
			mandatory,
			display,
			type: 'timeframe',
			...(primary ? { linkFolder: primary, linkFallback: fallback } : {}),
		};
	}

	return { key, label, mandatory, display, type: 'text' };
}

/**
 * Parse *_Fields.md body. Malformed lines and duplicate keys → warnings with line numbers.
 * First definition of a key wins.
 */
export function parseFieldsWithIssues(raw: string, fileName: string): ParseFieldsResult {
	const fields: FieldDefinition[] = [];
	const issues: ValidationIssue[] = [];
	const seenKeys = new Set<string>();
	const lines = raw.split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		const lineNo = i + 1;
		const cleaned = (lines[i] ?? '').replace(/^[-*]\s*/, '').trim();
		if (!cleaned || cleaned.startsWith('#')) continue;

		const parts = cleaned.split('|').map(s => s.trim());
		const key = parts[0];
		const label = parts[1];
		const mode = parts[2];
		const typeRaw = parts[3];
		const displayRaw = parts[4];

		if (!key || !label || !mode || !typeRaw) {
			issues.push({
				severity: 'warning',
				kind: 'malformed-line',
				file: fileName,
				line: lineNo,
				message: 'Skipped malformed field line (need key|label|mode|type|display).',
			});
			continue;
		}

		if (seenKeys.has(key)) {
			issues.push({
				severity: 'warning',
				kind: 'duplicate-field-key',
				file: fileName,
				line: lineNo,
				message: `Duplicate field key "${key}" — first definition is kept.`,
			});
			continue;
		}
		
        seenKeys.add(key);
		issues.push(...vocabularyIssues(fileName, lineNo, mode, typeRaw, displayRaw));
		const display = isDisplayType(displayRaw) ? displayRaw : 'property';
		fields.push(buildFieldDefinition(key, label, mode, typeRaw, display));
	}

	return { fields, issues };
}

const MODES = new Set(['mandatory', 'optional']);
const DISPLAYS = new Set(['title', 'property', 'section']);
const TYPE_BASES = new Set(['text', 'number', 'select', 'link', 'timeframe', 'multiselect']);

function vocabularyIssues(
	fileName: string,
	lineNo: number,
	mode: string,
	typeRaw: string,
	displayRaw: string | undefined
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const trimmed = typeRaw.trim();

	if (!MODES.has(mode.toLowerCase())) {
		issues.push({
			severity: 'warning',
			kind: 'malformed-line',
			file: fileName,
			line: lineNo,
			message: `Unknown mode "${mode}" (use mandatory or optional).`,
		});
	}

	const base = typeBase(trimmed);
	if (!TYPE_BASES.has(base)) {
		issues.push({
			severity: 'warning',
			kind: 'malformed-line',
			file: fileName,
			line: lineNo,
			message: `Unknown type "${typeRaw}" (use text, number, select:…, link:…, multiselect:…, timeframe).`,
		});
	}

	if (displayRaw && displayRaw.trim() && !DISPLAYS.has(displayRaw.toLowerCase())) {
		issues.push({
			severity: 'warning',
			kind: 'malformed-line',
			file: fileName,
			line: lineNo,
			message: `Unknown display "${displayRaw}" (use title, property, section).`,
		});
	}

	if (base === 'select') {
		const payload = trimmed.slice(trimmed.indexOf(':') + 1);
		if (parseQuotedStringList(payload) === null) {
			issues.push({
				severity: 'warning',
				kind: 'malformed-line',
				file: fileName,
				line: lineNo,
				message: 'select: options must be a quoted list, e.g. select:"Fire","Ice".',
			});
		}
	}

	if (base === 'multiselect') {
		const after = trimmed.slice(trimmed.indexOf(':') + 1);
		const kindSep = after.indexOf(':');
		const kind = (kindSep === -1 ? after : after.slice(0, kindSep)).trim().toLowerCase();
		const payload = kindSep === -1 ? '' : after.slice(kindSep + 1).trim();

		if (kind === 'timeframe' || kind.startsWith('timeframe')) {
			issues.push({
				severity: 'warning',
				kind: 'malformed-line',
				file: fileName,
				line: lineNo,
				message: 'multiselect does not support timeframe (use a single timeframe field).',
			});
		} else if (kind === 'text') {
			if (parseQuotedStringList(payload) === null) {
				issues.push({
					severity: 'warning',
					kind: 'malformed-line',
					file: fileName,
					line: lineNo,
					message: 'multiselect:text: options must be a quoted list, e.g. multiselect:text:"A","B".',
				});
			}
		} else if (kind === 'link') {
			if (!payload.split('>').map(p => p.trim()).filter(Boolean).length) {
				issues.push({
					severity: 'warning',
					kind: 'malformed-line',
					file: fileName,
					line: lineNo,
					message: 'multiselect:link: needs a type chain, e.g. multiselect:link:Weapon>Armor.',
				});
			}
		} else if (kind !== '') {
			issues.push({
				severity: 'warning',
				kind: 'malformed-line',
				file: fileName,
				line: lineNo,
				message: `Unknown multiselect kind "${kind}" (use text or link).`,
			});
		} else {
			issues.push({
				severity: 'warning',
				kind: 'malformed-line',
				file: fileName,
				line: lineNo,
				message: 'multiselect requires a kind: multiselect:text:… or multiselect:link:….',
			});
		}
	}

	return issues;
}

/**
 * Parse folder-rules.md. Malformed lines and duplicate entityType / targetFolder (non-*) → warnings.
 */
export function parseFolderRulesWithIssues(
	raw: string,
	fileName = 'folder-rules.md'
): ParseFolderRulesResult {
	const rules: FolderRule[] = [];
	const issues: ValidationIssue[] = [];
	const seenTypes = new Set<string>();
	const seenFolders = new Set<string>();
	const lines = raw.split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		const lineNo = i + 1;
		const cleaned = (lines[i] ?? '').replace(/^[-*]\s*/, '').trim();
		if (!cleaned || cleaned.startsWith('#')) continue;

		const parts = cleaned.split('|').map(s => s.trim());
		const entityType = parts[0];
		const targetFolder = parts[1];

		if (!entityType || !targetFolder) {
			issues.push({
				severity: 'warning',
				kind: 'malformed-line',
				file: fileName,
				line: lineNo,
				message: 'Skipped malformed rule (need EntityType | Folder).',
			});
			continue;
		}

		if (seenTypes.has(entityType)) {
			issues.push({
				severity: 'warning',
				kind: 'duplicate-folder-rule',
				file: fileName,
				line: lineNo,
				message: `Duplicate entity type "${entityType}" in folder-rules.`,
			});
		} else {
			seenTypes.add(entityType);
		}

		if (targetFolder !== '*' && seenFolders.has(targetFolder)) {
			issues.push({
				severity: 'warning',
				kind: 'duplicate-folder-rule',
				file: fileName,
				line: lineNo,
				message: `Duplicate target folder "${targetFolder}" in folder-rules.`,
			});
		} else if (targetFolder !== '*') {
			seenFolders.add(targetFolder);
		}

		rules.push({ entityType, targetFolder });
	}

	return { rules, issues };
}

function typeBase(typeRaw: string): string {
	const t = typeRaw.trim().toLowerCase();
	const colon = t.indexOf(':');
	return colon === -1 ? t : t.slice(0, colon);
}

