import * as vscode from 'vscode';
import { Marked } from 'marked';
import { InstalledSkillCard, LeaderboardView, WebviewMessage } from '../../types';
import { searchSkills, getLeaderboard } from '../../api/search';
import { fetchSkillDetail } from '../../api/detail-scraper';
import { fetchSkillMd } from '../../api/github';
import { installSkill, updateSkills, uninstallSkill } from '../../install/installer';
import { getLastUpdateResult } from '../../api/updates';
import { addSkillToManifest, removeSkillFromManifest, getManifestSkillNames } from '../../manifest/manifest';
import { getStyles } from './styles';
import {
  backIcon,
  fileIcon,
  copyIcon,
  renderSearchInput,
  renderTabs,
  renderChips,
  renderGridHeader,
  renderSkeletonRows,
  renderHero,
} from './templates';

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
          const msg = e instanceof Error ? e.message : 'Unknown error';
          targetWebview.postMessage({ command: 'error', payload: msg });
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
          const msg = e instanceof Error ? e.message : 'Unknown error';
          targetWebview.postMessage({ command: 'error', payload: msg });
        }
        break;
      }

      case 'detail': {
        const { source, skillId } = message.payload as { source: string; skillId: string };
        const [owner, repo] = source.split('/');
        try {
          let detail = await fetchSkillDetail(owner, repo, skillId);

          if (detail && !detail.skillMdHtml) {
            const md = await fetchSkillMd(source, skillId);
            if (md) {
              detail.skillMdHtml = await marked.parse(md);
            }
          }

          if (!detail) {
            const md = await fetchSkillMd(source, skillId);
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
          targetWebview.postMessage({ command: 'detailResult', payload: { ...detail, isInstalled, inManifest } });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          targetWebview.postMessage({ command: 'error', payload: msg });
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
        const { skillName } = message.payload as { skillName: string };
        const skill = this.installedSkills.find(s => s.folderName === skillName);
        if (skill) {
          await uninstallSkill(skill.name, { global: skill.scope === 'global' });
        }
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
  ${isTab ? renderHero() : ''}
  <div class="container">
    ${renderSearchInput()}
    ${renderTabs('all-time')}
    ${renderChips(categories)}
    ${renderGridHeader()}
    <div id="results">${renderSkeletonRows(10)}</div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const savedState = vscode.getState() || {};
    const githubIcon = '<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
    const starIcon = '<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="m8 .43.66 1.21 1.93 3.54 3.97.75 1.35.25-.95 1-2.77 2.93.52 4 .18 1.37-1.24-.6L8 13.17l-3.65 1.73-1.24.59.18-1.37.52-4-2.77-2.93-.95-1 1.35-.25 3.97-.75 1.93-3.54zm0 3.14L6.56 6.2l-.17.32-.35.06-2.97.56 2.07 2.19.25.26-.05.35-.39 3 2.73-1.3.32-.15.32.15 2.73 1.3-.4-3-.04-.35.25-.26 2.07-2.2-2.97-.55-.35-.06-.17-.32z" clip-rule="evenodd"/></svg>';
    let currentView = savedState.currentView || 'leaderboard';
    let currentTab = savedState.currentTab || 'all-time';
    let currentPage = 0;
    let currentChip = savedState.currentChip || null;
    let debounceTimer = null;
    let installedSkills = [];
    let manifestSkillNames = new Set();
    let navStack = [];

    function saveState() {
      vscode.setState({ currentView, currentTab, currentChip });
    }

    const searchInput = document.getElementById('searchInput');
    const searchKbd = document.getElementById('searchKbd');
    const searchClear = document.getElementById('searchClear');
    const resultsEl = document.getElementById('results');

    // === Hero command carousel (auto-rotate every 4s) ===
    const heroSuffixes = ['add <owner/repo>', 'update', 'init', 'find <query>'];
    const heroFullCmds = heroSuffixes.map(s => 'npx skills ' + s);
    let heroIdx = 0;

    const heroCmdCarousel = document.getElementById('heroCmdCarousel');
    const heroCopyIcon = document.getElementById('heroCopyIcon');

    if (heroCmdCarousel) {
      setInterval(() => {
        const current = heroCmdCarousel.querySelector('.hero-cmd-item.active');
        if (!current) return;

        // Slide current out (up)
        current.classList.remove('active');
        current.classList.add('slide-out');

        // Advance index
        heroIdx = (heroIdx + 1) % heroSuffixes.length;

        // Create new item sliding in (from below)
        const next = document.createElement('span');
        next.className = 'hero-cmd-item';
        next.textContent = heroSuffixes[heroIdx];
        heroCmdCarousel.appendChild(next);

        // Trigger reflow then animate in
        next.offsetHeight;
        next.classList.add('slide-in');

        // Cleanup after animation
        setTimeout(() => {
          current.remove();
          next.classList.remove('slide-in');
          next.classList.add('active');
        }, 300);
      }, 4000);
    }

    if (heroCopyIcon) {
      heroCopyIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(heroFullCmds[heroIdx]);
        if (!heroCopyIcon.dataset.copying) {
          heroCopyIcon.dataset.copying = 'true';
          const orig = heroCopyIcon.innerHTML;
          heroCopyIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:#fff"><polyline points="20 6 9 17 4 12"/></svg>';
          setTimeout(() => { heroCopyIcon.innerHTML = orig; delete heroCopyIcon.dataset.copying; }, 1500);
        }
      });
    }

    // === Init: restore saved state or load default ===
    if (savedState.currentView === 'installed') {
      currentTab = 'installed';
      updateTabs();
      showLeaderboardChrome(false);
      renderInstalledView();
    } else {
      loadLeaderboard(currentTab, 0);
    }

    // === Search ===
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim();
      searchKbd.style.display = q ? 'none' : '';
      searchClear.style.display = q ? 'block' : 'none';

      clearTimeout(debounceTimer);
      if (q.length >= 2) {
        debounceTimer = setTimeout(() => {
          currentView = 'search-results';
          vscode.postMessage({ command: 'search', payload: { query: q } });
          resultsEl.innerHTML = '${renderSkeletonRows(5).replace(/'/g, "\\'").replace(/\n/g, '')}';
        }, 300);
      } else if (q.length === 0) {
        currentView = 'leaderboard';
        currentChip = null;
        updateChips();
        loadLeaderboard(currentTab, 0);
      }
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
        searchInput.blur();
      }
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      searchInput.focus();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
      // Alt+Left: navigate back (mirrors VS Code editor back button)
      if (e.altKey && e.key === 'ArrowLeft' && navStack.length > 0) {
        e.preventDefault();
        goBack();
      }
    });

    // === Tabs ===
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentTab = tab.dataset.tab;
        currentPage = 0;
        searchInput.value = '';
        searchKbd.style.display = '';
        searchClear.style.display = 'none';
        currentChip = null;
        updateTabs();
        updateChips();

        if (currentTab === 'installed') {
          currentView = 'installed';
          showLeaderboardChrome(false);
          renderInstalledView();
        } else {
          currentView = 'leaderboard';
          showLeaderboardChrome(true);
          loadLeaderboard(currentTab, 0);
        }
        saveState();
      });
    });

    // === Chips ===
    document.querySelectorAll('.chip:not(.chip-add)').forEach(chip => {
      chip.addEventListener('click', () => {
        const cat = chip.dataset.category;
        if (currentChip === cat) {
          currentChip = null;
          updateChips();
          loadLeaderboard(currentTab, 0);
        } else {
          currentChip = cat;
          currentView = 'search-results';
          updateChips();
          searchInput.value = cat;
          searchKbd.style.display = 'none';
          searchClear.style.display = 'block';
          vscode.postMessage({ command: 'search', payload: { query: cat } });
          resultsEl.innerHTML = '${renderSkeletonRows(5).replace(/'/g, "\\'").replace(/\n/g, '')}';
        }
        saveState();
      });
    });

    // === Add filter button ===
    const addFilterBtn = document.querySelector('.chip-add');
    if (addFilterBtn) {
      addFilterBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'openCategorySettings' });
      });
    }

    // === Results click (detail) ===
    resultsEl.addEventListener('click', (e) => {
      // Handle manifest toggle via delegation (inline onclick blocked by CSP nonce policy)
      var manifestBtn = e.target.closest('.btn-manifest, .btn-action-manifest');
      if (manifestBtn) {
        toggleManifest(manifestBtn);
        return;
      }

      // Handle "Install Missing" banner button
      if (e.target.closest('.btn-install-missing')) {
        vscode.postMessage({ command: 'installFromManifest' });
        return;
      }

      // Handle remove button (Installed tab — new icon style)
      var removeBtn = e.target.closest('.btn-action-remove');
      if (removeBtn) {
        var rmName = removeBtn.dataset.skillName;
        if (rmName) {
          vscode.postMessage({ command: 'uninstall', payload: { skillName: rmName } });
          var rmLabel = removeBtn.querySelector('span');
          if (rmLabel) rmLabel.textContent = 'Removing...';
          removeBtn.disabled = true;
        }
        return;
      }

      // Handle update button (Installed tab — new icon style)
      var updateActionBtn = e.target.closest('.btn-action-update');
      if (updateActionBtn) {
        var upName = updateActionBtn.dataset.skillName;
        if (upName) {
          vscode.postMessage({ command: 'update', payload: { skillName: upName } });
          var upLabel = updateActionBtn.querySelector('span');
          if (upLabel) upLabel.textContent = 'Updating...';
          updateActionBtn.disabled = true;
        }
        return;
      }

      const row = e.target.closest('.grid-row');
      if (!row) return;

      // Don't navigate if clicking install/update button
      if (e.target.closest('.btn-install')) {
        const btn = e.target.closest('.btn-install');
        if (btn.classList.contains('btn-updatable')) {
          vscode.postMessage({ command: 'update', payload: { skillName: btn.dataset.skillName } });
          btn.textContent = 'Updating...';
          btn.disabled = true;
        } else if (!btn.classList.contains('btn-installed')) {
          const source = btn.dataset.install;
          const skillName = btn.dataset.skillName;
          vscode.postMessage({ command: 'install', payload: { source, skillName } });
          btn.textContent = 'Installing...';
          btn.disabled = true;
        }
        return;
      }

      const source = row.dataset.source;
      const skillId = row.dataset.skill;
      if (source && skillId) {
        // Push current state onto nav stack for client-side back
        navStack.push({
          view: currentView, tab: currentTab,
          query: searchInput ? searchInput.value : '',
          scrollY: window.scrollY,
          html: resultsEl.innerHTML,
          heroVisible: document.querySelector('.hero') ? document.querySelector('.hero').style.display !== 'none' : false,
          leaderboardChrome: document.querySelector('.search-container') ? document.querySelector('.search-container').style.display !== 'none' : true
        });
        currentView = 'detail';
        setHeroVisible(false);
        showLeaderboardChrome(false);
        var tabsNav = document.querySelector('.tabs');
        if (tabsNav) tabsNav.style.display = 'none';
        resultsEl.innerHTML = '<div class="empty-state">Loading skill details...</div>';
        vscode.postMessage({ command: 'detail', payload: { source, skillId } });
        saveState();
      }
    });

    // === Messages from extension ===
    window.addEventListener('message', (event) => {
      const msg = event.data;

      switch (msg.command) {
        case 'leaderboardResult': {
          const { skills, total, hasMore, page, installedNames, updatableNames, manifestSkillNames: mfNames } = msg.payload;
          const installed = new Set(installedNames || []);
          const updatable = new Set(updatableNames || []);
          if (mfNames) manifestSkillNames = new Set(mfNames);

          if (page === 0) {
            updateTabCount(total);
          }

          let html = '';
          skills.forEach((s, i) => {
            const rank = page * skills.length + i + 1;
            const sid = s.skillId || s.name;
            html += renderRow(s, rank, installed.has(sid), updatable.has(sid));
          });

          if (page === 0) {
            resultsEl.innerHTML = html;
          } else {
            resultsEl.insertAdjacentHTML('beforeend', html);
          }

          if (hasMore) {
            currentPage = page + 1;
          }
          break;
        }

        case 'searchResult': {
          const { skills, count, installedNames, updatableNames, manifestSkillNames: mfNames2 } = msg.payload;
          const installed = new Set(installedNames || []);
          const updatable = new Set(updatableNames || []);
          if (mfNames2) manifestSkillNames = new Set(mfNames2);

          if (skills.length === 0) {
            resultsEl.innerHTML = '<div class="empty-state">No skills found</div>';
          } else {
            let html = '';
            skills.forEach((s, i) => {
              const sid = s.skillId || s.name;
              html += renderRow(s, i + 1, installed.has(sid), updatable.has(sid));
            });
            resultsEl.innerHTML = html;
          }
          break;
        }

        case 'detailResult': {
          const detail = msg.payload;
          resultsEl.innerHTML = renderDetailHtml(detail);
          attachDetailListeners();
          break;
        }

        case 'error': {
          resultsEl.innerHTML =
            '<div class="empty-state">Error: ' + msg.payload + '</div>';
          break;
        }

        case 'updateButtonStates': {
          const installed = new Set(msg.payload.installedNames || []);
          const updatable = new Set(msg.payload.updatableNames || []);
          manifestSkillNames = new Set(msg.payload.manifestSkillNames || []);
          document.querySelectorAll('.btn-install').forEach(function(btn) {
            const skillName = btn.dataset.skillName;
            if (!skillName) return;
            if (updatable.has(skillName)) {
              btn.className = 'btn-install btn-updatable';
              btn.textContent = 'Update';
              btn.disabled = false;
            } else if (installed.has(skillName)) {
              btn.className = 'btn-install btn-installed';
              btn.textContent = '✓ Installed';
              btn.disabled = false;
            } else {
              btn.className = 'btn-install';
              btn.textContent = 'Install';
              btn.disabled = false;
            }
          });
          // Update manifest toggle buttons (detail page style)
          document.querySelectorAll('.btn-manifest').forEach(function(btn) {
            const skillName = btn.dataset.skillName;
            if (!skillName) return;
            const inMf = manifestSkillNames.has(skillName);
            btn.className = 'btn-manifest' + (btn.classList.contains('btn-manifest-detail') ? ' btn-manifest-detail' : '') + (inMf ? ' btn-manifest-active' : '');
            btn.textContent = inMf ? '✓ In skills.json' : '+ skills.json';
            btn.title = inMf ? 'Remove from skills.json' : 'Add to skills.json';
          });
          // Update action-style manifest buttons (installed tab)
          document.querySelectorAll('.btn-action-manifest').forEach(function(btn) {
            var skillName = btn.dataset.skillName;
            if (!skillName) return;
            var inMf = manifestSkillNames.has(skillName);
            if (inMf) {
              btn.classList.add('btn-action-active');
            } else {
              btn.classList.remove('btn-action-active');
            }
            var label = btn.querySelector('span');
            if (label) label.textContent = inMf ? 'In Skills.json' : 'Add to Skills.json';
            btn.title = inMf ? 'Remove from skills.json' : 'Add to skills.json';
          });
          // Re-render Installed tab if active to sync manifest state on rows
          if (currentView === 'installed') {
            renderInstalledView();
          }
          break;
        }

        case 'installedSkillsData': {
          installedSkills = msg.payload || [];
          updateInstalledTabLabel();
          if (currentView === 'installed') {
            renderInstalledView();
          }
          break;
        }
      }
    });

    // === Helpers ===
    function goBack() {
      const prev = navStack.pop();
      if (!prev) {
        // Fallback: full reload via extension
        vscode.postMessage({ command: 'back' });
        return;
      }
      currentView = prev.view;
      currentTab = prev.tab;
      resultsEl.innerHTML = prev.html;
      setHeroVisible(prev.heroVisible);
      showLeaderboardChrome(prev.leaderboardChrome);
      // Show tabs again (hidden when entering detail)
      var tabsNav = document.querySelector('.tabs');
      if (tabsNav) tabsNav.style.display = '';
      updateTabs();
      if (searchInput) searchInput.value = prev.query || '';
      requestAnimationFrame(function() { window.scrollTo(0, prev.scrollY || 0); });
      saveState();
    }

    function setHeroVisible(visible) {
      const hero = document.querySelector('.hero');
      const heading = document.querySelector('.hero-leaderboard-heading');
      if (hero) hero.style.display = visible ? '' : 'none';
      if (heading) heading.style.display = visible ? '' : 'none';
    }

    function showLeaderboardChrome(visible) {
      const search = document.querySelector('.search-container');
      const chips = document.querySelector('.chips');
      const gridHeader = document.querySelector('.grid-header');
      if (search) search.style.display = visible ? '' : 'none';
      if (chips) chips.style.display = visible ? '' : 'none';
      if (gridHeader) gridHeader.style.display = visible ? '' : 'none';
    }

    function renderInstalledView() {
      if (installedSkills.length === 0) {
        resultsEl.innerHTML = '<div class="empty-state">No skills installed yet. Browse the marketplace to get started.</div>';
        return;
      }
      let html = '';

      // Show "Install Missing" banner if manifest has skills not yet installed
      if (manifestSkillNames.size > 0) {
        const installedFolders = new Set(installedSkills.map(function(s) { return s.folderName; }));
        let missingCount = 0;
        manifestSkillNames.forEach(function(name) {
          if (!installedFolders.has(name)) missingCount++;
        });
        if (missingCount > 0) {
          html += '<div class="manifest-banner">'
            + '<span>' + missingCount + ' skill' + (missingCount > 1 ? 's' : '') + ' from skills.json ' + (missingCount > 1 ? 'are' : 'is') + ' not installed</span>'
            + '<button class="btn-install btn-install-missing">Install Missing</button>'
            + '</div>';
        }
      }

      installedSkills.forEach(function(skill) {
        html += renderInstalledRow(skill);
      });
      resultsEl.innerHTML = html;
    }

    function renderInstalledRow(skill) {
      const source = skill.source || '';
      const scopeLabel = skill.scope === 'project' ? 'project' : 'global';
      const desc = skill.description || '';
      const inMf = skill.inManifest;

      // SVG icons (12x12)
      var shareIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
      var trashIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      var updateIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';

      // Manifest button (add to / in skills.json)
      var manifestBtn = source
        ? '<button class="btn-action btn-action-manifest' + (inMf ? ' btn-action-active' : '') + '"'
          + ' data-source="' + escapeHtml(source) + '"'
          + ' data-skill-name="' + escapeHtml(skill.folderName) + '"'
          + ' title="' + (inMf ? 'Remove from skills.json' : 'Add to skills.json') + '">'
          + shareIcon + '<span>' + (inMf ? 'In Skills.json' : 'Add to Skills.json') + '</span>'
          + '</button>'
        : '';

      // Action button (Update takes priority over Uninstall)
      var actionBtn;
      if (skill.hasUpdate) {
        actionBtn = '<button class="btn-action btn-action-update"'
          + ' data-install="' + escapeHtml(source) + '" data-skill-name="' + escapeHtml(skill.folderName) + '">'
          + updateIcon + '<span>Update</span>'
          + '</button>';
      } else {
        actionBtn = '<button class="btn-action btn-action-remove"'
          + ' data-skill-name="' + escapeHtml(skill.folderName) + '">'
          + trashIcon + '<span>Uninstall</span>'
          + '</button>';
      }

      return '<div class="grid-row installed-row"'
        + (source ? ' data-source="' + source + '" data-skill="' + escapeHtml(skill.folderName) + '"' : '')
        + '>'
        + '<div class="row-info">'
        + '<div class="row-name">' + escapeHtml(skill.name)
        + ' <span class="scope-badge scope-' + scopeLabel + '">' + scopeLabel + '</span>'
        + '</div>'
        + '<div class="row-source">' + (desc ? escapeHtml(desc) : (source ? escapeHtml(source) : 'Custom skill')) + '</div>'
        + '</div>'
        + '<div class="row-actions">'
        + manifestBtn
        + actionBtn
        + '</div></div>';
    }

    function updateInstalledTabLabel() {
      const tab = document.querySelector('.tab[data-tab="installed"]');
      if (tab) {
        tab.textContent = 'Installed (' + installedSkills.length + ')';
      }
    }

    function loadLeaderboard(view, page) {
      currentView = 'leaderboard';
      if (page === 0) {
        resultsEl.innerHTML = '${renderSkeletonRows(10).replace(/'/g, "\\'").replace(/\n/g, '')}';
      }
      vscode.postMessage({ command: 'leaderboard', payload: { view, page } });
    }

    function updateTabs() {
      document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === currentTab);
      });
    }

    function updateChips() {
      document.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', c.dataset.category === currentChip);
      });
    }

    function updateTabCount(total) {
      const allTimeTab = document.querySelector('.tab[data-tab="all-time"]');
      if (allTimeTab && total) {
        allTimeTab.textContent = 'All Time (' + total.toLocaleString() + ')';
      }
    }

    function renderRow(skill, rank, isInstalled, isUpdatable) {
      const source = skill.source;
      const name = skill.name || skill.skillId;
      const skillId = skill.skillId || skill.name;
      const installs = skill.installs || 0;
      const change = skill.change;

      let changeHtml = '';
      if (change !== undefined && change !== 0) {
        const cls = change > 0 ? 'change-positive' : 'change-negative';
        changeHtml = '<span class="' + cls + '" style="font-size:0.75rem">'
          + (change > 0 ? '+' : '') + change + '</span>';
      }

      let btnClass = 'btn-install';
      let btnLabel = 'Install';
      if (isUpdatable) {
        btnClass = 'btn-install btn-updatable';
        btnLabel = 'Update';
      } else if (isInstalled) {
        btnClass = 'btn-install btn-installed';
        btnLabel = '✓ Installed';
      }

      return '<div class="grid-row" data-source="' + source + '" data-skill="' + skillId + '">'
        + '<span class="row-rank">' + rank + '</span>'
        + '<div class="row-info">'
        + '<div class="row-name">' + name + '</div>'
        + '<div class="row-source">' + source + '</div>'
        + '</div>'
        + '<div class="row-right">'
        + '<span class="row-installs">' + formatInstalls(installs) + '</span>'
        + changeHtml
        + '<button class="' + btnClass + '"'
        + ' data-install="' + source + '" data-skill-name="' + skillId + '"'
        + ' onclick="event.stopPropagation()">'
        + btnLabel
        + '</button>'
        + '</div></div>';
    }

    function formatInstalls(n) {
      if (n >= 1000) return (n / 1000).toFixed(1).replace(/\\.0$/, '') + 'K';
      return n.toLocaleString();
    }

    function renderDetailHtml(detail) {
      const parts = (detail.source || '').split('/');
      const owner = parts[0] || '';
      const repo = parts[1] || '';

      const agentRows = (detail.perAgent || []).map(a =>
        '<div class="agent-row"><span class="agent-name">' + a.agent
        + '</span><span class="agent-installs">' + a.installs + '</span></div>'
      ).join('');

      const starsSection = detail.githubStars
        ? '<div class="sidebar-section"><div class="sidebar-label">GitHub Stars</div>'
          + '<div class="sidebar-value sidebar-stars">'
          + '<span class="star-icon">' + starIcon + '</span>'
          + '<span>' + escapeHtml(detail.githubStars) + '</span>'
          + '</div></div>'
        : '';

      const repoSection = '<div class="sidebar-section"><div class="sidebar-label">Repository</div>'
        + '<a class="sidebar-link sidebar-value sidebar-link-with-icon" data-nav="external"'
        + ' data-url="https://github.com/' + escapeHtml(detail.repository || '') + '">'
        + githubIcon
        + '<span>' + escapeHtml(detail.repository || '') + '</span>'
        + '</a></div>';

      const skillId = detail.name;
      const detailSource = detail.source || '';
      const detailIsInstalled = detail.isInstalled || false;
      const detailInManifest = detail.inManifest || false;
      const manifestSection = detailSource
        ? '<div class="sidebar-section">'
          + '<button class="btn-manifest btn-manifest-detail' + (detailInManifest ? ' btn-manifest-active' : '') + '"'
          + ' data-source="' + escapeHtml(detailSource) + '"'
          + ' data-skill-name="' + escapeHtml(skillId) + '"'
          + ' title="' + (detailInManifest ? 'Remove from skills.json' : 'Add to skills.json') + '"'
          + ' onclick="toggleManifest(this)">'
          + (detailInManifest ? '✓ In skills.json' : '+ Add to skills.json')
          + '</button></div>'
        : '';

      return '<div class="detail-view">'
        + '<button class="back-btn" id="backBtn">${backIcon.replace(/'/g, "\\'")} Back to results</button>'
        + '<div class="detail-breadcrumb">'
        + '<a data-nav="home">skills</a> <span>/</span> '
        + '<a data-nav="external" data-url="https://skills.sh/' + owner + '">' + owner + '</a> <span>/</span> '
        + '<a data-nav="external" data-url="https://skills.sh/' + owner + '/' + repo + '">' + repo + '</a> <span>/</span> '
        + '<span>' + detail.name + '</span></div>'
        + '<h1 class="detail-title">' + detail.name + '</h1>'
        + '<div class="detail-cmd" id="copyCmd" title="Click to copy">'
        + '<span class="detail-cmd-text"><span class="dollar">$</span> ' + escapeHtml(detail.installCommand) + '</span>'
        + '<span class="copy-icon">${copyIcon.replace(/'/g, "\\'")}</span></div>'
        + '<div class="detail-grid"><div class="detail-content">'
        + '<div class="detail-skillmd-header">${fileIcon.replace(/'/g, "\\'")} <span>SKILL.md</span></div>'
        + '<div class="prose">' + (detail.skillMdHtml || '') + '</div>'
        + '</div><aside>'
        + manifestSection
        + '<div class="sidebar-section"><div class="sidebar-label">Weekly Installs</div>'
        + '<div class="sidebar-value-large">' + (detail.weeklyInstalls || 'N/A') + '</div></div>'
        + repoSection
        + starsSection
        + '<div class="sidebar-section"><div class="sidebar-label">First Seen</div>'
        + '<div class="sidebar-value">' + (detail.firstSeen || 'N/A') + '</div></div>'
        + (agentRows ? '<div class="sidebar-section"><div class="sidebar-label">Installed On</div>'
          + '<div class="agent-table">' + agentRows + '</div></div>' : '')
        + '</aside></div></div>';
    }

    function escapeHtml(str) {
      return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function attachDetailListeners() {
      const backBtn = document.getElementById('backBtn');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          goBack();
        });
      }

      // Navigation links (breadcrumbs + sidebar)
      document.querySelectorAll('[data-nav]').forEach(link => {
        link.addEventListener('click', () => {
          const nav = link.getAttribute('data-nav');
          if (nav === 'home') {
            goBack();
          } else if (nav === 'external') {
            const url = link.getAttribute('data-url');
            if (url) vscode.postMessage({ command: 'openExternal', payload: { url } });
          }
        });
      });

      // Copy install command with feedback
      const copyCmd = document.getElementById('copyCmd');
      if (copyCmd) {
        copyCmd.addEventListener('click', () => {
          const text = copyCmd.querySelector('.detail-cmd-text').textContent.replace(/^\\$ /, '');
          navigator.clipboard.writeText(text);
          showCopyFeedback(copyCmd.querySelector('.copy-icon'));
        });
      }
    }

    function showCopyFeedback(iconEl) {
      if (!iconEl || iconEl.dataset.copying) return;
      iconEl.dataset.copying = 'true';
      const originalHtml = iconEl.innerHTML;
      iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:#fff"><polyline points="20 6 9 17 4 12"/></svg>';
      setTimeout(() => {
        iconEl.innerHTML = originalHtml;
        delete iconEl.dataset.copying;
      }, 1500);
    }

    function toggleManifest(btn) {
      const source = btn.dataset.source;
      const skillName = btn.dataset.skillName;
      if (!skillName) return;
      const isActionStyle = btn.classList.contains('btn-action-manifest');
      const isActive = btn.classList.contains('btn-manifest-active') || btn.classList.contains('btn-action-active');
      if (isActive) {
        vscode.postMessage({ command: 'removeFromManifest', payload: { skillName } });
        btn.classList.remove('btn-manifest-active', 'btn-action-active');
        var label = btn.querySelector('span');
        if (label) { label.textContent = 'Add to Skills.json'; }
        else { btn.textContent = '+ skills.json'; }
        btn.title = 'Add to skills.json';
      } else {
        vscode.postMessage({ command: 'addToManifest', payload: { source, skillName } });
        btn.classList.add(isActionStyle ? 'btn-action-active' : 'btn-manifest-active');
        var label2 = btn.querySelector('span');
        if (label2) { label2.textContent = 'In Skills.json'; }
        else { btn.textContent = '✓ In skills.json'; }
        btn.title = 'Remove from skills.json';
      }
    }
  </script>
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
