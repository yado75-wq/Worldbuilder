import { Menu, Notice, Plugin, TAbstractFile, TFolder, normalizePath, setTooltip } from 'obsidian';
import { WorldBuilderSettings, DEFAULT_SETTINGS, PluginState } from './types/runtime';
import { WorldBuilderSettingTab } from './settings';
import { scanVault } from './state/WorldState';
import { registerFileMenu } from './context/MenuBuilder';
import { ensureDefaultTemplates } from './commands/SetupCommand';
import { pickLiveDefaultTemplateSet } from './util/pickLiveDefaultTemplateSet';
import { loadI18n, t } from './i18n';

export default class WorldBuilderPlugin extends Plugin {
	settings!: WorldBuilderSettings;
	state!: PluginState;
	private ribbonIconEl!: HTMLElement;
	private settingTab!: WorldBuilderSettingTab;
	private activeWorldConflictNotified = false;

	async onload() {
		await this.loadSettings();
		await loadI18n(this.app, this.manifest.id);
		
		this.state = {
			activeWorld: null,
			worlds: [],
			templateSets: [],
		};

		this.settingTab = new WorldBuilderSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

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
			const ensured = await ensureDefaultTemplates(
				this.app,
				this.settings,
				this.pluginDir,
				this.state.templateSets
			);
			if (!ensured.ok) {
				new Notice(	t('notice.defaults-install-failed', { detail: ensured.detail ? ` (${ensured.detail})` : '',	}));}
			await this.refreshState();
		});
	}

	onunload() {}

	async refreshState() {
		this.state = await scanVault(this.app, this.settings);
		
		const picked = pickLiveDefaultTemplateSet(
			this.state.templateSets,
			this.settings.defaultTemplateSet
		);

		if (picked.name !== null && picked.switched) {
			this.settings.defaultTemplateSet = picked.name;
			await this.saveSettings();
			new Notice(	t('notice.default-template-set-switched', {	from: picked.from, to: picked.name,}));
		}
		
		const activeCount = this.state.worlds.filter(w => w.status === 'active').length;
		const conflict = this.state.worlds.length > 0 && activeCount !== 1;
		if (conflict && !this.activeWorldConflictNotified) {
			new Notice(
				activeCount > 1
					? t('notice.active-world-conflict-multi')
					: t('notice.active-world-conflict-none')
			);
			this.activeWorldConflictNotified = true;
		} else if (!conflict) {
			this.activeWorldConflictNotified = false;	
		}

		this.updateRibbonTooltip();
		this.settingTab?.update();
	}

	private updateRibbonTooltip(): void {
		const worldName = this.state.activeWorld?.name;
		setTooltip(
			this.ribbonIconEl,
			worldName
				? t('ribbon.active', { name: worldName })
				: t('ribbon.none')
		);
	}

	private showStatusMenu(evt: MouseEvent): void {
		const menu = new Menu();

		const activeWorld = this.state.activeWorld;
		menu.addItem(item => item
			.setTitle(activeWorld ? t('menu.status-active', { name: activeWorld.name })	: t('menu.status-none'))
			.setIcon('globe')
			.setDisabled(true)
		);

		menu.addItem(item => item
			.setTitle(t('menu.status-default-set', {
				name: this.settings.defaultTemplateSet || t('menu.status-default-none'),
			}))
			.setIcon('layout-template')
			.setDisabled(true)
		);

		menu.addSeparator();

		menu.addItem(item => item
			.setTitle(t('menu.open-settings'))
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
				new Notice(t('notice.template-set-deleted', { name: file.name }));
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