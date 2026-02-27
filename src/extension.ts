import * as vscode from 'vscode';
import { SkillScanner } from './local/scanner';
import { SkillWatcher } from './local/watcher';
import { InstalledSkillsTreeProvider } from './views/installed-tree';
import { MarketplaceViewProvider } from './views/marketplace/provider';
import { installSkill, updateSkills, uninstallSkill, disposeTerminal, notifyInstallDetected, onOperationCompleted } from './install/installer';
import { checkUpdates, getLastUpdateResult, clearUpdateForSkill } from './api/updates';
import { searchSkills } from './api/search';
import { InstalledSkill, InstalledSkillCard } from './types';
import { getLog } from './logger';
import { addSkillToManifest, removeSkillFromManifest, readManifest, writeManifest, getManifestPath, getMissingSkills, isSkillInManifest, getManifestSkillNames } from './manifest/manifest';
import { toErrorMessage } from './utils/errors';

// Extract InstalledSkill from either a direct InstalledSkill or a SkillItem tree item
function resolveSkill(arg: { skill?: InstalledSkill; path?: string } | InstalledSkill | undefined): InstalledSkill | undefined {
  if (!arg) { return undefined; }
  if ('skill' in arg && arg.skill && 'path' in arg.skill) { return arg.skill; }
  if ('path' in arg && typeof arg.path === 'string') { return arg as InstalledSkill; }
  return undefined;
}

