/**
 * Leading "_" marks archive/system identity (worlds, template sets).
 * Plugin-created identities must not use it.
 */
export function hasLeadingUnderscore(name: string): boolean {
	return name.trimStart().startsWith('_');
}