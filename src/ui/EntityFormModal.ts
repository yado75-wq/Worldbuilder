import { App, Modal, Setting } from 'obsidian';
import { FieldDefinition, FormResult } from '../types';
import { InputModal } from './InputModal';

export interface EntityFormModalOptions {
	title: string;
	fields: FieldDefinition[];
	prefill: Record<string, string>;
	linkCandidates: Record<string, string[]>;
	onSubmit: (result: FormResult) => void;
	onCancel: () => void;
	onCreateLink?: (field: FieldDefinition, name: string) => Promise<string | null>;
}

export class EntityFormModal extends Modal {
	private options: EntityFormModalOptions;
	private values: Record<string, string> = {};
	private submitted = false;

	constructor(app: App, options: EntityFormModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl, options } = this;
		const { title, fields, prefill, linkCandidates } = options;

		this.titleEl.setText(title);

		// Initialize values from prefill
		for (const f of fields) {
			this.values[f.key] = prefill[f.key] ?? '';
		}

		// Build a Setting for each field
		for (const f of fields) {
			const isRequired = f.display === 'title';
			const name = f.label + (isRequired ? ' *' : '');

			if (f.type === 'select' && f.options) {
				new Setting(contentEl)
					.setName(name)
					.addDropdown(drop => {
						for (const opt of f.options ?? []) {
							drop.addOption(opt, opt);
						}
						drop.setValue(this.values[f.key] ?? f.options?.[0] ?? '');
						drop.onChange(value => { this.values[f.key] = value; });
					});

			} else if (f.type === 'link') {
				const candidates = linkCandidates[f.key] ?? [];
				new Setting(contentEl)
					.setName(name)
					.addDropdown(drop => {
						const UNDEFINED = '— None / not yet defined —';
						const CREATE_VALUE = '__create__';
						const createLabel = `Create new ${f.linkFolder ?? 'item'}…`;
						drop.addOption(UNDEFINED, UNDEFINED);
						for (const c of candidates) {
							drop.addOption(c, c);
						}
						if (this.options.onCreateLink) {
							drop.addOption(CREATE_VALUE, createLabel);
						}
						const current = this.values[f.key]?.replace(/^\[\[|\]\]$/g, '') ?? '';
						drop.setValue(candidates.includes(current) ? current : UNDEFINED);
						drop.onChange(value => {
							void (async () => {
								if (value === CREATE_VALUE) {
									const created = await this.createLinkValue(f);
									if (created) {
										const createdName = created.replace(/^\[\[|\]\]$/g, '');
										drop.addOption(createdName, createdName);
										drop.setValue(createdName);
										this.values[f.key] = created;
									} else {
										drop.setValue(candidates.includes(current) ? current : UNDEFINED);
									}
									return;
								}
								this.values[f.key] = value === UNDEFINED ? '' : `[[${value}]]`;
							})();
						});
					});

			} else if (f.display === 'section') {
				new Setting(contentEl)
					.setName(name)
					.addTextArea(area => {
						area.setValue(this.values[f.key] ?? '');
						area.onChange(value => { this.values[f.key] = value; });
						area.inputEl.rows = 4;
						area.inputEl.addClass('wb-full-width');
					});

			} else {
				new Setting(contentEl)
					.setName(name)
					.addText(text => {
						text.setValue(this.values[f.key] ?? '');
						text.onChange(value => { this.values[f.key] = value; });
						text.inputEl.addClass('wb-full-width');
						if (f.display === 'title') {
							window.setTimeout(() => text.inputEl.focus(), 50);
						}
					});
			}
		}

		// Error message for missing title
		const errorEl = contentEl.createEl('p', {
			text: 'Name is required.',
			attr: { style: 'color: var(--color-red); font-size: 0.85em; margin-bottom: 8px;' }
		});
		errorEl.addClass('wb-hidden');

		// Submit button
		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Save')
				.setCta()
				.onClick(() => { this.submit(errorEl); })
			);

		// Enter to submit (not in textarea)
		contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
				this.submit(errorEl);
			}
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		if (!this.submitted) this.options.onCancel();
	}

	private async createLinkValue(field: FieldDefinition): Promise<string | null> {
		if (!this.options.onCreateLink) return null;

		return new Promise((resolve) => {
			new InputModal(
				this.app,
				`Name for new ${field.linkFolder ?? 'item'}`,
				'New item',
				'',
				(value: string) => {
					const trimmed = value.trim();
					if (!trimmed) {
						resolve(null);
						return;
					}
					void this.options.onCreateLink?.(field, trimmed).then(resolve);
				},
				() => resolve(null)
			).open();
		});
	}

	private submit(errorEl: HTMLElement): void {
		const titleField = this.options.fields.find(f => f.display === 'title');
		if (titleField) {
			const titleValue = this.values[titleField.key]?.trim() ?? '';
			if (!titleValue) {
				errorEl.removeClass('wb-hidden');
				return;
			}
		}

		this.submitted = true;
		this.close();

		const data: Record<string, string | null> = {};
		for (const f of this.options.fields) {
			const val = this.values[f.key]?.trim() ?? '';
			data[f.key] = val || null;
		}

		this.options.onSubmit({ data });
	}
}
