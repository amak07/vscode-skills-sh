import { vi } from 'vitest';

// --- EventEmitter (real lightweight implementation) ---

export class EventEmitter<T = void> {
  private listeners: Array<(e: T) => void> = [];

  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };

  fire(data: T) {
    this.listeners.forEach(l => l(data));
  }

  dispose() {
    this.listeners = [];
  }
}

// --- Uri ---

export class Uri {
  readonly scheme: string;
  readonly fsPath: string;
  readonly path: string;

  private constructor(scheme: string, fsPath: string) {
    this.scheme = scheme;
    this.fsPath = fsPath;
    this.path = fsPath;
  }

  static file(p: string) { return new Uri('file', p); }
  static parse(value: string) { return new Uri('https', value); }
  static joinPath(base: Uri, ...segments: string[]) {
    return new Uri(base.scheme, [base.fsPath, ...segments].join('/'));
  }
  toString() { return `${this.scheme}://${this.fsPath}`; }
  with(_change: { scheme?: string; path?: string }) { return this; }
}

// --- TreeItem ---

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label?: string;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  iconPath?: ThemeIcon;
  command?: { command: string; title: string; arguments?: unknown[] };
  collapsibleState?: TreeItemCollapsibleState;

  constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

// --- ThemeIcon ---

export class ThemeIcon {
  id: string;
  constructor(id: string) { this.id = id; }
}

// --- RelativePattern ---

export class RelativePattern {
  constructor(public base: Uri | string, public pattern: string) {}
}

// --- Disposable ---

export class Disposable {
  constructor(private callOnDispose: () => void) {}
  dispose() { this.callOnDispose(); }
}

// --- Enums ---

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export enum ViewColumn {
  One = 1,
  Two = 2,
}

// --- workspace ---

const configValues: Record<string, unknown> = {};

export const workspace = {
  workspaceFolders: undefined as Array<{ uri: Uri; name: string }> | undefined,

  getConfiguration: vi.fn((section?: string) => ({
    get: vi.fn(<T>(key: string, defaultValue?: T): T => {
      const fullKey = section ? `${section}.${key}` : key;
      return (configValues[fullKey] as T) ?? (defaultValue as T);
    }),
    update: vi.fn(),
  })),

  createFileSystemWatcher: vi.fn(() => ({
    onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
    onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
    dispose: vi.fn(),
  })),

  onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  openTextDocument: vi.fn(async () => ({})),

  // Test helpers
  __setConfigValue(key: string, value: unknown) { configValues[key] = value; },
  __resetConfig() { Object.keys(configValues).forEach(k => delete configValues[k]); },
};

// --- window ---

export const window = {
  createOutputChannel: vi.fn((_name: string, _opts?: unknown) => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    append: vi.fn(),
    appendLine: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn(),
  })),

  createTerminal: vi.fn((_opts?: unknown) => ({
    show: vi.fn(),
    sendText: vi.fn(),
    dispose: vi.fn(),
    exitStatus: undefined,
  })),

  createTreeView: vi.fn(() => ({
    badge: undefined,
    dispose: vi.fn(),
  })),

  registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),

  createWebviewPanel: vi.fn((_viewType: string, _title: string, _column: number, _opts?: unknown) => ({
    webview: {
      postMessage: vi.fn(async () => true),
      asWebviewUri: vi.fn((uri: Uri) => uri),
      onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
      cspSource: 'mock-csp',
      options: {} as unknown,
      html: '',
    },
    onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
    dispose: vi.fn(),
    visible: true,
    active: true,
    viewColumn: 1,
    reveal: vi.fn(),
    options: {},
    title: _title,
  })),

  showInformationMessage: vi.fn(async () => undefined),
  showWarningMessage: vi.fn(async () => undefined),
  showErrorMessage: vi.fn(async () => undefined),
  showInputBox: vi.fn(async () => undefined),
  showQuickPick: vi.fn(async () => undefined),
  showTextDocument: vi.fn(async () => ({})),

  withProgress: vi.fn(async (_options: unknown, task: (progress: { report: (v: unknown) => void }) => Promise<unknown>) => {
    return task({ report: vi.fn() });
  }),

  onDidChangeWindowState: vi.fn(() => ({ dispose: vi.fn() })),
  onDidEndTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
};

// --- commands ---

const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

export const commands = {
  registerCommand: vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
    registeredCommands.set(id, handler);
    return { dispose: vi.fn() };
  }),

  executeCommand: vi.fn(async (id: string, ...args: unknown[]) => {
    const handler = registeredCommands.get(id);
    if (handler) { return handler(...args); }
  }),

  __getRegistered() { return registeredCommands; },
  __clearRegistered() { registeredCommands.clear(); },
};

// --- env ---

export const env = {
  clipboard: { writeText: vi.fn(), readText: vi.fn(async () => '') },
  openExternal: vi.fn(),
};

// --- extensions ---

export const extensions = {
  getExtension: vi.fn(() => undefined),
};
