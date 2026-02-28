/**
 * Webview client script for the Skills.sh Marketplace panel.
 *
 * Extracted from the inline <script> in provider.ts so it can be
 * bundled separately by esbuild and tested with Vitest + happy-dom.
 */

// ── Types ────────────────────────────────────────────────────────────
export interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): Record<string, unknown> | undefined;
  setState(state: Record<string, unknown>): void;
}

export interface WebviewConfig {
  icons: {
    github: string;
    star: string;
    share: string;
    trash: string;
    update: string;
    back: string;
    file: string;
    copy: string;
  };
  skeletonRows10: string;
  skeletonRows5: string;
}

export interface SkillData {
  name?: string;
  skillId?: string;
  source: string;
  installs?: number;
  change?: number;
}

export interface InstalledSkillData {
  name: string;
  folderName: string;
  source?: string;
  description?: string;
  scope?: string;
  isCustom?: boolean;
  hasUpdate?: boolean;
  inManifest?: boolean;
}

export interface DetailData {
  name: string;
  source?: string;
  weeklyInstalls?: string;
  repository?: string;
  installCommand: string;
  perAgent?: { agent: string; installs: number }[];
  isInstalled?: boolean;
  inManifest?: boolean;
  hasUpdate?: boolean;
  skillMdHtml?: string;
  githubStars?: string;
  firstSeen?: string;
  securityAudits?: { partner: string; status: string; url: string }[];
}

export interface AuditSkill {
  name: string;
  skillId: string;
  source: string;
  audits?: { status: string }[];
}

export interface AuditsData {
  skills: AuditSkill[];
}

export interface DocsData {
  page: string;
  title: string;
  html: string;
}

// ── Pure utility functions ───────────────────────────────────────────

