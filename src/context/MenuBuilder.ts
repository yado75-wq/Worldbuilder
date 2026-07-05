import { App, Menu, Notice, TAbstractFile, TFolder } from 'obsidian';
import { PluginState, WorldBuilderSettings } from '../types';
import { resolveContext } from './ContextResolver';
import { newWorld } from '../commands/NewWorldCommand';
import { switchToWorld } from '../commands/SwitchWorldCommand';

export function registerFileMenu(
	app: App,
	menu: Menu,
	file: TAbstractFile,
	state: PluginState,
	settings: WorldBuilderSettings
): void {

	// Never show menu items on system folder or its children
	if (
		file.path === settings.systemFolder ||
		file.path.startsWith(settings.systemFolder + '/')
	) return;

	const context = resolveContext(file, state.worlds);

	switch (context.type) {

		case 'vault-root':
			menu.addItem(item => item
				.setTitle('New world')
				.setIcon('globe')
				.onClick(() => { void newWorld(app, state, ''); })
			);
			break;

		case 'unknown':
			if (file instanceof TFolder) {
				menu.addItem(item => item
					.setTitle('New world')
					.setIcon('globe')
					.onClick(() => { void newWorld(app, state, file.path); })
				);
			}
			break;

		case 'world-root':
			menu.addSeparator();
			menu.addItem(item => item
				.setTitle('Edit world meta')
				.setIcon('pencil')
				.onClick(() => { void onEditWorldMeta(app, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Refresh dashboard')
				.setIcon('layout-dashboard')
				.onClick(() => { void onRefreshDashboard(app, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Sync world folders')
				.setIcon('folder-sync')
				.onClick(() => { void onSyncWorldFolders(app, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Switch to this world')
				.setIcon('check')
				.onClick(() => { void switchToWorld(app, state, context.world.path); })
			);
			menu.addSeparator();
			break;

		case 'entity-folder':
			menu.addItem(item => item
				.setTitle(`New ${context.entityType.toLowerCase()}`)
				.setIcon('plus-circle')
				.onClick(() => {
					void onCreateEntity(app, context.world.path, context.entityType, context.folder.path);
				})
			);
			break;

		case 'entity-file':
			menu.addItem(item => item
				.setTitle(`Edit ${context.entityType.toLowerCase()}`)
				.setIcon('pencil')
				.onClick(() => {
					void onEditEntity(app, context.world.path, context.entityType, context.file.path);
				})
			);
			break;

		case 'index-file':
			menu.addItem(item => item
				.setTitle('Edit world meta')
				.setIcon('pencil')
				.onClick(() => { void onEditWorldMeta(app, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Refresh dashboard')
				.setIcon('layout-dashboard')
				.onClick(() => { void onRefreshDashboard(app, context.world.path); })
			);
			break;

		case 'generic-folder':
			break;
	}
}

// ── Stubs — replaced as commands are implemented ──────────────────────────────

function onEditWorldMeta(app: App, worldPath: string): void {
	new Notice(`Edit world meta: ${worldPath}`);
}

function onRefreshDashboard(app: App, worldPath: string): void {
	new Notice(`Refresh dashboard: ${worldPath}`);
}

function onSyncWorldFolders(app: App, worldPath: string): void {
	new Notice(`Sync folders: ${worldPath}`);
}

function onCreateEntity(
	app: App,
	worldPath: string,
	entityType: string,
	folderPath: string
): void {
	new Notice(`Create ${entityType} in: ${folderPath}`);
}

function onEditEntity(
	app: App,
	worldPath: string,
	entityType: string,
	filePath: string
): void {
	new Notice(`Edit ${entityType}: ${filePath}`);
}
