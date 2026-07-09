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
			cls: 'wb-modal-prompt',
		});

		const input = contentEl.createEl('input', {
			type: 'text',
			cls: 'wb-modal-input',
			attr: {
				placeholder: this.placeholder,
			}
		});

		input.value = this.initialValue;

		const errorEl = contentEl.createEl('p', {
			text: 'A name is required.',
			cls: 'wb-input-error',
		});
		errorEl.addClass('wb-hidden');

		const btn = contentEl.createEl('button', {
			text: 'OK',
			cls: 'wb-modal-submit-btn',
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
