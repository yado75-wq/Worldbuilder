import { App, Menu, Notice, TAbstractFile } from 'obsidian';
import { PluginState } from '../types';
import { resolveContext } from './ContextResolver';
import { newWorld } from '../commands/NewWorldCommand';

export function registerFileMenu(
	app: App,
	menu: Menu,
	file: TAbstractFile,
	state: PluginState
): void {
	const context = resolveContext(file, state.worlds);

	switch (context.type) {

		case 'vault-root':
			menu.addItem(item => item
				.setTitle('New world')
				.setIcon('globe')
				.onClick(() => { void newWorld(app, state, ''); })
			);
			break;

		case 'generic-folder':
			menu.addItem(item => item
				.setTitle('New world')
				.setIcon('globe')
				.onClick(() => { void newWorld(app, state, context.folder.path); })
			);
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
				.onClick(() => { void onSwitchToWorld(app, context.world.path); })
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

		case 'unknown':
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

function onSwitchToWorld(app: App, worldPath: string): void {
	new Notice(`Switch to world: ${worldPath}`);
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
