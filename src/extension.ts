import * as vscode from 'vscode';
import { SkillScanner } from './local/scanner';
import { SkillWatcher } from './local/watcher';
import { InstalledSkillsTreeProvider } from './views/installed-tree';
import { MarketplaceViewProvider } from './views/marketplace/provider';
import { installSkill, updateSkills, uninstallSkill, disposeTerminal, notifyInstallDetected, onOperationCompleted } from './install/installer';
import { checkUpdates, getLastUpdateResult, clearUpdateForSkill } from './api/updates';
import { searchSkills } from './api/search';
import { InstalledSkill } from './types';
import { getLog } from './logger';

// Extract InstalledSkill from either a direct InstalledSkill or a SkillItem tree item
function resolveSkill(arg: any): InstalledSkill | undefined {
  if (!arg) { return undefined; }
  // If it's a tree item with a .skill property (SkillItem)
  if (arg.skill && arg.skill.path) { return arg.skill; }
  // If it's a direct InstalledSkill (from command arguments)
  if (arg.path) { return arg; }
  return undefined;
}

export function activate(context: vscode.ExtensionContext) {
  const scanner = new SkillScanner();
  const treeProvider = new InstalledSkillsTreeProvider(scanner);
  marketplaceProvider = new MarketplaceViewProvider(context.extensionUri);

  // Register TreeView
  const treeView = vscode.window.createTreeView('skills-sh.installedSkills', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
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

  // Start file watcher
  const watcher = new SkillWatcher(scanner);
  watcher.start();

  let previousSkillNames = new Set<string>();
  watcher.onDidChange(async () => {
    const log = getLog();
    log.info('[watcher] Change detected, rescanning...');
    const oldNames = previousSkillNames;
    await treeProvider.rescan();
    const newNames = treeProvider.getInstalledSkillNames();
    log.info(`[watcher] Old names (${oldNames.size}): ${[...oldNames].join(', ')}`);
    log.info(`[watcher] New names (${newNames.size}): ${[...newNames].join(', ')}`);
    marketplaceProvider.setInstalledNames(newNames);

    // Notify installer progress listeners and clear updates only for genuinely new skills.
    for (const name of newNames) {
      notifyInstallDetected(name);
      // Only clear update status for skills that are genuinely new installs
      if (!oldNames.has(name)) {
        log.info(`[watcher] New skill detected: "${name}", clearing from update cache`);
        clearUpdateForSkill(name);
      }
    }

    syncUpdatableNames();
    updateBadge();

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
    } else if (oldNames.size > 0 && newNames.size < oldNames.size) {
      vscode.window.showInformationMessage(
        `Skills.sh: ${oldNames.size - newNames.size} skill(s) removed.`,
      );
    }

    previousSkillNames = newNames;
  });
  context.subscriptions.push(watcher);

  // When a terminal install/uninstall command completes (via shell integration),
  // trigger a rescan so the tree view and marketplace update even if the
  // filesystem watcher didn't fire (common on Windows with symlinks).
  onOperationCompleted(async () => {
    const log = getLog();
    log.info('[operation] Terminal command completed, rescanning...');
    const oldNames = previousSkillNames;
    await treeProvider.rescan();
    const newNames = treeProvider.getInstalledSkillNames();
    log.info(`[operation] Old names (${oldNames.size}): ${[...oldNames].join(', ')}`);
    log.info(`[operation] New names (${newNames.size}): ${[...newNames].join(', ')}`);
    marketplaceProvider.setInstalledNames(newNames);
    syncUpdatableNames();
    updateBadge();
    previousSkillNames = newNames;
  });

  // === Commands ===

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.refreshInstalled', async () => {
      await treeProvider.rescan();
      marketplaceProvider.setInstalledNames(treeProvider.getInstalledSkillNames());
      updateBadge();
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
        const msg = e instanceof Error ? e.message : 'Unknown error';
        vscode.window.showErrorMessage(`Search failed: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.uninstallSkill', async (arg: any) => {
      const skill = resolveSkill(arg);
      if (!skill) { return; }
      await uninstallSkill(skill.name, {
        global: skill.scope === 'global',
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.checkUpdates', async () => {
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
        const msg = e instanceof Error ? e.message : 'Unknown error';
        vscode.window.showErrorMessage(`Update check failed: ${msg}`);
      }
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
        await treeProvider.rescan();
        syncUpdatableNames();
        updateBadge();
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
      await treeProvider.rescan();
      syncUpdatableNames();
      updateBadge();
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

  // Auto-refresh on window focus
  const autoRefreshEnabled = vscode.workspace.getConfiguration('skills-sh')
    .get<boolean>('autoRefreshOnFocus', true);
  if (autoRefreshEnabled) {
    context.subscriptions.push(
      vscode.window.onDidChangeWindowState(async (state) => {
        if (state.focused) {
          await treeProvider.rescan();
          marketplaceProvider.setInstalledNames(treeProvider.getInstalledSkillNames());
          previousSkillNames = treeProvider.getInstalledSkillNames();
          updateBadge();
        }
      })
    );
  }

  // Re-scan when skills-sh settings change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('skills-sh')) {
        watcher.restart();
        await treeProvider.rescan();
        marketplaceProvider.setInstalledNames(treeProvider.getInstalledSkillNames());
        previousSkillNames = treeProvider.getInstalledSkillNames();
        updateBadge();
      }
    })
  );

  // Initial scan + diagnostics
  treeProvider.rescan().then(() => {
    const installedNames = treeProvider.getInstalledSkillNames();
    marketplaceProvider.setInstalledNames(installedNames);
    previousSkillNames = installedNames;
    updateBadge();

    // Show diagnostic notification if no skills found
    if (installedNames.size === 0) {
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
        await treeProvider.rescan();
        updateBadge();
        syncUpdatableNames();
      } catch { /* startup check is best-effort */ }
    });
  }
}

export function deactivate() {
  disposeTerminal();
  marketplaceProvider?.dispose();
}

let marketplaceProvider: MarketplaceViewProvider;
