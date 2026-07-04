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
				id: 'activeWorld',
				name: 'Active world',
				desc: 'Currently active world',
				type: 'text' as const,
			},
		];
	}
}
