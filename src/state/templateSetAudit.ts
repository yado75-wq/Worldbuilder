import { FieldDefinition } from '../formkit';
import { TemplateSetInfo, ValidationIssue } from '../types/templateSet';
import { WorldInfo } from '../types/world';

/** Worlds whose template_set frontmatter equals this set name. */
export function worldsUsingTemplateSet(
	worlds: readonly WorldInfo[],
	setName: string
): WorldInfo[] {
	return worlds.filter(w => w.templateSet === setName);
}

function fieldSetHasType(
	fieldSets: Record<string, FieldDefinition[]>,
	typeName: string
): boolean {
	if (typeName in fieldSets) return true;
	const lower = typeName.toLowerCase();
	return Object.keys(fieldSets).some(k => k.toLowerCase() === lower);
}

/** Link / multiselect:link chain members referenced from field definitions. */
export function collectLinkTargetTypes(fields: readonly FieldDefinition[]): string[] {
	const types: string[] = [];
	for (const field of fields) {
		if (field.type === 'link' && field.linkTypes?.length) {
			types.push(...field.linkTypes);
		}
		if (
			field.type === 'multiselect' &&
			field.multiKind === 'link' &&
			field.linkTypes?.length
		) {
			types.push(...field.linkTypes);
		}
	}
	return types;
}

/**
 * Errors when a link target type has no matching *_Fields.md in the same set.
 * WorldMeta is never a valid entity link target for this check if referenced —
 * still reported missing unless a WorldMeta_Fields-derived key exists (it does as WorldMeta).
 */
export function missingLinkTargetIssues(
	fieldSets: Record<string, FieldDefinition[]>
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const seen = new Set<string>();

	for (const [typeName, fields] of Object.entries(fieldSets)) {
		const file = `${typeName}_Fields.md`;
		for (const target of collectLinkTargetTypes(fields)) {
			if (fieldSetHasType(fieldSets, target)) continue;
			const key = `${file}::${target}`;
			if (seen.has(key)) continue;
			seen.add(key);
			issues.push({
				severity: 'error',
				kind: 'link-target-missing',
				file,
				message: `Link target "${target}" has no ${target}_Fields.md in this template set.`,
			});
		}
	}

	return issues;
}

/** Types present in fieldSets but not named in any folder-rules row ( * placement ). */
export function fieldsWithoutRuleIssues(
	fieldSets: Record<string, FieldDefinition[]>,
	folderRules: readonly { entityType: string }[]
): ValidationIssue[] {
	const mentioned = new Set(folderRules.map(r => r.entityType));
	const issues: ValidationIssue[] = [];

	for (const typeName of Object.keys(fieldSets)) {
		if (typeName.toLowerCase() === 'worldmeta') continue;
		if (mentioned.has(typeName)) continue;
		// case-insensitive mention
		if ([...mentioned].some(m => m.toLowerCase() === typeName.toLowerCase())) {
			continue;
		}
		issues.push({
			severity: 'info',
			kind: 'fields-without-rule',
			file: `${typeName}_Fields.md`,
			message: `"${typeName}" has no folder-rules row; placement is * (create anywhere under the world).`,
		});
	}

	return issues;
}

export interface TemplateSetAuditResult {
	setName: string;
	usedBy: WorldInfo[];
	issues: ValidationIssue[];
	errorCount: number;
	warningCount: number;
	infoCount: number;
}

/**
 * Read-only report for one template set: bindings + issues already on the set
 * (caller should run after scan so link-target / schema issues are present).
 */
export function auditTemplateSet(
	set: TemplateSetInfo,
	worlds: readonly WorldInfo[]
): TemplateSetAuditResult {
	const usedBy = worldsUsingTemplateSet(worlds, set.name);
	const issues = set.issues;
	return {
		setName: set.name,
		usedBy,
		issues,
		errorCount: issues.filter(i => i.severity === 'error').length,
		warningCount: issues.filter(i => i.severity === 'warning').length,
		infoCount: issues.filter(i => i.severity === 'info').length,
	};
}
