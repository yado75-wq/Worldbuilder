import { App, Modal } from 'obsidian';

export class ConfirmModal extends Modal {
	private prompt: string;
	private onConfirm: (confirmed: boolean) => void;
	private answered = false;

	constructor(
		app: App,
		prompt: string,
		onConfirm: (confirmed: boolean) => void,
	) {
		super(app);
		this.prompt = prompt;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('p', {
			text: this.prompt,
			attr: { style: 'margin-bottom: 16px; font-weight: 500;' }
		});

		const btnRow = contentEl.createDiv({
			attr: { style: 'display: flex; gap: 8px;' }
		});

		const yesBtn = btnRow.createEl('button', {
			text: 'Yes',
			attr: {
				style: 'flex: 1; padding: 8px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px; cursor: pointer;'
			}
		});

		const noBtn = btnRow.createEl('button', {
			text: 'No',
			attr: {
				style: 'flex: 1; padding: 8px; background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); border-radius: 4px; cursor: pointer;'
			}
		});

		yesBtn.addEventListener('click', () => {
			this.answered = true;
			this.close();
			this.onConfirm(true);
		});

		noBtn.addEventListener('click', () => {
			this.answered = true;
			this.close();
			this.onConfirm(false);
		});

		contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') { this.answered = true; this.close(); this.onConfirm(true); }
			if (e.key === 'Escape') { this.answered = true; this.close(); this.onConfirm(false); }
		});

		window.setTimeout(() => yesBtn.focus(), 50);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		if (!this.answered) this.onConfirm(false);
	}
}
