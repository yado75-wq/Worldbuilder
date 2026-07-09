import { App, Modal, Notice, PluginSettingTab, Setting } from 'obsidian';
import WorldBuilderPlugin from './main';
import { cloneTemplateSet, resetTemplateSet } from './commands/SetupCommand';
import { InputModal } from './ui/InputModal';

export class WorldBuilderSettingTab extends PluginSettingTab {
	plugin: WorldBuilderPlugin;

	constructor(app: App, plugin: WorldBuilderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Template sets ──────────────────────────────────────────────────

		new Setting(containerEl)
			.setName('Template sets')
			.setHeading();

		const templateSets = this.plugin.state.templateSets;
		const defaultSet = this.plugin.settings.defaultTemplateSet;

		if (templateSets.length === 0) {
			new Setting(containerEl)
				.setName('No template sets found')
				.setDesc('Reload the plugin to initialize default templates.');
		} else {
			for (const set of templateSets) {
				const statusIcon = set.isValid ? '✓' : '✗';
				const isDefault = set.name === defaultSet;
				const desc = [
					set.isValid ? 'Valid.' : `${set.issues.length} issue(s): ${set.issues.map(i => i.message).join(', ')}`,
					isDefault ? 'Default for new worlds.' : '',
				].filter(Boolean).join(' ');

				const setting = new Setting(containerEl)
					.setName(`${statusIcon} ${set.name}${isDefault ? ' ★' : ''}`)
					.setDesc(desc)
					.addButton(btn => btn
						.setButtonText('Set as default')
						.setDisabled(isDefault || !set.isValid)
						.onClick(() => {
							void (async () => {
								this.plugin.settings.defaultTemplateSet = set.name;
								await this.plugin.saveSettings();
								this.display();
							})();
						})
					)
					.addButton(btn => btn
						.setButtonText('Clone')
						.onClick(() => {
							this.cloneTemplateSet(set.name);
						})
					)
					.addButton(btn => btn
						.setButtonText('Assign to world')
						.onClick(() => {
							void (async () => {
								await this.assignTemplateSetToWorld(set.name);
							})();
						})
					)
					.addButton(btn => btn
						.setButtonText('Reset to defaults')
						.setWarning()
						.onClick(() => {
							void (async () => {
								await resetTemplateSet(
									this.app,
									this.plugin.settings,
									this.plugin.pluginDir,
									set.name
								);
								await this.plugin.refreshState();
								this.display();
							})();
						})
					);

				if (!set.isValid) {
					setting.nameEl.addClass('wb-invalid');
				}
			}
		}

		// ── New template set ───────────────────────────────────────────────

		new Setting(containerEl)
			.setName('New template set')
			.setDesc('Create a new template set copied from plugin defaults.')
			.addButton(btn => btn
				.setButtonText('Create')
				.setCta()
				.onClick(() => {
					new InputModal(
						this.app,
						'Template set name',
						'fantasy',
						'',
						(name) => {
							void (async () => {
								const path = `${this.plugin.settings.systemFolder}/${this.plugin.settings.templatesFolder}/${name}`;
								if (this.app.vault.getAbstractFileByPath(path)) {
									new Notice(`"${name}" already exists.`);
									return;
								}
								await this.app.vault.createFolder(path);
								await resetTemplateSet(
									this.app,
									this.plugin.settings,
									this.plugin.pluginDir,
									name
								);
								await this.plugin.refreshState();
								this.display();
							})();
						},
						() => {}
					).open();
				})
			);

		// ── Active world ───────────────────────────────────────────────────

		new Setting(containerEl)
			.setName('Active world')
			.setHeading();

		const activeWorld = this.plugin.state.activeWorld;
		new Setting(containerEl)
			.setName(activeWorld ? activeWorld.name : 'No active world')
			.setDesc(activeWorld
				? `Template set: ${activeWorld.templateSet}`
				: 'Create or switch to a world to get started.'
			);
	}

	private cloneTemplateSet(sourceName: string): void {
		new InputModal(
			this.app,
			'Name for cloned template set',
			'fantasy-copy',
			`${sourceName}-copy`,
			(name) => {
				void (async () => {
					const created = await cloneTemplateSet(
						this.app,
						this.plugin.settings,
						sourceName,
						name
					);
					if (!created) return;

					this.plugin.settings.defaultTemplateSet = name;
					await this.plugin.saveSettings();
					await this.plugin.refreshState();
					this.display();
				})();
			},
			() => {}
		).open();
	}

	private async assignTemplateSetToWorld(templateSetName: string): Promise<void> {
		const worlds = this.plugin.state.worlds;
		if (worlds.length === 0) {
			new Notice('No worlds found.');
			return;
		}

		const picked = await new Promise<number | null>((resolve) => {
			let resolved = false;
			const modal = new Modal(this.app);
			modal.titleEl.setText(`Assign "${templateSetName}" to world`);

			for (let i = 0; i < worlds.length; i++) {
				const world = worlds[i];
				if (!world) continue;
				const active = world.status === 'active' ? ' ★' : '';
				const current = world.templateSet === templateSetName ? ' (current)' : '';
				const label = `${world.name}${active}${current}`;

				const btn = modal.contentEl.createEl('button', {
					text: label,
					cls: 'wb-world-picker-btn',
				});
				btn.addEventListener('click', () => {
					if (resolved) return;
					resolved = true;
					modal.close();
					resolve(i);
				});
			}

			modal.onClose = () => {
				if (!resolved) resolve(null);
			};
			modal.open();
		});

		if (picked === null) return;

		const world = worlds[picked];
		if (!world) return;

		const currentContent = await this.app.vault.read(world.indexFile);
		const updatedContent = updateTemplateSetFrontmatter(currentContent, templateSetName);
		await this.app.vault.modify(world.indexFile, updatedContent);
		await this.plugin.refreshState();
		this.display();
		new Notice(`Assigned "${templateSetName}" to "${world.name}".`);
	}

	getSettingDefinitions() {
		return [];
	}
}

function updateTemplateSetFrontmatter(content: string, templateSetName: string): string {
	const frontmatterPattern = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;
	const match = content.match(frontmatterPattern);

	if (!match?.[1]) {
		return `---\ntags:\n  - world\ntemplate_set: ${templateSetName}\n---\n\n${content}`;
	}

	const frontmatterBody = match[1];
	const updatedFrontmatter = frontmatterBody.replace(
		/^template_set:.*$/m,
		`template_set: ${templateSetName}`
	);

	if (updatedFrontmatter === frontmatterBody) {
		return content.replace(
			frontmatterPattern,
			`---\n${frontmatterBody}\ntemplate_set: ${templateSetName}\n---\n`
		);
	}

	return content.replace(frontmatterPattern, `---\n${updatedFrontmatter}\n---\n`);
}
