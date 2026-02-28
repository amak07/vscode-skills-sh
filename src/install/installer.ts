import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getLog } from '../logger';
import { clearUpdateForSkill } from '../api/updates';
import { removeLockEntryByFolder } from '../utils/lock-file';
import { getAgentsSkillsDir } from '../utils/constants';
import { toErrorMessage } from '../utils/errors';

let sharedTerminal: vscode.Terminal | undefined;

function getTerminal(): vscode.Terminal {
  if (sharedTerminal && !sharedTerminal.exitStatus) {
    return sharedTerminal;
  }
  sharedTerminal = vscode.window.createTerminal({ name: 'Skills.sh' });
  return sharedTerminal;
}

function getInstallScope(): string {
  return vscode.workspace.getConfiguration('skills-sh').get<string>('installScope', 'global');
}

function shouldConfirm(): boolean {
  return vscode.workspace.getConfiguration('skills-sh').get<boolean>('confirmBeforeInstall', true);
}

// Event emitter for install detection — watcher fires this when a new skill appears
const _onInstallDetected = new vscode.EventEmitter<string>();
export const onInstallDetected = _onInstallDetected.event;

export function notifyInstallDetected(skillName: string): void {
  _onInstallDetected.fire(skillName);
}

// Event emitter for terminal operation completion — fires when shell integration
// detects that an install/uninstall command finished in the terminal.
// extension.ts listens to this to trigger a rescan independently of the file watcher.
const _onOperationCompleted = new vscode.EventEmitter<void>();
export const onOperationCompleted = _onOperationCompleted.event;

