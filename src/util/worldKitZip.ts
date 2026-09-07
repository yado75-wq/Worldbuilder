import JSZip from 'jszip';

export const KIT_FORMAT_VERSION = 1;
export const KIT_PLUGIN_ID = 'world-builder-tools';
export const MANIFEST_NAME = 'worldbuilder-kit.json';

export interface WorldKitManifest {
	formatVersion: number;
	pluginId: string;
	exportedAt: string;
	worldFolderName: string;
	templateSetName: string;
	pluginVersion?: string;
}

export type KitFileEntry = { path: string; data: string | Uint8Array };

export interface ParsedWorldKit {
	manifest: WorldKitManifest;
	/** paths relative to world/ */
	worldFiles: KitFileEntry[];
	/** paths relative to template-set/ */
	templateSetFiles: KitFileEntry[];
}

export function buildManifest(input: {
	worldFolderName: string;
	templateSetName: string;
	pluginVersion?: string;
}): WorldKitManifest {
	return {
		formatVersion: KIT_FORMAT_VERSION,
		pluginId: KIT_PLUGIN_ID,
		exportedAt: new Date().toISOString(),
		worldFolderName: input.worldFolderName,
		templateSetName: input.templateSetName,
		pluginVersion: input.pluginVersion,
	};
}

export async function packWorldKit(input: {
	manifest: WorldKitManifest;
	worldFiles: KitFileEntry[];
	templateSetFiles: KitFileEntry[];
}): Promise<ArrayBuffer> {
	const zip = new JSZip();
	zip.file(MANIFEST_NAME, JSON.stringify(input.manifest, null, 2));

	for (const f of input.worldFiles) {
		zip.file(`world/${f.path.replace(/^\/+/, '')}`, f.data);
	}
	for (const f of input.templateSetFiles) {
		zip.file(`template-set/${f.path.replace(/^\/+/, '')}`, f.data);
	}

	return zip.generateAsync({ type: 'arraybuffer' });
}

export async function unpackWorldKit(data: ArrayBuffer): Promise<
	| { ok: true; kit: ParsedWorldKit }
	| { ok: false; code: 'invalid-kit'; detail?: string }
> {
	let zip: JSZip;
	try {
		zip = await JSZip.loadAsync(data);
	} catch {
		return { ok: false, code: 'invalid-kit', detail: 'not-zip' };
	}

	const manifestFile = zip.file(MANIFEST_NAME);
	if (!manifestFile) {
		return { ok: false, code: 'invalid-kit', detail: 'missing-manifest' };
	}

	let manifest: WorldKitManifest;
	try {
		manifest = JSON.parse(await manifestFile.async('string')) as WorldKitManifest;
	} catch {
		return { ok: false, code: 'invalid-kit', detail: 'bad-manifest-json' };
	}

	if (manifest.pluginId !== KIT_PLUGIN_ID) {
		return { ok: false, code: 'invalid-kit', detail: 'plugin-id' };
	}
	if (manifest.formatVersion !== KIT_FORMAT_VERSION) {
		return { ok: false, code: 'invalid-kit', detail: 'format-version' };
	}
	if (!manifest.worldFolderName?.trim() || !manifest.templateSetName?.trim()) {
		return { ok: false, code: 'invalid-kit', detail: 'names' };
	}

	const worldFiles: KitFileEntry[] = [];
	const templateSetFiles: KitFileEntry[] = [];

	const files = Object.keys(zip.files);
	for (const path of files) {
		const entry = zip.files[path];
		if (!entry || entry.dir) continue;
		if (path === MANIFEST_NAME) continue;

		if (path.startsWith('world/')) {
			const rel = path.slice('world/'.length);
			if (!rel) continue;
			worldFiles.push({ path: rel, data: await entry.async('uint8array') });
		} else if (path.startsWith('template-set/')) {
			const rel = path.slice('template-set/'.length);
			if (!rel) continue;
			templateSetFiles.push({ path: rel, data: await entry.async('uint8array') });
		}
	}

	if (worldFiles.length === 0) {
		return { ok: false, code: 'invalid-kit', detail: 'empty-world' };
	}

	return {
		ok: true,
		kit: { manifest, worldFiles, templateSetFiles },
	};
}