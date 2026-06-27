import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';

vi.mock('child_process');

import { getRunningWslDistros, dumpWslSkills, parseWslDump, parseRunningDistros } from '../../../local/wsl';

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

describe('parseWslDump', () => {
  const TAB = String.fromCharCode(9);
  const dump =
    `===SKILL${TAB}.agents/skills${TAB}monorepo-management===\n` +
    `---\nname: monorepo-management\ndescription: Master monorepos\n---\nBody.\n` +
    `\n===ENDSKILL===\n` +
    `===SKILL${TAB}.claude/skills${TAB}monorepo-management===\n` +
    `---\nname: monorepo-management\ndescription: Master monorepos\n---\nBody.\n` +
    `\n===ENDSKILL===\n` +
    `===HOME===/home/abelm===\n` +
    `===LOCK===\n{"version":3,"skills":{"monorepo-management":{"source":"wshobson/agents"}}}\n===ENDLOCK===\n`;

  it('extracts skills, home, and the lock JSON', () => {
    const parsed = parseWslDump(dump);
    expect(parsed.home).toBe('/home/abelm');
    expect(parsed.lockJson).toContain('wshobson/agents');
    expect(parsed.skills).toHaveLength(2);
    expect(parsed.skills[0]).toMatchObject({ agentDir: '.agents/skills', folderName: 'monorepo-management' });
    expect(parsed.skills[0].content).toContain('name: monorepo-management');
  });

  it('handles an empty dump (no skills, no lock)', () => {
    const parsed = parseWslDump('===HOME===/home/x===\n===LOCK===\n\n===ENDLOCK===\n');
    expect(parsed.skills).toEqual([]);
    expect(parsed.lockJson).toBeNull();
    expect(parsed.home).toBe('/home/x');
  });
});

describe('getRunningWslDistros', () => {
  beforeEach(() => { vi.mocked(execFile).mockReset(); });
  afterEach(() => { setPlatform(originalPlatform); });

  it('returns [] on non-Windows without spawning wsl.exe', async () => {
    setPlatform('darwin');
    expect(await getRunningWslDistros()).toEqual([]);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('lists running distros on win32', async () => {
    setPlatform('win32');
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, out: Buffer) => void) => {
      cb(null, utf16(WSL_LIST_OUTPUT));
      return {} as never;
    }) as never);
    expect(await getRunningWslDistros()).toEqual(['Ubuntu-20.04']);
  });

  it('returns [] (never throws) when wsl.exe is missing', async () => {
    setPlatform('win32');
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, out: Buffer | null) => void) => {
      cb(Object.assign(new Error('spawn wsl.exe ENOENT'), { code: 'ENOENT' }), null);
      return {} as never;
    }) as never);
    expect(await getRunningWslDistros()).toEqual([]);
  });
});

describe('dumpWslSkills', () => {
  beforeEach(() => { vi.mocked(execFile).mockReset(); });

  it('runs a script in the distro via wsl -e and returns its stdout', async () => {
    let capturedArgs: string[] = [];
    vi.mocked(execFile).mockImplementation(((_cmd: string, args: string[], _opts: unknown, cb: (e: Error | null, out: Buffer) => void) => {
      capturedArgs = args;
      cb(null, Buffer.from('DUMP-OUTPUT', 'utf8'));
      return {} as never;
    }) as never);

    const out = await dumpWslSkills('Ubuntu-20.04', ['.agents/skills', '.claude/skills']);

    expect(out).toBe('DUMP-OUTPUT');
    expect(capturedArgs.slice(0, 4)).toEqual(['-d', 'Ubuntu-20.04', '-e', 'sh']);
    // The generated script references each agent dir.
    expect(capturedArgs[capturedArgs.length - 1]).toContain(`'.agents/skills' '.claude/skills'`);
  });

  it('returns null (never throws) on failure', async () => {
    vi.mocked(execFile).mockImplementation(((_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, out: Buffer | null) => void) => {
      cb(new Error('boom'), null);
      return {} as never;
    }) as never);
    expect(await dumpWslSkills('Ubuntu-20.04', ['.agents/skills'])).toBeNull();
  });
});
