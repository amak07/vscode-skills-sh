import { UpdateCheckResponse } from '../types';
import { fetchSkillFolderHashes } from './github';

let lastUpdateResult: UpdateCheckResponse | null = null;

export function getLastUpdateResult(): UpdateCheckResponse | null {
  return lastUpdateResult;
}

/** Remove a skill from the cached update result (e.g. after it was updated) */
export function clearUpdateForSkill(skillName: string): void {
  if (!lastUpdateResult) { return; }
  lastUpdateResult = {
    ...lastUpdateResult,
    updates: lastUpdateResult.updates.filter(u => u.name !== skillName),
  };
}

/**
 * Check for skill updates using the GitHub Trees API directly.
 * Matches the CLI's fetchSkillFolderHash() logic: tries main → master branches.
 * This avoids the branch mismatch bug in the Vercel check-updates API.
 */
export async function checkUpdates(
  skills: { name: string; source: string; skillFolderHash: string; skillPath?: string }[]
): Promise<UpdateCheckResponse> {
  // Group by source repo to batch API calls
  const bySource = new Map<string, typeof skills>();
  for (const s of skills) {
    const list = bySource.get(s.source) || [];
    list.push(s);
    bySource.set(s.source, list);
  }

  const updates: UpdateCheckResponse['updates'] = [];

  for (const [source, sourceSkills] of bySource) {
    const hashes = await fetchSkillFolderHashes(source);

    for (const skill of sourceSkills) {
      // Extract folder path from skillPath: "skills/react-email/SKILL.md" → "skills/react-email"
      const folderPath = skill.skillPath
        ? skill.skillPath.replace(/\/SKILL\.md$/i, '')
        : `skills/${skill.name}`;

      const latestHash = hashes.get(folderPath);
      if (latestHash && latestHash !== skill.skillFolderHash) {
        updates.push({ name: skill.name, source, newHash: latestHash });
      }
    }
  }

  lastUpdateResult = { updates, errors: [] };
  return lastUpdateResult;
}
