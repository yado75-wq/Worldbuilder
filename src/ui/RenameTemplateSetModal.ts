import { App, Modal, Setting } from 'obsidian';
import { WorldInfo } from '../types/world';
import { t } from '../i18n';

/**
 * Live→live rename: clone hint + world checkboxes (default all checked).
 * Resolves with selected world paths, or null if cancelled.
 */
export class RenameTemplateSetWorldModal extends Modal {
	private oldName: string;
	private newName: string;
	private worlds: WorldInfo[];
	private defaultsWarning: boolean;
	private onDone: (selectedPaths: string[] | null) => void;
	private selected: Set<string>;
	private answered = false;

	constructor(
		app: App,
		opts: {
			oldName: string;
			newName: string;
			worlds: WorldInfo[];
			defaultsWarning: boolean;
			onDone: (selectedPaths: string[] | null) => void;
		}
	) {
		super(app);
		this.oldName = opts.oldName;
		this.newName = opts.newName;
		this.worlds = opts.worlds;
		this.defaultsWarning = opts.defaultsWarning;
		this.onDone = opts.onDone;
		this.selected = new Set(opts.worlds.map(w => w.path));
	}

	onOpen(): void {
		const { contentEl } = this;
		this.titleEl.setText(
			t('modal.rename-template-title', {
				old: this.oldName,
				new: this.newName,
			})
		);

		contentEl.createEl('p', {
			text: t('modal.rename-template-clone-hint'),
			cls: 'wb-confirm-prompt',
		});

		if (this.defaultsWarning) {
			contentEl.createEl('p', {
				text: t('modal.rename-template-defaults-warn'),
				cls: 'wb-confirm-prompt',
			});
		}

		if (this.worlds.length === 0) {
			contentEl.createEl('p', {
				text: t('modal.rename-template-no-worlds'),
				cls: 'wb-confirm-prompt',
			});
		} else {
			contentEl.createEl('p', {
				text: t('modal.rename-template-worlds-intro', {
					old: this.oldName,
				}),
				cls: 'wb-confirm-prompt',
			});

			for (const world of this.worlds) {
				const path = world.path;
				const label =
					world.status === 'active'
						? `${world.name} ★ · ${world.path}`
						: `${world.name} · ${world.path}`;
				new Setting(contentEl).setName(label).addToggle(toggle => {
					toggle.setValue(this.selected.has(path));
					toggle.onChange(on => {
						if (on) this.selected.add(path);
						else this.selected.delete(path);
					});
				});
			}

			contentEl.createEl('p', {
				text: t('modal.rename-template-unchecked-hint'),
				cls: 'wb-confirm-prompt',
			});
		}

		const btnRow = contentEl.createDiv({ cls: 'wb-confirm-btn-row' });
		const confirmBtn = btnRow.createEl('button', {
			text: t('modal.rename-template-ok'),
			cls: 'wb-confirm-btn wb-confirm-btn-primary',
		});
		const cancelBtn = btnRow.createEl('button', {
			text: t('form.cancel'),
			cls: 'wb-confirm-btn wb-confirm-btn-secondary',
		});

		confirmBtn.addEventListener('click', () => {
			this.answered = true;
			this.close();
			this.onDone([...this.selected]);
		});
		cancelBtn.addEventListener('click', () => {
			this.answered = true;
			this.close();
			this.onDone(null);
		});

		window.setTimeout(() => confirmBtn.focus(), 50);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.answered) this.onDone(null);
	}
}
