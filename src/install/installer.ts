import * as vscode from 'vscode';

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

export async function installSkill(
  source: string,
  options?: { agent?: string; skill?: string; global?: boolean }
): Promise<void> {
  const agent = options?.agent || getDefaultAgent();
  const isGlobal = options?.global ?? (getInstallScope() === 'global');

  const confirm = vscode.workspace.getConfiguration('skills-sh').get<boolean>('confirmBeforeInstall', true);
  if (confirm) {
    const answer = await vscode.window.showInformationMessage(
      `Install skill from ${source}?`,
      { modal: false },
      'Install',
      'Cancel'
    );
    if (answer !== 'Install') {
      return;
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

  const terminal = getTerminal();
  terminal.show();
  terminal.sendText(cmd);
}

export async function uninstallSkill(
  skillName: string,
  options?: { agent?: string; global?: boolean }
): Promise<void> {
  const agent = options?.agent || getDefaultAgent();
  const isGlobal = options?.global ?? (getInstallScope() === 'global');

  const confirm = vscode.workspace.getConfiguration('skills-sh').get<boolean>('confirmBeforeInstall', true);
  if (confirm) {
    const answer = await vscode.window.showWarningMessage(
      `Uninstall skill "${skillName}"?`,
      { modal: true },
      'Uninstall',
      'Cancel'
    );
    if (answer !== 'Uninstall') {
      return;
    }
  }

  let cmd = `npx skills remove ${skillName} -a ${agent}`;
  if (isGlobal) {
    cmd += ' -g';
  }
  cmd += ' -y';

  const terminal = getTerminal();
  terminal.show();
  terminal.sendText(cmd);
}

export function disposeTerminal(): void {
  sharedTerminal?.dispose();
  sharedTerminal = undefined;
}
