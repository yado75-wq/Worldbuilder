import { Plugin, normalizePath, TFolder } from 'obsidian';
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

		this.addSettingTab(new WorldBuilderSettingTab(this.app, this));

		// Register context menu
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				registerFileMenu(
					this.app,
					menu,
					file,
					this.state,
					this.settings,
					() => void this.saveSettings()
				);
			})
		);

		// Metadata cache — fires after frontmatter is fully parsed
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
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

		// Vault — handles structural changes
		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFolder) void this.refreshState();
			})
		);
		this.registerEvent(this.app.vault.on('delete', () => void this.refreshState()));
		this.registerEvent(this.app.vault.on('rename', () => void this.refreshState()));

		// Wait for vault to be fully ready before scanning
		this.app.workspace.onLayoutReady(async () => {
			await ensureDefaultTemplates(
				this.app,
				this.settings,
				this.pluginDir,
				this.state.templateSets
			);
			await this.refreshState();
		});
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
