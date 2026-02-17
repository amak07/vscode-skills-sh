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
