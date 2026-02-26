import * as vscode from 'vscode';
import { getLog } from '../logger';
import { clearUpdateForSkill } from '../api/updates';

let sharedTerminal: vscode.Terminal | undefined;

function getTerminal(): vscode.Terminal {
  if (sharedTerminal && !sharedTerminal.exitStatus) {
    return sharedTerminal;
  }
  sharedTerminal = vscode.window.createTerminal({ name: 'Skills.sh' });
  return sharedTerminal;
}

function getDefaultAgent(): string {
  return vscode.workspace.getConfiguration('skills-sh').get<string>('defaultAgent', 'claude-code');
}

function getInstallScope(): string {
  return vscode.workspace.getConfiguration('skills-sh').get<string>('installScope', 'ask');
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
  options?: { agent?: string; skill?: string; global?: boolean }
): Promise<boolean> {
  const agent = options?.agent || getDefaultAgent();
  const skillName = options?.skill || source;

  let isGlobal: boolean;

  if (options?.global !== undefined) {
    // Explicit scope from caller (e.g. manifest install)
    isGlobal = options.global;
    const scopeLabel = isGlobal ? 'globally' : 'in this project';
    const answer = await vscode.window.showInformationMessage(
      `Install "${skillName}" ${scopeLabel} for ${agent}?`, 'Install');
    if (answer !== 'Install') { return false; }
  } else {
    const pref = getInstallScope();
    if (pref === 'global' || pref === 'project') {
      // Fixed scope from config
      isGlobal = pref === 'global';
      const scopeLabel = isGlobal ? 'globally' : 'in this project';
      const answer = await vscode.window.showInformationMessage(
        `Install "${skillName}" ${scopeLabel} for ${agent}?`, 'Install');
      if (answer !== 'Install') { return false; }
    } else {
      // "ask" mode — two-button toast combines scope selection + confirmation
      const answer = await vscode.window.showInformationMessage(
        `Install "${skillName}" for ${agent}?`, 'Install Globally', 'Install in Project');
      if (!answer) { return false; }
      isGlobal = answer === 'Install Globally';
    }
  }

  let cmd = `npx skills add ${source} -a ${agent}`;
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
  const action = await vscode.window.showInformationMessage(
    `Skills.sh: Update ${updates.length} skill(s) — ${names}`,
    'Update'
  );
  if (action !== 'Update') { return; }

  const agent = getDefaultAgent();
  const log = getLog();
  const terminal = getTerminal();
  terminal.show();

  // Send remove+add commands individually (cross-shell compatible — no && or ;)
  for (const u of updates) {
    const removeCmd = `npx skills remove ${u.name} -a ${agent} -g -y`;
    const addCmd = `npx skills add https://github.com/${u.source} -s ${u.name} -a ${agent} -g -y`;
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
  options?: { agent?: string; global?: boolean }
): Promise<void> {
  const agent = options?.agent || getDefaultAgent();
  const isGlobal = options?.global ?? (getInstallScope() === 'global');

  const answer = await vscode.window.showWarningMessage(
    `Uninstall "${skillName}"?`,
    'Uninstall'
  );
  if (answer !== 'Uninstall') {
    return;
  }

  let cmd = `npx skills remove ${skillName} -a ${agent}`;
  if (isGlobal) {
    cmd += ' -g';
  }
  cmd += ' -y';

  const log = getLog();
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
