import { App, Menu, Notice, TAbstractFile, TFolder } from 'obsidian';
import { PluginState, WorldBuilderSettings } from '../types';
import { resolveContext } from './ContextResolver';
import { newWorld } from '../commands/NewWorldCommand';
import { switchToWorld } from '../commands/SwitchWorldCommand';
import { syncWorldFolders } from '../commands/SyncWorldFoldersCommand';
import { refreshDashboard } from '../commands/RefreshDashboardCommand';
import { editWorldMeta } from '../commands/EditWorldMetaCommand';
import { createEntity } from '../commands/CreateEntityCommand';

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
				.onClick(() => { void editWorldMeta(app, state, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Refresh dashboard')
				.setIcon('layout-dashboard')
				.onClick(() => { void refreshDashboard(app, state, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Sync world folders')
				.setIcon('folder-sync')
				.onClick(() => { void syncWorldFolders(app, state, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Switch to this world')
				.setIcon('check')
				.onClick(() => { void switchToWorld(app, state, context.world.path); })
			);
			menu.addSeparator();
			break;

		case 'entity-folder': {
			menu.addItem(item => item
				.setTitle(`New ${context.entityType.toLowerCase()}`)
				.setIcon('plus-circle')
				.onClick(() => {
					void createEntity(app, state, context.world.path, context.entityType, context.folder.path);
				})
			);
			// Also show wildcard entity types
			const templateSet = state.templateSets.find(ts => ts.name === context.world.templateSet)
				?? state.templateSets[0];
			const wildcardTypes = templateSet?.folderRules
				.filter(r => r.targetFolder === '*')
				.map(r => r.entityType) ?? [];

			for (const entityType of wildcardTypes) {
				menu.addItem(item => item
					.setTitle(`New ${entityType.toLowerCase()}`)
					.setIcon('file-plus')
					.onClick(() => {
						void createEntity(app, state, context.world.path, entityType, context.folder.path);
					})
				);
			}
			break;
		}

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
				.onClick(() => { void editWorldMeta(app, state, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Refresh dashboard')
				.setIcon('layout-dashboard')
				.onClick(() => { void refreshDashboard(app, state, context.world.path); })
			);
			break;

		case 'generic-folder': {
			// Show all entity types that have * as their target folder
			const world = context.world;
			const templateSet = state.templateSets.find(ts => ts.name === world.templateSet)
				?? state.templateSets[0];
			const wildcardTypes = templateSet?.folderRules
				.filter(r => r.targetFolder === '*')
				.map(r => r.entityType) ?? [];

			for (const entityType of wildcardTypes) {
				menu.addItem(item => item
					.setTitle(`New ${entityType.toLowerCase()}`)
					.setIcon('file-plus')
					.onClick(() => {
						void createEntity(app, state, world.path, entityType, context.folder.path);
					})
				);
			}
			break;
		}
	}
}

// ── Stubs — replaced as commands are implemented ──────────────────────────────

function onEditEntity(
	app: App,
	worldPath: string,
	entityType: string,
	filePath: string
): void {
	new Notice(`Edit ${entityType}: ${filePath}`);
}
