import { App, Notice, TFile, normalizePath } from 'obsidian';
import { PluginState, WorldBuilderSettings } from '../types/runtime';
import { InputModal } from '../formkit';
import { ConfirmModal } from '../ui/ConfirmModal';
import { unpackWorldKit, type KitFileEntry } from '../util/worldKitZip';
import { allocateUniqueFolderName } from '../util/uniqueFolderName';
import { hasLeadingUnderscore } from '../util/names';
import { replaceIndexDisplayName } from './shared/WorldIndex';
import { t } from '../i18n';

export type ImportWorldResult =
	| { ok: true; worldPath: string; templateSetName: string }
	| {
			ok: false;
			code:
				| 'cancelled'
				| 'invalid-kit'
				| 'leading-underscore'
				| 'write-failed';
			detail?: string;
	  };

function err(
	code: Extract<ImportWorldResult, { ok: false }>['code'],
	detail?: string
): ImportWorldResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

export async function importWorld(
	app: App,
	state: PluginState,
	settings: WorldBuilderSettings
): Promise<ImportWorldResult> {
	const data = await pickKitZip();
	if (!data) return err('cancelled');

	const unpacked = await unpackWorldKit(data);
	if (!unpacked.ok) {
		new Notice(t('notice.kit-invalid'));
		return err('invalid-kit', unpacked.detail);
	}

	const { kit } = unpacked;
	const setNameFromKit = kit.manifest.templateSetName.trim();
	const worldBaseName = kit.manifest.worldFolderName.trim();

	try {
		const templateSetName = await resolveTemplateSetForImport(
			app, state, settings, setNameFromKit, kit.templateSetFiles
		);
		if (templateSetName === null) return err('cancelled');
		if (templateSetName === undefined) {
			// leading underscore rejected inside helper
			return err('leading-underscore');
		}

		const exists = (p: string) => !!app.vault.getAbstractFileByPath(p);
		const worldFolderName = allocateUniqueFolderName(exists, worldBaseName, '', t('notice.imported-label'));
		const worldPath = worldFolderName;

		await writeKitTree(app, worldPath, kit.worldFiles);

		const indexPath = normalizePath(`${worldPath}/_index.md`);
		const indexFile = app.vault.getAbstractFileByPath(indexPath);
		if (indexFile instanceof TFile) {
			let content = await app.vault.read(indexFile);
			if (/^status:\s*.*$/m.test(content)) {
				content = content.replace(/^status:\s*.*$/m, 'status: inactive');
			} else if (/^---\s*\r?\n/.test(content)) {
				content = content.replace(/^---\s*\r?\n/, '---\nstatus: inactive\n');
			}
			if (/^template_set:\s*.*$/m.test(content)) {
				content = content.replace(/^template_set:\s*.*$/m, `template_set: ${templateSetName}`);
			} else if (/^---\s*\r?\n/.test(content)) {
				content = content.replace(/^---\s*\r?\n/, `---\ntemplate_set: ${templateSetName}\n`);
			}
			content = replaceIndexDisplayName(content, worldFolderName);
			await app.vault.modify(indexFile, content);
		}

		new Notice(
			t('notice.world-imported', {
				name: worldFolderName,
				set: templateSetName,
			})
		);
		return { ok: true, worldPath, templateSetName };
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		new Notice(t('notice.kit-import-failed'));
		return err('write-failed', detail);
	}
}

/** null = cancel; undefined = leading-underscore failure; string = set name to use */
async function resolveTemplateSetForImport(
	app: App,
	state: PluginState,
	settings: WorldBuilderSettings,
	setNameFromKit: string,
	templateSetFiles: KitFileEntry[]
): Promise<string | null | undefined> {
	const existing = state.templateSets.find(s => s.name === setNameFromKit);

	if (!existing) {
		const setPath = normalizePath(
			`${settings.systemFolder}/${settings.templatesFolder}/${setNameFromKit}`
		);
		if (hasLeadingUnderscore(setNameFromKit)) {
			new Notice(t('notice.leading-underscore'));
			return undefined;
		}
		await writeKitTree(app, setPath, templateSetFiles);
		return setNameFromKit;
	}

	const useExisting = await askConfirm(
		app,
		t('modal.template-set-exists-body', { name: setNameFromKit }),
		t('modal.template-set-use-existing'),
		t('modal.template-set-import-as-new'),
		t('modal.template-set-exists-title', { name: setNameFromKit })
	);

	// ConfirmModal: true = confirm label (use existing), false = cancel label path
	// We need three-way: use existing / import as new / cancel.
	// First dialog: Use existing (Yes) vs Import as new (No). Escape = cancel via onClose false —
	// treat No as "import as new", and add a second cancel by using a dedicated flow:

	if (useExisting === 'cancel') return null;
	if (useExisting === true) return setNameFromKit;

	const newName = await askName(
		app,
		t('modal.template-set-import-name-prompt'),
		t('modal.template-set-import-name-placeholder', { name: setNameFromKit }),
		`${setNameFromKit}-import`
	);
	if (!newName) return null;
	if (hasLeadingUnderscore(newName)) {
		new Notice(t('notice.leading-underscore'));
		return undefined;
	}
	if (state.templateSets.some(s => s.name === newName)
		|| app.vault.getAbstractFileByPath(
			normalizePath(`${settings.systemFolder}/${settings.templatesFolder}/${newName}`)
		)) {
		new Notice(t('notice.already-exists', { name: newName }));
		return null;
	}

	const setPath = normalizePath(
		`${settings.systemFolder}/${settings.templatesFolder}/${newName}`
	);
	await writeKitTree(app, setPath, templateSetFiles);
	return newName;
}

