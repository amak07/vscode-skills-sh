import { vi, beforeEach } from 'vitest';
import { workspace, commands } from 'vscode';

vi.stubGlobal('fetch', vi.fn());

beforeEach(() => {
  (workspace as any).__resetConfig();
  (commands as any).__clearRegistered();
});
