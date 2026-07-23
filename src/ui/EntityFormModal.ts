import { App, DropdownComponent, Modal, Setting, TextComponent } from 'obsidian';
import { FieldDefinition, FormResult } from '../types';
import { InputModal } from './InputModal';
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
	linkCandidates: Record<string, string[]>;
	onSubmit: (result: FormResult) => void;
	onCancel: () => void;
	onCreateLink?: (field: FieldDefinition, name: string) => Promise<string | null>;
	/** The world's configured `time_unit` (§4), shown as a fixed label next to each timeframe offset. Defaults to 'years' — irrelevant for a form with no `timeframe` fields. */
	worldTimeUnit?: string;
	/**
	 * Per timeframe field key, which of its anchor candidates are
	 * themselves points (start === end) — those get a single unsuffixed
	 * dropdown entry instead of separate `Entity:start`/`Entity:end`
	 * options, since both would resolve identically. Omitted entirely (or
	 * a candidate simply absent from the list) falls back to always
	 * showing both — the safe default when the caller hasn't determined
	 * point-status for some reason.
	 */
	timeframePointCandidates?: Record<string, string[]>;
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
		onSelect: (link: string) => void,
		extraOption?: { value: string; label: string }
	): void {
		const UNDEFINED = '— None / not yet defined —';
		const CREATE_VALUE = '__create__';
		const createLabel = `Create new ${field.linkFolder ?? 'item'}…`;

		drop.addOption(UNDEFINED, UNDEFINED);
		if (extraOption) {
			drop.addOption(extraOption.value, extraOption.label);
		}
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
		const initial = current === extraOption?.value ? current : (candidates.includes(current) ? current : UNDEFINED);
		drop.setValue(initial);

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
						drop.setValue(initial);
					}
					return;
				}
				if (extraOption && value === extraOption.value) {
					onSelect(extraOption.value);
					return;
				}
				onSelect(value === UNDEFINED ? '' : `[[${value}]]`);
			})();
		});
	}

	/**
	 * The `timeframe` field widget (TIME_DESIGN.md §1, §2): a top-level
	 * "Same as another entity" toggle switches between the two shapes §2
	 * actually supports —
	 *   - `inherit`: this entity's whole interval is copied from another
	 *     entity's (a bare `[[Entity]]` value), or
	 *   - `interval`: a Start row, a "point in time" checkbox (default
	 *     checked), and an End row shown only when unchecked.
	 * Self-contained — no generic cross-field conditional system
	 * (explicitly out of scope, §10). Recomputes the single serialized
	 * frontmatter value (§2) into `this.values[f.key]` on every change, via
	 * the pure `composeTimeframeValue` — the internal §2 storage syntax
	 * itself is never shown in the UI.
	 */
	private buildTimeframeField(
		contentEl: HTMLElement,
		field: FieldDefinition,
		name: string,
		candidates: string[]
	): void {
		const state: TimeframeFieldInput = decomposeTimeframeValue(this.values[field.key]);
		const worldUnit = this.options.worldTimeUnit ?? 'years';
		const pointCandidates = new Set(this.options.timeframePointCandidates?.[field.key] ?? []);

		// Both sides unbounded (§1: "should not be possible to create") —
		// reconciled here too, not just prevented going forward, since
		// already-existing data saved before this rule could still have it.
		// Kept arbitrary but deterministic: Start's -∞ wins, End is cleared.
		if (state.start.unbounded && state.end.unbounded) {
			state.end.unbounded = false;
		}

		const recompute = (): void => {
			this.values[field.key] = composeTimeframeValue(state, worldUnit) ?? '';
		};

		const container = contentEl.createDiv({ cls: 'wb-timeframe-field' });
		container.createDiv({ cls: 'wb-timeframe-title', text: name });

		let intervalBlock: HTMLElement | undefined;
		let inheritBlock: HTMLElement | undefined;

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

		// Inherit mode: a single anchor picker — the entity whose whole
		// interval (both ends) this one copies (§2's bare [[Entity]] form).
		const inheritCurrent = state.inheritLink.replace(/^\[\[|\]\]$/g, '');
		new Setting(inheritBlock)
			.setName('Entity')
			.addDropdown(drop => this.buildAnchorDropdown(drop, field, candidates, inheritCurrent, link => {
				state.inheritLink = link;
				recompute();
			}));

		// Interval mode. Start's dropdown offers -∞ only while NOT in point
		// mode (a single point can never be unbounded, §1) AND only while
		// End isn't already unbounded (both sides unbounded at once spans
		// all of time and says nothing, §1) — since both of those
		// availabilities change dynamically, each row is fully rebuilt
		// (not just re-styled) whenever the other side's unbounded state
		// changes, or the point-in-time checkbox toggles.
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
					if (value) state.start.unbounded = false; // a single point can never be unbounded
					endRow.toggleClass('wb-hidden', value);
					renderStartRow();
					renderEndRow();
					recompute();
				});
			});

		recompute();
	}

	/**
	 * One Start/End row: a plain integer offset and a single dropdown that
	 * lists each candidate anchor twice — `Entity:start` and `Entity:end`
	 * — rather than picking an anchor and then a separate "use anchor's
	 * end" toggle. `Entity:start` behaves exactly like a plain anchor pick
	 * always has (offset stays editable, defaults to 0 — §2's arithmetic
	 * triplet form). `Entity:end` is §2's `boundary` form: an *exact*
	 * reference to the anchor's end with no offset of its own in the data
	 * model at all, so the offset input disables itself whenever it's
	 * selected. `allowUnbounded` additionally offers ∞/-∞ (per
	 * `unboundedSign`) as a third, mutually-exclusive kind of entry — never
	 * combined with an anchor, matching that infinity carries neither an
	 * anchor nor an offset in the data model. `onBecameUnbounded` fires
	 * whenever this row's own unbounded state changes (either direction) —
	 * the caller (buildTimeframeField) uses it to rebuild the *other* row,
	 * since Start and End can never both be unbounded at once (§1).
	 */
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
		const boundaryKey = (name: string, which: 'start' | 'end'): string => `${name}::${which}`;

		/** Only notifies the other row when this row's unbounded state actually flips, not on every keystroke/selection. */
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
					if (value.trim()) setUnbounded(false); // typing an offset cancels unbounded
					onChange();
				});
			})
			.addDropdown(drop => {
				drop.addOption(UNDEFINED, UNDEFINED);
				if (allowUnbounded) drop.addOption(UNBOUNDED_VALUE, UNBOUNDED_LABEL);
				for (const c of candidates) {
					if (pointCandidates.has(c)) {
						// A point (start === end, §3) — Entity:start and
						// Entity:end would always resolve identically, so
						// only one plain entry is offered. Internally still
						// keyed as 'start' — same code path either way.
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
					const name = value.slice(0, sep);
					const which = value.slice(sep + 2);
					point.anchor = `[[${name}]]`;
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

		const data: Record<string, string | null> = {};
		for (const f of this.options.fields) {
			const val = this.values[f.key]?.trim() ?? '';
			data[f.key] = val || null;
		}

		this.options.onSubmit({ data });
	}
}
