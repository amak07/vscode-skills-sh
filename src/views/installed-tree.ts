import * as vscode from 'vscode';
import { InstalledSkill } from '../types';
import { SkillScanner } from '../local/scanner';
import { getLastUpdateResult } from '../api/updates';
import { getManifestSkillNames } from '../manifest/manifest';

type TreeItem = GroupItem | SkillItem | QuickLinkItem;

const GROUP_ICONS: Record<string, string> = {
  source: 'repo',
  custom: 'account',
  untracked: 'question',
  project: 'folder-library',
  updates: 'cloud-upload',
  'quick-links': 'link',
};

class GroupItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly groupType: 'source' | 'custom' | 'untracked' | 'project' | 'updates' | 'quick-links',
    public readonly children: TreeItem[],
    collapsibleState = vscode.TreeItemCollapsibleState.Collapsed,
  ) {
    super(label, collapsibleState);
    if (groupType === 'updates') {
      this.contextValue = 'updatesGroup';
    } else if (groupType === 'source') {
      this.contextValue = 'sourceGroup';
    } else {
      this.contextValue = 'group';
    }
    this.iconPath = new vscode.ThemeIcon(GROUP_ICONS[groupType] ?? 'extensions');
  }
}

class SkillItem extends vscode.TreeItem {
  constructor(
    public readonly skill: InstalledSkill,
    hasUpdate: boolean = false,
    inManifest: boolean = false,
  ) {
    super(skill.name, vscode.TreeItemCollapsibleState.None);

    if (hasUpdate) {
      this.description = 'Update available';
      this.iconPath = new vscode.ThemeIcon('arrow-up');
    } else if (skill.isCustom) {
      this.description = skill.description;
      this.iconPath = new vscode.ThemeIcon('file-code');
    } else if (!skill.source || !skill.hash) {
      this.description = skill.description
        ? `${skill.description} (untracked)`
        : '(untracked)';
      this.iconPath = new vscode.ThemeIcon('file-code');
    } else {
      this.description = skill.description;
      this.iconPath = new vscode.ThemeIcon('file-code');
    }

    const tooltipLines = [skill.name];
    if (skill.description) { tooltipLines.push(skill.description); }
    tooltipLines.push(`\nPath: ${skill.path}`);
    if (skill.source) {
      tooltipLines.push(`Source: ${skill.source}`);
    } else if (skill.isCustom) {
      tooltipLines.push('\nCustom skill (user-created)');
    } else {
      tooltipLines.push('\nUntracked: re-install via Marketplace to enable updates');
    }
    if (inManifest) {
      tooltipLines.push('\n📋 In skills.json');
    }
    this.tooltip = tooltipLines.join('\n');

    // Context value scheme: skill / skill_manifest / skill_updatable / skill_updatable_manifest
    const base = hasUpdate ? 'skill_updatable' : 'skill';
    this.contextValue = inManifest ? `${base}_manifest` : base;
    this.command = {
      command: 'skills-sh.previewSkillFile',
      title: 'Preview SKILL.md',
      arguments: [skill],
    };
  }
}

// CustomSourceItem and RemoteSkillItem commented out — Part 6E (future enhancement, see beads backlog)

class QuickLinkItem extends vscode.TreeItem {
  constructor(
    label: string,
    icon: string,
    commandId: string,
    tooltip: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.tooltip = tooltip;
    this.contextValue = 'quickLink';
    this.command = { command: commandId, title: label };
  }
}

