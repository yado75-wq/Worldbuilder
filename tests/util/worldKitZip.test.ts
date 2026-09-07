import { describe, expect, it } from 'vitest';
import {
	buildManifest,
	packWorldKit,
	unpackWorldKit,
	KIT_PLUGIN_ID,
} from '../../src/util/worldKitZip';

describe('worldKitZip', () => {
	it('round-trips manifest and files', async () => {
		const manifest = buildManifest({
			worldFolderName: 'michal',
			templateSetName: 'fantasy',
			pluginVersion: '1.0.4',
		});

		const buf = await packWorldKit({
			manifest,
			worldFiles: [
				{ path: '_index.md', data: '---\ntags:\n  - world\n---\n' },
				{ path: 'Characters/Aria.md', data: '# Aria\n' },
			],
			templateSetFiles: [
				{ path: 'Character_Fields.md', data: 'name | Name | mandatory | text | title\n' },
			],
		});

		const parsed = await unpackWorldKit(buf);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		expect(parsed.kit.manifest.pluginId).toBe(KIT_PLUGIN_ID);
		expect(parsed.kit.manifest.worldFolderName).toBe('michal');
		expect(parsed.kit.manifest.templateSetName).toBe('fantasy');
		expect(parsed.kit.worldFiles.map(f => f.path).sort()).toEqual([
			'Characters/Aria.md',
			'_index.md',
		]);
		expect(parsed.kit.templateSetFiles.map(f => f.path)).toEqual([
			'Character_Fields.md',
		]);
	});

	it('rejects non-zip data', async () => {
		const enc = new TextEncoder();
		const result = await unpackWorldKit(enc.encode('not a zip').buffer);
		expect(result).toMatchObject({ ok: false, code: 'invalid-kit' });
	});
});