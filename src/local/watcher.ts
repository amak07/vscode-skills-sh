import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { SkillScanner } from './scanner';

export class SkillWatcher implements vscode.Disposable {
  private watchers: vscode.FileSystemWatcher[] = [];
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

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
    watcher.onDidCreate(() => this._onDidChange.fire());
    watcher.onDidDelete(() => this._onDidChange.fire());
    watcher.onDidChange(() => this._onDidChange.fire());
    this.watchers.push(watcher);
  }

  private disposeWatchers(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
  }

  dispose(): void {
    this.disposeWatchers();
    this._onDidChange.dispose();
  }
}
