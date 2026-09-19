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
import { RenameTemplateSetWorldModal } from './ui/RenameTemplateSetModal';
import { ConfirmModal } from './ui/ConfirmModal';
import { setActiveWorld } from './commands/SwitchWorldCommand';
import { editWorldMeta } from './commands/EditWorldMetaCommand';
import { cloneWorld } from './commands/CloneWorldCommand';
import { refreshDashboard } from './commands/RefreshDashboardCommand';
import { syncWorldFiles } from './commands/SyncWorldFilesCommand';
import { syncWorldFolders } from './commands/SyncWorldFoldersCommand';
import { refreshAllTimeframes } from './commands/RefreshAllTimeframesCommand';
import { newWorld } from './commands/NewWorldCommand';
import { exportWorld } from './commands/ExportWorldCommand';
import { importWorld } from './commands/ImportWorldCommand';
import { listRenamableEntityTypes, renameEntityType } from './commands/RenameEntityTypeCommand';
import { listDeletableEntityTypes, deleteEntityType } from './commands/DeleteEntityTypeCommand';
import { renameTemplateSet, updateTemplateSetFrontmatter } from './commands/RenameTemplateSetCommand';
import { hasActiveWorldConflict } from './context/ActiveWorld';
import { resolveTemplateSetByName } from './context/TemplateSetResolve';
import { hasLeadingUnderscore } from './util/names';
import { auditTemplateSet } from './state/templateSetAudit';
import { auditWorld } from './state/worldAudit';
import { ValidationIssue } from './types/templateSet';
import { t } from './i18n';

