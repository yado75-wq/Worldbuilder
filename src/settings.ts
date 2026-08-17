import {
	App,
	Modal,
	Menu,
	Notice,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
	SettingGroupItem,
} from 'obsidian';
import WorldBuilderPlugin from './main';
import { cloneTemplateSet, resetTemplateSet } from './commands/SetupCommand';
import { InputModal } from './ui/InputModal';
import { setActiveWorld } from './commands/SwitchWorldCommand';
import { editWorldMeta } from './commands/EditWorldMetaCommand';
import { cloneWorld } from './commands/CloneWorldCommand';
import { refreshDashboard } from './commands/RefreshDashboardCommand';
import { syncWorldFiles } from './commands/SyncWorldFilesCommand';
import { syncWorldFolders } from './commands/SyncWorldFoldersCommand';
import { refreshAllTimeframes } from './commands/RefreshAllTimeframesCommand';
import { hasActiveWorldConflict } from './context/ActiveWorld';

export class WorldBuilderSettingTab extends PluginSettingTab {
	plugin: WorldBuilderPlugin;

	constructor(app: App, plugin: WorldBuilderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const templateSets = this.plugin.state.templateSets;
		const defaultSet = this.plugin.settings.defaultTemplateSet;
		const templateSetItems: SettingGroupItem[] = [];

		if (templateSets.length === 0) {
			templateSetItems.push({
				name: 'No template sets found',
				desc: 'Reload the plugin to initialize default templates.',
			});
		} else {
			for (const set of templateSets) {
				const statusIcon = set.isValid ? '✓' : '✗';
				const isDefault = set.name === defaultSet;
				
				const warningCount = set.issues.filter(i => i.severity === 'warning').length;
				const errorCount = set.issues.filter(i => i.severity === 'error').length;
				const summaryParts: string[] = [];
				if (errorCount) summaryParts.push(`${errorCount} error(s)`);
				if (warningCount) summaryParts.push(`${warningCount} warning(s)`);
				if (summaryParts.length === 0) summaryParts.push('Valid.');

				const desc = [
					summaryParts.join(', '),
					isDefault ? 'Default for new worlds.' : '',
				].filter(Boolean).join(' ');

				templateSetItems.push({
					name: `${statusIcon} ${set.name}${isDefault ? ' ★' : ''}`,
					desc,
					render: (setting: Setting) => {
						setting
							.addButton(btn => btn
								.setButtonText('Set as default')
								.setDisabled(isDefault || !set.isValid)
								.onClick(() => {
									void (async () => {
										this.plugin.settings.defaultTemplateSet = set.name;
										await this.plugin.saveSettings();
										this.update();
									})();
								})
							)
							.addButton(btn => btn
								.setButtonText('Clone')
								.onClick(() => this.cloneTemplateSet(set.name))
							)
							.addButton(btn => btn
								.setButtonText('Assign to world')
								.onClick(() => {
									void this.assignTemplateSetToWorld(set.name);
								})
							)
							.addButton(btn => btn
								.setButtonText('Reset to defaults')
								.setDestructive()
								.onClick(() => {
									void (async () => {
										await resetTemplateSet(
											this.app,
											this.plugin.settings,
											this.plugin.pluginDir,
											set.name
										);
										await this.plugin.refreshState();
										this.update();
									})();
								})
							);

						if (set.issues.length > 0) {
							const details = setting.settingEl.createEl('details', {
								cls: 'wb-template-issues',
							});
							details.createEl('summary', {
								text: `Show ${set.issues.length} issue(s)`,
							});

							const table = details.createEl('table', { cls: 'wb-issues-table' });
							const head = table.createEl('tr');
							for (const label of ['Sev', 'Kind', 'Where', 'Message']) {
								head.createEl('th', { text: label });
							}

							for (const issue of set.issues) {
								const row = table.createEl('tr');
								row.createEl('td', { text: issue.severity });
								row.createEl('td', { text: issue.kind });
								const where =
									issue.file && issue.line != null
										? `${issue.file}:${issue.line}`
										: issue.file ?? '—';
								row.createEl('td', { text: where });
								row.createEl('td', { text: issue.message });
							}
						}
					},
				});
			}
		}

		templateSetItems.push({
			name: 'New template set',
			desc: 'Create a new template set copied from plugin defaults.',
			render: (setting: Setting) => {
				setting.addButton(btn => btn
					.setButtonText('Create')
					.setCta()
					.onClick(() => {
						new InputModal(
							this.app,
							'Template set name',
							'fantasy',
							'',
							(name) => {
								void (async () => {
									const path = `${this.plugin.settings.systemFolder}/${this.plugin.settings.templatesFolder}/${name}`;
									if (this.app.vault.getAbstractFileByPath(path)) {
										new Notice(`"${name}" already exists.`);
										return;
									}
									await this.app.vault.createFolder(path);
									await resetTemplateSet(
										this.app,
										this.plugin.settings,
										this.plugin.pluginDir,
										name
									);
									await this.plugin.refreshState();
									this.update();
								})();
							},
							() => {}
						).open();
					})
				);
			},
		});

		const worlds = this.plugin.state.worlds;
		const activeCount = worlds.filter(w => w.status === 'active').length;
		const conflict = worlds.length > 0 && activeCount !== 1;

		const worldItems: SettingGroupItem[] = [];

		if (worlds.length === 0) {
			worldItems.push({
				name: 'No worlds',
				desc: 'Create a world from the file explorer context menu.',
			});
		} else {
			for (const world of worlds) {
				const isActive = world.status === 'active';
				const uniquelyActive = isActive && activeCount === 1;

				let desc = `Folder: ${world.path} · Template set: ${world.templateSet}`;
				if (conflict && activeCount > 1 && isActive) {
					desc += ' — Multiple active worlds; use Set as active to keep only this one.';
				} else if (conflict && activeCount === 0) {
					desc += ' — No active world; use Set as active.';
				}

				const folderName = world.folder.name;
				const nameMismatch = world.name !== folderName;

				worldItems.push({
					name: nameMismatch
						? `${world.name}${isActive ? ' ★' : ''} · Path: ${world.path}`
						: `${world.name}${isActive ? ' ★' : ''}`,
					desc,
					render: (setting: Setting) => {
						setting.addButton(btn => btn
							.setButtonText('Set as active')
							.setDisabled(uniquelyActive)
							.onClick(() => {
								void (async () => {
									const ok = await setActiveWorld(
										this.app,
										this.plugin.state,
										world.path
									);
									if (!ok) return;
									await this.plugin.refreshState();
									this.update();
								})();
							})
						);

						setting.addButton(btn => btn
							.setButtonText('Actions')
							.setDisabled(hasActiveWorldConflict(this.plugin.state))
							.onClick((evt: MouseEvent) => {
								const menu = new Menu();
								const path = world.path;

								menu.addItem(item => item
									.setTitle('Edit world meta')
									.setIcon('pencil')
									.onClick(() => {
										void (async () => {
											await editWorldMeta(this.app, this.plugin.state, path);
											await this.plugin.refreshState();
											this.update();
										})();
									})
								);

								menu.addItem(item => item
									.setTitle('Clone world')
									.setIcon('copy')
									.onClick(() => {
										void (async () => {
											await cloneWorld(this.app, this.plugin.state, path);
											await this.plugin.refreshState();
											this.update();
										})();
									})
								);

								menu.addSeparator();

								menu.addItem(item => item
									.setTitle('Refresh dashboard')
									.setIcon('layout-dashboard')
									.onClick(() => {
										void refreshDashboard(this.app, this.plugin.state, path);
									})
								);

								menu.addItem(item => item
									.setTitle('Sync world folders')
									.setIcon('folder-sync')
									.onClick(() => {
										void syncWorldFolders(this.app, this.plugin.state, path);
									})
								);

								menu.addItem(item => item
									.setTitle('Sync world files')
									.setIcon('arrow-right-left')
									.onClick(() => {
										void (async () => {
											await syncWorldFiles(this.app, this.plugin.state, path);
											await this.plugin.refreshState();
											this.update();
										})();
									})
								);

								menu.addItem(item => item
									.setTitle('Refresh all timeframes')
									.setIcon('refresh-cw')
									.onClick(() => {
										void refreshAllTimeframes(this.app, this.plugin.state, path);
									})
								);

								menu.showAtMouseEvent(evt);
							})
						);

						if (conflict && isActive) {
							setting.nameEl.addClass('wb-invalid');
						}else if (nameMismatch) {
							setting.nameEl.addClass('wb-name-mismatch');
						}
					},
				});
			}
		}

		return [
			{
				type: 'group',
				heading: 'Template sets',
				items: templateSetItems,
			},
			{
				type: 'group',
				heading: conflict ? 'Active world ⚠' : 'Active world',
				items: worldItems,
			},
		];
	}

