import { App, Menu, MenuItem, TAbstractFile, TFolder, Notice } from 'obsidian';
import { PluginState, WorldBuilderSettings, WorldInfo } from '../types';
import { resolveContext } from './ContextResolver';
import { 
	isEntityTypeUsable,
	isPluginMenuSuppressedPath, 
	resolveTemplateSetForWorld,
	listUsableWildcardTypes, 
} from './EntityTypeUsable';
import { newWorld } from '../commands/NewWorldCommand';
import { switchToWorld } from '../commands/SwitchWorldCommand';
import { syncWorldFolders } from '../commands/SyncWorldFoldersCommand';
import { syncWorldFiles } from '../commands/SyncWorldFilesCommand';
import { refreshDashboard } from '../commands/RefreshDashboardCommand';
import { editWorldMeta } from '../commands/EditWorldMetaCommand';
import { createEntity } from '../commands/CreateEntityCommand';
import { editEntity } from '../commands/EditEntityCommand';
import { refreshAllTimeframes } from '../commands/RefreshAllTimeframesCommand';

export function hasActiveWorldConflict(state: PluginState): boolean {
	if (state.worlds.length === 0) return false;
	return state.worlds.filter(w => w.status === 'active').length !== 1;
}

function blockIfConflict(state: PluginState): boolean {
	if (!hasActiveWorldConflict(state)) return false;
	new Notice(
		'Active world conflict: open worldbuilder settings and use set as active on one world.'
	);
	return true;
}

function templateSetForWorld(state: PluginState, world: WorldInfo) {
	return resolveTemplateSetForWorld(state.templateSets, world.templateSet);
}

export function registerFileMenu(
	app: App,
	menu: Menu,
	file: TAbstractFile,
	state: PluginState,
	settings: WorldBuilderSettings,
	saveSettings: () => void
): void {

	const templatesRootPath = `${settings.systemFolder}/${settings.templatesFolder}`;
	
	if (isPluginMenuSuppressedPath(file.path)) {
		return;
	}
	
	const context = resolveContext(app, file, state.worlds, state.templateSets, templatesRootPath);

	switch (context.type) {

		case 'vault-root':
			menu.addItem(item => item
				.setTitle('New world')
				.setIcon('globe')
				.onClick(() => { void newWorld(app, settings, state, ''); })
			);
			break;

		case 'unknown':
			if (file instanceof TFolder) {
				menu.addItem(item => item
					.setTitle('New world')
					.setIcon('globe')
					.onClick(() => { void newWorld(app, settings, state, file.path); })
				);
			}
			break;

		case 'template-set': {
			const isDefault = context.templateSet.name === settings.defaultTemplateSet;
			const isValid = context.templateSet.isValid;

			menu.addItem(item => {
				item.setTitle('Set as default template set')
					.setIcon('star')
					.setDisabled(isDefault || !isValid)
					.onClick(() => {
						settings.defaultTemplateSet = context.templateSet.name;
						saveSettings();
					});
			});
			break;
		}

		case 'world-root': {
			const isActive = context.world.status === 'active';
			menu.addSeparator();
			menu.addItem(item => item
				.setTitle('Edit world meta')
				.setIcon('pencil')
				.onClick(() => { if (!blockIfConflict(state)) void editWorldMeta(app, state, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Refresh dashboard')
				.setIcon('layout-dashboard')
				.onClick(() => { if (!blockIfConflict(state)) void refreshDashboard(app, state, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Sync world folders')
				.setIcon('folder-sync')
				.onClick(() => { if (!blockIfConflict(state)) void syncWorldFolders(app, state, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Sync world files')
				.setIcon('arrow-right-left')
				.onClick(() => { if (!blockIfConflict(state)) void syncWorldFiles(app, state, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Refresh all timeframes')
				.setIcon('refresh-cw')
				.onClick(() => { if (!blockIfConflict(state)) void refreshAllTimeframes(app, state, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Switch to this world')
				.setIcon('check')
				.setDisabled(isActive)
				.onClick(() => { void switchToWorld(app, state, context.world.path); })
			);

			const worldWildcardTypes = getUsableWildcardTypes(state, context.world);
			if (worldWildcardTypes.length > 0) {
				menu.addSeparator();
				addWildcardItems(menu, worldWildcardTypes, () => context.world.path,
					(entityType, folderPath) => {
						if (blockIfConflict(state)) return;
						void createEntity(app, state, context.world.path, entityType, folderPath);
					}
				);
			}
			menu.addSeparator();
			break;
		}

		case 'entity-folder': {
			const ts = templateSetForWorld(state, context.world);
			if (isEntityTypeUsable(ts, context.entityType)) {
				menu.addItem(item => item
					.setTitle(`New ${context.entityType.toLowerCase()}`)
					.setIcon('plus-circle')
					.onClick(() => {
						if (blockIfConflict(state)) return;
						void createEntity(app, state, context.world.path, context.entityType, context.folder.path);
					})
				);
			}
			const entityWildcardTypes = getUsableWildcardTypes(state, context.world);
			addWildcardItems(menu, entityWildcardTypes, () => context.folder.path,
				(entityType, folderPath) => {
					if (blockIfConflict(state)) return;
					void createEntity(app, state, context.world.path, entityType, folderPath);
				}
			);
			break;
		}

		case 'entity-file': {
			const ts = templateSetForWorld(state, context.world);
			if (isEntityTypeUsable(ts, context.entityType)) {
				menu.addItem(item => item
					.setTitle(`Edit ${context.entityType.toLowerCase()}`)
					.setIcon('pencil')
					.onClick(() => {
						if (blockIfConflict(state)) return;
						void editEntity(app, state, context.world.path, context.entityType, context.file.path);
					})
				);
			}
			break;
		}

		case 'index-file':
			menu.addItem(item => item
				.setTitle('Edit world meta')
				.setIcon('pencil')
				.onClick(() => { if (!blockIfConflict(state)) void editWorldMeta(app, state, context.world.path); })
			);
			menu.addItem(item => item
				.setTitle('Refresh dashboard')
				.setIcon('layout-dashboard')
				.onClick(() => { if (!blockIfConflict(state)) void refreshDashboard(app, state, context.world.path); })
			);
			break;

		case 'generic-folder': {
			const genericWildcardTypes = getUsableWildcardTypes(state, context.world);
			addWildcardItems(menu, genericWildcardTypes, () => context.folder.path,
				(entityType, folderPath) => {
					if (blockIfConflict(state)) return;
					void createEntity(app, state, context.world.path, entityType, folderPath);
				}
			);
			break;
		}
	}
}

function getUsableWildcardTypes(state: PluginState, world: WorldInfo): string[] {
	const templateSet = templateSetForWorld(state, world);
	return listUsableWildcardTypes(templateSet);
}

function addWildcardItems(
	menu: Menu,
	types: string[],
	getFolderPath: () => string,
	onCreate: (entityType: string, folderPath: string) => void
): void {
	if (types.length === 0) return;

	if (types.length > 3) {
		menu.addSeparator();
	}

	for (const entityType of types) {
		menu.addItem((item: MenuItem) => item
			.setTitle(`New ${entityType.toLowerCase()}`)
			.setIcon('file-plus')
			.onClick(() => { onCreate(entityType, getFolderPath()); })
		);
	}
}