/** Shared issues table — set issues vs world issues passed in separately (never mixed). */
function renderIssuesTable(
	parentEl: HTMLElement,
	issues: ValidationIssue[],
	summary: string,
	cssClass: string
): void {
	parentEl.querySelectorAll(`.${cssClass}`).forEach(el => el.remove());
	if (issues.length === 0) return;

	const details = parentEl.createEl('details', { cls: cssClass });
	details.open = true;
	details.createEl('summary', { text: summary });

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
	for (const issue of issues) {
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

function issuesSummaryText(issues: ValidationIssue[]): string {
	const errorCount = issues.filter(i => i.severity === 'error').length;
	const warningCount = issues.filter(i => i.severity === 'warning').length;
	if (errorCount > 0 && warningCount > 0) {
		return t('settings.show-errors-and-warnings', {
			errors: String(errorCount),
			warnings: String(warningCount),
		});
	}
	if (errorCount > 0) {
		return t('settings.show-errors', { count: String(errorCount) });
	}
	if (warningCount > 0) {
		return t('settings.show-warnings', { count: String(warningCount) });
	}
	return t('settings.show-notes');
}


export class WorldBuilderSettingTab extends PluginSettingTab {
	plugin: WorldBuilderPlugin;

	/** Last Audit world results per world path (not mixed with template-set scan issues). */
	private worldIssuesByPath = new Map<string, ValidationIssue[]>();

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
					issuesSummary = t('settings.show-errors-and-warnings', {
						errors: String(errorCount),
						warnings: String(warningCount),
					});
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
						const setName = set.name;

						setting
							.addButton(btn => btn
								.setButtonText(t('settings.set-as-default'))
								.setDisabled(isDefault || !set.isValid)
								.onClick(() => {
									void (async () => {
										this.plugin.settings.defaultTemplateSet = setName;
										await this.plugin.saveSettings();
										this.update();
									})();
								})
							)
							.addButton(btn => btn
								.setButtonText(t('settings.assign-to-world'))
								.onClick(() => {
									void this.assignTemplateSetToWorld(setName);
								})
							)
							.addButton(btn => btn
								.setButtonText(t('settings.manage'))
								.onClick((evt: MouseEvent) => {
									const menu = new Menu();

									menu.addItem(item => item
										.setTitle(t('settings.clone'))
										.setIcon('copy')
										.onClick(() => this.cloneTemplateSet(setName))
									);

									menu.addItem(item => item
										.setTitle(t('settings.rename-template-set'))
										.setIcon('folder-pen') // or 'pencil' / 'folder-input'
										.onClick(() => {
											void this.openRenameTemplateSet(setName);
										})
									);

									menu.addItem(item => item
										.setTitle(t('settings.rename-entity-type'))
										.setIcon('pencil')
										.onClick(() => {
											void this.openRenameEntityType(setName);
										})
									);
							
									menu.addItem(item => item
										.setTitle(t('settings.audit-set'))
										.setIcon('scan-search')
										.onClick(() => {
											void (async () => {
												await this.plugin.refreshState();
												const current = this.plugin.state.templateSets.find(s => s.name === setName);
												if (!current) {
													new Notice(t('notice.template-set-not-found', { name: setName }));
													return;
												}
												const report = auditTemplateSet(current, this.plugin.state.worlds);
												const used =
													report.usedBy.length === 0
														? t('notice.audit-set-unused')
														: t('notice.audit-set-used-by', {
																list: report.usedBy
																	.map(w =>
																		w.status === 'active' ? `${w.name} ★` : w.name
																	)
																	.join(', '),
															});
												if (report.issues.length === 0) {
													new Notice(
														t('notice.audit-set-clean', { name: setName, used })
													);
												} else {
													new Notice(
														t('notice.audit-set-found', {
															name: setName,
															errors: String(report.errorCount),
															warnings: String(report.warningCount),
															used,
														})
													);
												}
												this.update();
											})();
										})
									);

									menu.addSeparator();

									menu.addItem(item => item
										.setTitle(t('settings.delete-entity-type'))
										.setIcon('trash')
										.setWarning(true)
										.onClick(() => {
											void this.openDeleteEntityType(setName);
										})
									);
									
									menu.addItem(item => item
										.setTitle(t('settings.reset-to-defaults'))
										.setIcon('rotate-ccw')
										.setWarning(true)
										.onClick(() => {
											void (async () => {
												const result = await resetTemplateSet(
													this.app,
													this.plugin.settings,
													this.plugin.pluginDir,
													setName
												);
												if (!result.ok) {
													new Notice(t('settings.reset-failed', {
														name: setName,
														detail: result.detail ?? '',
													}));
													return;
												}
												await this.plugin.refreshState();
												this.update();
											})();
										})
									);

									menu.showAtMouseEvent(evt);
								})
							);

						if (set.issues.length > 0) {
							renderIssuesTable(
								setting.settingEl,
								set.issues,
								issuesSummary,
								'wb-template-issues'
							);
						}
					},
				});
			}
		}

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

				let desc = t('settings.world-desc', {
					path: world.path,
					templateSet: world.templateSet,
				});
				const tsResolve = resolveTemplateSetByName(
					this.plugin.state.templateSets,
					world.templateSet
				);
				if (!tsResolve.ok) {
					desc +=
						tsResolve.reason === 'none'
							? t('settings.world-no-template-sets')
							: t('settings.world-template-missing', { name: world.templateSet });
				} else if (conflict && activeCount > 1 && isActive) {
					desc += t('settings.world-multi-active');
				} else if (conflict && activeCount === 0) {
					desc += t('settings.world-zero-active');
				}

				const folderName = world.folder.name;
				const nameMismatch = world.name !== folderName;
				const worldIssues = this.worldIssuesByPath.get(world.path) ?? [];

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

								menu.addItem(item => item
									.setTitle(t('menu.export-world'))
									.setIcon('package')
									.onClick(() => {
										void (async () => {
											await exportWorld(
												this.app,
												this.plugin.state,
												this.plugin.settings,
												path,
												this.plugin.manifest.version
											);
										})();
									})
								);

								menu.addItem(item => item
									.setTitle(t('settings.audit-world'))
									.setIcon('scan-search')
									.onClick(() => {
										const report = auditWorld(
											this.app,
											world,
											this.plugin.state.templateSets
										);
										this.worldIssuesByPath.set(path, report.issues);
										if (report.issues.length === 0) {
											new Notice(
												t('notice.audit-world-clean', {
													name: report.worldName,
													set: report.templateSetName,
												})
											);
										} else {
											new Notice(
												t('notice.audit-world-table', {
													name: report.worldName,
													count: String(report.issues.length),
												})
											);
										}
										this.update();
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

						if (worldIssues.length > 0) {
							renderIssuesTable(
								setting.settingEl,
								worldIssues,
								issuesSummaryText(worldIssues),
								'wb-world-issues'
							);
						}

						if (conflict && isActive) {
							setting.nameEl.addClass('wb-invalid');
						} else if (nameMismatch) {
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
				extraButtons: [
					(btn) => {
						btn
							.setIcon('plus')
							.setTooltip(t('settings.new-template-set'))
							.onClick(() => {
								this.openNewTemplateSetModal();
							});
					},
				],
				items: templateSetItems,
			},
			{
				type: 'group',
				heading: conflict
					? t('settings.active-world-conflict')
					: t('settings.active-world'),
				extraButtons: [
					(btn) => {
						btn
							.setIcon('plus')
							.setTooltip(t('menu.new-world'))
							.onClick(() => {
								const menu = new Menu();
								menu.addItem(item => item
									.setTitle(t('menu.new-world'))
									.setIcon('plus')
									.onClick(() => {
										void (async () => {
											await newWorld(
												this.app,
												this.plugin.settings,
												this.plugin.state,
												''
											);
											await this.plugin.refreshState();
											this.update();
										})();
									})
								);
								menu.addItem(item => item
									.setTitle(t('menu.import-world'))
									.setIcon('package')
									.onClick(() => {
										void (async () => {
											await importWorld(
												this.app,
												this.plugin.state,
												this.plugin.settings
											);
											await this.plugin.refreshState();
											this.update();
										})();
									})
								);
								const rect = btn.extraSettingsEl.getBoundingClientRect();
								menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
							});
					},
				],
				items: worldItems,
			},
		];
	}

	private openNewTemplateSetModal(): void {
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
						new Notice(t('notice.already-exists', { name: trimmed }));
						return;
					}
					await this.app.vault.createFolder(path);
					const result = await resetTemplateSet(
						this.app,
						this.plugin.settings,
						this.plugin.pluginDir,
						trimmed
					);
					if (!result.ok) {
						new Notice(t('settings.create-template-set-failed', {
							name: trimmed,
							detail: result.detail ?? '',
						}));
						return;
					}
					await this.plugin.refreshState();
					this.update();
				})();
			},
			() => {}
		).open();
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

	private openRenameTemplateSet(setName: string): void {
		const set = this.plugin.state.templateSets.find(s => s.name === setName);
		if (!set) {
			new Notice(t('notice.template-set-not-found', { name: setName }));
			return;
		}

		new InputModal(
			this.app,
			t('settings.rename-template-set').replace('…', ''),
			setName,
			setName,
			(name) => {
				void (async () => {
					const result = await renameTemplateSet(
						this.app,
						this.plugin.state,
						this.plugin.settings,
						setName,
						name,
						async (info) =>
							await new Promise<string[] | null>((resolve) => {
								new RenameTemplateSetWorldModal(this.app, {
									oldName: info.oldName,
									newName: info.newName,
									worlds: info.worlds,
									defaultsWarning: info.defaultsWarning,
									onDone: resolve,
								}).open();
							}),
						async (info) =>
							await new Promise<boolean>((resolve) => {
								new ConfirmModal(
									this.app,
									t('modal.rename-template-archive-body', {
										old: info.oldName,
										new: info.newName,
									}),
									(ok) => resolve(ok),
									t('modal.rename-template-archive-ok'),
									t('form.cancel'),
									t('modal.rename-template-archive-title')
								).open();
							})
					);

					if (!result.ok) return;

					if ( result.ok && this.plugin.settings.defaultTemplateSet === result.oldName ) {
						if (result.archived) {
							const live = this.plugin.state.templateSets
								.map(s => s.name)
								.filter(n => n !== result.oldName);
							const next =
								live.includes('defaults') ? 'defaults' : (live[0] ?? '');
							this.plugin.settings.defaultTemplateSet = next;
							await this.plugin.saveSettings();
							if (next) {
								new Notice(
									t('notice.default-template-set-switched', {
										from: result.oldName,
										to: next,
									})
								);
							}
						} else {
							this.plugin.settings.defaultTemplateSet = result.newName;
							await this.plugin.saveSettings();
						}
					}

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

	private openRenameEntityType(setName: string): void {
		const set = this.plugin.state.templateSets.find(s => s.name === setName);
		if (!set) {
			new Notice(t('notice.template-set-not-found', { name: setName }));
			return;
		}
		const types = listRenamableEntityTypes(set.fieldSets);
		if (types.length === 0) {
			new Notice(t('notice.rename-entity-none'));
			return;
		}

		// 1) Pick old type
		void (async () => {
			const oldType = await new Promise<string | null>((resolve) => {
				let done = false;
				const modal = new Modal(this.app);
				modal.titleEl.setText(t('modal.rename-entity-pick-title', { set: setName }));
				for (const typeName of types) {
					const btn = modal.contentEl.createEl('button', {
						text: typeName,
						cls: 'wb-world-picker-btn',
					});
					btn.addEventListener('click', () => {
						if (done) return;
						done = true;
						modal.close();
						resolve(typeName);
					});
				}
				modal.onClose = () => {
					if (!done) resolve(null);
				};
				modal.open();
			});
			if (!oldType) return;

			// 2) New name
			new InputModal(
				this.app,
				t('modal.rename-entity-new-prompt', { old: oldType }),
				t('modal.rename-entity-new-placeholder'),
				oldType,
				(name) => {
					void (async () => {
						const result = await renameEntityType(
							this.app,
							this.plugin.state,
							setName,
							oldType,
							name,
							async (impact) => {
								return await new Promise<boolean>((resolve) => {
									new ConfirmModal(
										this.app,
										t('modal.rename-entity-confirm', {
											old: oldType,
											new: name.trim(),
											rules: String(impact.rulesLines),
											fields: String(impact.fieldTokenFiles),
											notes: String(impact.notesEstimate),
											worlds: String(impact.worldCount),
										}),
										(ok) => resolve(ok),
										t('settings.rename-entity-type').replace('…', ''),
										t('form.cancel'),
										t('modal.rename-entity-confirm-title')
									).open();
								});
							}
						);
						if (!result.ok) return;
						await this.plugin.refreshState();
						this.update();
					})();
				},
				() => {}
			).open();
		})();
	}

	private openDeleteEntityType(setName: string): void {
		const set = this.plugin.state.templateSets.find(s => s.name === setName);
		if (!set) {
			new Notice(t('notice.template-set-not-found', { name: setName }));
			return;
		}
		const types = listDeletableEntityTypes(set.fieldSets);
		if (types.length === 0) {
			new Notice(t('notice.delete-entity-none'));
			return;
		}

		void (async () => {
			const typeName = await new Promise<string | null>((resolve) => {
				let done = false;
				const modal = new Modal(this.app);
				modal.titleEl.setText(t('modal.delete-entity-pick-title', { set: setName }));
				for (const name of types) {
					const btn = modal.contentEl.createEl('button', {
						text: name,
						cls: 'wb-world-picker-btn',
					});
					btn.addEventListener('click', () => {
						if (done) return;
						done = true;
						modal.close();
						resolve(name);
					});
				}
				modal.onClose = () => {
					if (!done) resolve(null);
				};
				modal.open();
			});
			if (!typeName) return;

			const result = await deleteEntityType(
				this.app,
				this.plugin.state,
				setName,
				typeName,
				async (impact) => {
					const lines = [
						t('modal.delete-entity-confirm-head', {
							type: typeName,
							set: setName,
						}),
						'',
						t('modal.delete-entity-confirm-instances', {
							count: String(impact.instanceCount),
						}),
						t('modal.delete-entity-confirm-actions'),
						impact.willRemoveFolderRule
							? t('modal.delete-entity-will-remove-rule')
							: t('modal.delete-entity-keep-rule'),
						impact.willCleanLinkTokens
							? t('modal.delete-entity-will-clean-links')
							: t('modal.delete-entity-keep-links'),
					];
					if (impact.genericDefaultsWarning) {
						lines.push('', t('modal.delete-entity-generic-warn'));
					}
					return await new Promise<boolean>((resolve) => {
						new ConfirmModal(
							this.app,
							lines.join('\n'),
							(ok) => resolve(ok),
							t('settings.delete-entity-type').replace('…', ''),
							t('form.cancel'),
							t('modal.delete-entity-confirm-title')
						).open();
					});
				}
			);
			if (!result.ok) return;
			await this.plugin.refreshState();
			this.update();
		})();
	}
}

