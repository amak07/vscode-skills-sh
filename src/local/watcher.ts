import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { SkillScanner } from './scanner';

export class SkillWatcher implements vscode.Disposable {
  private watchers: vscode.FileSystemWatcher[] = [];
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private static readonly DEBOUNCE_MS = 300;

  constructor(private scanner: SkillScanner) {}

  start(): void {
    this.disposeWatchers();

    for (const dir of this.scanner.getAllGlobalDirs()) {
      this.watchDirectory(dir);
    }

    for (const dir of this.scanner.getAllProjectDirs()) {
      this.watchDirectory(dir);
    }

    this.watchLockFile();
    this.watchLocalLockFile();
    this.watchManifestFile();
  }

  /** Watch ~/.agents/.skill-lock.json — a regular file that npx skills always updates */
  private watchLockFile(): void {
    const lockDir = path.join(os.homedir(), '.agents');
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(lockDir),
      '.skill-lock.json',
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.addWatcher(watcher);
  }

  /** Watch skills-lock.json in the workspace root (project-scope installs) */
  private watchLocalLockFile(): void {
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || ws.length === 0) { return; }
    const pattern = new vscode.RelativePattern(ws[0].uri, 'skills-lock.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.addWatcher(watcher);
  }

  /** Watch skills.json in the workspace root for manual edits */
  private watchManifestFile(): void {
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || ws.length === 0) { return; }
    const pattern = new vscode.RelativePattern(ws[0].uri, 'skills.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.addWatcher(watcher);
  }

  restart(): void {
    this.start();
  }

  private watchDirectory(dir: string): void {
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(dir),
      '*/SKILL.md',
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.addWatcher(watcher);
  }

  private addWatcher(watcher: vscode.FileSystemWatcher): void {
    const fire = () => {
      if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
      this.debounceTimer = setTimeout(() => {
        this._onDidChange.fire();
      }, SkillWatcher.DEBOUNCE_MS);
    };
    watcher.onDidCreate(fire);
    watcher.onDidDelete(fire);
    watcher.onDidChange(fire);
    this.watchers.push(watcher);
  }

  private disposeWatchers(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
  }

  dispose(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
    this.disposeWatchers();
    this._onDidChange.dispose();
  }
}
