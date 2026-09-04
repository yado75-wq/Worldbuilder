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
import { InputModal } from './formkit/ui/InputModal';
import { setActiveWorld } from './commands/SwitchWorldCommand';
import { editWorldMeta } from './commands/EditWorldMetaCommand';
import { cloneWorld } from './commands/CloneWorldCommand';
import { refreshDashboard } from './commands/RefreshDashboardCommand';
import { syncWorldFiles } from './commands/SyncWorldFilesCommand';
import { syncWorldFolders } from './commands/SyncWorldFoldersCommand';
import { refreshAllTimeframes } from './commands/RefreshAllTimeframesCommand';
import { hasActiveWorldConflict } from './context/ActiveWorld';
import { resolveTemplateSetByName } from './context/TemplateSetResolve';
import { hasLeadingUnderscore } from './util/names';
import { t } from './i18n';

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
				name: t('settings.no-template-sets'),
				desc: t('settings.no-template-sets-desc'),
			});
		} else {
			for (const set of templateSets) {
				const statusIcon = set.isValid ? '✓' : '✗';
				const isDefault = set.name === defaultSet;
								
				const errorCount = set.issues.filter(i => i.severity === 'error').length;
				const warningCount = set.issues.filter(i => i.severity === 'warning').length;
				
				const lines: string[] = [];

				if (isDefault) {
					lines.push(t('settings.default-for-new-worlds'));
				}

				if (errorCount > 0) {
					lines.push(t('settings.error-count', { count: String(errorCount) }));
				}
				if (warningCount > 0) {
					lines.push(t('settings.warning-count', { count: String(warningCount) }));
				}

				if (errorCount === 0 && warningCount === 0) {
					lines.push(t('settings.valid'));
				}

				let issuesSummary: string;
				if (errorCount > 0 && warningCount > 0) {
					issuesSummary = t('settings.show-errors-and-warnings', { errors: String(errorCount), warnings: String(warningCount) });
				} else if (errorCount > 0) {
					issuesSummary = t('settings.show-errors', { count: String(errorCount) });
				} else if (warningCount > 0) {
					issuesSummary = t('settings.show-warnings', { count: String(warningCount) });
				} else {
					issuesSummary = t('settings.show-notes');
				}
				const desc = lines.join('·');
				templateSetItems.push({
					name: `${statusIcon} ${set.name}${isDefault ? ' ★' : ''}`,
					desc,
					render: (setting: Setting) => {
						setting
							.addButton(btn => btn
								.setButtonText(t('settings.set-as-default'))
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
								.setButtonText(t('settings.clone'))
								.onClick(() => this.cloneTemplateSet(set.name))
							)
							.addButton(btn => btn
								.setButtonText(t('settings.assign-to-world'))
								.onClick(() => {
									void this.assignTemplateSetToWorld(set.name);
								})
							)
							.addButton(btn => btn
								.setButtonText(t('settings.reset-to-defaults'))
								.setDestructive()
								.onClick(() => {
									void (async () => {
										const result = await resetTemplateSet(
											this.app,
											this.plugin.settings,
											this.plugin.pluginDir,
											set.name
										);
										if (!result.ok) {
											new Notice(t('settings.reset-failed', { name: set.name, detail: result.detail ?? '' }));
											return;
										}
										await this.plugin.refreshState();
										this.update();
									})();
								})
							);

						if (set.issues.length > 0) {
							setting.settingEl.querySelectorAll('.wb-template-issues').forEach(el => el.remove());

							const details = setting.settingEl.createEl('details', {
								cls: 'wb-template-issues',
							});
							
							details.createEl('summary', {
								text: issuesSummary,
							});

							const table = details.createEl('table', { cls: 'wb-issues-table' });
							const head = table.createEl('tr');
							for (const label of [
								t('settings.issues-sev'),
								t('settings.issues-kind'),
								t('settings.issues-where'),
								t('settings.issues-message'),
								]) {
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
			name: t('settings.new-template-set'),
			desc: t('settings.new-template-set-desc'),
			render: (setting: Setting) => {
				setting.addButton(btn => btn
					.setButtonText(t('settings.create'))
					.setCta()
					.onClick(() => {
						new InputModal(
							this.app,
							t('settings.template-set-name-prompt'),
							t('settings.template-set-name-placeholder'),
							'',
							(name) => {
								void (async () => {
									const trimmed = name.trim();
									if (!trimmed) return;
									if (hasLeadingUnderscore(trimmed)) {
										new Notice(t('notice.leading-underscore'));
										return;
									}
									const path = `${this.plugin.settings.systemFolder}/${this.plugin.settings.templatesFolder}/${trimmed}`;
									if (this.app.vault.getAbstractFileByPath(path)) {
										new Notice(t('notice.already-exists', { name }));
										return;
									}
									await this.app.vault.createFolder(path);
									const result =await resetTemplateSet(
										this.app,
										this.plugin.settings,
										this.plugin.pluginDir,
										name
									);
									if (!result.ok) {
										new Notice(t('settings.create-template-set-failed', { name, detail: result.detail ?? '' }));
										return;
									}
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
				name: t('settings.no-worlds'),
				desc: t('settings.no-worlds-desc'),
			});
		} else {
			for (const world of worlds) {
				const isActive = world.status === 'active';
				const uniquelyActive = isActive && activeCount === 1;

				let desc = t('settings.world-desc', { path: world.path, templateSet: world.templateSet });
				const tsResolve = resolveTemplateSetByName(this.plugin.state.templateSets, world.templateSet);
				if (!tsResolve.ok) {
					desc += tsResolve.reason === 'none'
						? t('settings.world-no-template-sets')
    					: t('settings.world-template-missing', { name: world.templateSet });
				} else if (conflict && activeCount > 1 && isActive) {
					desc += t('settings.world-multi-active');
				} else if (conflict && activeCount === 0) {
					desc += t('settings.world-zero-active');
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
							.setButtonText(t('settings.set-as-active'))
							.setDisabled(uniquelyActive)
							.onClick(() => {
								void (async () => {
									const result = await setActiveWorld(
										this.app,
										this.plugin.state,
										world.path
									);
									if (!result.ok) return;
									await this.plugin.refreshState();
									this.update();
								})();
							})
						);

						setting.addButton(btn => btn
							.setButtonText(t('settings.actions'))
							.setDisabled(hasActiveWorldConflict(this.plugin.state))
							.onClick((evt: MouseEvent) => {
								const menu = new Menu();
								const path = world.path;

								menu.addItem(item => item
									.setTitle(t('menu.edit-world-meta'))
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
									.setTitle(t('settings.clone'))
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
									.setTitle(t('menu.refresh-dashboard'))
									.setIcon('layout-dashboard')
									.onClick(() => {
										void refreshDashboard(this.app, this.plugin.state, path);
									})
								);

								menu.addItem(item => item
									.setTitle(t('menu.sync-world-folders'))
									.setIcon('folder-sync')
									.onClick(() => {
										void syncWorldFolders(this.app, this.plugin.state, path);
									})
								);

								menu.addItem(item => item
									.setTitle(t('menu.sync-world-files'))
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
									.setTitle(t('menu.refresh-all-timeframes'))
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
				heading: t('settings.template-sets'),
				items: templateSetItems,
			},
			{
				type: 'group',
				heading: conflict ? t('settings.active-world-conflict') : t('settings.active-world'),
				items: worldItems,
			},
		];
	}

	private cloneTemplateSet(sourceName: string): void {
		new InputModal(
			this.app,
			t('settings.clone-template-prompt'),
			t('settings.clone-template-placeholder'),
			`${sourceName}-copy`,
			(name) => {
				void (async () => {
					const trimmed = name.trim();
					if (!trimmed) return;
					if (hasLeadingUnderscore(trimmed)) {
						new Notice(t('notice.leading-underscore'));
						return;
					}
					const created = await cloneTemplateSet(
						this.app,
						this.plugin.settings,
						sourceName,
						trimmed
					);
					if (!created.ok) return;

					this.plugin.settings.defaultTemplateSet = trimmed;
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
			new Notice(t('settings.no-worlds-found'));
			return;
		}

		const picked = await new Promise<number | null>((resolve) => {
			let resolved = false;
			const modal = new Modal(this.app);
			modal.titleEl.setText(t('settings.assign-title', { name: templateSetName }));

			for (let i = 0; i < worlds.length; i++) {
				const world = worlds[i];
				if (!world) continue;
				const active = world.status === 'active' ? ' ★' : '';
				const current = world.templateSet === templateSetName ? t('settings.current-suffix') : '';
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
		new Notice(t('settings.assigned', { templateSet: templateSetName, world: world.name }));
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