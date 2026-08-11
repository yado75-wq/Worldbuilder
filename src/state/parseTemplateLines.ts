import {
	DisplayType,
	FieldDefinition,
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
			key,
			label,
			mandatory,
			display,
			type: 'select',
			options: typeRaw.slice(7).split(',').map(s => s.trim()).filter(Boolean),
		};
	}

	if (typeRaw.startsWith('link:')) {
		const spec = typeRaw.slice(5);
		const parts = spec.split('>').map(s => s.trim()).filter(Boolean);
		const primary = parts[0];
		if (!primary) {
			return { key, label, mandatory, display, type: 'text' };
		}
		return {
			key,
			label,
			mandatory,
			display,
			type: 'link',
			linkFolder: primary,
			linkFallback: parts[1],
		};
	}

	if (typeRaw === 'timeframe' || typeRaw.startsWith('timeframe:')) {
		const spec = typeRaw.startsWith('timeframe:') ? typeRaw.slice(10) : '';
		const parts = spec.split('>').map(s => s.trim()).filter(Boolean);
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
const TYPE_BASES = new Set(['text', 'number', 'select', 'link', 'timeframe']);

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

/** Vocabulary checks for one field line. Does not decide whether to keep the field. */
function vocabularyIssues(
	fileName: string,
	lineNo: number,
	mode: string,
	typeRaw: string,
	displayRaw: string | undefined
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	if (!MODES.has(mode.toLowerCase())) {
		issues.push({
			severity: 'warning',
			kind: 'malformed-line',
			file: fileName,
			line: lineNo,
			message: `Unknown mode "${mode}" (use mandatory or optional).`,
		});
	}

	const base = typeBase(typeRaw);
	if (!TYPE_BASES.has(base)) {
		issues.push({
			severity: 'warning',
			kind: 'malformed-line',
			file: fileName,
			line: lineNo,
			message: `Unknown type "${typeRaw}" (use text, number, select:…, link:…, timeframe).`,
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

	return issues;
}