import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import WorldBuilderPlugin from './main';
import { resetTemplateSet } from './commands/SetupCommand';
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

		if (templateSets.length === 0) {
			new Setting(containerEl)
				.setName('No template sets found')
				.setDesc('Reload the plugin to initialize default templates.');
		} else {
			for (const set of templateSets) {
				const statusIcon = set.isValid ? '✓' : '✗';
				const desc = set.isValid
					? 'Template set is valid.'
					: `${set.issues.length} issue(s): ${set.issues.map(i => i.message).join(', ')}`;

				new Setting(containerEl)
					.setName(`${statusIcon} ${set.name}`)
					.setDesc(desc)
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

	getSettingDefinitions() {
		return [];
	}
}
