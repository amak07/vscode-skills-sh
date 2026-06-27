import { execFile } from 'child_process';
import { getLog } from '../logger';

/** WSL's own internal distros — not real Linux homes a user installs skills into. */
const SYSTEM_DISTROS = new Set(['docker-desktop', 'docker-desktop-data']);

/** NUL char, used to scrub UTF-16 decode artifacts without an inline escape. */
const NUL = String.fromCharCode(0);

const TAB = String.fromCharCode(9);

export interface WslDumpSkill {
  agentDir: string;   // relative agent skills dir, e.g. ".agents/skills"
  folderName: string; // skill folder name
  content: string;    // raw SKILL.md contents
}

export interface WslDump {
  home: string;            // the distro's $HOME, e.g. "/home/abelm"
  lockJson: string | null; // raw ~/.agents/.skill-lock.json contents, if present
  skills: WslDumpSkill[];
}

/**
 * Names of running, non-system WSL distros (Windows only). Returns [] on any
 * other platform or on any failure (e.g. wsl.exe not installed). Never throws.
 *
 * We scan only RUNNING distros on purpose: starting a stopped distro just to
 * read skills is slow and a surprising side effect.
 */
export async function getRunningWslDistros(): Promise<string[]> {
  if (process.platform !== 'win32') {
    return [];
  }
  const log = getLog();
  try {
    const listing = await runWsl(['-l', '-v'], 'utf16le');
    return parseRunningDistros(listing);
  } catch (e) {
    log.info(`[wsl] WSL detection unavailable: ${(e as Error).message}`);
    return [];
  }
}

/**
 * Read installed skills from a distro by running a single shell script through
 * `wsl.exe -e` (NOT the `\\wsl$` UNC share, which is unreliable / session-
 * dependent on Windows). Returns the raw dump text, or null on failure.
 */
export async function dumpWslSkills(distro: string, agentDirs: string[]): Promise<string | null> {
  const log = getLog();
  const dirsLiteral = agentDirs.map(d => `'${d}'`).join(' ');
  const script =
    `for agentdir in ${dirsLiteral}; do ` +
    `base="$HOME/$agentdir"; [ -d "$base" ] || continue; ` +
    `for d in "$base"/*/; do ` +
    `[ -f "$d/SKILL.md" ] || continue; ` +
    `name=$(basename "$d"); ` +
    `printf '===SKILL\\t%s\\t%s===\\n' "$agentdir" "$name"; ` +
    `cat "$d/SKILL.md"; ` +
    `printf '\\n===ENDSKILL===\\n'; ` +
    `done; done; ` +
    `printf '===HOME===%s===\\n' "$HOME"; ` +
    `printf '===LOCK===\\n'; ` +
    `cat "$HOME/.agents/.skill-lock.json" 2>/dev/null; ` +
    `printf '\\n===ENDLOCK===\\n'`;
  try {
    // `sh -c` (not `-lc`): a login shell could run a user's profile and pollute
    // stdout before the first delimiter. The script needs only builtins + cat.
    return await runWsl(['-d', distro, '-e', 'sh', '-c', script], 'utf8');
  } catch (e) {
    log.warn(`[wsl] could not read skills from distro ${distro}: ${(e as Error).message}`);
    return null;
  }
}

/** Parse the delimited dump emitted by dumpWslSkills() into structured data. */
export function parseWslDump(dump: string): WslDump {
  const skills: WslDumpSkill[] = [];
  const skillRe = new RegExp(
    `===SKILL${TAB}([^${TAB}]+)${TAB}([^\\n]+?)===\\n([\\s\\S]*?)\\n===ENDSKILL===`,
    'g',
  );
  let m: RegExpExecArray | null;
  while ((m = skillRe.exec(dump)) !== null) {
    skills.push({ agentDir: m[1], folderName: m[2], content: m[3] });
  }

  // Anchor the HOME/LOCK markers to line starts (they're printed that way) so a
  // SKILL.md body containing the literal marker text can't be mistaken for them.
  const homeMatch = dump.match(/^===HOME===([\s\S]*?)===$/m);
  const home = homeMatch ? homeMatch[1].trim() : '';

  const lockMatch = dump.match(/^===LOCK===\n([\s\S]*?)\n===ENDLOCK===$/m);
  const lockRaw = lockMatch ? lockMatch[1].trim() : '';

  return { home, lockJson: lockRaw || null, skills };
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
      { encoding: 'buffer', windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) { reject(err); return; }
        resolve(Buffer.from(stdout as unknown as Buffer).toString(encoding));
      },
    );
  });
}