	private cloneTemplateSet(sourceName: string): void {
		new InputModal(
			this.app,
			'Name for cloned template set',
			'fantasy-copy',
			`${sourceName}-copy`,
			(name) => {
				void (async () => {
					const created = await cloneTemplateSet(
						this.app,
						this.plugin.settings,
						sourceName,
						name
					);
					if (!created) return;

					this.plugin.settings.defaultTemplateSet = name;
					await this.plugin.saveSettings();
					await this.plugin.refreshState();
					this.update();
				})();
			},
			() => {}
		).open();
	}

	private async assignTemplateSetToWorld(templateSetName: string): Promise<void> {
		const worlds = this.plugin.state.worlds;
		if (worlds.length === 0) {
			new Notice('No worlds found.');
			return;
		}

		const picked = await new Promise<number | null>((resolve) => {
			let resolved = false;
			const modal = new Modal(this.app);
			modal.titleEl.setText(`Assign "${templateSetName}" to world`);

			for (let i = 0; i < worlds.length; i++) {
				const world = worlds[i];
				if (!world) continue;
				const active = world.status === 'active' ? ' ★' : '';
				const current = world.templateSet === templateSetName ? ' (current)' : '';
				const label = `${world.name}${active}${current}`;

				const btn = modal.contentEl.createEl('button', {
					text: label,
					cls: 'wb-world-picker-btn',
				});
				btn.addEventListener('click', () => {
					if (resolved) return;
					resolved = true;
					modal.close();
					resolve(i);
				});
			}

			modal.onClose = () => {
				if (!resolved) resolve(null);
			};
			modal.open();
		});

		if (picked === null) return;

		const world = worlds[picked];
		if (!world) return;

		const currentContent = await this.app.vault.read(world.indexFile);
		const updatedContent = updateTemplateSetFrontmatter(currentContent, templateSetName);
		await this.app.vault.modify(world.indexFile, updatedContent);
		await this.plugin.refreshState();
		this.update();
		new Notice(`Assigned "${templateSetName}" to "${world.name}".`);
	}
}

function updateTemplateSetFrontmatter(content: string, templateSetName: string): string {
	const frontmatterPattern = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;
	const match = content.match(frontmatterPattern);

	if (!match?.[1]) {
		return `---\ntags:\n  - world\ntemplate_set: ${templateSetName}\n---\n\n${content}`;
	}

	const frontmatterBody = match[1];
	const updatedFrontmatter = frontmatterBody.replace(
		/^template_set:.*$/m,
		`template_set: ${templateSetName}`
	);

	if (updatedFrontmatter === frontmatterBody) {
		return content.replace(
			frontmatterPattern,
			`---\n${frontmatterBody}\ntemplate_set: ${templateSetName}\n---\n`
		);
	}

	return content.replace(frontmatterPattern, `---\n${updatedFrontmatter}\n---\n`);
}