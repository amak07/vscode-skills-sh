import * as vscode from 'vscode';
import { Marked } from 'marked';
import { LeaderboardView, WebviewMessage } from '../../types';
import { searchSkills, getLeaderboard } from '../../api/search';
import { fetchSkillDetail } from '../../api/detail-scraper';
import { fetchSkillMd } from '../../api/github';
import { installSkill, updateSkills } from '../../install/installer';
import { getLastUpdateResult } from '../../api/updates';
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
  private fontsUri = '';
  private panels: vscode.WebviewPanel[] = [];
  private tabWebviews = new WeakSet<vscode.Webview>();

  constructor(private readonly extensionUri: vscode.Uri) {}

  setInstalledNames(names: Set<string>): void {
    this.installedNames = names;
    this.pushButtonStates();
  }

  setUpdatableNames(names: Set<string>): void {
    this.updatableNames = names;
    this.pushButtonStates();
  }

  private pushButtonStates(): void {
    const payload = {
      installedNames: [...this.installedNames],
      updatableNames: [...this.updatableNames],
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
            payload: { ...data, installedNames: [...this.installedNames], updatableNames: [...this.updatableNames] },
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
            payload: { ...data, installedNames: [...this.installedNames], updatableNames: [...this.updatableNames] },
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

          targetWebview.postMessage({ command: 'detailResult', payload: detail });
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
          // User dismissed the confirmation dialog — reset button states
          this.pushButtonStates();
        }
        break;
      }

      case 'update': {
        const updateResult = getLastUpdateResult();
        if (updateResult?.updates?.length) {
          await updateSkills(updateResult.updates);
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
    let currentView = 'leaderboard';
    let currentTab = 'all-time';
    let currentPage = 0;
    let currentChip = null;
    let debounceTimer = null;

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

    // === Init: load leaderboard ===
    loadLeaderboard('all-time', 0);

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

    // Keyboard shortcut: / to focus search
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
    });

    // === Tabs ===
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentTab = tab.dataset.tab;
        currentPage = 0;
        currentView = 'leaderboard';
        searchInput.value = '';
        searchKbd.style.display = '';
        searchClear.style.display = 'none';
        currentChip = null;
        updateTabs();
        updateChips();
        loadLeaderboard(currentTab, 0);
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
      const row = e.target.closest('.grid-row');
      if (!row) return;

      // Don't navigate if clicking install/update button
      if (e.target.closest('.btn-install')) {
        const btn = e.target.closest('.btn-install');
        if (btn.classList.contains('btn-updatable')) {
          vscode.postMessage({ command: 'update' });
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
        currentView = 'detail';
        setHeroVisible(false);
        vscode.postMessage({ command: 'detail', payload: { source, skillId } });
        document.querySelector('.container').innerHTML =
          '<div class="empty-state">Loading skill details...</div>';
      }
    });

    // === Messages from extension ===
    window.addEventListener('message', (event) => {
      const msg = event.data;

      switch (msg.command) {
        case 'leaderboardResult': {
          const { skills, total, hasMore, page, installedNames, updatableNames } = msg.payload;
          const installed = new Set(installedNames || []);
          const updatable = new Set(updatableNames || []);

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
          const { skills, count, installedNames, updatableNames } = msg.payload;
          const installed = new Set(installedNames || []);
          const updatable = new Set(updatableNames || []);

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
          document.querySelector('.container').innerHTML = renderDetailHtml(detail);
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
          break;
        }
      }
    });

    // === Helpers ===
    function setHeroVisible(visible) {
      const hero = document.querySelector('.hero');
      const heading = document.querySelector('.hero-leaderboard-heading');
      if (hero) hero.style.display = visible ? '' : 'none';
      if (heading) heading.style.display = visible ? '' : 'none';
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

      return '<div class="detail-view">'
        + '<button class="back-btn" id="backBtn">${backIcon.replace(/'/g, "\\'")} Back to results</button>'
        + '<div class="detail-breadcrumb">'
        + '<a data-nav="home">skills</a> <span>/</span> '
        + '<a data-nav="external" data-url="https://skills.sh/' + owner + '">' + owner + '</a> <span>/</span> '
        + '<a data-nav="external" data-url="https://skills.sh/' + owner + '/' + repo + '">' + repo + '</a> <span>/</span> '
        + '<span>' + detail.name + '</span></div>'
        + '<h1 class="detail-title">' + detail.name + '</h1>'
        + '<div class="detail-cmd" id="copyCmd" title="Click to copy">'
        + '<code><span class="dollar">$</span> ' + escapeHtml(detail.installCommand) + '</code>'
        + '<span class="copy-icon">${copyIcon.replace(/'/g, "\\'")}</span></div>'
        + '<div class="detail-grid"><div class="detail-content">'
        + '<div class="detail-skillmd-header">${fileIcon.replace(/'/g, "\\'")} <span>SKILL.md</span></div>'
        + '<div class="prose">' + (detail.skillMdHtml || '') + '</div>'
        + '</div><aside>'
        + '<div class="sidebar-section"><div class="sidebar-label">Weekly Installs</div>'
        + '<div class="sidebar-value-large">' + (detail.weeklyInstalls || 'N/A') + '</div></div>'
        + '<div class="sidebar-section"><div class="sidebar-label">Repository</div>'
        + '<div class="sidebar-value">' + (detail.repository || '') + '</div></div>'
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
          vscode.postMessage({ command: 'back' });
        });
      }

      // Breadcrumb navigation
      document.querySelectorAll('.detail-breadcrumb a[data-nav]').forEach(link => {
        link.addEventListener('click', () => {
          const nav = link.getAttribute('data-nav');
          if (nav === 'home') {
            vscode.postMessage({ command: 'back' });
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
          const text = copyCmd.querySelector('code').textContent.replace(/^\\$ /, '');
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