export function escapeHtml(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatInstalls(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

export function getAuditBadgeClass(status: string): string {
  const s = (status || '').toLowerCase().trim();
  if (s === 'pass' || s === 'safe' || s === '0 alerts' || s === 'low risk') return 'audit-badge-pass';
  if (s === 'fail' || s === 'critical' || s === 'high risk') return 'audit-badge-fail';
  return 'audit-badge-warn';
}

// ── Module-level state (set by initializeWebview) ────────────────────

let _icons: WebviewConfig['icons'];
let _skeletonRows10 = '';
let _skeletonRows5 = '';

/**
 * Inject config without full DOM init. Useful for testing render functions.
 */
export function setConfig(config: WebviewConfig): void {
  _icons = config.icons;
  _skeletonRows10 = config.skeletonRows10;
  _skeletonRows5 = config.skeletonRows5;
}

// ── Render functions (use module-level _icons) ───────────────────────

export function renderRow(
  skill: SkillData, rank: number,
  isInstalled: boolean, isUpdatable: boolean,
): string {
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

export function renderInstalledRow(
  skill: InstalledSkillData,
  manifestSkillNames: Set<string>,
): string {
  const source = skill.source || '';
  const scopeLabel = skill.scope === 'project' ? 'project' : 'global';
  const desc = skill.description || '';
  const inMf = skill.inManifest;

  const manifestBtn = source
    ? '<button class="btn-action btn-action-manifest' + (inMf ? ' btn-action-active' : '') + '"'
      + ' data-source="' + escapeHtml(source) + '"'
      + ' data-skill-name="' + escapeHtml(skill.folderName) + '"'
      + ' title="' + (inMf ? 'Remove from skills.json' : 'Add to skills.json') + '">'
      + _icons.share + '<span>' + (inMf ? 'Remove from Skills.json' : 'Add to Skills.json') + '</span>'
      + '</button>'
    : '';

  let actionBtn: string;
  if (skill.hasUpdate) {
    actionBtn = '<button class="btn-action btn-action-update"'
      + ' data-install="' + escapeHtml(source) + '" data-skill-name="' + escapeHtml(skill.folderName) + '">'
      + _icons.update + '<span>Update</span>'
      + '</button>';
  } else {
    actionBtn = '<button class="btn-action btn-action-remove"'
      + ' data-skill-name="' + escapeHtml(skill.folderName) + '">'
      + _icons.trash + '<span>Uninstall</span>'
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

export function renderInstalledGroup(
  label: string,
  skills: InstalledSkillData[],
  expanded: boolean,
  manifestSkillNames: Set<string>,
): string {
  if (skills.length === 0) return '';
  const headerCls = expanded ? 'installed-group-header' : 'installed-group-header collapsed';
  const bodyCls = expanded ? 'installed-group-body open' : 'installed-group-body';
  let rows = '';
  skills.forEach(function (skill) { rows += renderInstalledRow(skill, manifestSkillNames); });
  return '<div class="installed-group">'
    + '<div class="' + headerCls + '"><span class="chevron">&#x25B8;</span> '
    + escapeHtml(label) + ' (' + skills.length + ')</div>'
    + '<div class="' + bodyCls + '">' + rows + '</div></div>';
}

export function renderDetailHtml(detail: DetailData): string {
  const parts = (detail.source || '').split('/');
  const owner = parts[0] || '';
  const repo = parts[1] || '';

  const agentRows = (detail.perAgent || []).map(a =>
    '<div class="agent-row"><span class="agent-name">' + a.agent
    + '</span><span class="agent-installs">' + a.installs + '</span></div>',
  ).join('');

  const starsSection = detail.githubStars
    ? '<div class="sidebar-section"><div class="sidebar-label">GitHub Stars</div>'
      + '<div class="sidebar-value sidebar-stars">'
      + '<span class="star-icon">' + _icons.star + '</span>'
      + '<span>' + escapeHtml(detail.githubStars) + '</span>'
      + '</div></div>'
    : '';

  const repoSection = '<div class="sidebar-section"><div class="sidebar-label">Repository</div>'
    + '<a class="sidebar-link sidebar-value sidebar-link-with-icon" data-nav="external"'
    + ' data-url="https://github.com/' + escapeHtml(detail.repository || '') + '">'
    + _icons.github
    + '<span>' + escapeHtml(detail.repository || '') + '</span>'
    + '</a></div>';

  const skillId = detail.name;
  const detailSource = detail.source || '';
  const detailIsInstalled = detail.isInstalled || false;
  const detailInManifest = detail.inManifest || false;

  let detailActionsHtml = '';
  if (detailIsInstalled) {
    if (detailSource) {
      detailActionsHtml += '<button class="btn-action btn-action-manifest'
        + (detailInManifest ? ' btn-action-active' : '') + '"'
        + ' data-source="' + escapeHtml(detailSource) + '"'
        + ' data-skill-name="' + escapeHtml(skillId) + '"'
        + ' title="' + (detailInManifest ? 'Remove from skills.json' : 'Add to skills.json') + '">'
        + _icons.share + '<span>' + (detailInManifest ? 'Remove from Skills.json' : 'Add to Skills.json') + '</span>'
        + '</button>';
    }
    if (detail.hasUpdate) {
      detailActionsHtml += '<button class="btn-action btn-action-update"'
        + ' data-install="' + escapeHtml(detailSource) + '"'
        + ' data-skill-name="' + escapeHtml(skillId) + '">'
        + _icons.update + '<span>Update</span></button>';
    } else {
      detailActionsHtml += '<button class="btn-action btn-action-remove"'
        + ' data-skill-name="' + escapeHtml(skillId) + '">'
        + _icons.trash + '<span>Uninstall</span></button>';
    }
  } else if (detailSource) {
    detailActionsHtml += '<button class="btn-install"'
      + ' data-install="' + escapeHtml(detailSource) + '"'
      + ' data-skill-name="' + escapeHtml(skillId) + '">'
      + 'Install</button>';
  }
  const actionsSection = detailActionsHtml
    ? '<div class="sidebar-section"><div class="row-actions">' + detailActionsHtml + '</div></div>'
    : '';

  const securitySection = (detail.securityAudits && detail.securityAudits.length > 0)
    ? '<div class="sidebar-section"><div class="sidebar-label">Security Audits</div>'
      + '<div class="security-audits">'
      + detail.securityAudits.map(function (a) {
        const cls = getAuditBadgeClass(a.status);
        return '<a class="security-audit-row" data-nav="external" data-url="' + escapeHtml(a.url) + '">'
          + '<span class="security-audit-partner">' + escapeHtml(a.partner) + '</span>'
          + '<span class="audit-badge ' + cls + '">' + escapeHtml(a.status) + '</span>'
          + '</a>';
      }).join('')
      + '</div></div>'
    : '';

  return '<div class="detail-view">'
    + '<button class="back-btn" id="backBtn">' + _icons.back + ' Back</button>'
    + '<div class="detail-breadcrumb">'
    + '<a data-nav="home">skills</a> <span>/</span> '
    + '<a data-nav="external" data-url="https://skills.sh/' + owner + '">' + owner + '</a> <span>/</span> '
    + '<a data-nav="external" data-url="https://skills.sh/' + owner + '/' + repo + '">' + repo + '</a> <span>/</span> '
    + '<span>' + detail.name + '</span></div>'
    + '<h1 class="detail-title">' + detail.name + '</h1>'
    + '<div class="detail-cmd" id="copyCmd" title="Click to copy">'
    + '<span class="detail-cmd-text"><span class="dollar">$</span> ' + escapeHtml(detail.installCommand) + '</span>'
    + '<span class="copy-icon">' + _icons.copy + '</span></div>'
    + '<div class="detail-grid"><div class="detail-content">'
    + '<div class="detail-skillmd-header">' + _icons.file + ' <span>SKILL.md</span></div>'
    + '<div class="prose">' + (detail.skillMdHtml || '') + '</div>'
    + '</div><aside>'
    + actionsSection
    + '<div class="sidebar-section"><div class="sidebar-label">Weekly Installs</div>'
    + '<div class="sidebar-value-large">' + (detail.weeklyInstalls || 'N/A') + '</div></div>'
    + repoSection
    + starsSection
    + '<div class="sidebar-section"><div class="sidebar-label">First Seen</div>'
    + '<div class="sidebar-value">' + (detail.firstSeen || 'N/A') + '</div></div>'
    + securitySection
    + (agentRows ? '<div class="sidebar-section"><div class="sidebar-label">Installed On</div>'
      + '<div class="agent-table">' + agentRows + '</div></div>' : '')
    + '</aside></div></div>';
}

export function renderAuditsView(data: AuditsData): string {
  const rows = (data.skills || []).map(function (skill: AuditSkill, i: number) {
    const badges = (skill.audits || []).map(function (a) {
      const cls = getAuditBadgeClass(a.status);
      return '<span class="audit-badge ' + cls + '">' + escapeHtml(a.status) + '</span>';
    });
    while (badges.length < 3) { badges.push('<span class="audit-badge">—</span>'); }

    return '<div class="audits-row" data-source="' + escapeHtml(skill.source)
      + '" data-skill="' + escapeHtml(skill.skillId) + '">'
      + '<span class="row-rank">' + (i + 1) + '</span>'
      + '<div class="row-info">'
      + '<div class="row-name">' + escapeHtml(skill.name) + '</div>'
      + '<div class="row-source">' + escapeHtml(skill.source) + '</div>'
      + '</div>'
      + '<div class="audits-results">' + badges.join('') + '</div>'
      + '</div>';
  }).join('');

  return '<div class="audits-view">'
    + '<button class="back-btn" id="backBtn">' + _icons.back + ' Back</button>'
    + '<h1 class="detail-title">Security Audits</h1>'
    + '<p class="audits-subtitle">Combined security audit results from Gen Agent Trust Hub, Socket, and Snyk.</p>'
    + '<div class="audits-header">'
    + '<span>#</span><span>Skill</span>'
    + '<span>Gen Trust Hub</span><span>Socket</span><span>Snyk</span>'
    + '</div>'
    + rows
    + (rows.length === 0 ? '<div class="empty-state">No audit data available</div>' : '')
    + '</div>';
}

export function renderDocsView(data: DocsData): string {
  const pages = [
    { page: 'overview', label: 'Overview' },
    { page: 'cli', label: 'CLI' },
    { page: 'faq', label: 'FAQ' },
  ];
  const sidebarLinks = pages.map(function (p) {
    const active = p.page === data.page ? ' active' : '';
    return '<a class="docs-sidebar-link' + active + '" data-docs-page="' + p.page + '">' + p.label + '</a>';
  }).join('');

  return '<div class="docs-view">'
    + '<button class="back-btn" id="backBtn">' + _icons.back + ' Back</button>'
    + '<div class="docs-layout">'
    + '<nav class="docs-sidebar">'
    + '<div class="docs-sidebar-title">Documentation</div>'
    + sidebarLinks
    + '</nav>'
    + '<div class="docs-content">'
    + '<h1 class="detail-title">' + escapeHtml(data.title) + '</h1>'
    + '<div class="prose">' + (data.html || '') + '</div></div>'
    + '</div></div>';
}

// ── Main initialization ──────────────────────────────────────────────

export function initializeWebview(api: VsCodeApi, config: WebviewConfig): void {
  setConfig(config);

  const savedState = api.getState() || {};

  let currentView = (savedState.currentView as string) || 'leaderboard';
  let currentTab = (savedState.currentTab as string) || 'all-time';
  let currentPage = 0;
  let currentChip = (savedState.currentChip as string) || null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let installedSkills: InstalledSkillData[] = [];
  let manifestSkillNames = new Set<string>();
  let navStack: Array<{
    view: string; tab: string; query: string; scrollY: number;
    html: string; heroVisible: boolean; leaderboardChrome: boolean;
  }> = [];
  let navigationStack: string[] = [];
  let currentDocsPage = 'overview';

  function saveState(): void {
    api.setState({ currentView, currentTab, currentChip, searchQuery: searchInput ? searchInput.value : '' });
  }

  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  const searchKbd = document.getElementById('searchKbd') as HTMLElement | null;
  const searchClear = document.getElementById('searchClear') as HTMLElement | null;
  const resultsEl = document.getElementById('results') as HTMLElement;

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

      current.classList.remove('active');
      current.classList.add('slide-out');

      heroIdx = (heroIdx + 1) % heroSuffixes.length;

      const next = document.createElement('span');
      next.className = 'hero-cmd-item';
      next.textContent = heroSuffixes[heroIdx];
      heroCmdCarousel.appendChild(next);

      // Trigger reflow then animate in
      void next.offsetHeight;
      next.classList.add('slide-in');

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

  // === Init: request cached data from extension ===
  api.postMessage({ command: 'ready' });

  // === Init: restore saved state or load default ===
  if (savedState.searchQuery && searchInput) {
    searchInput.value = savedState.searchQuery as string;
    if (searchKbd) searchKbd.style.display = 'none';
    if (searchClear) searchClear.style.display = 'block';
    setHeroVisible(false);
    currentView = 'search-results';
    resultsEl.innerHTML = _skeletonRows5;
    api.postMessage({ command: 'search', payload: { query: savedState.searchQuery } });
  } else if (savedState.currentView === 'installed') {
    currentTab = 'installed';
    updateTabs();
    showLeaderboardChrome(false);
    renderInstalledView();
  } else {
    loadLeaderboard(currentTab, 0);
  }

  // === Nav bar (Audits / Docs + brand home link) ===
  const navBrand = document.querySelector('.nav-brand');
  if (navBrand) {
    (navBrand as HTMLElement).style.cursor = 'pointer';
    navBrand.addEventListener('click', function () {
      navigationStack = [];
      api.postMessage({ command: 'back' });
    });
  }
  document.querySelectorAll('[data-nav-page]').forEach(function (link) {
    link.addEventListener('click', function () {
      const page = link.getAttribute('data-nav-page');
      if (page === 'audits') {
        navigateToAudits();
      } else if (page === 'docs') {
        navigateToDocs('overview');
      }
    });
  });

  function navigateToAudits(): void {
    navigationStack.push(currentView);
    currentView = 'audits';
    setHeroVisible(false);
    updateNavLinks();
    const container = document.querySelector('.container');
    if (container) container.innerHTML = '<div class="empty-state">Loading security audits...</div>';
    api.postMessage({ command: 'audits' });
  }

  function navigateToDocs(page: string): void {
    if (currentView !== 'docs') {
      navigationStack.push(currentView);
    }
    currentView = 'docs';
    currentDocsPage = page || 'overview';
    setHeroVisible(false);
    updateNavLinks();
    const container = document.querySelector('.container');
    if (container) container.innerHTML = '<div class="empty-state">Loading documentation...</div>';
    api.postMessage({ command: 'docs', payload: { page: currentDocsPage } });
  }

  function updateNavLinks(): void {
    document.querySelectorAll('[data-nav-page]').forEach(function (link) {
      const page = link.getAttribute('data-nav-page');
      link.classList.toggle('active', page === currentView);
    });
  }

  function navigateBack(): void {
    const prev = navigationStack.pop() || 'leaderboard';
    if (prev === 'audits') {
      currentView = 'audits';
      setHeroVisible(false);
      updateNavLinks();
      const container = document.querySelector('.container');
      if (container) container.innerHTML = '<div class="empty-state">Loading security audits...</div>';
      api.postMessage({ command: 'audits' });
    } else if (prev === 'docs') {
      currentView = 'docs';
      setHeroVisible(false);
      updateNavLinks();
      const container = document.querySelector('.container');
      if (container) container.innerHTML = '<div class="empty-state">Loading documentation...</div>';
      api.postMessage({ command: 'docs', payload: { page: currentDocsPage } });
    } else {
      api.postMessage({ command: 'back' });
    }
  }

  // === Search ===
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim();
      if (searchKbd) searchKbd.style.display = q ? 'none' : '';
      if (searchClear) searchClear.style.display = q ? 'block' : 'none';

      if (q.length > 0) {
        setHeroVisible(false);
      } else {
        setHeroVisible(true);
      }

      if (debounceTimer) clearTimeout(debounceTimer);
      if (q.length >= 2) {
        debounceTimer = setTimeout(() => {
          currentView = 'search-results';
          api.postMessage({ command: 'search', payload: { query: q } });
          resultsEl.innerHTML = _skeletonRows5;
          saveState();
        }, 300);
      } else if (q.length === 0) {
        currentView = 'leaderboard';
        currentChip = null;
        updateChips();
        loadLeaderboard(currentTab, 0);
        saveState();
      }
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
        searchInput.blur();
      }
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
        searchInput.focus();
      }
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      if (searchInput) searchInput.focus();
    }
    if (e.altKey && e.key === 'ArrowLeft' && navStack.length > 0) {
      e.preventDefault();
      goBack();
    }
  });

  // === Tabs ===
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = (tab as HTMLElement).dataset.tab || '';
      currentPage = 0;
      currentChip = null;
      updateTabs();
      updateChips();

      if (currentTab === 'installed') {
        if (searchInput) {
          searchInput.value = '';
          if (searchKbd) searchKbd.style.display = '';
          if (searchClear) searchClear.style.display = 'none';
        }
        setHeroVisible(true);
        currentView = 'installed';
        showLeaderboardChrome(false);
        renderInstalledView();
      } else {
        showLeaderboardChrome(true);
        const activeQuery = searchInput ? searchInput.value.trim() : '';
        if (activeQuery.length >= 2) {
          currentView = 'search-results';
          resultsEl.innerHTML = _skeletonRows5;
          api.postMessage({ command: 'search', payload: { query: activeQuery } });
        } else {
          currentView = 'leaderboard';
          setHeroVisible(true);
          loadLeaderboard(currentTab, 0);
        }
      }
      saveState();
    });
  });

  // === Chips ===
  document.querySelectorAll('.chip:not(.chip-add)').forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = (chip as HTMLElement).dataset.category;
      if (currentChip === cat) {
        currentChip = null;
        updateChips();
        loadLeaderboard(currentTab, 0);
      } else {
        currentChip = cat || null;
        currentView = 'search-results';
        updateChips();
        if (searchInput) {
          searchInput.value = cat || '';
          if (searchKbd) searchKbd.style.display = 'none';
          if (searchClear) searchClear.style.display = 'block';
        }
        api.postMessage({ command: 'search', payload: { query: cat } });
        resultsEl.innerHTML = _skeletonRows5;
      }
      saveState();
    });
  });

  // === Add filter button ===
  const addFilterBtn = document.querySelector('.chip-add');
  if (addFilterBtn) {
    addFilterBtn.addEventListener('click', () => {
      api.postMessage({ command: 'openCategorySettings' });
    });
  }

  // === Results click (detail) ===
  resultsEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Handle collapsible group headers (Installed tab)
    const groupHeader = target.closest('.installed-group-header');
    if (groupHeader) {
      const body = groupHeader.nextElementSibling;
      if (body) body.classList.toggle('open');
      groupHeader.classList.toggle('collapsed');
      return;
    }

    // Handle manifest toggle via delegation
    const manifestBtn = target.closest('.btn-manifest, .btn-action-manifest') as HTMLButtonElement | null;
    if (manifestBtn) {
      toggleManifest(manifestBtn);
      return;
    }

    // Handle "Install Missing" banner button
    if (target.closest('.btn-install-missing')) {
      api.postMessage({ command: 'installFromManifest' });
      return;
    }

    // Handle remove button
    const removeBtn = target.closest('.btn-action-remove') as HTMLButtonElement | null;
    if (removeBtn) {
      const rmName = removeBtn.dataset.skillName;
      if (rmName) {
        api.postMessage({ command: 'uninstall', payload: { skillName: rmName } });
        const rmLabel = removeBtn.querySelector('span');
        if (rmLabel) rmLabel.textContent = 'Removing...';
        removeBtn.disabled = true;
      }
      return;
    }

    // Handle update button
    const updateActionBtn = target.closest('.btn-action-update') as HTMLButtonElement | null;
    if (updateActionBtn) {
      const upName = updateActionBtn.dataset.skillName;
      if (upName) {
        api.postMessage({ command: 'update', payload: { skillName: upName } });
        const upLabel = updateActionBtn.querySelector('span');
        if (upLabel) upLabel.textContent = 'Updating...';
        updateActionBtn.disabled = true;
      }
      return;
    }

    // Handle install button (leaderboard grid rows + detail page)
    const installBtn = target.closest('.btn-install') as HTMLButtonElement | null;
    if (installBtn) {
      if (installBtn.classList.contains('btn-updatable')) {
        api.postMessage({ command: 'update', payload: { skillName: installBtn.dataset.skillName } });
        installBtn.textContent = 'Updating...';
        installBtn.disabled = true;
      } else if (!installBtn.classList.contains('btn-installed')) {
        const source = installBtn.dataset.install;
        const skillName = installBtn.dataset.skillName;
        api.postMessage({ command: 'install', payload: { source, skillName } });
        installBtn.textContent = 'Installing...';
        installBtn.disabled = true;
      }
      return;
    }

    const row = target.closest('.grid-row') as HTMLElement | null;
    if (!row) return;

    const source = row.dataset.source;
    const skillId = row.dataset.skill;
    if (source && skillId) {
      const hero = document.querySelector('.hero');
      navStack.push({
        view: currentView, tab: currentTab,
        query: searchInput ? searchInput.value : '',
        scrollY: window.scrollY,
        html: resultsEl.innerHTML,
        heroVisible: hero ? !hero.classList.contains('collapsed') : false,
        leaderboardChrome: document.querySelector('.search-container') ? (document.querySelector('.search-container') as HTMLElement).style.display !== 'none' : true,
      });
      navigationStack.push(currentView);
      currentView = 'detail';
      setHeroVisible(false);
      showLeaderboardChrome(false);
      const tabsNav = document.querySelector('.tabs');
      if (tabsNav) (tabsNav as HTMLElement).style.display = 'none';
      resultsEl.innerHTML = '<div class="empty-state">Loading skill details...</div>';
      api.postMessage({ command: 'detail', payload: { source, skillId } });
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

        if (page === 0 && currentTab === 'all-time') {
          updateTabCount(total);
        }

        let html = '';
        skills.forEach((s: SkillData, i: number) => {
          const rank = page * skills.length + i + 1;
          const sid = s.skillId || s.name;
          html += renderRow(s, rank, installed.has(sid!), updatable.has(sid!));
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
        const { skills, installedNames, updatableNames, manifestSkillNames: mfNames2 } = msg.payload;
        const installed = new Set(installedNames || []);
        const updatable = new Set(updatableNames || []);
        if (mfNames2) manifestSkillNames = new Set(mfNames2);

        if (skills.length === 0) {
          resultsEl.innerHTML = '<div class="empty-state">No skills found</div>';
        } else {
          let html = '';
          skills.forEach((s: SkillData, i: number) => {
            const sid = s.skillId || s.name;
            html += renderRow(s, i + 1, installed.has(sid!), updatable.has(sid!));
          });
          resultsEl.innerHTML = html;
        }
        break;
      }

      case 'detailResult': {
        const detail = msg.payload;
        const detailHtml = renderDetailHtml(detail);
        if (!resultsEl.parentNode) {
          const container = document.querySelector('.container');
          if (container) {
            container.innerHTML = '';
            container.appendChild(resultsEl);
          }
        }
        resultsEl.innerHTML = detailHtml;
        attachDetailListeners();
        break;
      }

      case 'error': {
        resultsEl.innerHTML =
          '<div class="empty-state">Error: ' + msg.payload + '</div>';
        break;
      }

      case 'updateButtonStates': {
        const installed = new Set<string>(msg.payload.installedNames || []);
        const updatable = new Set<string>(msg.payload.updatableNames || []);
        manifestSkillNames = new Set<string>(msg.payload.manifestSkillNames || []);
        document.querySelectorAll('.btn-install').forEach(function (btn) {
          const skillName = (btn as HTMLElement).dataset.skillName;
          if (!skillName) return;
          if (updatable.has(skillName)) {
            btn.className = 'btn-install btn-updatable';
            btn.textContent = 'Update';
            (btn as HTMLButtonElement).disabled = false;
          } else if (installed.has(skillName)) {
            btn.className = 'btn-install btn-installed';
            btn.textContent = '✓ Installed';
            (btn as HTMLButtonElement).disabled = false;
          } else {
            btn.className = 'btn-install';
            btn.textContent = 'Install';
            (btn as HTMLButtonElement).disabled = false;
          }
        });
        document.querySelectorAll('.btn-manifest').forEach(function (btn) {
          const skillName = (btn as HTMLElement).dataset.skillName;
          if (!skillName) return;
          const inMf = manifestSkillNames.has(skillName);
          btn.className = 'btn-manifest' + (btn.classList.contains('btn-manifest-detail') ? ' btn-manifest-detail' : '') + (inMf ? ' btn-manifest-active' : '');
          btn.textContent = inMf ? '✓ Remove from skills.json' : '+ skills.json';
          (btn as HTMLElement).title = inMf ? 'Remove from skills.json' : 'Add to skills.json';
        });
        document.querySelectorAll('.btn-action-manifest').forEach(function (btn) {
          const skillName = (btn as HTMLElement).dataset.skillName;
          if (!skillName) return;
          const inMf = manifestSkillNames.has(skillName);
          if (inMf) {
            btn.classList.add('btn-action-active');
          } else {
            btn.classList.remove('btn-action-active');
          }
          const label = btn.querySelector('span');
          if (label) label.textContent = inMf ? 'Remove from Skills.json' : 'Add to Skills.json';
          (btn as HTMLElement).title = inMf ? 'Remove from skills.json' : 'Add to skills.json';
        });
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

      case 'auditsResult': {
        const container = document.querySelector('.container');
        if (container) container.innerHTML = renderAuditsView(msg.payload);
        attachAuditsListeners();
        break;
      }

      case 'docsResult': {
        const docsData = msg.payload;
        if (docsData) {
          currentDocsPage = docsData.page;
          const container = document.querySelector('.container');
          if (container) container.innerHTML = renderDocsView(docsData);
          attachDocsListeners();
        }
        break;
      }

      case 'navigateTo': {
        const nav = msg.payload;
        if (nav.view === 'audits') {
          navigateToAudits();
        } else if (nav.view === 'docs') {
          navigateToDocs(nav.page || 'overview');
        }
        break;
      }
    }
  });

  // === Helpers ===
  function goBack(): void {
    const prev = navStack.pop();
    if (!prev) {
      api.postMessage({ command: 'back' });
      return;
    }
    currentView = prev.view;
    currentTab = prev.tab;
    resultsEl.innerHTML = prev.html;
    setHeroVisible(prev.heroVisible);
    showLeaderboardChrome(prev.leaderboardChrome);
    const tabsNav = document.querySelector('.tabs');
    if (tabsNav) (tabsNav as HTMLElement).style.display = '';
    updateTabs();
    if (searchInput) {
      searchInput.value = prev.query || '';
      const hasQuery = (prev.query || '').length > 0;
      if (searchKbd) searchKbd.style.display = hasQuery ? 'none' : '';
      if (searchClear) searchClear.style.display = hasQuery ? 'block' : 'none';
    }
    requestAnimationFrame(function () { window.scrollTo(0, prev.scrollY || 0); });
    saveState();
  }

  function setHeroVisible(visible: boolean): void {
    const hero = document.querySelector('.hero');
    const heading = document.querySelector('.hero-leaderboard-heading');
    if (hero) hero.classList.toggle('collapsed', !visible);
    if (heading) heading.classList.toggle('collapsed', !visible);
  }

  function showLeaderboardChrome(visible: boolean): void {
    const search = document.querySelector('.search-container');
    const chips = document.querySelector('.chips');
    const gridHeader = document.querySelector('.grid-header');
    if (search) (search as HTMLElement).style.display = visible ? '' : 'none';
    if (chips) (chips as HTMLElement).style.display = visible ? '' : 'none';
    if (gridHeader) (gridHeader as HTMLElement).style.display = visible ? '' : 'none';
  }

  function renderInstalledView(): void {
    if (installedSkills.length === 0) {
      resultsEl.innerHTML = '<div class="empty-state">No skills installed yet. Browse the marketplace to get started.</div>';
      return;
    }
    let html = '';

    if (manifestSkillNames.size > 0) {
      const installedFolders = new Set(installedSkills.map(function (s) { return s.folderName; }));
      let missingCount = 0;
      manifestSkillNames.forEach(function (name) {
        if (!installedFolders.has(name)) missingCount++;
      });
      if (missingCount > 0) {
        html += '<div class="manifest-banner">'
          + '<span>' + missingCount + ' skill' + (missingCount > 1 ? 's' : '') + ' from skills.json ' + (missingCount > 1 ? 'are' : 'is') + ' not installed</span>'
          + '<button class="btn-install btn-install-missing">Install Missing</button>'
          + '</div>';
      }
    }

    const updates: InstalledSkillData[] = [];
    const custom: InstalledSkillData[] = [];
    const untracked: InstalledSkillData[] = [];
    const project: InstalledSkillData[] = [];
    const bySource: Record<string, InstalledSkillData[]> = {};

    installedSkills.forEach(function (skill) {
      if (skill.hasUpdate) updates.push(skill);
      if (skill.scope === 'project') { project.push(skill); return; }
      if (skill.isCustom) { custom.push(skill); return; }
      if (!skill.source) { untracked.push(skill); return; }
      const src = skill.source;
      if (!bySource[src]) bySource[src] = [];
      bySource[src].push(skill);
    });

    html += renderInstalledGroup('Updates Available', updates, true, manifestSkillNames);
    html += renderInstalledGroup('My Skills', custom, true, manifestSkillNames);

    const sources = Object.keys(bySource).sort();
    sources.forEach(function (src) {
      html += renderInstalledGroup(src, bySource[src], true, manifestSkillNames);
    });

    html += renderInstalledGroup('Untracked', untracked, false, manifestSkillNames);
    html += renderInstalledGroup('Project Skills', project, true, manifestSkillNames);

    resultsEl.innerHTML = html;
  }

  function updateInstalledTabLabel(): void {
    const tab = document.querySelector('.tab[data-tab="installed"]');
    if (tab) {
      tab.textContent = 'Installed (' + installedSkills.length + ')';
    }
  }

  function loadLeaderboard(view: string, page: number): void {
    currentView = 'leaderboard';
    if (page === 0) {
      resultsEl.innerHTML = _skeletonRows10;
    }
    api.postMessage({ command: 'leaderboard', payload: { view, page } });
  }

  function updateTabs(): void {
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', (t as HTMLElement).dataset.tab === currentTab);
    });
  }

  function updateChips(): void {
    document.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('active', (c as HTMLElement).dataset.category === currentChip);
    });
  }

  function updateTabCount(total: number): void {
    const allTimeTab = document.querySelector('.tab[data-tab="all-time"]');
    if (allTimeTab && total) {
      allTimeTab.textContent = 'All Time (' + total.toLocaleString() + ')';
    }
  }

  function attachDetailListeners(): void {
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (navigationStack.length > 0) {
          navigateBack();
        } else {
          goBack();
        }
      });
    }

    document.querySelectorAll('[data-nav]').forEach(link => {
      link.addEventListener('click', () => {
        const nav = link.getAttribute('data-nav');
        if (nav === 'home') {
          navigationStack = [];
          goBack();
        } else if (nav === 'external') {
          const url = link.getAttribute('data-url');
          if (url) api.postMessage({ command: 'openExternal', payload: { url } });
        }
      });
    });

    const copyCmd = document.getElementById('copyCmd');
    if (copyCmd) {
      copyCmd.addEventListener('click', () => {
        const cmdText = copyCmd.querySelector('.detail-cmd-text');
        if (cmdText) {
          const text = cmdText.textContent!.replace(/^\$ /, '');
          navigator.clipboard.writeText(text);
          showCopyFeedback(copyCmd.querySelector('.copy-icon'));
        }
      });
    }
  }

  function attachAuditsListeners(): void {
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
      backBtn.addEventListener('click', function () { navigateBack(); });
    }
    document.querySelectorAll('.audits-row').forEach(function (row) {
      row.addEventListener('click', function () {
        const source = row.getAttribute('data-source');
        const skillId = row.getAttribute('data-skill');
        if (source && skillId) {
          navigationStack.push('audits');
          currentView = 'detail';
          api.postMessage({ command: 'detail', payload: { source, skillId } });
          const container = document.querySelector('.container');
          if (container) container.innerHTML = '<div class="empty-state">Loading skill details...</div>';
        }
      });
    });
  }

  function attachDocsListeners(): void {
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
      backBtn.addEventListener('click', function () { navigateBack(); });
    }
    document.querySelectorAll('[data-docs-page]').forEach(function (link) {
      link.addEventListener('click', function () {
        const page = link.getAttribute('data-docs-page');
        if (page) {
          navigateToDocs(page);
        }
      });
    });
    document.querySelectorAll('.docs-content [data-nav="external"]').forEach(function (link) {
      link.addEventListener('click', function () {
        const url = link.getAttribute('data-url');
        if (url) { api.postMessage({ command: 'openExternal', payload: { url } }); }
      });
    });
    document.querySelectorAll('.docs-content [data-nav="home"]').forEach(function (link) {
      link.addEventListener('click', function () { navigateBack(); });
    });
  }

  function showCopyFeedback(iconEl: Element | null): void {
    if (!iconEl || (iconEl as HTMLElement).dataset.copying) return;
    (iconEl as HTMLElement).dataset.copying = 'true';
    const originalHtml = iconEl.innerHTML;
    iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:#fff"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(() => {
      iconEl.innerHTML = originalHtml;
      delete (iconEl as HTMLElement).dataset.copying;
    }, 1500);
  }

  function toggleManifest(btn: HTMLButtonElement): void {
    const source = btn.dataset.source;
    const skillName = btn.dataset.skillName;
    if (!skillName) return;
    const isActionStyle = btn.classList.contains('btn-action-manifest');
    const isActive = btn.classList.contains('btn-manifest-active') || btn.classList.contains('btn-action-active');
    if (isActive) {
      api.postMessage({ command: 'removeFromManifest', payload: { skillName } });
      btn.classList.remove('btn-manifest-active', 'btn-action-active');
      const label = btn.querySelector('span');
      if (label) { label.textContent = 'Add to Skills.json'; }
      else { btn.textContent = '+ skills.json'; }
      btn.title = 'Add to skills.json';
    } else {
      api.postMessage({ command: 'addToManifest', payload: { source, skillName } });
      btn.classList.add(isActionStyle ? 'btn-action-active' : 'btn-manifest-active');
      const label2 = btn.querySelector('span');
      if (label2) { label2.textContent = 'Remove from Skills.json'; }
      else { btn.textContent = '✓ Remove from skills.json'; }
      btn.title = 'Remove from skills.json';
    }
  }
}

// ── Auto-init in browser context ─────────────────────────────────────

declare const acquireVsCodeApi: (() => VsCodeApi) | undefined;

if (typeof acquireVsCodeApi === 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = (window as any).__webviewConfig as WebviewConfig;
  initializeWebview(acquireVsCodeApi(), config);
}
