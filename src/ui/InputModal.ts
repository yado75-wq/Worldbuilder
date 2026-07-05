import { App, Modal } from 'obsidian';

export class InputModal extends Modal {
	private prompt: string;
	private placeholder: string;
	private initialValue: string;
	private onSubmit: (value: string) => void;
	private onCancel: () => void;
	private submitted = false;

	constructor(
		app: App,
		prompt: string,
		placeholder: string,
		initialValue: string,
		onSubmit: (value: string) => void,
		onCancel: () => void,
	) {
		super(app);
		this.prompt = prompt;
		this.placeholder = placeholder;
		this.initialValue = initialValue;
		this.onSubmit = onSubmit;
		this.onCancel = onCancel;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('p', {
			text: this.prompt,
			attr: { style: 'margin-bottom: 8px; font-weight: 500;' }
		});

		const input = contentEl.createEl('input', {
			type: 'text',
			attr: {
				placeholder: this.placeholder,
				style: 'width: 100%; padding: 6px; margin-bottom: 12px; background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); border-radius: 4px; box-sizing: border-box;'
			}
		});

		input.value = this.initialValue;

		const errorEl = contentEl.createEl('p', {
			text: 'A name is required.',
			cls: 'wb-input-error',
			attr: { style: 'color: var(--color-red); font-size: 0.85em; margin-bottom: 8px;' }
		});
		errorEl.addClass('wb-hidden');

		const btn = contentEl.createEl('button', {
			text: 'OK',
			attr: {
				style: 'width: 100%; padding: 8px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px; cursor: pointer;'
			}
		});

		const submit = (): void => {
			const value = input.value.trim();
			if (!value) {
				errorEl.removeClass('wb-hidden');
				input.focus();
				return;
			}
			this.submitted = true;
			this.close();
			this.onSubmit(value);
		};

		btn.addEventListener('click', submit);

		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') submit();
		});

		window.setTimeout(() => input.focus(), 50);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		if (!this.submitted) this.onCancel();
	}
}
