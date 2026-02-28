import * as vscode from 'vscode';
import { Marked } from 'marked';
import { DocsPage, InstalledSkillCard, LeaderboardView, WebviewMessage } from '../../types';
import { searchSkills, getLeaderboard } from '../../api/search';
import { fetchSkillDetail } from '../../api/detail-scraper';
import { fetchSkillMd } from '../../api/github';
import { fetchDocsPage } from '../../api/docs-scraper';
import { fetchAuditListing } from '../../api/audits-scraper';
import { installSkill, updateSkills, uninstallSkill } from '../../install/installer';
import { getLastUpdateResult } from '../../api/updates';
import { addSkillToManifest, removeSkillFromManifest, getManifestSkillNames } from '../../manifest/manifest';
import { getStyles } from './styles';
import {
  backIcon,
  fileIcon,
  copyIcon,
  githubIcon,
  starIcon,
  shareIcon,
  trashIcon,
  updateIcon,
  renderSearchInput,
  renderTabs,
  renderChips,
  renderGridHeader,
  renderSkeletonRows,
  renderHero,
  renderNavBar,
} from './templates';
import { toErrorMessage } from '../../utils/errors';

const marked = new Marked();

export class MarketplaceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'skills-sh.marketplace';
  private _view?: vscode.WebviewView;
  private installedNames = new Set<string>();
  private updatableNames = new Set<string>();
  private installedSkills: InstalledSkillCard[] = [];
  private fontsUri = '';
  private panels: vscode.WebviewPanel[] = [];
  private tabWebviews = new WeakSet<vscode.Webview>();
  private detailRequestId = 0;

  private onManifestChanged?: () => void;

  constructor(private readonly extensionUri: vscode.Uri, onManifestChanged?: () => void) {
    this.onManifestChanged = onManifestChanged;
  }

  setInstalledNames(names: Set<string>): void {
    this.installedNames = names;
    this.pushButtonStates();
  }

  setUpdatableNames(names: Set<string>): void {
    this.updatableNames = names;
    this.pushButtonStates();
  }

  setInstalledSkills(skills: InstalledSkillCard[]): void {
    this.installedSkills = skills;
    const payload = skills;
    this._view?.webview.postMessage({ command: 'installedSkillsData', payload });
    for (const panel of this.panels) {
      panel.webview.postMessage({ command: 'installedSkillsData', payload });
    }
  }

  private pushButtonStates(): void {
    const manifestNames = [...getManifestSkillNames()];
    const payload = {
      installedNames: [...this.installedNames],
      updatableNames: [...this.updatableNames],
      manifestSkillNames: manifestNames,
    };
    this._view?.webview.postMessage({ command: 'updateButtonStates', payload });
    for (const panel of this.panels) {
      panel.webview.postMessage({ command: 'updateButtonStates', payload });
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    this.fontsUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'fonts')
    ).toString();

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media'),
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
      ],
    };

    webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      await this.handleMessage(message, webviewView.webview);
    });

    webviewView.webview.html = this.getHtml(webviewView.webview, this.fontsUri);
  }

  openInTab(): void {
    const panel = vscode.window.createWebviewPanel(
      'skills-sh.marketplaceTab',
      'Skills.sh Marketplace',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'media'),
          vscode.Uri.joinPath(this.extensionUri, 'dist'),
        ],
      },
    );

    const panelFontsUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'fonts')
    ).toString();

    this.tabWebviews.add(panel.webview);

    panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      await this.handleMessage(message, panel.webview);
    });

    panel.webview.html = this.getHtml(panel.webview, panelFontsUri, true);

    panel.onDidDispose(() => {
      this.panels = this.panels.filter(p => p !== panel);
    });

    this.panels.push(panel);
  }

  navigateTo(view: 'audits' | 'docs'): void {
    const payload = view === 'audits'
      ? { view: 'audits' }
      : { view: 'docs', page: 'overview' };

    this._view?.webview.postMessage({ command: 'navigateTo', payload });
    for (const panel of this.panels) {
      panel.webview.postMessage({ command: 'navigateTo', payload });
    }

    // Focus the marketplace sidebar
    vscode.commands.executeCommand('skills-sh.marketplace.focus');
  }

  dispose(): void {
    for (const panel of this.panels) {
      panel.dispose();
    }
    this.panels = [];
  }

  private async handleMessage(message: WebviewMessage, targetWebview: vscode.Webview): Promise<void> {
    switch (message.command) {
      case 'leaderboard': {
        const { view, page } = message.payload as { view: LeaderboardView; page: number };
        try {
          const data = await getLeaderboard(view, page);
          targetWebview.postMessage({
            command: 'leaderboardResult',
            payload: { ...data, installedNames: [...this.installedNames], updatableNames: [...this.updatableNames], manifestSkillNames: [...getManifestSkillNames()] },
          });
        } catch (e: unknown) {
          targetWebview.postMessage({ command: 'error', payload: toErrorMessage(e) });
        }
        break;
      }

      case 'search': {
        const { query } = message.payload as { query: string };
        try {
          const data = await searchSkills(query);
          targetWebview.postMessage({
            command: 'searchResult',
            payload: { ...data, installedNames: [...this.installedNames], updatableNames: [...this.updatableNames], manifestSkillNames: [...getManifestSkillNames()] },
          });
        } catch (e: unknown) {
          targetWebview.postMessage({ command: 'error', payload: toErrorMessage(e) });
        }
        break;
      }

      case 'detail': {
        const { source, skillId } = message.payload as { source: string; skillId: string };
        const [owner, repo] = source.split('/');
        const requestId = ++this.detailRequestId;
        try {
          let detail = await fetchSkillDetail(owner, repo, skillId);
          if (requestId !== this.detailRequestId) { break; }

          if (detail && !detail.skillMdHtml) {
            const md = await fetchSkillMd(source, skillId);
            if (requestId !== this.detailRequestId) { break; }
            if (md) {
              detail.skillMdHtml = await marked.parse(md);
            }
          }

          if (!detail) {
            const md = await fetchSkillMd(source, skillId);
            if (requestId !== this.detailRequestId) { break; }
            detail = {
              name: skillId,
              source,
              weeklyInstalls: 'N/A',
              firstSeen: 'N/A',
              repository: source,
              installCommand: `npx skills add https://github.com/${source} --skill ${skillId}`,
              perAgent: [],
              skillMdHtml: md ? await marked.parse(md) : '<p>Could not load skill details.</p>',
            };
          }

          const manifestNames = getManifestSkillNames();
          const isInstalled = this.installedNames.has(skillId);
          const inManifest = manifestNames.has(skillId);
          const hasUpdate = this.updatableNames.has(skillId);
          targetWebview.postMessage({ command: 'detailResult', payload: { ...detail, isInstalled, inManifest, hasUpdate } });
        } catch (e: unknown) {
          if (requestId !== this.detailRequestId) { break; }
          targetWebview.postMessage({ command: 'error', payload: toErrorMessage(e) });
        }
        break;
      }

      case 'install': {
        const { source, skillName } = message.payload as { source: string; skillName: string };
        const started = await installSkill(`https://github.com/${source}`, { skill: skillName });
        if (!started) {
          this.pushButtonStates();
        }
        break;
      }

      case 'update': {
        const updateResult = getLastUpdateResult();
        if (updateResult?.updates?.length) {
          const targetName = (message.payload as { skillName?: string })?.skillName;
          const updates = targetName
            ? updateResult.updates.filter(u => u.name === targetName)
            : updateResult.updates;
          if (updates.length > 0) {
            await updateSkills(updates);
          }
        }
        break;
      }

      case 'back': {
        // Re-render the full webview HTML to reset to leaderboard view
        const fontUri = this.getFontsUri(targetWebview);
        const isTab = this.tabWebviews.has(targetWebview);
        targetWebview.html = this.getHtml(targetWebview, fontUri, isTab);
        break;
      }

      case 'openExternal': {
        const { url } = message.payload as { url: string };
        vscode.env.openExternal(vscode.Uri.parse(url));
        break;
      }

      case 'openCategorySettings': {
        vscode.commands.executeCommand('workbench.action.openSettings', 'skills-sh.categories');
        break;
      }

      case 'addToManifest': {
        const { source: mSource, skillName: mSkill } = message.payload as { source: string; skillName: string };
        if (mSource && mSkill) {
          addSkillToManifest(mSource, mSkill);
          this.pushButtonStates();
          // Re-send installed skills with updated manifest state
          this.installedSkills = this.installedSkills.map(s =>
            s.folderName === mSkill ? { ...s, inManifest: true } : s,
          );
          this.setInstalledSkills(this.installedSkills);
          this.onManifestChanged?.();
          vscode.window.showInformationMessage(`Added "${mSkill}" to skills.json`);
        }
        break;
      }

      case 'audits': {
        try {
          const data = await fetchAuditListing();
          targetWebview.postMessage({ command: 'auditsResult', payload: data });
        } catch (e: unknown) {
          targetWebview.postMessage({ command: 'error', payload: toErrorMessage(e) });
        }
        break;
      }

      case 'removeFromManifest': {
        const { skillName: rmSkill } = message.payload as { skillName: string };
        if (rmSkill) {
          removeSkillFromManifest(rmSkill);
          this.pushButtonStates();
          this.installedSkills = this.installedSkills.map(s =>
            s.folderName === rmSkill ? { ...s, inManifest: false } : s,
          );
          this.setInstalledSkills(this.installedSkills);
          this.onManifestChanged?.();
          vscode.window.showInformationMessage(`Removed "${rmSkill}" from skills.json`);
        }
        break;
      }

      case 'installFromManifest': {
        vscode.commands.executeCommand('skills-sh.installFromManifest');
        break;
      }

      case 'uninstall': {
        const { skillName, folderName } = message.payload as { skillName?: string; folderName?: string };
        const lookupName = folderName || skillName;
        const skill = this.installedSkills.find(s => s.folderName === lookupName);
        if (skill) {
          await uninstallSkill(skill.name, {
            global: skill.scope === 'global',
            skillPath: skill.path,
            folderName: skill.folderName,
          });
        }
        break;
      }

      case 'docs': {
        const { page } = message.payload as { page: DocsPage };
        try {
          const data = await fetchDocsPage(page);
          targetWebview.postMessage({ command: 'docsResult', payload: data });
        } catch (e: unknown) {
          targetWebview.postMessage({ command: 'error', payload: toErrorMessage(e) });
        }
        break;
      }

      case 'ready': {
        // Push all cached state to the newly initialized webview
        if (this.installedSkills.length > 0) {
          targetWebview.postMessage({
            command: 'installedSkillsData',
            payload: this.installedSkills,
          });
        }
        const readyPayload = {
          installedNames: [...this.installedNames],
          updatableNames: [...this.updatableNames],
          manifestSkillNames: [...getManifestSkillNames()],
        };
        targetWebview.postMessage({ command: 'updateButtonStates', payload: readyPayload });
        break;
      }

      case 'changeTab':
      case 'categoryClick':
      case 'loadMore':
        break;
    }
  }

  private getFontsUri(webview: vscode.Webview): string {
    return webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'fonts')
    ).toString();
  }

  private getHtml(webview: vscode.Webview, fontUri: string, isTab = false): string {
    const nonce = getNonce();
    const categories = vscode.workspace.getConfiguration('skills-sh')
      .get<string[]>('categories', ['react', 'next', 'supabase', 'testing', 'ai', 'database', 'auth', 'css']);

    const webviewScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js')
    );

    const escIcon = (icon: string) => icon.replace(/'/g, "\\'");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonce}' 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
  <style nonce="${nonce}">${getStyles(fontUri)}</style>
</head>
<body${isTab ? ' class="tab-view"' : ''}>
  ${renderNavBar()}
  ${isTab ? renderHero() : ''}
  <div class="container">
    ${renderSearchInput()}
    ${renderTabs('all-time')}
    ${renderChips(categories)}
    ${renderGridHeader()}
    <div id="results">${renderSkeletonRows(10)}</div>
  </div>

  <script nonce="${nonce}">
    window.__webviewConfig = {
      icons: {
        github: '${escIcon(githubIcon)}',
        star: '${escIcon(starIcon)}',
        share: '${escIcon(shareIcon)}',
        trash: '${escIcon(trashIcon)}',
        update: '${escIcon(updateIcon)}',
        back: '${escIcon(backIcon)}',
        file: '${escIcon(fileIcon)}',
        copy: '${escIcon(copyIcon)}'
      },
      skeletonRows10: '${renderSkeletonRows(10).replace(/'/g, "\\'").replace(/\n/g, '')}',
      skeletonRows5: '${renderSkeletonRows(5).replace(/'/g, "\\'").replace(/\n/g, '')}'
    };
  </script>
  <script nonce="${nonce}" src="${webviewScriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