export class InstalledSkillsTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private globalSkills: InstalledSkill[] = [];
  private projectSkills: InstalledSkill[] = [];
  private hasInitiallyScanned = false;

  constructor(private scanner: SkillScanner) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  async rescan(): Promise<void> {
    const { globalSkills, projectSkills } = await this.scanner.scan();
    this.globalSkills = globalSkills;
    this.projectSkills = projectSkills;
    this.hasInitiallyScanned = true;

    const noSkills = this.globalSkills.length === 0
      && this.projectSkills.length === 0;
    vscode.commands.executeCommand('setContext', 'skills-sh.noSkillsFound', noSkills);

    this.refresh();
  }

  getInstalledSkillNames(): Set<string> {
    const names = new Set<string>();
    for (const skill of [...this.globalSkills, ...this.projectSkills]) {
      names.add(skill.name);
      names.add(skill.folderName);
    }
    return names;
  }

  getAllInstalledSkills(): InstalledSkill[] {
    return [...this.globalSkills, ...this.projectSkills];
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!element) {
      if (!this.hasInitiallyScanned) {
        await this.rescan();
      }

      const updateResult = getLastUpdateResult();
      const updatableNames = new Set(
        (updateResult?.updates ?? []).map(u => u.name),
      );
      const manifestNames = getManifestSkillNames();

      const groups: TreeItem[] = [];

      // --- Updates available group (pinned at top, expanded) ---
      if (updatableNames.size > 0) {
        const allSkills = [...this.globalSkills, ...this.projectSkills];
        const updatableSkills = allSkills.filter(s => updatableNames.has(s.name));
        if (updatableSkills.length > 0) {
          const children = updatableSkills.map(s =>
            new SkillItem(s, true, manifestNames.has(s.folderName)),
          );
          groups.push(new GroupItem(
            `Updates Available (${updatableSkills.length})`,
            'updates',
            children,
            vscode.TreeItemCollapsibleState.Expanded,
          ));
        }
      }

      // --- Skill groups: by source / custom / untracked ---
      const bySource = new Map<string, InstalledSkill[]>();
      const custom: InstalledSkill[] = [];
      const untracked: InstalledSkill[] = [];

      for (const skill of this.globalSkills) {
        if (skill.source) {
          const list = bySource.get(skill.source) || [];
          list.push(skill);
          bySource.set(skill.source, list);
        } else if (skill.isCustom) {
          custom.push(skill);
        } else {
          untracked.push(skill);
        }
      }

      // Custom skills — user-created, regular directories (not symlinks)
      if (custom.length > 0) {
        const sorted = this.sortSkills(custom);
        const children = sorted.map(s =>
          new SkillItem(s, false, manifestNames.has(s.folderName)),
        );
        groups.push(new GroupItem(
          `Custom Skills (${custom.length})`,
          'custom',
          children,
        ));
      }

      const sortedSources = Array.from(bySource.entries())
        .sort(([a], [b]) => a.localeCompare(b));

      for (const [source, skills] of sortedSources) {
        const sorted = this.sortSkills(skills);
        const children = sorted.map(s =>
          new SkillItem(s, updatableNames.has(s.name), manifestNames.has(s.folderName)),
        );
        groups.push(new GroupItem(
          `${source} (${skills.length})`,
          'source',
          children,
        ));
      }

      // Untracked — orphaned symlinks missing lock entries
      if (untracked.length > 0) {
        const sorted = this.sortSkills(untracked);
        const children = sorted.map(s =>
          new SkillItem(s, false, manifestNames.has(s.folderName)),
        );
        groups.push(new GroupItem(
          `Untracked (${untracked.length})`,
          'untracked',
          children,
        ));
      }

      // --- Project skills ---
      if (this.projectSkills.length > 0) {
        const sorted = this.sortSkills(this.projectSkills);
        const children = sorted.map(s =>
          new SkillItem(s, updatableNames.has(s.name), manifestNames.has(s.folderName)),
        );
        groups.push(new GroupItem(
          `Project Skills (${this.projectSkills.length})`,
          'project',
          children,
        ));
      }

      // --- Quick Links (pinned at top) ---
      groups.unshift(new GroupItem(
        'Quick Links',
        'quick-links',
        [
          new QuickLinkItem('Browse Marketplace', 'extensions', 'skills-sh.openMarketplaceTab', 'Open the full marketplace in an editor tab'),
          new QuickLinkItem('View Installed in Detail', 'list-flat', 'skills-sh.viewInstalledInEditor', 'View installed skills with full actions in editor'),
          new QuickLinkItem('Security Audits', 'shield', 'skills-sh.openAudits', 'Browse security audit results on skills.sh'),
          new QuickLinkItem('Documentation', 'book', 'skills-sh.openDocs', 'Read skills.sh documentation'),
        ],
      ));

      return groups;
    }

    if (element instanceof GroupItem) {
      return element.children;
    }

    return [];
  }

  /** Sort skills alphabetically by name. */
  private sortSkills(skills: InstalledSkill[]): InstalledSkill[] {
    return [...skills].sort((a, b) => a.name.localeCompare(b.name));
  }
}
