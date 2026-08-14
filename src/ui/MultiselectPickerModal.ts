import { App, Modal, Setting } from 'obsidian';
import type { LinkCandidateGroup } from '../commands/shared/EntityContent';
import type { FieldDefinition } from '../types';

export interface MultiselectPickerOptions {
	title: string;
	field: FieldDefinition;
	linkGroups: LinkCandidateGroup[];
	initial: string[];
	onApply: (selected: string[]) => void;
	onCancel: () => void;
}

export class MultiselectPickerModal extends Modal {
	private opts: MultiselectPickerOptions;
	private selected: Set<string>;
	private applied = false;

	constructor(app: App, opts: MultiselectPickerOptions) {
		super(app);
		this.opts = opts;
		this.selected = new Set(opts.initial);
	}

	onOpen(): void {
		const { contentEl, opts } = this;
		contentEl.empty();
		this.titleEl.setText(opts.title);

		const sourceOrder =
			opts.field.multiKind === 'link'
				? opts.linkGroups.flatMap(g => g.names.map(n => `[[${n}]]`))
				: (opts.field.options ?? []);

		const orderedSelected = (): string[] => {
			const out = sourceOrder.filter(v => this.selected.has(v));
			for (const extra of this.selected) {
				if (!sourceOrder.includes(extra)) out.push(extra);
			}
			return out;
		};

		// OK / Cancel at top
		const top = contentEl.createDiv({ cls: 'wb-multiselect-picker-top' });
		new Setting(top)
			.addButton(btn => btn
				.setButtonText('OK')
				.setCta()
				.onClick(() => {
					this.applied = true;
					opts.onApply(orderedSelected());
					this.close();
				})
			)
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(() => this.close())
			);

		const list = contentEl.createDiv({ cls: 'wb-multiselect-list wb-multiselect-picker-list' });

		const addRow = (label: string, value: string): void => {
			const row = list.createDiv({ cls: 'wb-multiselect-item' });
			const mark = row.createSpan({ cls: 'wb-multiselect-mark' });
			const labelEl = row.createSpan({ cls: 'wb-multiselect-label', text: label });

			const sync = (): void => {
				const on = this.selected.has(value);
				mark.setText(on ? '✓' : '');
				row.toggleClass('is-selected', on);
			};

			row.addEventListener('click', () => {
				if (this.selected.has(value)) this.selected.delete(value);
				else this.selected.add(value);
				sync();
			});
			sync();
			void labelEl;
		};

		if (opts.field.multiKind === 'link') {
			const showHeaders = opts.linkGroups.length > 1;
			for (const g of opts.linkGroups) {
				if (showHeaders) {
					list.createDiv({ cls: 'wb-multiselect-header', text: g.entityType });
				}
				if (g.names.length === 0 && showHeaders) {
					list.createDiv({ cls: 'wb-multiselect-empty', text: 'empty' });
					continue;
				}
				for (const n of g.names) {
					addRow(n, `[[${n}]]`);
				}
			}
		} else {
			for (const opt of opts.field.options ?? []) {
				addRow(opt, opt);
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.applied) this.opts.onCancel();
	}
}