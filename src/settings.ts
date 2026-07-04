import { App, PluginSettingTab, Setting } from 'obsidian';
import WorldBuilderPlugin from './main';

export class WorldBuilderSettingTab extends PluginSettingTab {
	plugin: WorldBuilderPlugin;

	constructor(app: App, plugin: WorldBuilderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Folder locations ───────────────────────────────────────────────

		new Setting(containerEl)
			.setName('Folder locations')
			.setHeading();

		new Setting(containerEl)
			.setName('System folder')
			.setDesc('Root folder for plugin system files. Default: _system')
			.addText(text => text
				.setPlaceholder('_system')
				.setValue(this.plugin.settings.systemFolder)
				.onChange(async (value) => {
					this.plugin.settings.systemFolder = value.trim() || '_system';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Templates folder')
			.setDesc('Folder containing template sets, relative to system folder. Default: templates')
			.addText(text => text
				.setPlaceholder('Templates')
				.setValue(this.plugin.settings.templatesFolder)
				.onChange(async (value) => {
					this.plugin.settings.templatesFolder = value.trim() || 'templates';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Scripts folder')
			.setDesc('Folder for user scripts, relative to system folder. Default: scripts')
			.addText(text => text
				.setPlaceholder('Scripts')
				.setValue(this.plugin.settings.scriptsFolder)
				.onChange(async (value) => {
					this.plugin.settings.scriptsFolder = value.trim() || 'scripts';
					await this.plugin.saveSettings();
				}));

		// ── Template sets ──────────────────────────────────────────────────

		new Setting(containerEl)
			.setName('Template sets')
			.setHeading();

		const templateSets = this.plugin.state.templateSets;

		if (templateSets.length === 0) {
			new Setting(containerEl)
				.setName('No template sets found')
				.setDesc('Create a template set to get started.');
		} else {
			for (const set of templateSets) {
				const statusIcon = set.isValid ? '✓' : '✗';
				const desc = set.isValid
					? 'Template set is valid.'
					: `${set.issues.length} issue(s): ${set.issues.map(i => i.message).join(', ')}`;

				new Setting(containerEl)
					.setName(`${statusIcon} ${set.name}`)
					.setDesc(desc);
			}
		}

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
		return [
			{
				id: 'systemFolder',
				name: 'System folder',
				desc: 'Root folder for WorldBuilder system files. Default: _system',
				type: 'text' as const,
			},
			{
				id: 'templatesFolder',
				name: 'Templates folder',
				desc: 'Folder containing template sets, relative to system folder. Default: templates',
				type: 'text' as const,
			},
			{
				id: 'scriptsFolder',
				name: 'Scripts folder',
				desc: 'Folder for user scripts, relative to system folder. Default: scripts',
				type: 'text' as const,
			},
		];
	}
}