export async function installSkill(
  source: string,
  options?: { skill?: string; global?: boolean }
): Promise<boolean> {
  const skillName = options?.skill || source;

  let isGlobal: boolean;
  const confirm = shouldConfirm();

  if (options?.global !== undefined) {
    // Explicit scope from caller (e.g. manifest install)
    isGlobal = options.global;
    if (confirm) {
      const scopeLabel = isGlobal ? 'globally' : 'in this project';
      const answer = await vscode.window.showInformationMessage(
        `Install "${skillName}" ${scopeLabel}?`, 'Install');
      if (answer !== 'Install') { return false; }
    }
  } else {
    const pref = getInstallScope();
    if (pref === 'global' || pref === 'project') {
      // Fixed scope from config — show scope in toast with option to change
      isGlobal = pref === 'global';
      if (confirm) {
        const scopeLabel = isGlobal ? 'globally' : 'in this project';
        const answer = await vscode.window.showInformationMessage(
          `Install "${skillName}" ${scopeLabel}?`, 'Install', 'Change Scope');
        if (answer === 'Change Scope') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'skills-sh.installScope');
          return false;
        }
        if (answer !== 'Install') { return false; }
      }
    } else {
      // "ask" mode — two-button toast combines scope selection + confirmation
      // Always show this prompt even when confirmBeforeInstall is false,
      // because the user needs to choose the install scope.
      const answer = await vscode.window.showInformationMessage(
        `Install "${skillName}"?`, 'Install Globally', 'Install in Project');
      if (!answer) { return false; }
      isGlobal = answer === 'Install Globally';
    }
  }

  let cmd = `npx skills add ${source}`;
  if (options?.skill) {
    cmd += ` -s ${options.skill}`;
  }
  if (isGlobal) {
    cmd += ' -g';
  }
  cmd += ' -y';

  const log = getLog();
  const terminal = getTerminal();
  terminal.show();
  terminal.sendText(cmd);
  log.info(`[installer] install: sent command for "${skillName}": ${cmd}`);

  // Show progress notification until terminal completes, watcher detects the skill, or timeout
  const displaySource = source.replace('https://github.com/', '');
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Installing "${skillName}" (${displaySource})...`,
      cancellable: false,
    },
    () => {
      const minDelay = new Promise<void>(r => setTimeout(r, 2000));
      const detection = new Promise<void>((resolve) => {
        const disposables: vscode.Disposable[] = [];
        let timeoutId: ReturnType<typeof setTimeout>;
        let resolved = false;

        const cleanup = (source: string) => {
          if (resolved) { return; }
          resolved = true;
          log.info(`[installer] install: detected completion via ${source} for "${skillName}"`);
          clearTimeout(timeoutId);
          disposables.forEach(d => d.dispose());
          resolve();
        };

        // Detection 1: Terminal shell integration — fires when the command completes
        disposables.push(
          vscode.window.onDidEndTerminalShellExecution((e) => {
            log.info(`[installer] install: onDidEndTerminalShellExecution fired (terminal match: ${e.terminal === terminal}, exit: ${e.exitCode})`);
            if (e.terminal === terminal) {
              if (e.exitCode !== undefined && e.exitCode !== 0) {
                vscode.window.showErrorMessage(
                  `Install of "${skillName}" failed (exit code ${e.exitCode}). Check the terminal.`,
                );
              }
              _onOperationCompleted.fire();
              cleanup('shell-integration');
            }
          })
        );

        // Detection 2: Watcher-based (filesystem change)
        disposables.push(
          onInstallDetected((name) => {
            log.info(`[installer] install: onInstallDetected fired for "${name}" (waiting for "${skillName}")`);
            if (name === skillName) { cleanup('watcher'); }
          })
        );

        // Detection 3: Timeout fallback
        timeoutId = setTimeout(() => {
          cleanup('timeout');
          vscode.window.showWarningMessage(
            `Install of "${skillName}" may still be running. Check the Skills.sh terminal.`,
          );
        }, 30_000);
      });
      return Promise.all([minDelay, detection]).then(() => {});
    },
  );

  return true;
}

export async function updateSkills(
  updates: { name: string; source: string; newHash: string }[]
): Promise<void> {
  if (updates.length === 0) { return; }

  const names = updates.map(u => u.name).join(', ');
  if (shouldConfirm()) {
    const action = await vscode.window.showInformationMessage(
      `Skills.sh: Update ${updates.length} skill(s) — ${names}`,
      'Update'
    );
    if (action !== 'Update') { return; }
  }

  const log = getLog();
  const terminal = getTerminal();
  terminal.show();

  // Send remove+add commands individually (cross-shell compatible — no && or ;)
  for (const u of updates) {
    const removeCmd = `npx skills remove ${u.name} -g -y`;
    const addCmd = `npx skills add https://github.com/${u.source} -s ${u.name} -g -y`;
    terminal.sendText(removeCmd);
    terminal.sendText(addCmd);
    log.info(`[installer] update: sent commands for "${u.name}": ${removeCmd} ; ${addCmd}`);
  }

  // Optimistically clear the requested skills from the update cache
  for (const u of updates) {
    clearUpdateForSkill(u.name);
  }

  // Show progress notification until terminal completes or timeout
  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Updating ${updates.length} skill(s)...`, cancellable: false },
    () => {
      const minDelay = new Promise<void>(r => setTimeout(r, 2000));
      const detection = new Promise<void>((resolve) => {
        const disposables: vscode.Disposable[] = [];
        let timeoutId: ReturnType<typeof setTimeout>;
        let resolved = false;

        const cleanup = (source: string) => {
          if (resolved) { return; }
          resolved = true;
          log.info(`[installer] update: detected completion via ${source} for "${names}"`);
          clearTimeout(timeoutId);
          disposables.forEach(d => d.dispose());
          _onOperationCompleted.fire();
          resolve();
        };

        // Detection 1: Terminal shell integration — wait for all commands to finish
        // Each skill sends 2 commands (remove + add), so we expect 2N completions.
        const expectedCmds = updates.length * 2;
        let completedCmds = 0;
        disposables.push(
          vscode.window.onDidEndTerminalShellExecution((e) => {
            if (e.terminal === terminal) {
              completedCmds++;
              log.info(`[installer] update: shell execution ${completedCmds}/${expectedCmds} (exit: ${e.exitCode})`);
              if (e.exitCode !== undefined && e.exitCode !== 0) {
                vscode.window.showWarningMessage(
                  `Some skill updates may have failed (exit code ${e.exitCode}). Check the terminal.`,
                );
              }
              if (completedCmds >= expectedCmds) {
                cleanup('shell-integration');
              }
            }
          })
        );

        // Detection 2: Watcher-based (filesystem change)
        disposables.push(
          onInstallDetected(() => {
            cleanup('watcher');
          })
        );

        // Detection 3: Timeout fallback
        timeoutId = setTimeout(() => {
          cleanup('timeout');
          vscode.window.showWarningMessage(
            `Skill update may still be running. Check the Skills.sh terminal.`,
          );
        }, 30_000);
      });
      return Promise.all([minDelay, detection]).then(() => {});
    },
  );
}

export async function uninstallSkill(
  skillName: string,
  options?: { global?: boolean; skillPath?: string; folderName?: string }
): Promise<void> {
  const isGlobal = options?.global ?? (getInstallScope() === 'global');

  if (shouldConfirm()) {
    const answer = await vscode.window.showWarningMessage(
      `Uninstall "${skillName}"?`,
      'Uninstall'
    );
    if (answer !== 'Uninstall') {
      return;
    }
  }

  const log = getLog();

  // Project-scoped skills: delete directly (the skills.sh CLI only manages
  // global installs and doesn't know about project-level directories).
  // Three artifacts to clean up:
  //   1. The symlink/dir at <project>/.claude/skills/<name>
  //   2. The content at ~/.agents/skills/<name> (if no global symlink still uses it)
  //   3. The lock file entry in ~/.agents/.skill-lock.json
  if (!isGlobal && options?.skillPath) {
    try {
      const folderName = options.folderName || path.basename(options.skillPath);

      // Resolve link target — readlinkSync works for both symlinks AND
      // directory junctions on Windows (lstatSync().isSymbolicLink() returns
      // false for junctions, which caused content cleanup to be skipped).
      let symlinkTarget: string | undefined;
      try {
        const linkTarget = fs.readlinkSync(options.skillPath);
        symlinkTarget = path.isAbsolute(linkTarget)
          ? path.resolve(linkTarget)
          : path.resolve(path.dirname(options.skillPath), linkTarget);
        log.info(`[installer] uninstall: "${options.skillPath}" links to -> "${symlinkTarget}"`);
      } catch {
        log.info(`[installer] uninstall: "${options.skillPath}" is not a symlink/junction (or already removed)`);
      }

      // 1. Remove the project skill entry (symlink or directory)
      fs.rmSync(options.skillPath, { recursive: true, force: true });
      log.info(`[installer] uninstall: removed project entry "${options.skillPath}"`);

      // 2. If it was a symlink to ~/.agents/skills/, also clean up the content
      //    — but only if no global symlink still references it
      const agentsSkillsDir = getAgentsSkillsDir();
      const contentDir = symlinkTarget || path.join(agentsSkillsDir, folderName);

      const isUnderAgentsDir = process.platform === 'win32'
        ? contentDir.toLowerCase().startsWith(agentsSkillsDir.toLowerCase())
        : contentDir.startsWith(agentsSkillsDir);

      if (isUnderAgentsDir && fs.existsSync(contentDir)) {
        const globalSkillsDir = path.join(os.homedir(), '.claude', 'skills');
        const globalSymlink = path.join(globalSkillsDir, folderName);
        const globalStillExists = fs.existsSync(globalSymlink);
        log.info(`[installer] uninstall: contentDir="${contentDir}", globalSymlink="${globalSymlink}", globalStillExists=${globalStillExists}`);

        if (!globalStillExists) {
          fs.rmSync(contentDir, { recursive: true, force: true });
          log.info(`[installer] uninstall: removed content dir "${contentDir}"`);

          // 3. Clean up lock file entry
          removeLockEntryByFolder(folderName, log);
        } else {
          log.info(`[installer] uninstall: skipping content cleanup — global symlink still exists at "${globalSymlink}"`);
        }
      }

      _onOperationCompleted.fire();
    } catch (e) {
      const msg = toErrorMessage(e);
      log.error(`[installer] uninstall: failed for "${skillName}": ${msg}`);
      vscode.window.showErrorMessage(`Failed to uninstall "${skillName}": ${msg}`);
    }
    return;
  }

  // Global-scoped skills: delegate to skills.sh CLI
  let cmd = `npx skills remove ${skillName}`;
  if (isGlobal) {
    cmd += ' -g';
  }
  cmd += ' -y';

  const terminal = getTerminal();
  terminal.show();
  terminal.sendText(cmd);
  log.info(`[installer] uninstall: sent command for "${skillName}": ${cmd}`);

  // Detect completion via shell integration and trigger UI refresh
  const disposable = vscode.window.onDidEndTerminalShellExecution((e) => {
    log.info(`[installer] uninstall: onDidEndTerminalShellExecution fired (terminal match: ${e.terminal === terminal}, exit: ${e.exitCode})`);
    if (e.terminal === terminal) {
      disposable.dispose();
      log.info(`[installer] uninstall: completed for "${skillName}", firing onOperationCompleted`);
      _onOperationCompleted.fire();
    }
  });

  // Clean up listener if it never fires
  setTimeout(() => { disposable.dispose(); }, 30_000);
}

export function disposeTerminal(): void {
  sharedTerminal?.dispose();
  sharedTerminal = undefined;
}