export function activate(context: vscode.ExtensionContext) {
  const scanner = new SkillScanner();
  const treeProvider = new InstalledSkillsTreeProvider(scanner);
  marketplaceProvider = new MarketplaceViewProvider(context.extensionUri, () => treeProvider.refresh());

  // Register TreeView
  const treeView = vscode.window.createTreeView('skills-sh.installedSkills', {
    treeDataProvider: treeProvider,
  });
  context.subscriptions.push(treeView);

  // Helper: update the tree view badge with the current update count
  function updateBadge(): void {
    const updateResult = getLastUpdateResult();
    const count = updateResult?.updates?.length ?? 0;
    treeView.badge = count > 0
      ? { value: count, tooltip: `${count} update(s) available` }
      : undefined;
    vscode.commands.executeCommand('setContext', 'skills-sh.hasUpdates', count > 0);
  }

  // Register Webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MarketplaceViewProvider.viewType,
      marketplaceProvider,
    )
  );

  // Helper: sync marketplace updatable names from the authoritative update cache
  function syncUpdatableNames(): void {
    const updateResult = getLastUpdateResult();
    const updatableNames = new Set((updateResult?.updates ?? []).map(u => u.name));
    marketplaceProvider.setUpdatableNames(updatableNames);
  }

  // Helper: sync full installed skill cards to marketplace webview
  function syncInstalledSkills(): void {
    const updateResult = getLastUpdateResult();
    const updatableNames = new Set((updateResult?.updates ?? []).map(u => u.name));
    const manifestNames = getManifestSkillNames();
    const allSkills = treeProvider.getAllInstalledSkills();
    const cards: InstalledSkillCard[] = allSkills.map(s => ({
      name: s.name,
      folderName: s.folderName,
      description: s.description,
      path: s.path,
      source: s.source,
      scope: s.scope,
      hasUpdate: updatableNames.has(s.name),
      isCustom: s.isCustom,
      inManifest: manifestNames.has(s.folderName),
    }));
    marketplaceProvider.setInstalledSkills(cards);
  }

  // Consolidated state sync — pushes all derived state without rescanning
  function syncAllState(): void {
    const names = treeProvider.getInstalledSkillNames();
    marketplaceProvider.setInstalledNames(names);
    syncInstalledSkills();
    syncUpdatableNames();
    updateBadge();
    previousSkillNames = names;
    previousSkillsList = treeProvider.getAllInstalledSkills();
  }

  // Rescan + sync all state in one call
  async function refreshAllState(): Promise<void> {
    await treeProvider.rescan();
    syncAllState();
  }

  // Start file watcher
  const watcher = new SkillWatcher(scanner);
  watcher.start();

  let previousSkillNames = new Set<string>();
  let previousSkillsList: InstalledSkill[] = [];

  async function handleSkillChanges(source: string): Promise<void> {
    const log = getLog();
    const oldNames = previousSkillNames;
    const oldSkills = previousSkillsList;

    await treeProvider.rescan();
    syncAllState(); // updates previousSkillNames/previousSkillsList

    const newNames = previousSkillNames;
    const newSkills = previousSkillsList;
    log.info(`[${source}] Old (${oldNames.size}): ${[...oldNames].join(', ')}`);
    log.info(`[${source}] New (${newNames.size}): ${[...newNames].join(', ')}`);


    // Notify install listeners + clear update cache for new skills
    for (const name of newNames) {
      notifyInstallDetected(name);
      if (!oldNames.has(name)) {
        log.info(`[${source}] New skill: "${name}", clearing update cache`);
        clearUpdateForSkill(name);
      }
    }

    const added = newNames.size - oldNames.size;
    if (oldNames.size > 0 && added > 0) {
      vscode.window.showInformationMessage(
        `Skills.sh: ${added} new skill(s) installed.`,
        'View Installed',
      ).then(action => {
        if (action === 'View Installed') {
          vscode.commands.executeCommand('skills-sh.installedSkills.focus');
        }
      });

      // Post-install: offer to add newly installed skills to skills.json
      if (oldSkills.length > 0 && readManifest()) {
        const manifestSkills = getManifestSkillNames();
        const oldFolderNames = new Set(oldSkills.map(s => s.folderName));
        const newlyAdded = newSkills.filter(s =>
          !oldFolderNames.has(s.folderName) && s.source && !manifestSkills.has(s.folderName),
        );
        for (const skill of newlyAdded) {
          vscode.window.showInformationMessage(
            `You installed "${skill.name}". Add it to this project's skills.json?`,
            'Add to skills.json',
            'Dismiss',
          ).then(action => {
            if (action === 'Add to skills.json' && skill.source) {
              addSkillToManifest(skill.source, skill.folderName);
              treeProvider.refresh();
              vscode.window.showInformationMessage(`Added "${skill.name}" to skills.json`);
            }
          });
        }
      }
    } else if (oldNames.size > 0 && newNames.size < oldNames.size) {
      vscode.window.showInformationMessage(
        `Skills.sh: ${oldNames.size - newNames.size} skill(s) removed.`,
      );

      // Post-uninstall: offer to remove uninstalled skills from skills.json
      if (readManifest()) {
        const manifestSkills = getManifestSkillNames();
        const newFolderNames = new Set(newSkills.map(s => s.folderName));
        const removed = oldSkills.filter(s =>
          !newFolderNames.has(s.folderName) && manifestSkills.has(s.folderName),
        );
        for (const skill of removed) {
          vscode.window.showInformationMessage(
            `You uninstalled "${skill.name}". Remove it from this project's skills.json?`,
            'Remove from skills.json',
            'Keep in skills.json',
          ).then(action => {
            if (action === 'Remove from skills.json') {
              removeSkillFromManifest(skill.folderName);
              treeProvider.refresh();
              vscode.window.showInformationMessage(`Removed "${skill.name}" from skills.json`);
            }
          });
        }
      }
    }

    previousSkillNames = newNames;
    previousSkillsList = newSkills;
  }

  watcher.onDidChange(() => {
    getLog().info('[watcher] Change detected, rescanning...');
    handleSkillChanges('watcher');
  });
  context.subscriptions.push(watcher);

  // When a terminal install/uninstall command completes (via shell integration),
  // trigger a rescan so the tree view and marketplace update even if the
  // filesystem watcher didn't fire (common on Windows with symlinks).
  context.subscriptions.push(
    onOperationCompleted(() => {
      getLog().info('[operation] Terminal command completed, rescanning...');
      handleSkillChanges('operation');
    }),
  );

  // === Commands ===

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.refreshInstalled', async () => {
      await refreshAllState();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.openSkillFile', (arg: any) => {
      const skill = resolveSkill(arg);
      if (!skill) { return; }
      const uri = vscode.Uri.file(`${skill.path}/SKILL.md`);
      vscode.window.showTextDocument(uri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.previewSkillFile', (arg: any) => {
      const skill = resolveSkill(arg);
      if (!skill) { return; }
      const uri = vscode.Uri.file(`${skill.path}/SKILL.md`);
      vscode.commands.executeCommand('markdown.showPreview', uri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.launchClaudeWithSkill', async (arg: any) => {
      const skillData = resolveSkill(arg);
      const name = skillData?.name;
      if (!name) { return; }
      const prompt = `Run the "${name}" skill to `;
      const target = vscode.workspace.getConfiguration('skills-sh').get<string>('claudeLaunchTarget', 'terminal');

      if (target === 'extension') {
        const claudeExt = vscode.extensions.getExtension('anthropic.claude-code');
        if (claudeExt) {
          await vscode.commands.executeCommand('claude-vscode.editor.open', undefined, prompt);
        } else {
          vscode.window.showWarningMessage(
            'Claude Code extension not found. Install "anthropic.claude-code" or switch to terminal mode.',
            'Open Settings',
          ).then(action => {
            if (action === 'Open Settings') {
              vscode.commands.executeCommand('workbench.action.openSettings', 'skills-sh.claudeLaunchTarget');
            }
          });
        }
      } else {
        const terminal = vscode.window.createTerminal({ name: `Claude - ${name}` });
        terminal.show();
        const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
        terminal.sendText(`${claudeCmd} '${prompt}'`, false);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.installSkill', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search for a skill to install',
        placeHolder: 'e.g. react, supabase, testing...',
      });
      if (!query || query.length < 2) { return; }

      try {
        const results = await searchSkills(query);
        if (results.skills.length === 0) {
          vscode.window.showInformationMessage('No skills found.');
          return;
        }

        const items = results.skills.map(s => ({
          label: s.name,
          description: `${s.source} — ${s.installs.toLocaleString()} installs`,
          source: s.source,
          skillId: s.skillId,
        }));

        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a skill to install',
        });
        if (!picked) { return; }

        await installSkill(`https://github.com/${picked.source}`, {
          skill: picked.skillId,
        });
      } catch (e: unknown) {
        vscode.window.showErrorMessage(`Search failed: ${toErrorMessage(e)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.uninstallSkill', async (arg: any) => {
      const skill = resolveSkill(arg);
      if (!skill) { return; }
      await uninstallSkill(skill.name, {
        global: skill.scope === 'global',
        skillPath: skill.path,
        folderName: skill.folderName,
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.checkUpdates', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Checking for skill updates...', cancellable: false },
        async () => {
          const { globalSkills, projectSkills } = await scanner.scan();
          const allSkills = [...globalSkills, ...projectSkills];

          const skillsWithHashes = allSkills
            .filter(s => s.source && s.hash)
            .map(s => ({ name: s.name, source: s.source!, skillFolderHash: s.hash!, skillPath: s.skillPath }));

          // Exclude custom (user-authored) skills — they have no remote source to check
          const untrackedSkills = allSkills.filter(s => !s.isCustom && (!s.source || !s.hash));

          if (skillsWithHashes.length === 0) {
            if (untrackedSkills.length > 0) {
              const names = untrackedSkills.map(s => s.name).join(', ');
              vscode.window.showInformationMessage(
                `${untrackedSkills.length} skill(s) missing tracking data (${names}). Re-install via Marketplace to enable updates.`,
                'Browse Marketplace',
              ).then(action => {
                if (action === 'Browse Marketplace') {
                  vscode.commands.executeCommand('skills-sh.openMarketplace');
                }
              });
            } else {
              vscode.window.showInformationMessage('No installed skills have update tracking data.');
            }
            await treeProvider.rescan();
            updateBadge();
            return;
          }

          try {
            const result = await checkUpdates(skillsWithHashes);
            await treeProvider.rescan();
            updateBadge();
            syncUpdatableNames();

            if (result.updates.length === 0) {
              let msg = 'All skills are up to date.';
              if (untrackedSkills.length > 0) {
                msg += ` ${untrackedSkills.length} skill(s) missing tracking data — re-install to enable updates.`;
              }
              vscode.window.showInformationMessage(msg);
            } else {
              const names = result.updates.map(u => u.name).join(', ');
              const action = await vscode.window.showInformationMessage(
                `Updates available for: ${names}`,
                'Update All',
              );

              if (action === 'Update All') {
                await updateSkills(result.updates);
              }
            }
          } catch (e: unknown) {
            vscode.window.showErrorMessage(`Update check failed: ${toErrorMessage(e)}`);
          }
        },
      );
    })
  );

  // Update single skill (from inline button on updatable skills)
  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.updateSingleSkill', async (item: any) => {
      const skill = item?.skill;
      if (!skill?.name) { return; }
      const result = getLastUpdateResult();
      const update = result?.updates.find(u => u.name === skill.name);
      if (update) {
        await updateSkills([update]);
        await refreshAllState();
      }
    })
  );

  // Update all skills (from inline button on "Updates Available" group)
  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.updateAllSkills', async () => {
      const result = getLastUpdateResult();
      if (!result?.updates?.length) {
        vscode.window.showInformationMessage('No updates available.');
        return;
      }
      await updateSkills(result.updates);
      await refreshAllState();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.openMarketplace', () => {
      vscode.commands.executeCommand('skills-sh.marketplace.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.copySkillPath', (arg: any) => {
      const skill = resolveSkill(arg);
      if (!skill) { return; }
      vscode.env.clipboard.writeText(skill.path);
      vscode.window.showInformationMessage(`Copied: ${skill.path}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.addCustomSource', async () => {
      const source = await vscode.window.showInputBox({
        prompt: 'Enter a GitHub repository (owner/repo)',
        placeHolder: 'e.g. my-org/my-skills',
        validateInput: (value) => {
          if (!value.match(/^[\w.-]+\/[\w.-]+$/)) {
            return 'Must be in owner/repo format';
          }
          return null;
        },
      });
      if (!source) { return; }

      const config = vscode.workspace.getConfiguration('skills-sh');
      const current = config.get<string[]>('customSources', []);
      if (current.includes(source)) {
        vscode.window.showInformationMessage(`"${source}" is already in your custom sources.`);
        return;
      }

      await config.update('customSources', [...current, source], vscode.ConfigurationTarget.Global);
      await treeProvider.rescan();
      vscode.window.showInformationMessage(`Added "${source}" to custom sources.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.removeCustomSource', async (item: { source?: string }) => {
      const source = item?.source;
      if (!source) { return; }

      const config = vscode.workspace.getConfiguration('skills-sh');
      const current = config.get<string[]>('customSources', []);
      const updated = current.filter(s => s !== source);
      await config.update('customSources', updated, vscode.ConfigurationTarget.Global);
      await treeProvider.rescan();
      vscode.window.showInformationMessage(`Removed "${source}" from custom sources.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.browseCustomSource', (item: { source?: string }) => {
      if (item?.source) {
        vscode.commands.executeCommand('skills-sh.marketplace.focus');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.openMarketplaceTab', () => {
      marketplaceProvider.openInTab();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.openAudits', () => {
      marketplaceProvider.navigateTo('audits');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.openDocs', () => {
      marketplaceProvider.navigateTo('docs');
    })
  );

  // Open Settings command
  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.openSettings', () => {
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:skills-sh.skills-sh',
      );
    })
  );

  // Install from custom source command
  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.installFromSource', async (item: { skillName?: string; source?: string }) => {
      if (!item?.skillName || !item?.source) { return; }
      await installSkill(`https://github.com/${item.source}`, {
        skill: item.skillName,
      });
    })
  );

  // === Manifest (skills.json) commands ===

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.addToManifest', (arg: any) => {
      const skill = resolveSkill(arg);
      if (!skill) { return; }
      if (!skill.source) {
        vscode.window.showWarningMessage(
          `"${skill.name}" has no known source and cannot be added to skills.json. Re-install via Marketplace to add source tracking.`,
        );
        return;
      }
      addSkillToManifest(skill.source, skill.folderName);
      treeProvider.refresh();
      vscode.window.showInformationMessage(`Added "${skill.name}" to skills.json`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.removeFromManifest', (arg: any) => {
      const skill = resolveSkill(arg);
      if (!skill) { return; }
      removeSkillFromManifest(skill.folderName);
      treeProvider.refresh();
      vscode.window.showInformationMessage(`Removed "${skill.name}" from skills.json`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.editManifest', async () => {
      const allSkills = treeProvider.getAllInstalledSkills();
      const skillsWithSource = allSkills.filter(s => s.source);
      if (skillsWithSource.length === 0) {
        vscode.window.showInformationMessage('No installed skills have source tracking. Install skills from the Marketplace first.');
        return;
      }

      const manifestNames = getManifestSkillNames();
      const items = skillsWithSource.map(s => ({
        label: s.name,
        description: s.source!,
        picked: manifestNames.has(s.folderName),
        skill: s,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: 'Select skills to include in skills.json',
      });
      if (!picked) { return; }

      // Build manifest from selections
      const bySource = new Map<string, string[]>();
      for (const item of picked) {
        const source = item.skill.source!;
        const list = bySource.get(source) ?? [];
        list.push(item.skill.folderName);
        bySource.set(source, list);
      }

      const manifest = {
        skills: Array.from(bySource.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([source, skills]) => ({ source, skills: skills.sort() })),
      };

      writeManifest(manifest);
      treeProvider.refresh();

      // Open the file in editor
      const manifestPath = getManifestPath();
      if (manifestPath) {
        const doc = await vscode.workspace.openTextDocument(manifestPath);
        await vscode.window.showTextDocument(doc);
      }
      vscode.window.showInformationMessage(`Updated skills.json with ${picked.length} skill(s)`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.installFromManifest', async () => {
      const manifest = readManifest();
      if (!manifest) {
        vscode.window.showInformationMessage('No skills.json found in this workspace.');
        return;
      }

      const allSkills = treeProvider.getAllInstalledSkills();
      const missing = getMissingSkills(manifest, allSkills);

      if (missing.length === 0) {
        vscode.window.showInformationMessage('All skills from skills.json are already installed.');
        return;
      }

      const items = missing.map(m => ({
        label: m.skillName,
        description: m.source,
        picked: true,
        missing: m,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: `${missing.length} skill(s) from skills.json are not installed. Select skills to install.`,
      });
      if (!picked || picked.length === 0) { return; }

      const agent = vscode.workspace.getConfiguration('skills-sh').get<string>('defaultAgent', 'claude-code');
      const terminal = vscode.window.createTerminal({ name: 'Skills.sh — Install from manifest' });
      terminal.show();

      for (const item of picked) {
        const cmd = `npx skills add https://github.com/${item.missing.source} -s ${item.missing.skillName} -a ${agent} -g -y`;
        terminal.sendText(cmd);
      }

      vscode.window.showInformationMessage(`Installing ${picked.length} skill(s) from skills.json...`);
    })
  );

  // Auto-refresh on window focus
  const autoRefreshEnabled = vscode.workspace.getConfiguration('skills-sh')
    .get<boolean>('autoRefreshOnFocus', true);
  if (autoRefreshEnabled) {
    context.subscriptions.push(
      vscode.window.onDidChangeWindowState(async (state) => {
        if (state.focused) {
          await refreshAllState();
        }
      })
    );
  }

  // Re-scan when skills-sh settings change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('skills-sh')) {
        watcher.restart();
        await refreshAllState();
      }
    })
  );

  // Initial scan + diagnostics
  treeProvider.rescan().then(() => {
    syncAllState();

    // Show diagnostic notification if no skills found
    if (treeProvider.getInstalledSkillNames().size === 0) {
      const diagnostics = scanner.getDiagnostics();
      if (diagnostics.issues.length > 0) {
        vscode.window.showInformationMessage(
          `Skills.sh: ${diagnostics.issues[0]}`,
          'Browse Marketplace',
          'Open Settings',
        ).then(action => {
          if (action === 'Browse Marketplace') {
            vscode.commands.executeCommand('skills-sh.openMarketplace');
          } else if (action === 'Open Settings') {
            vscode.commands.executeCommand('skills-sh.openSettings');
          }
        });
      }
    }

    // Auto-detect missing skills from skills.json on activation (Step 5)
    const manifest = readManifest();
    if (manifest) {
      const allSkills = treeProvider.getAllInstalledSkills();
      const missing = getMissingSkills(manifest, allSkills);
      if (missing.length > 0) {
        const total = manifest.skills.reduce((n, e) => n + e.skills.length, 0);
        vscode.window.showInformationMessage(
          `This project recommends ${total} skill(s) — ${missing.length} not installed.`,
          'Install Missing',
          'Dismiss',
        ).then(action => {
          if (action === 'Install Missing') {
            vscode.commands.executeCommand('skills-sh.installFromManifest');
          }
        });
      }
    } else if (
      treeProvider.getInstalledSkillNames().size > 0
      && vscode.workspace.getConfiguration('skills-sh').get<boolean>('promptSkillsJson', true)
    ) {
      // No skills.json exists but skills are installed — prompt to create one
      vscode.window.showInformationMessage(
        'Create a skills.json to share this project\'s skills with your team?',
        'Create skills.json',
        'Dismiss',
      ).then(action => {
        if (action === 'Create skills.json') {
          vscode.commands.executeCommand('skills-sh.editManifest');
        }
      });
    }
  });

  // Silent background update check on startup — populate tree + badge only, no toast
  if (vscode.workspace.getConfiguration('skills-sh').get<boolean>('checkUpdatesOnStartup', true)) {
    scanner.scan().then(async ({ globalSkills, projectSkills }) => {
      const allSkills = [...globalSkills, ...projectSkills];
      const skillsWithHashes = allSkills
        .filter(s => s.source && s.hash)
        .map(s => ({ name: s.name, source: s.source!, skillFolderHash: s.hash!, skillPath: s.skillPath }));
      if (skillsWithHashes.length === 0) { return; }
      try {
        await checkUpdates(skillsWithHashes);
        await refreshAllState();
      } catch { /* startup check is best-effort */ }
    });
  }
}

export function deactivate() {
  disposeTerminal();
  marketplaceProvider?.dispose();
}

let marketplaceProvider: MarketplaceViewProvider;
