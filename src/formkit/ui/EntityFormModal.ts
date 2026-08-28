import { App, DropdownComponent, Modal, Setting, TextComponent } from 'obsidian';
import { FieldDefinition, FormResult, LinkCandidateGroup } from '../types';
import { InputModal } from './InputModal';
import { MultiselectPickerModal } from './MultiselectPickerModal';

import {
	composeTimeframeValue,
	decomposeTimeframeValue,
	TimeframeFieldInput,
	TimepointInput,
} from '../time/TimeframeWidgetState';

export interface EntityFormModalOptions {
	title: string;
	fields: FieldDefinition[];
	prefill: Record<string, string>;
	linkCandidateGroups: Record<string, LinkCandidateGroup[]>;
	timeframeCandidates: Record<string, string[]>;
	onSubmit: (result: FormResult) => void;
	onCancel: () => void;
	onCreateLink?: (field: FieldDefinition, name: string) => Promise<string | null>;
	worldTimeUnit?: string;
	timeframePointCandidates?: Record<string, string[]>;
}

function singleLinkType(field: FieldDefinition): string | undefined {
	if (field.linkTypes && field.linkTypes.length === 1) {
		return field.linkTypes[0];
	}
	if (field.linkTypes && field.linkTypes.length > 1) {
		return undefined;
	}
	return field.linkFolder?.trim() || undefined;
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
		const { title, fields, prefill } = options;

		this.titleEl.setText(title);

		for (const f of fields) {
			this.values[f.key] = prefill[f.key] ?? '';
		}

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

			} else if (f.type === 'multiselect') {
				this.buildMultiselectField(contentEl, f, name, options.linkCandidateGroups[f.key] ?? []);

			} else if (f.type === 'link') {
				const groups = options.linkCandidateGroups[f.key] ?? [];
				const current = this.values[f.key]?.replace(/^\[\[|\]\]$/g, '') ?? '';
				new Setting(contentEl)
					.setName(name)
					.addDropdown(drop => this.buildLinkDropdown(drop, f, groups, current, (link: string) => {
						this.values[f.key] = link;
					}));

			} else if (f.type === 'timeframe') {
				this.buildTimeframeField(
					contentEl,
					f,
					name,
					options.timeframeCandidates[f.key] ?? []
				);

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

		const errorEl = contentEl.createEl('p', {
			text: 'Name is required.',
			cls: 'wb-input-error',
		});
		errorEl.addClass('wb-hidden');

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Save')
				.setCta()
				.onClick(() => { this.submit(errorEl); })
			);

		contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
				this.submit(errorEl);
			}
		});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.submitted) this.options.onCancel();
	}

	private buildMultiselectField(
		contentEl: HTMLElement,
		field: FieldDefinition,
		name: string,
		linkGroups: LinkCandidateGroup[]
	): void {
		const sourceOrder =
			field.multiKind === 'link'
				? linkGroups.flatMap(g => g.names.map(n => `[[${n}]]`))
				: (field.options ?? []);

		const parseCurrent = (): string[] => {
			try {
				const parsed = JSON.parse(this.values[field.key] || '[]') as unknown;
				return Array.isArray(parsed)
					? parsed.filter((x): x is string => typeof x === 'string')
					: [];
			} catch {
				return [];
			}
		};

		const summaryText = (values: string[]): string => {
			const labels = sourceOrder
				.filter(v => values.includes(v))
				.map(v => v.replace(/^\[\[|\]\]$/g, ''));
			// extras not in source
			for (const v of values) {
				if (!sourceOrder.includes(v)) {
					labels.push(v.replace(/^\[\[|\]\]$/g, ''));
				}
			}
			return labels.length > 0 ? labels.join(', ') : '— None —';
		};

		if (!this.values[field.key]) {
			this.values[field.key] = JSON.stringify(parseCurrent());
		}

		const setting = new Setting(contentEl).setName(name);
		const summaryEl = setting.controlEl.createDiv({ cls: 'wb-multiselect-summary' });
		summaryEl.setText(summaryText(parseCurrent()));

		setting.addButton(btn => btn
			.setButtonText('Choose…')
			.onClick(() => {
				new MultiselectPickerModal(this.app, {
					title: name,
					field,
					linkGroups,
					initial: parseCurrent(),
					onApply: (selected) => {
						this.values[field.key] = JSON.stringify(selected);
						summaryEl.setText(summaryText(selected));
					},
					onCancel: () => { /* keep previous */ },
				}).open();
			})
		);
	}

	private async createLinkValue(field: FieldDefinition): Promise<string | null> {
		if (!this.options.onCreateLink) return null;
		const typeLabel = singleLinkType(field) ?? 'item';

		return new Promise((resolve) => {
			new InputModal(
				this.app,
				`Name for new ${typeLabel}`,
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

	private buildLinkDropdown(
		drop: DropdownComponent,
		field: FieldDefinition,
		groups: LinkCandidateGroup[],
		current: string,
		onSelect: (link: string) => void
	): void {
		const UNDEFINED = '— None / not yet defined —';
		const CREATE_VALUE = '__create__';
		const headerValue = (entityType: string): string => `__header__:${entityType}`;
		const emptyValue = (entityType: string): string => `__empty__:${entityType}`;

		const typeForCreate = singleLinkType(field);
		const showHeaders = groups.length > 1;

		drop.addOption(UNDEFINED, UNDEFINED);

		const selectableNames: string[] = [];
		for (const group of groups) {
			if (showHeaders) {
				const hv = headerValue(group.entityType);
				drop.addOption(hv, `— ${group.entityType} —`);
				const headerOpt = Array.from(drop.selectEl.options).find(o => o.value === hv);
				if (headerOpt) headerOpt.disabled = true;
			}

			if (group.names.length === 0) {
				if (showHeaders) {
					const ev = emptyValue(group.entityType);
					drop.addOption(ev, 'Empty');
					const emptyOpt = Array.from(drop.selectEl.options).find(o => o.value === ev);
					if (emptyOpt) emptyOpt.disabled = true;
				}
			} else {
				for (const n of group.names) {
					drop.addOption(n, n);
					selectableNames.push(n);
				}
			}
		}

		if (this.options.onCreateLink && typeForCreate) {
			drop.addOption(CREATE_VALUE, `Create new ${typeForCreate}…`);
		}

		const initial = selectableNames.includes(current) ? current : UNDEFINED;
		drop.setValue(initial);

		drop.onChange(value => {
			void (async () => {
				if (value.startsWith('__header__:') || value.startsWith('__empty__:')) {
					drop.setValue(initial);
					return;
				}
				if (value === CREATE_VALUE) {
					const created = await this.createLinkValue(field);
					if (created) {
						const createdName = created.replace(/^\[\[|\]\]$/g, '');
						drop.addOption(createdName, createdName);
						drop.setValue(createdName);
						onSelect(created);
					} else {
						drop.setValue(initial);
					}
					return;
				}
				onSelect(value === UNDEFINED ? '' : `[[${value}]]`);
			})();
		});
	}

	private buildAnchorDropdown(
		drop: DropdownComponent,
		_field: FieldDefinition,
		candidates: string[],
		current: string,
		onSelect: (link: string) => void,
		extraOption?: { value: string; label: string }
	): void {
		const UNDEFINED = '— None / not yet defined —';

		drop.addOption(UNDEFINED, UNDEFINED);
		if (extraOption) {
			drop.addOption(extraOption.value, extraOption.label);
		}
		for (const c of candidates) {
			drop.addOption(c, c);
		}

		const initial = current === extraOption?.value
			? current
			: (candidates.includes(current) ? current : UNDEFINED);
		drop.setValue(initial);

		drop.onChange(value => {
			if (extraOption && value === extraOption.value) {
				onSelect(extraOption.value);
				return;
			}
			onSelect(value === UNDEFINED ? '' : `[[${value}]]`);
		});
	}

	private buildTimeframeField(
		contentEl: HTMLElement,
		field: FieldDefinition,
		name: string,
		candidates: string[]
	): void {
		const state: TimeframeFieldInput = decomposeTimeframeValue(this.values[field.key]);
		const worldUnit = this.options.worldTimeUnit ?? 'years';
		const pointCandidates = new Set(this.options.timeframePointCandidates?.[field.key] ?? []);

		if (state.start.unbounded && state.end.unbounded) {
			state.end.unbounded = false;
		}

		const recompute = (): void => {
			this.values[field.key] = composeTimeframeValue(state, worldUnit) ?? '';
		};

		const container = contentEl.createDiv({ cls: 'wb-timeframe-field' });
		container.createDiv({ cls: 'wb-timeframe-title', text: name });

		let intervalBlock: HTMLElement | undefined = undefined;
		let inheritBlock: HTMLElement | undefined = undefined;

		new Setting(container)
			.setName('Same as another entity')
			.addToggle(toggle => {
				toggle.setValue(state.mode === 'inherit');
				toggle.onChange(value => {
					state.mode = value ? 'inherit' : 'interval';
					intervalBlock?.toggleClass('wb-hidden', value);
					inheritBlock?.toggleClass('wb-hidden', !value);
					recompute();
				});
			});

		intervalBlock = container.createDiv();
		inheritBlock = container.createDiv();
		intervalBlock.toggleClass('wb-hidden', state.mode === 'inherit');
		inheritBlock.toggleClass('wb-hidden', state.mode !== 'inherit');

		const inheritCurrent = state.inheritLink.replace(/^\[\[|\]\]$/g, '');
		new Setting(inheritBlock)
			.setName('Entity')
			.addDropdown(drop => this.buildAnchorDropdown(drop, field, candidates, inheritCurrent, link => {
				state.inheritLink = link;
				recompute();
			}));

		const startRow = intervalBlock.createDiv({ cls: 'wb-timeframe-row' });
		const endRow = intervalBlock.createDiv({ cls: 'wb-timeframe-row' });

		const renderStartRow = (): void => {
			startRow.empty();
			this.buildTimepointRow(
				startRow, candidates, pointCandidates, 'Start', worldUnit, state.start,
				!state.point && !state.end.unbounded, -1, recompute,
				() => { renderEndRow(); }
			);
		};
		const renderEndRow = (): void => {
			endRow.empty();
			this.buildTimepointRow(
				endRow, candidates, pointCandidates, 'End', worldUnit, state.end,
				!state.start.unbounded, 1, recompute,
				() => { renderStartRow(); }
			);
		};
		renderStartRow();
		endRow.toggleClass('wb-hidden', state.point);
		renderEndRow();

		new Setting(intervalBlock)
			.setName('Point in time')
			.addToggle(toggle => {
				toggle.setValue(state.point);
				toggle.onChange(value => {
					state.point = value;
					if (value) state.start.unbounded = false;
					endRow.toggleClass('wb-hidden', value);
					renderStartRow();
					renderEndRow();
					recompute();
				});
			});

		recompute();
	}

	private buildTimepointRow(
		rowEl: HTMLElement,
		candidates: string[],
		pointCandidates: Set<string>,
		label: string,
		worldUnit: string,
		point: TimepointInput,
		allowUnbounded: boolean,
		unboundedSign: 1 | -1,
		onChange: () => void,
		onBecameUnbounded: () => void
	): void {
		const mainLine = rowEl.createDiv({ cls: 'wb-timeframe-row-main' });
		mainLine.createSpan({ cls: 'wb-timeframe-row-label', text: label });
		mainLine.createSpan({ cls: 'wb-timeframe-unit-label', text: worldUnit });

		const UNDEFINED = '— None / not yet defined —';
		const UNBOUNDED_VALUE = unboundedSign === 1 ? '__unbounded_end__' : '__unbounded_start__';
		const UNBOUNDED_LABEL = unboundedSign === 1 ? '∞ (unbounded)' : '-∞ (unbounded)';
		const boundaryKey = (n: string, which: 'start' | 'end'): string => `${n}::${which}`;

		const setUnbounded = (value: boolean): void => {
			const changed = point.unbounded !== value;
			point.unbounded = value;
			if (changed) onBecameUnbounded();
		};

		let offsetText: TextComponent | undefined;

		new Setting(mainLine)
			.setClass('wb-timeframe-row-setting')
			.addText(text => {
				offsetText = text;
				text.setPlaceholder('0');
				text.setValue(point.offset);
				text.setDisabled(point.unbounded || point.useAnchorEnd);
				text.inputEl.type = 'number';
				text.inputEl.step = '1';
				text.inputEl.addClass('wb-timeframe-offset-input');
				text.onChange(value => {
					point.offset = value;
					if (value.trim()) setUnbounded(false);
					onChange();
				});
			})
			.addDropdown(drop => {
				drop.addOption(UNDEFINED, UNDEFINED);
				if (allowUnbounded) drop.addOption(UNBOUNDED_VALUE, UNBOUNDED_LABEL);
				for (const c of candidates) {
					if (pointCandidates.has(c)) {
						drop.addOption(boundaryKey(c, 'start'), c);
					} else {
						drop.addOption(boundaryKey(c, 'start'), `${c}:start`);
						drop.addOption(boundaryKey(c, 'end'), `${c}:end`);
					}
				}

				const bareAnchor = point.anchor.replace(/^\[\[|\]\]$/g, '');
				const isPoint = pointCandidates.has(bareAnchor);
				const initialWhich = isPoint ? 'start' : (point.useAnchorEnd ? 'end' : 'start');
				const current = point.unbounded
					? UNBOUNDED_VALUE
					: bareAnchor && candidates.includes(bareAnchor)
						? boundaryKey(bareAnchor, initialWhich)
						: UNDEFINED;
				drop.setValue(current);

				drop.onChange(value => {
					if (value === UNBOUNDED_VALUE) {
						point.anchor = '';
						point.useAnchorEnd = false;
						point.offset = '';
						offsetText?.setValue('');
						offsetText?.setDisabled(true);
						setUnbounded(true);
						onChange();
						return;
					}
					if (value === UNDEFINED) {
						point.anchor = '';
						point.useAnchorEnd = false;
						offsetText?.setDisabled(false);
						setUnbounded(false);
						onChange();
						return;
					}
					const sep = value.lastIndexOf('::');
					const n = value.slice(0, sep);
					const which = value.slice(sep + 2);
					point.anchor = `[[${n}]]`;
					point.useAnchorEnd = which === 'end';
					if (which === 'end') {
						point.offset = '';
						offsetText?.setValue('');
						offsetText?.setDisabled(true);
					} else {
						offsetText?.setDisabled(false);
						if (!point.offset.trim()) {
							point.offset = '0';
							offsetText?.setValue('0');
						}
					}
					setUnbounded(false);
					onChange();
				});
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

		const data: Record<string, string | string[] | null> = {};
		for (const f of this.options.fields) {
			if (f.type === 'multiselect') {
				try {
					const parsed = JSON.parse(this.values[f.key] || '[]') as unknown;
					const list = Array.isArray(parsed)
						? parsed.filter((x): x is string => typeof x === 'string')
						: [];
					data[f.key] = list.length > 0 ? list : null;
				} catch {
					data[f.key] = null;
				}
			} else {
				const val = this.values[f.key]?.trim() ?? '';
				data[f.key] = val || null;
			}
		}

		this.options.onSubmit({ data });
	}
}