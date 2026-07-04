import { Plugin, normalizePath } from 'obsidian';
import { WorldBuilderSettings, DEFAULT_SETTINGS, PluginState } from './types';
import { WorldBuilderSettingTab } from './settings';
import { scanVault } from './state/WorldState';
import { registerFileMenu } from './context/MenuBuilder';
import { ensureDefaultTemplates } from './commands/SetupCommand';

export default class WorldBuilderPlugin extends Plugin {
	settings!: WorldBuilderSettings;
	state!: PluginState;

	async onload() {
		await this.loadSettings();

		this.state = {
			activeWorld: null,
			worlds: [],
			templateSets: [],
		};

		await this.refreshState();

		// Ensure defaults folder exists and is populated
		await ensureDefaultTemplates(
			this.app,
			this.settings,
			this.pluginDir,
			this.state.templateSets
		);

		// Refresh state after setup
		await this.refreshState();

		this.addSettingTab(new WorldBuilderSettingTab(this.app, this));

		// Register context menu
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				registerFileMenu(this.app, menu, file, this.state);
			})
		);

		// Watch for vault changes that affect state
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (
					file.name === '_index.md' ||
					file.name.endsWith('_Fields.md') ||
					file.name === 'folder-rules.md' ||
					file.name === 'world-template.md'
				) {
					void this.refreshState();
				}
			})
		);

		this.registerEvent(this.app.vault.on('create', () => void this.refreshState()));
		this.registerEvent(this.app.vault.on('delete', () => void this.refreshState()));
		this.registerEvent(this.app.vault.on('rename', () => void this.refreshState()));
	}

	onunload() {}

	async refreshState() {
		this.state = await scanVault(this.app, this.settings);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<WorldBuilderSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	get pluginDir(): string {
		return normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}`);
	}

	get templatesPath(): string {
		return `${this.settings.systemFolder}/${this.settings.templatesFolder}`;
	}
}
