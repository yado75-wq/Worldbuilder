import { App, Menu, MenuItem, TAbstractFile, TFolder } from 'obsidian';
import { PluginState, WorldBuilderSettings } from '../types';
import { resolveContext } from './ContextResolver';
import { newWorld } from '../commands/NewWorldCommand';
import { switchToWorld } from '../commands/SwitchWorldCommand';
import { syncWorldFolders } from '../commands/SyncWorldFoldersCommand';
import { refreshDashboard } from '../commands/RefreshDashboardCommand';
import { editWorldMeta } from '../commands/EditWorldMetaCommand';
import { createEntity } from '../commands/CreateEntityCommand';
import { editEntity } from '../commands/EditEntityCommand';

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

		case 'world-root': {
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

			const worldWildcardTypes = getWildcardTypes(state, context.world.templateSet);
			if (worldWildcardTypes.length > 0) {
				menu.addSeparator();
				addWildcardItems(menu, worldWildcardTypes, () => context.world.path,
					(entityType, folderPath) => {
						void createEntity(app, state, context.world.path, entityType, folderPath);
					}
				);
			}
			menu.addSeparator();
			break;
		}

		case 'entity-folder': {
			menu.addItem(item => item
				.setTitle(`New ${context.entityType.toLowerCase()}`)
				.setIcon('plus-circle')
				.onClick(() => {
					void createEntity(app, state, context.world.path, context.entityType, context.folder.path);
				})
			);
			const entityWildcardTypes = getWildcardTypes(state, context.world.templateSet);
			addWildcardItems(menu, entityWildcardTypes, () => context.folder.path,
				(entityType, folderPath) => {
					void createEntity(app, state, context.world.path, entityType, folderPath);
				}
			);
			break;
		}

		case 'entity-file':
			menu.addItem(item => item
				.setTitle(`Edit ${context.entityType.toLowerCase()}`)
				.setIcon('pencil')
				.onClick(() => {
					void editEntity(app, state, context.world.path, context.entityType, context.file.path);
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
			const genericWildcardTypes = getWildcardTypes(state, context.world.templateSet);
			addWildcardItems(menu, genericWildcardTypes, () => context.folder.path,
				(entityType, folderPath) => {
					void createEntity(app, state, context.world.path, entityType, folderPath);
				}
			);
			break;
		}
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWildcardTypes(state: PluginState, templateSetName: string): string[] {
	const templateSet = state.templateSets.find(ts => ts.name === templateSetName)
		?? state.templateSets[0];
	return templateSet?.folderRules
		.filter(r => r.targetFolder === '*')
		.map(r => r.entityType) ?? [];
}

function addWildcardItems(
	menu: Menu,
	types: string[],
	getFolderPath: () => string,
	onCreate: (entityType: string, folderPath: string) => void
): void {
	if (types.length === 0) return;

	if (types.length > 3) {
		// Add a separator and label instead of submenu
		menu.addSeparator();
		for (const entityType of types) {
			menu.addItem((item: MenuItem) => item
				.setTitle(`New ${entityType.toLowerCase()}`)
				.setIcon('file-plus')
				.onClick(() => { onCreate(entityType, getFolderPath()); })
			);
		}
	} else {
		for (const entityType of types) {
			menu.addItem((item: MenuItem) => item
				.setTitle(`New ${entityType.toLowerCase()}`)
				.setIcon('file-plus')
				.onClick(() => { onCreate(entityType, getFolderPath()); })
			);
		}
	}
}


