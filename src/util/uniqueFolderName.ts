/**
 * Allocate a free folder name under parentPath ('' = vault root).
 * Pattern: base → `${base} (${importedLabel})` → `${base} (${importedLabel} 2)` → …
 */
export function allocateUniqueFolderName(
	exists: (path: string) => boolean,
	baseName: string,
	parentPath = '',
	importedLabel = 'imported'
): string {
	const join = (name: string) =>
		!parentPath || parentPath === '/' ? name : `${parentPath}/${name}`;

	if (!exists(join(baseName))) return baseName;

	const first = `${baseName} (${importedLabel})`;
	if (!exists(join(first))) return first;

	let n = 2;
	for (;;) {
		const candidate = `${baseName} (${importedLabel} ${n})`;
		if (!exists(join(candidate))) return candidate;
		n += 1;
	}
}