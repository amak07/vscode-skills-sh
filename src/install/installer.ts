import * as vscode from 'vscode';
import { exec } from 'child_process';
import { getLog } from '../logger';

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
  return vscode.workspace.getConfiguration('skills-sh').get<string>('installScope', 'project');
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
  const isGlobal = options?.global ?? (getInstallScope() === 'global');
  const skillName = options?.skill || source;

  const answer = await vscode.window.showInformationMessage(
    `Install "${skillName}" for ${agent}?`,
    'Install'
  );
  if (answer !== 'Install') {
    return false;
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
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Updating skills...', cancellable: false },
    async (progress) => {
      let succeeded = 0;
      const failed: string[] = [];

      for (const update of updates) {
        progress.report({ message: `(${succeeded + failed.length + 1}/${updates.length}) ${update.name}` });

        const removeCmd = `${npx} skills remove ${update.name} -a ${agent} -g -y`;
        const addCmd = `${npx} skills add https://github.com/${update.source} -s ${update.name} -a ${agent} -g -y`;

        try {
          await execCommand(removeCmd);
          await execCommand(addCmd);
          succeeded++;
        } catch {
          failed.push(update.name);
        }
      }

      if (failed.length > 0) {
        vscode.window.showWarningMessage(
          `Updated ${succeeded}, failed ${failed.length}: ${failed.join(', ')}`
        );
      } else {
        vscode.window.showInformationMessage(`Updated ${succeeded} skill(s) successfully.`);
      }
    },
  );
}

function execCommand(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) { reject(new Error(stderr || error.message)); }
      else { resolve(stdout); }
    });
  });
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
