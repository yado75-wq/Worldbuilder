import { App, Notice, TFile, TFolder, getAllTags } from 'obsidian';
import { PluginState, FolderRule } from '../types';

interface MoveCandidate {
	file: TFile;
	currentFolder: string;
	targetFolder: string;
	reason: string;
}

export async function syncWorldFiles(
	app: App,
	state: PluginState,
	worldPath: string
): Promise<void> {

	const world = state.worlds.find(w => w.path === worldPath);
	if (!world) {
		new Notice('World not found.');
		return;
	}

	const templateSet = state.templateSets.find(ts => ts.name === world.templateSet)
		?? state.templateSets[0];

	if (!templateSet) {
		new Notice('No template set found.');
		return;
	}

	// Only rules with specific folders (not *)
	const fixedRules = templateSet.folderRules.filter(r => r.targetFolder !== '*');

	// Scan all md files in world, one level deep
	const worldFolder = app.vault.getAbstractFileByPath(worldPath);
	if (!(worldFolder instanceof TFolder)) {
		new Notice('World folder not found.');
		return;
	}

	const candidates: MoveCandidate[] = [];
	const unrecognized: string[] = [];

	// Check all files in all direct subfolders of the world
	for (const child of worldFolder.children) {
		if (!(child instanceof TFolder)) continue;

		for (const item of child.children) {
			if (!(item instanceof TFile)) continue;
			if (item.extension !== 'md') continue;
			if (item.basename === '_index' || item.basename === '_dashboard') continue;

			const cache = app.metadataCache.getFileCache(item);
			const tags = getAllTags(cache ?? {}) ?? [];

			// Normalize tags — remove # prefix
			const normalizedTags = tags.map(t => t.replace('#', ''));

			// Skip generic files
			if (normalizedTags.includes('generic')) continue;

			// Find matching rule by tag
			const matchingRule = findRuleByTag(fixedRules, normalizedTags);

			if (!matchingRule) {
				// No rule matches — unrecognized
				if (normalizedTags.length > 0) {
					unrecognized.push(item.path);
				}
				continue;
			}

			const targetFolderPath = `${worldPath}/${matchingRule.targetFolder}`;

			// Check if file is already in the correct folder
			if (item.parent?.path === targetFolderPath) continue;

			candidates.push({
				file: item,
				currentFolder: item.parent?.name ?? '?',
				targetFolder: matchingRule.targetFolder,
				reason: `tag "${normalizedTags[0]}" → ${matchingRule.targetFolder}`,
			});
		}
	}

	if (candidates.length === 0) {
		const msg = unrecognized.length > 0
			? `All files are in correct folders. ${unrecognized.length} unrecognized file(s) left in place.`
			: 'All files are in correct folders.';
		new Notice(msg);
		return;
	}

	// Build preview and ask confirmation
	const preview = candidates
		.map(c => `• ${c.file.basename}: ${c.currentFolder} → ${c.targetFolder}`)
		.join('\n');

	const confirmed = await askConfirm(
		app,
		`Move ${candidates.length} file(s)?\n\n${preview}`,
		'Move files',
		'Cancel'
	);

	if (!confirmed) return;

	// Move files
	const moved: string[] = [];
	const failed: string[] = [];

	for (const candidate of candidates) {
		const targetPath = `${worldPath}/${candidate.targetFolder}/${candidate.file.name}`;

		// Ensure target folder exists
		const targetFolder = app.vault.getAbstractFileByPath(`${worldPath}/${candidate.targetFolder}`);
		if (!(targetFolder instanceof TFolder)) {
			failed.push(`${candidate.file.basename} (target folder missing)`);
			continue;
		}

		// Check for name conflict
		if (app.vault.getAbstractFileByPath(targetPath)) {
			failed.push(`${candidate.file.basename} (name conflict in target)`);
			continue;
		}

		try {
			await app.fileManager.renameFile(candidate.file, targetPath);
			moved.push(candidate.file.basename);
		} catch {
			failed.push(candidate.file.basename);
		}
	}

	// Summary
	const parts: string[] = [];
	if (moved.length > 0) parts.push(`Moved: ${moved.join(', ')}`);
	if (failed.length > 0) parts.push(`Failed: ${failed.join(', ')}`);
	if (unrecognized.length > 0) parts.push(`Unrecognized (left in place): ${unrecognized.length}`);
	new Notice(parts.join('\n'));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findRuleByTag(
	rules: FolderRule[],
	tags: string[]
): FolderRule | null {
	for (const tag of tags) {
		const rule = rules.find(r => r.entityType.toLowerCase() === tag.toLowerCase());
		if (rule) return rule;
	}
	return null;
}

function askConfirm(
	app: App,
	message: string,
	confirmLabel: string,
	cancelLabel: string
): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new ConfirmModal(app, message, confirmLabel, cancelLabel, resolve);
		modal.open();
	});
}

// Inline confirm modal — avoids importing ConfirmModal which uses Yes/No labels
import { Modal } from 'obsidian';

class ConfirmModal extends Modal {
	private message: string;
	private confirmLabel: string;
	private cancelLabel: string;
	private onResult: (confirmed: boolean) => void;
	private answered = false;

	constructor(
		app: App,
		message: string,
		confirmLabel: string,
		cancelLabel: string,
		onResult: (confirmed: boolean) => void
	) {
		super(app);
		this.message = message;
		this.confirmLabel = confirmLabel;
		this.cancelLabel = cancelLabel;
		this.onResult = onResult;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.titleEl.setText('Sync world files');

		contentEl.createEl('p', {
			text: this.message,
			attr: { style: 'white-space: pre-wrap; font-size: 0.9em;' }
		});

		const btnRow = contentEl.createDiv({
			attr: { style: 'display: flex; gap: 8px; margin-top: 16px;' }
		});

		const confirmBtn = btnRow.createEl('button', {
			text: this.confirmLabel,
			attr: { style: 'flex: 1; padding: 8px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px; cursor: pointer;' }
		});

		const cancelBtn = btnRow.createEl('button', {
			text: this.cancelLabel,
			attr: { style: 'flex: 1; padding: 8px; background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); border-radius: 4px; cursor: pointer;' }
		});

		confirmBtn.addEventListener('click', () => {
			this.answered = true;
			this.close();
			this.onResult(true);
		});

		cancelBtn.addEventListener('click', () => {
			this.answered = true;
			this.close();
			this.onResult(false);
		});

		window.setTimeout(() => confirmBtn.focus(), 50);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.answered) this.onResult(false);
	}
}
