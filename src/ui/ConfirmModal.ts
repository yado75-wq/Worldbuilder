import { App, Modal } from 'obsidian';

export class ConfirmModal extends Modal {
	private prompt: string;
	private onConfirm: (confirmed: boolean) => void;
	private confirmLabel: string;
	private cancelLabel: string;
	private answered = false;

	constructor(
		app: App,
		prompt: string,
		onConfirm: (confirmed: boolean) => void,
		confirmLabel = 'Yes',
		cancelLabel = 'No',
		title = '',
	) {
		super(app);
		this.prompt = prompt;
		this.onConfirm = onConfirm;
		this.confirmLabel = confirmLabel;
		this.cancelLabel = cancelLabel;
		if (title) this.titleEl.setText(title);
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('p', {
			text: this.prompt,
			cls: 'wb-confirm-prompt',
		});

		const btnRow = contentEl.createDiv({
			cls: 'wb-confirm-btn-row',
		});

		const confirmBtn = btnRow.createEl('button', {
			text: this.confirmLabel,
			cls: 'wb-confirm-btn wb-confirm-btn-primary',
		});

		const cancelBtn = btnRow.createEl('button', {
			text: this.cancelLabel,
			cls: 'wb-confirm-btn wb-confirm-btn-secondary',
		});

		confirmBtn.addEventListener('click', () => {
			this.answered = true;
			this.close();
			this.onConfirm(true);
		});

		cancelBtn.addEventListener('click', () => {
			this.answered = true;
			this.close();
			this.onConfirm(false);
		});

		contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') { this.answered = true; this.close(); this.onConfirm(true); }
			if (e.key === 'Escape') { this.answered = true; this.close(); this.onConfirm(false); }
		});

		window.setTimeout(() => confirmBtn.focus(), 50);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		if (!this.answered) this.onConfirm(false);
	}
}

