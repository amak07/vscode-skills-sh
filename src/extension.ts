import * as vscode from 'vscode';
import { SkillScanner } from './local/scanner';
import { SkillWatcher } from './local/watcher';
import { InstalledSkillsTreeProvider } from './views/installed-tree';
import { MarketplaceViewProvider } from './views/marketplace/provider';
import { installSkill, uninstallSkill, disposeTerminal } from './install/installer';
import { checkUpdates } from './api/updates';
import { searchSkills } from './api/search';
import { InstalledSkill } from './types';

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

  // Register Webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MarketplaceViewProvider.viewType,
      marketplaceProvider,
    )
  );

  // Start file watcher
  const watcher = new SkillWatcher(scanner);
  watcher.start();

  let previousSkillCount = 0;
  watcher.onDidChange(async () => {
    const oldCount = previousSkillCount;
    await treeProvider.rescan();
    const newCount = treeProvider.getInstalledSkillNames().size;
    marketplaceProvider.setInstalledNames(treeProvider.getInstalledSkillNames());

    if (oldCount > 0 && newCount > oldCount) {
      vscode.window.showInformationMessage(
        `Skills.sh: ${newCount - oldCount} new skill(s) installed.`,
        'View Installed',
      ).then(action => {
        if (action === 'View Installed') {
          vscode.commands.executeCommand('skills-sh.installedSkills.focus');
        }
      });
    } else if (oldCount > 0 && newCount < oldCount) {
      vscode.window.showInformationMessage(
        `Skills.sh: ${oldCount - newCount} skill(s) removed.`,
      );
    }

    previousSkillCount = newCount;
  });
  context.subscriptions.push(watcher);

  // === Commands ===

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.refreshInstalled', async () => {
      await treeProvider.rescan();
      marketplaceProvider.setInstalledNames(treeProvider.getInstalledSkillNames());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.openSkillFile', (skill: InstalledSkill) => {
      const uri = vscode.Uri.file(`${skill.path}/SKILL.md`);
      vscode.window.showTextDocument(uri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.previewSkillFile', (skill: InstalledSkill) => {
      const uri = vscode.Uri.file(`${skill.path}/SKILL.md`);
      vscode.commands.executeCommand('markdown.showPreview', uri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.launchClaudeWithSkill', async (arg: any) => {
      const skillData = arg?.skill ?? arg;
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
    vscode.commands.registerCommand('skills-sh.uninstallSkill', async (skill: InstalledSkill) => {
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
        .map(s => ({ name: s.name, source: s.source!, skillFolderHash: s.hash! }));

      const untrackedSkills = allSkills.filter(s => !s.source || !s.hash);

      if (skillsWithHashes.length === 0) {
        if (untrackedSkills.length > 0) {
          const names = untrackedSkills.map(s => s.name).join(', ');
          vscode.window.showInformationMessage(
            `Found ${untrackedSkills.length} skill(s) without tracking data (${names}). Re-install via Marketplace to enable updates.`,
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
        return;
      }

      try {
        const result = await checkUpdates(skillsWithHashes);
        await treeProvider.rescan();

        if (result.updates.length === 0) {
          let msg = 'All tracked skills are up to date.';
          if (untrackedSkills.length > 0) {
            msg += ` (${untrackedSkills.length} untracked skill(s) cannot be checked)`;
          }
          vscode.window.showInformationMessage(msg);
        } else {
          const names = result.updates.map(u => u.name).join(', ');
          const action = await vscode.window.showInformationMessage(
            `Updates available for: ${names}`,
            'Update All',
            'Select Updates',
          );

          if (action === 'Update All') {
            for (const update of result.updates) {
              await installSkill(`https://github.com/${update.source}`, {
                skill: update.name,
              });
            }
          } else if (action === 'Select Updates') {
            const items = result.updates.map(u => ({
              label: u.name,
              description: u.source,
              picked: true,
            }));
            const selected = await vscode.window.showQuickPick(items, {
              canPickMany: true,
              placeHolder: 'Select skills to update',
            });
            if (selected) {
              for (const item of selected) {
                const update = result.updates.find(u => u.name === item.label);
                if (update) {
                  await installSkill(`https://github.com/${update.source}`, {
                    skill: update.name,
                  });
                }
              }
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        vscode.window.showErrorMessage(`Update check failed: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.openMarketplace', () => {
      vscode.commands.executeCommand('skills-sh.marketplace.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skills-sh.copySkillPath', (skill: InstalledSkill) => {
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
          previousSkillCount = treeProvider.getInstalledSkillNames().size;
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
        previousSkillCount = treeProvider.getInstalledSkillNames().size;
      }
    })
  );

  // Initial scan + diagnostics
  treeProvider.rescan().then(() => {
    const installedNames = treeProvider.getInstalledSkillNames();
    marketplaceProvider.setInstalledNames(installedNames);
    previousSkillCount = installedNames.size;

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

  // Check for updates on startup if configured
  if (vscode.workspace.getConfiguration('skills-sh').get<boolean>('checkUpdatesOnStartup', false)) {
    vscode.commands.executeCommand('skills-sh.checkUpdates');
  }
}

export function deactivate() {
  disposeTerminal();
  marketplaceProvider?.dispose();
}

let marketplaceProvider: MarketplaceViewProvider;
