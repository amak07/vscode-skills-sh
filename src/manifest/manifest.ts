import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { SkillManifest, SkillManifestEntry, InstalledSkill } from '../types';

const MANIFEST_FILENAME = 'skills.json';

/** Get the path to skills.json in the workspace root */
export function getManifestPath(): string | null {
  const ws = vscode.workspace.workspaceFolders;
  if (!ws || ws.length === 0) { return null; }
  return path.join(ws[0].uri.fsPath, MANIFEST_FILENAME);
}

/** Read and parse skills.json, returns null if not found or invalid */
export function readManifest(): SkillManifest | null {
  const manifestPath = getManifestPath();
  if (!manifestPath) { return null; }

  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed && Array.isArray(parsed.skills)) {
      return parsed as SkillManifest;
    }
    return null;
  } catch {
    return null;
  }
}

/** Write skills.json to the workspace root */
export function writeManifest(manifest: SkillManifest): void {
  const manifestPath = getManifestPath();
  if (!manifestPath) { return; }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

/** Add a skill to skills.json (creates the file if needed) */
export function addSkillToManifest(source: string, skillName: string): void {
  const manifest = readManifest() ?? { skills: [] };

  // Find existing entry for this source, or create a new one
  let entry = manifest.skills.find(e => e.source === source);
  if (!entry) {
    entry = { source, skills: [] };
    manifest.skills.push(entry);
  }

  // Add skill name if not already present
  if (!entry.skills.includes(skillName)) {
    entry.skills.push(skillName);
    entry.skills.sort();
  }

  // Sort entries by source for consistency
  manifest.skills.sort((a, b) => a.source.localeCompare(b.source));

  writeManifest(manifest);
}

/** Remove a skill from skills.json by folder name */
export function removeSkillFromManifest(skillName: string): void {
  const manifest = readManifest();
  if (!manifest) { return; }

  for (const entry of manifest.skills) {
    const idx = entry.skills.indexOf(skillName);
    if (idx !== -1) {
      entry.skills.splice(idx, 1);
    }
  }

  // Remove entries with no skills left
  manifest.skills = manifest.skills.filter(e => e.skills.length > 0);

  writeManifest(manifest);
}

/** Check if a skill is in the manifest (by folder name) */
export function isSkillInManifest(skillName: string): boolean {
  const manifest = readManifest();
  if (!manifest) { return false; }
  return manifest.skills.some(e => e.skills.includes(skillName));
}

/** Get all skill names currently listed in the manifest */
export function getManifestSkillNames(): Set<string> {
  const manifest = readManifest();
  if (!manifest) { return new Set(); }
  const names = new Set<string>();
  for (const entry of manifest.skills) {
    for (const skill of entry.skills) {
      names.add(skill);
    }
  }
  return names;
}

export interface MissingSkill {
  source: string;
  skillName: string;
}

/** Diff manifest against installed skills — return what's missing */
export function getMissingSkills(
  manifest: SkillManifest,
  installedSkills: InstalledSkill[],
): MissingSkill[] {
  const missing: MissingSkill[] = [];

  // Build a set of installed skill folder names for quick lookup
  const installedNames = new Set<string>();
  for (const skill of installedSkills) {
    installedNames.add(skill.folderName);
    installedNames.add(skill.name);
  }

  for (const entry of manifest.skills) {
    for (const skillName of entry.skills) {
      if (!installedNames.has(skillName)) {
        missing.push({ source: entry.source, skillName });
      }
    }
  }

  return missing;
}
