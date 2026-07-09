import { Menu, Notice, Plugin, TAbstractFile, TFolder, normalizePath, setTooltip } from 'obsidian';
import { WorldBuilderSettings, DEFAULT_SETTINGS, PluginState } from './types';
import { WorldBuilderSettingTab } from './settings';
import { scanVault } from './state/WorldState';
import { registerFileMenu } from './context/MenuBuilder';
import { ensureDefaultTemplates } from './commands/SetupCommand';

export default class WorldBuilderPlugin extends Plugin {
	settings!: WorldBuilderSettings;
	state!: PluginState;
	private ribbonIconEl!: HTMLElement;

	async onload() {
		await this.loadSettings();

		this.state = {
			activeWorld: null,
			worlds: [],
			templateSets: [],
		};

		this.addSettingTab(new WorldBuilderSettingTab(this.app, this));

		// Ribbon icon — shows active world on hover, status + settings link on click
		this.ribbonIconEl = this.addRibbonIcon('globe', 'Worldbuilder', (evt) => {
			this.showStatusMenu(evt);
		});

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

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				void this.handleDelete(file);
			})
		);

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

		// If default template set no longer exists, fall back to first available
		const defaultExists = this.state.templateSets
			.some(ts => ts.name === this.settings.defaultTemplateSet);

		if (!defaultExists && this.state.templateSets.length > 0) {
			const fallback = this.state.templateSets[0]?.name ?? 'defaults';
			this.settings.defaultTemplateSet = fallback;
			await this.saveSettings();
			new Notice(`Default template set was removed. Switched to "${fallback}".`);
		}

		this.updateRibbonTooltip();
	}

	private updateRibbonTooltip(): void {
		const worldName = this.state.activeWorld?.name;
		const tooltip = worldName ? `Worldbuilder — Active: ${worldName}` : 'Worldbuilder — No active world';
		setTooltip(this.ribbonIconEl, tooltip);
	}

	private showStatusMenu(evt: MouseEvent): void {
		const menu = new Menu();

		const activeWorld = this.state.activeWorld;
		menu.addItem(item => item
			.setTitle(activeWorld ? `Active world: ${activeWorld.name}` : 'No active world')
			.setIcon('globe')
			.setDisabled(true)
		);

		menu.addItem(item => item
			.setTitle(`Default template set: ${this.settings.defaultTemplateSet || 'none'}`)
			.setIcon('layout-template')
			.setDisabled(true)
		);

		menu.addSeparator();

		menu.addItem(item => item
			.setTitle('Open worldbuilder settings')
			.setIcon('settings')
			.onClick(() => {
				this.app.setting.open();
				this.app.setting.openTabById(this.manifest.id);
			})
		);

		menu.showAtMouseEvent(evt);
	}

	private async handleDelete(file: TAbstractFile): Promise<void> {
		const templatesRoot = `${this.settings.systemFolder}/${this.settings.templatesFolder}`;

		// Check if a template set folder was deleted
		if (file instanceof TFolder) {
			const parentPath = file.parent?.path ?? '';
			if (parentPath === templatesRoot) {
				new Notice(`Template set "${file.name}" was deleted.`);
			}
		}

		await this.refreshState();
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
