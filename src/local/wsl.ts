import { execFile } from 'child_process';
import * as fs from 'fs';
import { getLog } from '../logger';

/**
 * A WSL distro's home directory, reachable from the Windows host via a UNC path.
 * `base` is e.g. `\\wsl$\Ubuntu-20.04\home\abelm` — agent skill dirs hang off it.
 */
export interface WslRoot {
  distro: string;
  base: string;
}

/** WSL's own internal distros — not real Linux homes a user installs skills into. */
const SYSTEM_DISTROS = new Set(['docker-desktop', 'docker-desktop-data']);

/** NUL char, used to scrub UTF-16 decode artifacts without an inline escape. */
const NUL = String.fromCharCode(0);

/**
 * Detect running WSL distros and resolve each one's default-user home as a
 * Windows UNC path. Windows-only; returns [] on any other platform or on any
 * failure (e.g. wsl.exe not installed). Never throws.
 *
 * We scan only RUNNING distros on purpose: touching `\\wsl$\<distro>` for a
 * stopped distro auto-starts it, which is slow and a surprising side effect.
 */
export async function getWslRoots(): Promise<WslRoot[]> {
  if (process.platform !== 'win32') {
    return [];
  }
  const log = getLog();
  try {
    const listing = await runWsl(['-l', '-v'], 'utf16le');
    const distros = parseRunningDistros(listing);
    const roots: WslRoot[] = [];
    for (const distro of distros) {
      try {
        // `$HOME` is emitted by the Linux shell as raw UTF-8 (not wsl.exe's UTF-16).
        const home = (await runWsl(['-d', distro, '-e', 'sh', '-lc', 'printf %s "$HOME"'], 'utf8')).trim();
        if (!home.startsWith('/')) { continue; }
        const base = resolveWslBase(distro, home);
        if (base) {
          roots.push({ distro, base });
        }
      } catch (e) {
        log.warn(`[wsl] could not resolve home for distro ${distro}: ${(e as Error).message}`);
      }
    }
    return roots;
  } catch (e) {
    // wsl.exe missing or any other failure — degrade silently to "no WSL".
    log.info(`[wsl] WSL detection unavailable: ${(e as Error).message}`);
    return [];
  }
}

/**
 * Resolve a distro + Linux home (`/home/<user>`) to a reachable Windows UNC base.
 * Windows exposes WSL files under `\\wsl$\<distro>` (older) or `\\wsl.localhost\
 * <distro>` (Windows 22H2+); try both and return the first that exists, or null.
 */
function resolveWslBase(distro: string, home: string): string | null {
  const tail = home.replace(/\//g, '\\');
  for (const prefix of ['\\\\wsl$\\', '\\\\wsl.localhost\\']) {
    const base = `${prefix}${distro}${tail}`;
    try {
      if (fs.existsSync(base)) { return base; }
    } catch {
      // UNC access can throw (provider unavailable) — treat as "not here".
    }
  }
  return null;
}

/**
 * Parse `wsl.exe -l -v` output into the names of running, non-system distros.
 * Output looks like (with a leading "*" marking the default distro):
 *   NAME              STATE           VERSION
 * * Ubuntu-20.04      Running         2
 *   docker-desktop    Stopped         2
 */
export function parseRunningDistros(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    // Drop stray NUL artifacts, then strip the leading default-distro "*" marker.
    const line = raw.split(NUL).join('').replace(/^\s*\*?\s*/, '').trimEnd();
    if (!line) { continue; }
    if (/^NAME\s+STATE\s+VERSION/i.test(line)) { continue; }
    const cols = line.split(/\s{2,}/);
    if (cols.length < 2) { continue; }
    const name = cols[0].trim();
    const state = cols[1].trim();
    if (!name || SYSTEM_DISTROS.has(name)) { continue; }
    if (state !== 'Running') { continue; }
    names.push(name);
  }
  return names;
}

/** Run wsl.exe, capturing raw bytes and decoding with the given encoding. */
function runWsl(args: string[], encoding: BufferEncoding): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'wsl.exe',
      args,
      { encoding: 'buffer', windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) { reject(err); return; }
        resolve(Buffer.from(stdout as unknown as Buffer).toString(encoding));
      },
    );
  });
}
