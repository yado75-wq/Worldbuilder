import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { FakeVault, resetFakeObsidian, asTFile, asTFolder } from '../../fakes/obsidian';
import {
	replaceIndexDisplayName,
	syncWorldNameToFolder,
	worldFolderName,
} from '../../../src/commands/shared/WorldIndex';
import { WorldInfo } from '../../../src/types/world';

function makeWorld(app: App, folderPath: string, indexContent: string): WorldInfo {
	const vault = app.vault as unknown as FakeVault;
	const indexPath = `${folderPath}/_index.md`;
	const indexFile = asTFile(vault.seedFile(indexPath, indexContent));
	const folder = asTFolder(app.vault.getAbstractFileByPath(folderPath)!);
	return {
		name: 'Display',
		path: folderPath,
		folder,
		indexFile,
		status: 'active',
		templateSet: 'defaults',		
		worldTemplate: [],
	};
}

describe('replaceIndexDisplayName', () => {
	it('updates name: and heading', () => {
		const input =
			'---\ntags:\n  - world\nstatus: active\nname: "Old"\n---\n\n# Old\n';
		const out = replaceIndexDisplayName(input, 'New');
		expect(out).toContain('name: "New"');
		expect(out).toContain('# New');
		expect(out).not.toContain('name: "Old"');
	});

	it('inserts name: when missing from frontmatter', () => {
		const input = '---\nstatus: active\n---\n\n# Something\n';
		const out = replaceIndexDisplayName(input, 'New');
		expect(out).toContain('name: "New"');
		expect(out).toContain('# New');
	});
});

describe('syncWorldNameToFolder', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
	});

	it('rewrites index when display name differs from folder name', async () => {
		const vault = app.vault as unknown as FakeVault;
		const world = makeWorld(
			app,
			'Michail',
			'---\ntags:\n  - world\nstatus: active\nname: "Misko"\n---\n\n# Misko\n'
		);

		const ok = await syncWorldNameToFolder(app, world);

		expect(ok).toBe(true);
		expect(worldFolderName(world)).toBe('Michail');
		const content = vault.contentAt('Michail/_index.md') ?? '';
		expect(content).toContain('name: "Michail"');
		expect(content).toContain('# Michail');
	});

	it('returns true and leaves content when already aligned', async () => {
		const vault = app.vault as unknown as FakeVault;
		const world = makeWorld(
			app,
			'Misko',
			'---\nstatus: active\nname: "Misko"\n---\n\n# Misko\n'
		);

		const before = vault.contentAt('Misko/_index.md');
		const ok = await syncWorldNameToFolder(app, world);

		expect(ok).toBe(true);
		expect(vault.contentAt('Misko/_index.md')).toBe(before);
	});
});