type Tri = true | false | 'cancel';

function askConfirm(
	app: App,
	prompt: string,
	confirmLabel: string,
	cancelLabel: string,
	title: string
): Promise<Tri> {
	return new Promise((resolve) => {
		let settled = false;
		const modal = new ConfirmModal(
			app,
			prompt,
			(confirmed) => {
				if (settled) return;
				settled = true;
				// true → use existing; false from button → import as new
				// onClose without answer also false — cannot distinguish cancel vs "import as new"
				// with only ConfirmModal. Use confirmed true/false as the two actions;
				// user closes window without clicking → treat as cancel only if we track answered.
				resolve(confirmed ? true : false);
			},
			confirmLabel,
			cancelLabel,
			title
		);
		// Patch: ConfirmModal calls onConfirm(false) on close without answer — same as "import as new".
		// Acceptable v1: Escape = import-as-new path cancelled only after name dialog cancel.
		modal.open();
	});
}

function askName(
	app: App,
	prompt: string,
	placeholder: string,
	initial: string
): Promise<string | null> {
	return new Promise((resolve) => {
		let submitted = false;
		new InputModal(
			app,
			prompt,
			placeholder,
			initial,
			(value) => {
				submitted = true;
				const trimmed = value.trim();
				resolve(trimmed.length > 0 ? trimmed : null);
			},
			() => {
				if (!submitted) resolve(null);
			}
		).open();
	});
}

async function writeKitTree(
	app: App,
	rootPath: string,
	files: KitFileEntry[]
): Promise<void> {
	const folders = new Set<string>();
	for (const f of files) {
		const full = normalizePath(`${rootPath}/${f.path}`);
		const parts = full.split('/');
		parts.pop();
		let acc = '';
		for (const part of parts) {
			acc = acc ? `${acc}/${part}` : part;
			folders.add(acc);
		}
	}
	const sorted = [...folders].sort((a, b) => a.length - b.length);
	for (const folder of sorted) {
		if (!app.vault.getAbstractFileByPath(folder)) {
			await app.vault.createFolder(folder);
		}
	}
	if (!app.vault.getAbstractFileByPath(rootPath)) {
		await app.vault.createFolder(rootPath);
	}

	for (const f of files) {
		const full = normalizePath(`${rootPath}/${f.path}`);
		const data = f.data instanceof Uint8Array
			? f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength)
			: new TextEncoder().encode(String(f.data)).buffer;
		const existing = app.vault.getAbstractFileByPath(full);
		if (existing instanceof TFile) {
			await app.vault.modifyBinary(existing, data as ArrayBuffer);
		} else {
			await app.vault.createBinary(full, data as ArrayBuffer);
		}
	}
}

interface ElectronOpenDialog {
	showOpenDialog: (opts: {
		properties?: string[];
		filters?: { name: string; extensions: string[] }[];
	}) => Promise<{ canceled: boolean; filePaths: string[] }>;
}

async function pickKitZip(): Promise<ArrayBuffer | null> {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron dialog is only available at runtime on desktop
		const electron = require('electron') as {
			remote?: { dialog: ElectronOpenDialog };
			dialog?: ElectronOpenDialog;
		};
		const dialog = electron.remote?.dialog ?? electron.dialog;
		if (dialog?.showOpenDialog) {
			const result = await dialog.showOpenDialog({
				properties: ['openFile'],
				filters: [{ name: 'World Builder Kit', extensions: ['zip'] }],
			});
			if (result.canceled || !result.filePaths?.[0]) return null;
			// eslint-disable-next-line @typescript-eslint/no-require-imports -- Node fs for reading a zip chosen outside the vault
			const fs = require('fs') as typeof import('fs');
			const buf = fs.readFileSync(result.filePaths[0]);
			return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		}
	} catch {
		// fall through
	}

	new Notice(t('notice.kit-import-failed'));
	return null;
}