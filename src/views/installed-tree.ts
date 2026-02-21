import * as vscode from 'vscode';
import { InstalledSkill } from '../types';
import { SkillScanner } from '../local/scanner';
import { fetchRepoSkillList } from '../api/github';
import { getLastUpdateResult } from '../api/updates';

type TreeItem = GroupItem | SkillItem | CustomSourceItem | RemoteSkillItem;

const GROUP_ICONS: Record<string, string> = {
  source: 'repo',
  custom: 'account',
  untracked: 'question',
  project: 'folder-library',
  'custom-sources': 'repo',
  updates: 'cloud-upload',
};

class GroupItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly groupType: 'source' | 'custom' | 'untracked' | 'project' | 'custom-sources' | 'updates',
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
  constructor(public readonly skill: InstalledSkill, hasUpdate: boolean = false) {
    super(skill.name, vscode.TreeItemCollapsibleState.None);

    // Only show agent badges when installed for 2+ agents (otherwise it's noise)
    const agentSuffix = skill.agents.length > 1 ? ` · ${skill.agents.join(', ')}` : '';

    if (hasUpdate) {
      this.description = `Update available${agentSuffix}`;
      this.iconPath = new vscode.ThemeIcon('arrow-up');
    } else if (skill.isCustom) {
      this.description = `${skill.description}${agentSuffix}`;
      this.iconPath = new vscode.ThemeIcon('file-code');
    } else if (!skill.source || !skill.hash) {
      this.description = skill.description
        ? `${skill.description} (untracked)${agentSuffix}`
        : `(untracked)${agentSuffix}`;
      this.iconPath = new vscode.ThemeIcon('file-code');
    } else {
      this.description = `${skill.description}${agentSuffix}`;
      this.iconPath = new vscode.ThemeIcon('file-code');
    }

    const tooltipLines = [skill.name];
    if (skill.description) { tooltipLines.push(skill.description); }
    if (skill.agents.length > 0) { tooltipLines.push(`\nAgents: ${skill.agents.join(', ')}`); }
    tooltipLines.push(`\nPath: ${skill.path}`);
    if (skill.source) {
      tooltipLines.push(`Source: ${skill.source}`);
    } else if (skill.isCustom) {
      tooltipLines.push('\nCustom skill (user-created)');
    } else {
      tooltipLines.push('\nUntracked: re-install via Marketplace to enable updates');
    }
    this.tooltip = tooltipLines.join('\n');

    this.contextValue = hasUpdate ? 'skill_updatable' : 'skill';
    this.command = {
      command: 'skills-sh.previewSkillFile',
      title: 'Preview SKILL.md',
      arguments: [skill],
    };
  }
}

class CustomSourceItem extends vscode.TreeItem {
  constructor(
    public readonly source: string,
    public readonly skillCount: number,
  ) {
    super(source, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${skillCount} skills`;
    this.contextValue = 'customSource';
    this.iconPath = new vscode.ThemeIcon('repo');
  }
}

class RemoteSkillItem extends vscode.TreeItem {
  constructor(
    public readonly skillName: string,
    public readonly source: string,
    public readonly isInstalled: boolean,
  ) {
    super(skillName, vscode.TreeItemCollapsibleState.None);
    this.description = isInstalled ? 'Installed' : '';
    this.tooltip = `${skillName} from ${source}`;
    this.contextValue = 'remoteSkill';
    this.iconPath = new vscode.ThemeIcon(
      isInstalled ? 'check' : 'cloud-download',
    );
  }
}

export class InstalledSkillsTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private globalSkills: InstalledSkill[] = [];
  private projectSkills: InstalledSkill[] = [];
  private customSourceSkillCounts = new Map<string, number>();
  private customSourceSkills = new Map<string, string[]>();
  private hasInitiallyScanned = false;

  constructor(private scanner: SkillScanner) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  async rescan(): Promise<void> {
    const { globalSkills, projectSkills } = await this.scanner.scan();
    this.globalSkills = globalSkills;
    this.projectSkills = projectSkills;
    await this.loadCustomSourceCounts();
    this.hasInitiallyScanned = true;

    const customSources = vscode.workspace.getConfiguration('skills-sh')
      .get<string[]>('customSources', []);
    const noSkills = this.globalSkills.length === 0
      && this.projectSkills.length === 0
      && customSources.length === 0;
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

      const groups: TreeItem[] = [];

      // --- Updates available group (pinned at top, expanded) ---
      if (updatableNames.size > 0) {
        const allSkills = [...this.globalSkills, ...this.projectSkills];
        const updatableSkills = allSkills.filter(s => updatableNames.has(s.name));
        if (updatableSkills.length > 0) {
          const children = updatableSkills.map(s => new SkillItem(s, true));
          groups.push(new GroupItem(
            `Updates Available (${updatableSkills.length})`,
            'updates',
            children,
            vscode.TreeItemCollapsibleState.Expanded,
          ));
        }
      }

      // --- Source-based groups for global skills ---
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
        const children = custom.map(s => new SkillItem(s, false));
        groups.push(new GroupItem(
          `My Skills (${custom.length})`,
          'custom',
          children,
        ));
      }

      const sortedSources = Array.from(bySource.entries())
        .sort(([a], [b]) => a.localeCompare(b));

      for (const [source, skills] of sortedSources) {
        const children = skills.map(s => new SkillItem(s, updatableNames.has(s.name)));
        groups.push(new GroupItem(
          `${source} (${skills.length})`,
          'source',
          children,
        ));
      }

      // Untracked — orphaned symlinks missing lock entries
      if (untracked.length > 0) {
        const children = untracked.map(s => new SkillItem(s, false));
        groups.push(new GroupItem(
          `Untracked (${untracked.length})`,
          'untracked',
          children,
        ));
      }

      // --- Project skills ---
      if (this.projectSkills.length > 0) {
        const children = this.projectSkills.map(s =>
          new SkillItem(s, updatableNames.has(s.name)),
        );
        groups.push(new GroupItem(
          `Project Skills (${this.projectSkills.length})`,
          'project',
          children,
        ));
      }

      // --- Custom sources ---
      const customSources = vscode.workspace.getConfiguration('skills-sh')
        .get<string[]>('customSources', []);
      if (customSources.length > 0) {
        const sourceItems = customSources.map(source => {
          const count = this.customSourceSkillCounts.get(source) ?? 0;
          return new CustomSourceItem(source, count);
        });
        groups.push(new GroupItem(
          `Custom Sources (${customSources.length})`,
          'custom-sources',
          sourceItems,
        ));
      }

      return groups;
    }

    if (element instanceof GroupItem) {
      return element.children;
    }

    if (element instanceof CustomSourceItem) {
      const skills = this.customSourceSkills.get(element.source) ?? [];
      const installedNames = this.getInstalledSkillNames();
      return skills.map(name =>
        new RemoteSkillItem(name, element.source, installedNames.has(name)),
      );
    }

    return [];
  }

  private async loadCustomSourceCounts(): Promise<void> {
    const customSources = vscode.workspace.getConfiguration('skills-sh')
      .get<string[]>('customSources', []);

    this.customSourceSkillCounts.clear();
    this.customSourceSkills.clear();

    const promises = customSources.map(async (source) => {
      try {
        const skills = await fetchRepoSkillList(source);
        this.customSourceSkillCounts.set(source, skills.length);
        this.customSourceSkills.set(source, skills);
      } catch {
        this.customSourceSkillCounts.set(source, 0);
        this.customSourceSkills.set(source, []);
      }
    });

    await Promise.allSettled(promises);
  }
}
