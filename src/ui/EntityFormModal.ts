import { App, DropdownComponent, Modal, Setting, TextComponent } from 'obsidian';
import { FieldDefinition, FormResult } from '../types';
import { InputModal } from './InputModal';
import {
	composeTimeframeValue,
	decomposeTimeframeValue,
	TimeframeFieldInput,
} from '../time/TimeframeWidgetState';

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
				const current = this.values[f.key]?.replace(/^\[\[|\]\]$/g, '') ?? '';
				new Setting(contentEl)
					.setName(name)
					.addDropdown(drop => this.buildAnchorDropdown(drop, f, candidates, current, link => {
						this.values[f.key] = link;
					}));

			} else if (f.type === 'timeframe') {
				this.buildTimeframeField(contentEl, f, name, linkCandidates[f.key] ?? []);

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
			cls: 'wb-input-error',
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
			if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
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

	/**
	 * A `[[Link]]`-picking dropdown with hot-create support — shared by
	 * `link` fields and the `timeframe` widget's anchor picker (§1: "reuse
	 * the exact mechanism link fields already have... not a new creation
	 * path"). `current` is a bare entity name (no `[[ ]]`), `''` if none.
	 * `onSelect` receives `''` (cleared) or a `[[Name]]` link.
	 */
	private buildAnchorDropdown(
		drop: DropdownComponent,
		field: FieldDefinition,
		candidates: string[],
		current: string,
		onSelect: (link: string) => void
	): void {
		const UNDEFINED = '— None / not yet defined —';
		const CREATE_VALUE = '__create__';
		const createLabel = `Create new ${field.linkFolder ?? 'item'}…`;

		drop.addOption(UNDEFINED, UNDEFINED);
		for (const c of candidates) {
			drop.addOption(c, c);
		}
		// Hot-create needs somewhere to put the new file (createLinkedEntity,
		// CreateEntityCommand.ts, requires field.linkFolder) — without one,
		// "Create new…" would just silently no-op. `timeframe` anchors have
		// no linkFolder by design (any entity in the world can be an
		// anchor), so this naturally never offers create for them; you can
		// still reference a not-yet-created entity by typing `[[Name]]`
		// directly, and the resolution check (§6) reports it gracefully.
		if (this.options.onCreateLink && field.linkFolder) {
			drop.addOption(CREATE_VALUE, createLabel);
		}
		drop.setValue(candidates.includes(current) ? current : UNDEFINED);

		drop.onChange(value => {
			void (async () => {
				if (value === CREATE_VALUE) {
					const created = await this.createLinkValue(field);
					if (created) {
						const createdName = created.replace(/^\[\[|\]\]$/g, '');
						drop.addOption(createdName, createdName);
						drop.setValue(createdName);
						onSelect(created);
					} else {
						drop.setValue(candidates.includes(current) ? current : UNDEFINED);
					}
					return;
				}
				onSelect(value === UNDEFINED ? '' : `[[${value}]]`);
			})();
		});
	}

	/**
	 * The `timeframe` field widget (TIME_DESIGN.md §1): a Start row, a
	 * "point in time" checkbox (default checked), and an End row shown only
	 * when unchecked. Self-contained — no generic cross-field conditional
	 * system (explicitly out of scope, §10). Recomputes the single
	 * serialized frontmatter value (§2) into `this.values[f.key]` on every
	 * change, via the pure `composeTimeframeValue`.
	 */
	private buildTimeframeField(
		contentEl: HTMLElement,
		field: FieldDefinition,
		name: string,
		candidates: string[]
	): void {
		const state: TimeframeFieldInput = decomposeTimeframeValue(this.values[field.key]);

		const recompute = (): void => {
			this.values[field.key] = composeTimeframeValue(state) ?? '';
		};

		const container = contentEl.createDiv({ cls: 'wb-timeframe-field' });
		container.createDiv({ cls: 'wb-timeframe-title', text: name });

		const startRow = container.createDiv({ cls: 'wb-timeframe-row' });
		this.buildTimepointRow(startRow, field, candidates, 'Start', state.startRaw, value => {
			state.startRaw = value;
			recompute();
		});

		const endRow = container.createDiv({ cls: 'wb-timeframe-row' });
		endRow.toggleClass('wb-hidden', state.point);

		new Setting(container)
			.setName('Point in time')
			.addToggle(toggle => {
				toggle.setValue(state.point);
				toggle.onChange(value => {
					state.point = value;
					endRow.toggleClass('wb-hidden', value);
					recompute();
				});
			});

		this.buildTimepointRow(endRow, field, candidates, 'End', state.endRaw, value => {
			state.endRaw = value;
			recompute();
		});

		recompute();
	}

	/** One Start/End row: a raw timepoint-syntax text input, plus an anchor picker that inserts a starter tuple. */
	private buildTimepointRow(
		rowEl: HTMLElement,
		field: FieldDefinition,
		candidates: string[],
		label: string,
		initialValue: string,
		onChange: (raw: string) => void
	): void {
		rowEl.createSpan({ cls: 'wb-timeframe-row-label', text: label });

		let textComponent: TextComponent | undefined;

		new Setting(rowEl)
			.setClass('wb-timeframe-row-setting')
			.addText(text => {
				textComponent = text;
				text.setPlaceholder('e.g. 1200, ∞, (0, years, [[Milestone]])');
				text.setValue(initialValue);
				text.inputEl.addClass('wb-full-width');
				text.onChange(value => { onChange(value); });
			})
			.addDropdown(drop => this.buildAnchorDropdown(drop, field, candidates, '', link => {
				if (!link) return;
				const template = `(0, , ${link})`;
				textComponent?.setValue(template);
				onChange(template);
			}));
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
