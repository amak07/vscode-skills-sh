import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';

// fs is mocked so existsSync is configurable (UNC paths don't exist in CI).
vi.mock('fs', async (importOriginal) => ({ ...(await importOriginal() as object) }));
vi.mock('child_process');

import * as fs from 'fs';
import { getWslRoots, parseRunningDistros } from '../../../local/wsl';

/** `wsl.exe -l -v` prints UTF-16LE. Build a Buffer matching that. */
function utf16(text: string): Buffer {
  return Buffer.from(text, 'utf16le');
}

const WSL_LIST_OUTPUT =
  '  NAME              STATE           VERSION\r\n' +
  '* Ubuntu-20.04      Running         2\r\n' +
  '  Debian            Stopped         2\r\n' +
  '  docker-desktop    Running         2\r\n' +
  '  docker-desktop-data Running       2\r\n';

const originalPlatform = process.platform;
function setPlatform(p: string): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

describe('parseRunningDistros', () => {
  it('keeps only running, non-system distros and strips the default-distro marker', () => {
    expect(parseRunningDistros(WSL_LIST_OUTPUT)).toEqual(['Ubuntu-20.04']);
  });

  it('returns [] for empty / header-only output', () => {
    expect(parseRunningDistros('  NAME   STATE   VERSION\r\n')).toEqual([]);
    expect(parseRunningDistros('')).toEqual([]);
  });
});

describe('getWslRoots', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset();
  });
  afterEach(() => {
    setPlatform(originalPlatform);
  });

  it('returns [] on non-Windows without spawning wsl.exe', async () => {
    setPlatform('darwin');
    const roots = await getWslRoots();
    expect(roots).toEqual([]);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('lists running distros and resolves each UNC home (win32)', async () => {
    setPlatform('win32');
    // First call: `wsl -l -v` (UTF-16LE). Subsequent: `$HOME` per distro (UTF-8).
    vi.mocked(execFile).mockImplementation(((cmd: string, args: string[], _opts: unknown, cb: (e: Error | null, out: Buffer) => void) => {
      if (args.includes('-l')) { cb(null, utf16(WSL_LIST_OUTPUT)); }
      else { cb(null, Buffer.from('/home/abelm', 'utf8')); }
      return {} as never;
    }) as never);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    const roots = await getWslRoots();

    expect(roots).toEqual([
      { distro: 'Ubuntu-20.04', base: '\\\\wsl$\\Ubuntu-20.04\\home\\abelm' },
    ]);
  });

  it('falls back to \\\\wsl.localhost when \\\\wsl$ is unavailable', async () => {
    setPlatform('win32');
    vi.mocked(execFile).mockImplementation(((cmd: string, args: string[], _opts: unknown, cb: (e: Error | null, out: Buffer) => void) => {
      if (args.includes('-l')) { cb(null, utf16(WSL_LIST_OUTPUT)); }
      else { cb(null, Buffer.from('/home/abelm', 'utf8')); }
      return {} as never;
    }) as never);
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).startsWith('\\\\wsl.localhost\\'));

    expect(await getWslRoots()).toEqual([
      { distro: 'Ubuntu-20.04', base: '\\\\wsl.localhost\\Ubuntu-20.04\\home\\abelm' },
    ]);
  });

  it('skips a distro whose UNC home does not exist', async () => {
    setPlatform('win32');
    vi.mocked(execFile).mockImplementation(((cmd: string, args: string[], _opts: unknown, cb: (e: Error | null, out: Buffer) => void) => {
      if (args.includes('-l')) { cb(null, utf16(WSL_LIST_OUTPUT)); }
      else { cb(null, Buffer.from('/home/abelm', 'utf8')); }
      return {} as never;
    }) as never);
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    expect(await getWslRoots()).toEqual([]);
  });

  it('returns [] (never throws) when wsl.exe is missing', async () => {
    setPlatform('win32');
    vi.mocked(execFile).mockImplementation(((cmd: string, args: string[], _opts: unknown, cb: (e: Error | null, out: Buffer | null) => void) => {
      cb(Object.assign(new Error('spawn wsl.exe ENOENT'), { code: 'ENOENT' }), null);
      return {} as never;
    }) as never);

    expect(await getWslRoots()).toEqual([]);
  });
});
