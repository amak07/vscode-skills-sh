export function getStyles(fontUri: string): string {
  return `
    @font-face {
      font-family: 'Geist Sans';
      src: url('${fontUri}/GeistSans-Regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Geist Sans';
      src: url('${fontUri}/GeistSans-Medium.woff2') format('woff2');
      font-weight: 500;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Geist Sans';
      src: url('${fontUri}/GeistSans-SemiBold.woff2') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Geist Mono';
      src: url('${fontUri}/GeistMono-Regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }

    :root {
      --bg-100: #000000;
      --bg-200: #000000;
      --gray-100: #1a1a1a;
      --gray-200: #1f1f1f;
      --gray-400: #2e2e2e;
      --gray-600: #878787;
      --gray-900: #a0a0a0;
      --gray-1000: #ededed;
      --green-700: #00ab3e;
      --blue-600: #0090ff;
      --red-700: #fc0035;
      --radius: 0.5rem;
      --radius-md: 0.375rem;
      --radius-sm: 0.25rem;
      --font-sans: 'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-mono: 'Geist Mono', 'Courier New', monospace;
    }

    .light-theme {
      --bg-100: #ffffff;
      --bg-200: #fafafa;
      --gray-100: #f2f2f2;
      --gray-200: #ebebeb;
      --gray-400: #eaeaea;
      --gray-600: #a8a8a8;
      --gray-900: #666666;
      --gray-1000: #171717;
      --green-700: #28a948;
      --blue-600: #0070f7;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html {
      height: 100%;
      background: var(--bg-200);
    }

    body {
      min-height: 100%;
      background: var(--bg-200);
      color: var(--gray-1000);
      font-family: var(--font-sans);
      font-size: 0.875rem;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* === Search Input === */
    .search-container {
      position: relative;
      border-bottom: 1px solid var(--gray-400);
      margin-top: 1rem;
      transition: border-color 150ms;
    }
    .search-container:focus-within {
      border-bottom-color: var(--gray-1000);
    }
    .search-icon {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      color: var(--gray-600);
      pointer-events: none;
      display: flex;
      align-items: center;
      padding-left: 0.25rem;
    }
    .search-icon svg { width: 16px; height: 16px; }
    .search-input {
      width: 100%;
      background: transparent;
      border: none;
      font-family: var(--font-mono);
      font-size: 0.875rem;
      color: var(--gray-1000);
      padding: 0.75rem 2rem 0.75rem 1.75rem;
      outline: none !important;
      box-shadow: none !important;
      transition: border-color 100ms;
    }
    .search-input::placeholder { color: var(--gray-600); }
    .search-input:focus {
      outline: none !important;
      box-shadow: none !important;
    }
    .search-input:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
    .search-kbd {
      position: absolute;
      right: 0.5rem;
      top: 50%;
      transform: translateY(-50%);
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--gray-900);
      padding: 0.125rem 0.375rem;
      border: 1px solid var(--gray-200);
      border-radius: var(--radius-sm);
      outline: none;
      box-shadow: none;
      background: transparent;
      -webkit-appearance: none;
    }
    .search-clear {
      position: absolute;
      right: 0.5rem;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--gray-600);
      cursor: pointer;
      padding: 0.25rem;
      display: none;
    }
    .search-clear:hover { color: var(--gray-1000); }
    .search-clear svg { width: 14px; height: 14px; }

    /* === Tabs === */
    .tabs {
      display: flex;
      gap: 1.5rem;
      border-bottom: 1px solid var(--gray-200);
      margin-top: 1.5rem;
    }
    .tab {
      padding-bottom: 0.5rem;
      border-bottom: 2px solid transparent;
      color: var(--gray-600);
      cursor: pointer;
      font-size: 0.875rem;
      transition: color 150ms, border-color 150ms;
      background: none;
      border-top: none;
      border-left: none;
      border-right: none;
      font-family: var(--font-sans);
    }
    .tab:hover { color: var(--gray-1000); }
    .tab.active {
      color: var(--gray-1000);
      border-bottom-color: var(--gray-1000);
    }

    /* === Category Chips === */
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      padding: 0.75rem 0;
      align-items: center;
    }
    .chips-label {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--gray-600);
      margin-right: 0.25rem;
    }
    .chip {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      border: 1px solid var(--gray-200);
      background: transparent;
      color: var(--gray-600);
      cursor: pointer;
      transition: all 150ms;
    }
    .chip:hover { color: var(--gray-1000); border-color: var(--gray-400); }
    .chip.active {
      background: var(--gray-1000);
      color: var(--bg-200);
      border-color: var(--gray-1000);
    }
    .chip-add {
      border-style: dashed;
      font-size: 0.875rem;
      line-height: 1;
    }
    .chip-add:hover { border-style: solid; }

    /* === Leaderboard Grid === */
    .grid-header {
      display: grid;
      grid-template-columns: 2rem 1fr auto;
      gap: 0.75rem;
      padding: 0.75rem 0;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      color: var(--gray-600);
      border-bottom: 1px solid var(--gray-200);
    }
    .grid-row {
      display: grid;
      grid-template-columns: 2rem 1fr auto;
      gap: 0.75rem;
      align-items: start;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--gray-200);
      cursor: pointer;
      transition: background 150ms;
      text-decoration: none;
      color: inherit;
    }
    .grid-row:hover { background: rgba(26, 26, 26, 0.3); }
    .light-theme .grid-row:hover { background: rgba(0, 0, 0, 0.03); }
    .row-rank {
      font-family: var(--font-mono);
      font-size: 0.875rem;
      color: var(--gray-600);
    }
    .row-info { min-width: 0; }
    .row-name {
      display: flex;
      align-items: center;
      font-weight: 600;
      font-size: 0.875rem;
      overflow: hidden;
      white-space: nowrap;
    }
    .row-name-text {
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .row-source {
      font-size: 0.75rem;
      color: var(--gray-600);
      margin-top: 0.125rem;
    }
    .row-right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.25rem;
    }
    .row-installs {
      font-family: var(--font-mono);
      font-size: 0.875rem;
      white-space: nowrap;
    }

    /* === Publisher Group (Leaderboard) === */
    .publisher-summary-row {
      cursor: pointer;
      user-select: none;
      color: var(--gray-600);
      font-size: 0.8125rem;
    }
    .publisher-summary-row:hover { color: var(--fg); }
    .publisher-chevron {
      display: inline-block;
      transition: transform 150ms;
      font-size: 0.625rem;
      margin-right: 0.35rem;
    }
    .publisher-summary-row.expanded .publisher-chevron {
      transform: rotate(90deg);
    }
    .publisher-group-body { display: none; }
    .publisher-group-body.open { display: block; }

    /* === Install Button === */
    .btn-install {
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      padding: 0.1875rem 0.5rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--gray-400);
      background: transparent;
      color: var(--gray-1000);
      cursor: pointer;
      transition: all 150ms;
      white-space: nowrap;
    }
    .btn-install:hover {
      background: var(--gray-1000);
      color: var(--bg-200);
    }
    .btn-installed {
      color: var(--green-700);
      border-color: var(--green-700);
      cursor: default;
    }
    .btn-installed:hover {
      background: transparent;
      color: var(--green-700);
    }
    .btn-updatable {
      color: var(--amber-700, #b45309);
      border-color: var(--amber-700, #b45309);
      font-weight: 600;
    }
    .btn-updatable:hover {
      background: var(--amber-700, #b45309);
      color: var(--bg-200, #fff);
    }
    .btn-updating {
      opacity: 0.7;
      cursor: not-allowed;
    }

    /* === Detail View === */
    .detail-view { padding: 1.5rem 0 0; }
    .detail-view .btn-install {
      width: 100%;
      padding: 0.5rem 0.75rem;
      font-size: 0.75rem;
      background: var(--gray-1000);
      color: var(--bg-100);
      border-color: var(--gray-1000);
      font-weight: 600;
    }
    .detail-view .btn-install:hover {
      background: var(--gray-1000);
      color: var(--bg-100);
      opacity: 0.8;
    }
    .detail-view .btn-installed {
      background: transparent;
      color: var(--green-700);
      border-color: var(--green-700);
      opacity: 1;
    }
    .detail-view .btn-installed:hover {
      background: transparent;
      color: var(--green-700);
      opacity: 1;
    }
    .detail-view .btn-action {
      padding: 0.5rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .detail-view .btn-action-manifest {
      background: var(--blue-600);
      color: var(--bg-200);
      border-color: var(--blue-600);
    }
    .detail-view .btn-action-manifest:hover {
      background: var(--blue-600);
      color: var(--bg-200);
      opacity: 0.8;
    }
    .detail-view .btn-action-manifest.btn-action-active {
      opacity: 1;
    }
    .detail-view .btn-action-manifest.btn-action-active:hover {
      opacity: 0.8;
    }
    .detail-view .btn-action-remove {
      background: var(--red-600, #dc2626);
      color: var(--bg-200);
      border-color: var(--red-600, #dc2626);
    }
    .detail-view .btn-action-remove:hover {
      background: var(--red-600, #dc2626);
      color: var(--bg-200);
      opacity: 0.8;
    }
    .detail-view .btn-action-update {
      background: var(--amber-700, #b45309);
      color: var(--bg-200, #fff);
      border-color: var(--amber-700, #b45309);
    }
    .detail-view .btn-action-update:hover {
      background: var(--amber-700, #b45309);
      color: var(--bg-200, #fff);
      opacity: 0.8;
    }
    .detail-breadcrumb {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: var(--gray-600);
      margin-bottom: 1.5rem;
      min-width: 0;
      flex-wrap: wrap;
    }
    .detail-breadcrumb a {
      color: var(--gray-600);
      text-decoration: none;
      cursor: pointer;
    }
    .detail-breadcrumb a:hover { color: var(--gray-1000); }
    .detail-breadcrumb span { color: var(--gray-600); }
    .detail-title {
      font-size: 1.875rem;
      font-weight: 600;
      letter-spacing: -0.025em;
      margin-bottom: 1rem;
      word-break: break-all;
    }
    .detail-cmd {
      background: rgba(31, 31, 31, 0.5);
      border-radius: var(--radius-md);
      padding: 0.625rem 0.875rem;
      font-family: var(--font-mono);
      font-size: 0.875rem;
      color: var(--gray-900);
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      margin-bottom: 2.5rem;
      cursor: pointer;
      transition: color 150ms;
      max-width: 100%;
    }
    .light-theme .detail-cmd { background: rgba(235, 235, 235, 0.5); }
    .detail-cmd:hover { color: var(--gray-1000); }
    .detail-cmd-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .detail-cmd .dollar { opacity: 0.5; margin-right: 0.25rem; }
    .detail-cmd .copy-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      opacity: 0.5;
      cursor: pointer;
      transition: opacity 150ms;
    }
    .detail-cmd .copy-icon:hover { opacity: 1; }
    .detail-grid {
      display: grid;
      grid-template-columns: 1fr 220px;
      gap: 3rem;
    }
    .tab-view .detail-grid {
      grid-template-columns: 9fr 3fr;
      gap: 4rem;
    }
    /* Narrow panels: stack vertically with stats on top */
    @media (max-width: 480px) {
      .detail-grid {
        grid-template-columns: 1fr;
        gap: 2rem;
      }
      .detail-grid > aside { order: -1; }
      .detail-grid > .detail-content { order: 1; }
      /* Preserve two-column in tab view even at narrow viewport */
      .tab-view .detail-grid {
        grid-template-columns: 9fr 3fr;
        gap: 4rem;
      }
      .tab-view .detail-grid > aside { order: unset; }
      .tab-view .detail-grid > .detail-content { order: unset; }
    }
    .detail-summary-card {
      border: 1px solid var(--gray-200);
      border-radius: var(--radius);
      background: rgba(255, 255, 255, 0.03);
      padding: 1.25rem 1.25rem 1rem;
      margin-bottom: 1.5rem;
    }
    .light-theme .detail-summary-card {
      background: rgba(0, 0, 0, 0.02);
    }
    .detail-summary-label {
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--gray-600);
      margin-bottom: 0.75rem;
    }
    .detail-summary-body {
      font-size: 0.875rem;
      color: var(--gray-900);
      line-height: 1.6;
    }
    .detail-summary-body p:first-child {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--gray-1000);
      margin: 0 0 0.625rem;
    }
    .detail-summary-body ul {
      margin: 0.5rem 0 0;
      padding-left: 1.25rem;
    }
    .detail-summary-body li {
      margin-bottom: 0.375rem;
    }
    .detail-summary-body li:last-child {
      margin-bottom: 0;
    }
    .detail-content { min-width: 0; overflow: hidden; }
    .detail-grid > aside { align-self: start; }
    .detail-skillmd-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-family: var(--font-mono);
      font-size: 0.875rem;
      color: var(--gray-1000);
      margin-bottom: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--gray-200);
    }
    .detail-skillmd-header svg { width: 16px; height: 16px; }

    /* === Sidebar Metadata === */
    .sidebar-section {
      padding: 2rem 0;
      border-top: 1px solid var(--gray-200);
    }
    .sidebar-section:first-child {
      padding-top: 0;
      padding-bottom: 2rem;
      border-top: none;
    }
    .sidebar-label {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      color: var(--gray-1000);
      margin-bottom: 0.5rem;
    }
    .sidebar-value {
      font-family: var(--font-mono);
      font-size: 0.875rem;
      color: var(--gray-1000);
    }
    .sidebar-value-large {
      font-family: var(--font-mono);
      font-size: 1.875rem;
      font-weight: 600;
      letter-spacing: -0.025em;
      color: var(--gray-1000);
    }
    .sidebar-link {
      color: var(--gray-1000);
      text-decoration: none;
      word-break: break-all;
    }
    .sidebar-link:hover { text-decoration: underline; }
    .sidebar-link-with-icon {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }
    .sidebar-link-with-icon svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
    .sidebar-stars {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .sidebar-stars svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      display: block;
    }
    .star-icon { color: #b45309; }
    .light-theme .star-icon { color: #d97706; }
    .agent-table { width: 100%; }
    .agent-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 0;
      font-size: 0.875rem;
      border-bottom: 1px solid var(--gray-200);
    }
    .agent-row:last-child { border-bottom: none; }
    .agent-name { color: var(--gray-1000); }
    .agent-installs {
      font-family: var(--font-mono);
      color: var(--gray-900);
    }

    /* === Prose (SKILL.md content) === */
    .prose {
      color: var(--gray-900);
      line-height: 1.625;
    }
    .prose h1 {
      font-size: 2.25rem;
      font-weight: 600;
      letter-spacing: -0.025em;
      color: var(--gray-1000);
      margin-bottom: 0.5rem;
      margin-top: 1.5rem;
    }
    .prose h2 {
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: -0.025em;
      color: var(--gray-1000);
      margin-bottom: 0.5rem;
      margin-top: 1.5rem;
    }
    .prose h3 {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--gray-1000);
      margin-bottom: 0.5rem;
      margin-top: 1rem;
    }
    .prose p { margin-bottom: 1rem; }
    .prose ul, .prose ol {
      margin-bottom: 1rem;
      padding-left: 1.5rem;
    }
    .prose li { margin-bottom: 0.375rem; color: var(--gray-900); }
    .prose ul { list-style-type: disc; }
    .prose ul li::marker { color: var(--gray-600); }
    .prose code {
      background: var(--gray-200);
      color: var(--gray-1000);
      padding: 0.125rem 0.375rem;
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      font-size: 0.8125rem;
    }
    .prose pre {
      background: var(--gray-100);
      color: var(--gray-1000);
      border: 1px solid var(--gray-400);
      border-radius: var(--radius-md);
      padding: 1rem;
      overflow-x: auto;
      margin-bottom: 1rem;
      line-height: 1.6;
    }
    .prose pre code {
      background: none;
      color: inherit;
      padding: 0;
      border-radius: 0;
      font-size: 0.8125rem;
    }
    .prose table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1rem;
    }
    .prose th, .prose td {
      border: 1px solid var(--gray-200);
      padding: 0.5rem 0.75rem;
      text-align: left;
      font-size: 0.875rem;
    }
    .prose th { font-weight: 600; color: var(--gray-1000); }
    .prose a {
      color: var(--blue-600);
      text-decoration: none;
    }
    .prose a:hover { text-decoration: underline; }

    /* === Skeleton loading === */
    .skeleton {
      display: grid;
      grid-template-columns: 2rem 1fr auto;
      gap: 0.75rem;
      align-items: start;
      padding: 0.75rem 0;
    }
    .skeleton-bar {
      height: 1.25rem;
      background: var(--gray-200);
      border-radius: var(--radius-sm);
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    .skeleton-bar-sm { height: 1rem; width: 60%; margin-top: 0.25rem; }
    @keyframes pulse { 50% { opacity: 0.5; } }

    /* === Empty state === */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 0;
      color: var(--gray-600);
      font-family: var(--font-mono);
      font-size: 0.875rem;
    }

    /* === Back button === */
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      color: var(--gray-900);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      background: none;
      border: 1px solid var(--gray-400);
      border-radius: var(--radius-sm);
      font-family: var(--font-sans);
      margin-bottom: 1.25rem;
      padding: 0.375rem 0.75rem;
      transition: all 150ms;
    }
    .back-btn:hover {
      color: var(--gray-1000);
      border-color: var(--gray-1000);
    }
    .back-btn svg { width: 14px; height: 14px; }

    /* === Content fade transition === */
    @keyframes contentFadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .content-fade-in {
      animation: contentFadeIn 0.2s ease-out;
    }

    /* === Scroll container === */
    .container {
      padding: 0 0.5rem;
      max-width: 100%;
      overflow-x: hidden;
    }

    /* Change indicator for hot */
    .change-positive { color: var(--green-700); }
    .change-negative { color: var(--red-700); }

    /* === Tab view (expanded editor tab) === */
    .tab-view .container {
      max-width: 1152px;
      margin: 0 auto;
      padding: 0 1rem;
    }

    /* === Hero Section (tab view only) === */
    .hero {
      max-width: 1152px;
      margin: 0 auto;
      padding: 4rem 1rem 3rem;
      max-height: 1000px;
      overflow: hidden;
      transition: max-height 300ms ease-out, opacity 200ms ease-out,
                  padding-top 300ms ease-out, padding-bottom 300ms ease-out;
    }
    .hero.collapsed {
      max-height: 0;
      opacity: 0;
      padding-top: 0;
      padding-bottom: 0;
    }
    .hero-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2.5rem;
      align-items: center;
      margin-bottom: 3rem;
    }
    .hero-ascii {
      font-family: var(--font-mono);
      font-size: clamp(0.35rem, 1.1vw, 0.625rem);
      line-height: 1.15;
      color: var(--gray-1000);
      white-space: pre;
      overflow: hidden;
      user-select: none;
      letter-spacing: 0;
    }
    .hero-subtitle {
      font-family: var(--font-mono);
      font-size: 0.9375rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--gray-1000);
      margin-top: 1.5rem;
    }
    .hero-tagline {
      font-size: 1.875rem;
      line-height: 1.25;
      letter-spacing: -0.025em;
      color: var(--gray-600);
      text-wrap: balance;
    }
    .hero-bottom-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 3rem;
      align-items: start;
    }
    @media (max-width: 600px) {
      .hero-bottom-grid {
        grid-template-columns: 1fr;
        gap: 2rem;
      }
    }
    .hero-try {
      margin-bottom: 0;
    }
    .hero-try-label {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--gray-1000);
      margin-bottom: 0.875rem;
    }
    .hero-cmd {
      background: rgba(31, 31, 31, 0.5);
      border-radius: var(--radius-md);
      padding: 0.625rem 0.875rem;
      font-family: var(--font-mono);
      font-size: 0.875rem;
      color: var(--gray-900);
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      transition: color 150ms;
    }
    .hero-cmd .dollar { opacity: 0.5; margin-right: 0.25rem; }
    .hero-cmd-static { white-space: nowrap; }
    .hero-cmd-carousel {
      position: relative;
      display: inline-flex;
      align-items: center;
      height: 1.25em;
      overflow: hidden;
      width: 16ch;
    }
    .hero-cmd-item {
      position: absolute;
      left: 0;
      white-space: nowrap;
      opacity: 0;
      transform: translateY(100%);
    }
    .hero-cmd-item.active {
      position: relative;
      opacity: 1;
      transform: translateY(0);
    }
    .hero-cmd-item.slide-out {
      position: absolute;
      opacity: 0;
      transform: translateY(-100%);
      transition: transform 300ms ease, opacity 300ms ease;
    }
    .hero-cmd-item.slide-in {
      opacity: 1;
      transform: translateY(0);
      transition: transform 300ms ease, opacity 300ms ease;
    }
    .hero-cmd .copy-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      opacity: 0.5;
      cursor: pointer;
      transition: opacity 150ms;
    }
    .hero-cmd .copy-icon:hover { opacity: 1; }
    .hero-agents-section {
      margin-bottom: 0;
    }
    .hero-agents-label {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--gray-1000);
      margin-bottom: 0.875rem;
    }
    /* === Agent Logo Carousel === */
    .hero-agents-carousel {
      position: relative;
      overflow: hidden;
      width: 100%;
      -webkit-mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 8%,
        black 92%,
        transparent 100%
      );
      mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 8%,
        black 92%,
        transparent 100%
      );
    }
    .carousel-track {
      display: flex;
      gap: 2rem;
      animation: carousel-scroll 60s linear infinite;
      width: max-content;
    }
    .carousel-item {
      flex-shrink: 0;
      width: 64px;
      height: 64px;
      border-radius: var(--radius-md);
      overflow: hidden;
      cursor: default;
      transition: transform 150ms ease;
    }
    .carousel-item:hover {
      transform: scale(1.15);
    }
    .carousel-item svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    @keyframes carousel-scroll {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    .hero-agents-carousel:hover .carousel-track {
      animation-play-state: paused;
    }
    @media (prefers-reduced-motion: reduce) {
      .carousel-track {
        animation: none;
      }
    }
    .hero-leaderboard-heading {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--gray-1000);
      max-width: 1152px;
      margin: 0 auto;
      padding: 1rem 1rem 0;
      max-height: 100px;
      overflow: hidden;
      transition: max-height 300ms ease-out, opacity 200ms ease-out,
                  padding-top 300ms ease-out;
    }
    .hero-leaderboard-heading.collapsed {
      max-height: 0;
      opacity: 0;
      padding-top: 0;
    }
    .light-theme .hero-cmd { background: rgba(235, 235, 235, 0.5); }

    /* === Prism.js token colors (matches skills.sh dark theme) === */
    .prose .token.comment,
    .prose .token.prolog,
    .prose .token.doctype,
    .prose .token.cdata { color: #6a737d; font-style: italic; }
    .prose .token.keyword,
    .prose .token.operator { color: #c792ea; }
    .prose .token.function { color: #82aaff; }
    .prose .token.string,
    .prose .token.attr-value { color: #c3e88d; }
    .prose .token.number { color: #f78c6c; }
    .prose .token.parameter,
    .prose .token.variable { color: #ffcb6b; }
    .prose .token.punctuation { color: #89ddff; }
    .prose .token.class-name { color: #ffcb6b; }
    .prose .token.builtin { color: #82aaff; }
    .prose .token.property { color: #f07178; }
    .prose .token.boolean { color: #ff5370; }
    .prose .token.tag { color: #f07178; }
    .prose .token.attr-name { color: #ffcb6b; }
    .prose .token.selector { color: #c792ea; }
    .prose .code-line { display: block; }

    /* === Installed Tab: Card Grid === */
    .installed-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.75rem;
      padding: 0.5rem 0.75rem;
    }
    .installed-card {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--gray-200);
      border-radius: var(--radius);
      padding: 0.75rem;
      transition: border-color 150ms, opacity 150ms;
      cursor: default;
      position: relative;
    }
    .installed-card:hover {
      border-color: var(--gray-400);
    }
    /* Info banner */
    .info-banner {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.625rem 0.75rem;
      margin-bottom: 0.75rem;
      border-radius: var(--radius);
      background: var(--gray-100);
      border: 1px solid var(--gray-200);
      font-size: 0.75rem;
      line-height: 1.45;
      color: var(--gray-900);
    }
    .info-banner-icon {
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      margin-top: 1px;
      color: var(--gray-600);
    }
    .info-banner a {
      color: var(--blue-600);
      text-decoration: none;
    }
    .info-banner a:hover {
      text-decoration: underline;
    }
    .info-banner .dismiss-banner {
      flex-shrink: 0;
      margin-left: auto;
      background: none;
      border: none;
      color: var(--gray-600);
      cursor: pointer;
      padding: 0;
      font-size: 1rem;
      line-height: 1;
    }
    .info-banner .dismiss-banner:hover {
      color: var(--gray-900);
    }
    .info-banner code {
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      background: var(--gray-200);
      padding: 0.1rem 0.3rem;
      border-radius: var(--radius-sm);
    }
    /* Card header: status dot + name */
    .card-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.375rem;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .status-dot-on { background: var(--green-700); }
    .status-dot-off { background: var(--gray-600); }
    .card-name {
      font-weight: 600;
      font-size: 0.8125rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    /* Toggle row */
    .card-toggle {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      color: var(--gray-600);
      margin-bottom: 0.375rem;
      cursor: pointer;
      user-select: none;
    }
    .card-toggle:hover { color: var(--gray-900); }
    .toggle-switch {
      position: relative;
      width: 28px;
      height: 16px;
      border-radius: 8px;
      background: var(--gray-400);
      transition: background 150ms;
      flex-shrink: 0;
    }
    .toggle-switch.on { background: var(--green-700); }
    .toggle-switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--bg-200);
      transition: transform 150ms;
    }
    .toggle-switch.on::after { transform: translateX(12px); }
    /* Meta row: scope + agents */
    .card-meta {
      font-size: 0.6875rem;
      color: var(--gray-600);
      margin-bottom: 0.5rem;
    }
    /* Card actions */
    .card-actions {
      display: flex;
      gap: 0.375rem;
      margin-top: auto;
      padding-top: 0.5rem;
      border-top: 1px solid var(--gray-200);
      align-items: center;
    }
    .card-actions .btn-action {
      flex: 1;
      font-size: 0.625rem;
      padding: 0.1875rem 0.375rem;
    }
    /* Overflow menu button */
    .overflow-menu-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: 1px solid var(--gray-200);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--gray-600);
      cursor: pointer;
      font-size: 0.875rem;
      line-height: 1;
      transition: all 150ms;
      flex-shrink: 0;
    }
    .overflow-menu-btn:hover {
      border-color: var(--gray-400);
      color: var(--fg);
    }
    /* Overflow dropdown */
    .overflow-menu {
      position: absolute;
      right: 0.5rem;
      bottom: 3rem;
      background: var(--bg-100);
      border: 1px solid var(--gray-200);
      border-radius: var(--radius-sm);
      padding: 0.25rem 0;
      min-width: 160px;
      z-index: 50;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .overflow-menu-item {
      display: block;
      width: 100%;
      padding: 0.375rem 0.75rem;
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      color: var(--gray-900);
      background: none;
      border: none;
      text-align: left;
      cursor: pointer;
      transition: background 150ms;
    }
    .overflow-menu-item:hover {
      background: var(--gray-100);
      color: var(--fg);
    }
    .overflow-menu-item-danger { color: var(--red-600, #dc2626); }
    .overflow-menu-item-danger:hover {
      background: color-mix(in srgb, var(--red-600, #dc2626) 10%, transparent);
    }

    /* Collapsible group sections */
    .installed-group {
      margin-top: 0.375rem;
    }
    .installed-group:first-child {
      margin-top: 0;
    }
    .installed-group-header {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.5rem 0.75rem 0.375rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--gray-900);
      cursor: pointer;
      user-select: none;
      border-bottom: 1px solid var(--gray-200);
    }
    .installed-group-header:hover { color: var(--fg); }
    .installed-group-header .chevron {
      display: inline-block;
      transition: transform 150ms;
      font-size: 0.5rem;
    }
    .installed-group-header:not(.collapsed) .chevron { transform: rotate(90deg); }
    .installed-group-body { display: none; }
    .installed-group-body.open { display: block; }

    .scope-badge {
      display: inline-flex;
      align-items: center;
      font-family: var(--font-mono);
      font-size: 0.5625rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      padding: 0.125rem 0.25rem;
      border-radius: 9999px;
      margin-left: 0.25rem;
      white-space: nowrap;
      flex-shrink: 0;
      line-height: 1;
    }
    .scope-global {
      color: var(--green-700);
      border: 1px solid var(--green-700);
    }
    .scope-project {
      color: var(--blue-600);
      border: 1px solid var(--blue-600);
    }

    /* === Agent chips (multi-agent awareness) === */
    .row-agents {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-top: 0.25rem;
    }
    .agent-chip {
      display: inline-block;
      padding: 0.0625rem 0.375rem;
      border-radius: 0.1875rem;
      font-size: 0.6875rem;
      font-family: var(--font-mono);
      background: var(--vscode-badge-background, var(--gray-200));
      color: var(--vscode-badge-foreground, var(--gray-700));
      white-space: nowrap;
    }

    /* === Manifest (skills.json) toggle button === */
    .btn-manifest {
      font-family: var(--font-mono);
      font-size: 0.625rem;
      padding: 0.125rem 0.375rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--gray-400);
      background: transparent;
      color: var(--gray-600);
      cursor: pointer;
      transition: all 150ms;
      white-space: nowrap;
    }
    .btn-manifest:hover {
      border-color: var(--blue-600);
      color: var(--blue-600);
    }
    .btn-manifest-active {
      color: var(--blue-600);
      border-color: var(--blue-600);
    }
    .btn-manifest-active:hover {
      color: var(--red-600, #dc2626);
      border-color: var(--red-600, #dc2626);
    }
    .btn-manifest-detail {
      width: 100%;
      padding: 0.375rem 0.5rem;
      font-size: 0.75rem;
      text-align: center;
    }

    /* === Action button row === */
    .row-actions {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    /* === Action buttons with icons === */
    .btn-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.375rem;
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      padding: 0.25rem 0.5rem;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      background: transparent;
      cursor: pointer;
      transition: all 150ms;
      white-space: nowrap;
      width: 100%;
    }
    .btn-action svg { flex-shrink: 0; }
    /* Add to Skills.json — blue theme */
    .btn-action-manifest {
      color: var(--blue-600);
      border-color: color-mix(in srgb, var(--blue-600) 40%, transparent);
    }
    .btn-action-manifest:hover {
      border-color: var(--blue-600);
      background: color-mix(in srgb, var(--blue-600) 10%, transparent);
    }
    .btn-action-manifest.btn-action-active {
      color: var(--bg-200);
      border-color: var(--blue-600);
      background: var(--blue-600);
    }
    .btn-action-manifest.btn-action-active:hover {
      background: color-mix(in srgb, var(--blue-600) 80%, transparent);
    }
    /* Uninstall — red theme */
    .btn-action-remove {
      color: var(--red-600, #dc2626);
      border-color: color-mix(in srgb, var(--red-600, #dc2626) 40%, transparent);
    }
    .btn-action-remove:hover {
      border-color: var(--red-600, #dc2626);
      background: color-mix(in srgb, var(--red-600, #dc2626) 10%, transparent);
    }
    /* Update — amber theme */
    .btn-action-update {
      color: var(--amber-700, #b45309);
      border-color: var(--amber-700, #b45309);
      font-weight: 600;
    }
    .btn-action-update:hover {
      background: var(--amber-700, #b45309);
      color: var(--bg-200, #fff);
    }

    /* === Manifest "Install Missing" banner === */
    .manifest-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.5rem 0.75rem;
      margin-bottom: 0.5rem;
      border: 1px solid var(--blue-600);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--blue-600) 8%, transparent);
      font-size: 0.75rem;
      color: var(--gray-300);
    }
    .manifest-banner .btn-install {
      flex-shrink: 0;
      font-size: 0.6875rem;
      padding: 0.1875rem 0.625rem;
    }

    /* === Security Audit Badges (detail sidebar) === */
    .security-audits { width: 100%; }
    .security-audit-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--gray-200);
      cursor: pointer;
      text-decoration: none;
      color: inherit;
      transition: background 150ms;
    }
    .security-audit-row:last-child { border-bottom: none; }
    .security-audit-row:hover { background: rgba(26, 26, 26, 0.3); margin: 0 -0.375rem; padding: 0.5rem 0.375rem; border-radius: var(--radius-sm); }
    .light-theme .security-audit-row:hover { background: rgba(0, 0, 0, 0.03); }
    .security-audit-partner {
      font-size: 0.875rem;
      color: var(--gray-1000);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .audit-badge {
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      padding: 0.125rem 0.5rem;
      border-radius: var(--radius-sm);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .audit-badge-pass {
      color: #22c55e;
      background: rgba(34, 197, 94, 0.1);
    }
    .audit-badge-warn {
      color: #eab308;
      background: rgba(234, 179, 8, 0.1);
    }
    .audit-badge-fail {
      color: #ef4444;
      background: rgba(239, 68, 68, 0.1);
    }

    /* --- Composite shield badge (cards) --- */
    .audit-shield {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-family: var(--font-mono);
      font-size: 0.625rem;
      font-weight: 500;
      padding: 1px 6px;
      border-radius: var(--radius-sm);
      white-space: nowrap;
      flex-shrink: 0;
      cursor: pointer;
      vertical-align: middle;
    }
    .audit-shield svg { width: 10px; height: 12px; flex-shrink: 0; position: relative; top: -0.5px; }
    .audit-shield-pass {
      color: #22c55e;
      background: rgba(34, 197, 94, 0.08);
    }
    .audit-shield-partial {
      color: #9ca3af;
      background: rgba(156, 163, 175, 0.1);
    }
    .audit-shield-fail {
      color: #ef4444;
      background: rgba(239, 68, 68, 0.12);
    }
    .light-theme .audit-shield-pass { background: rgba(34, 197, 94, 0.12); }
    .light-theme .audit-shield-partial { background: rgba(156, 163, 175, 0.12); }
    .light-theme .audit-shield-fail { background: rgba(239, 68, 68, 0.15); }

    /* === Nav Bar (Audits / Docs links) === */
    .nav-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 0.5rem;
      border-bottom: 1px solid var(--gray-200);
    }
    .tab-view .nav-bar {
      max-width: 1152px;
      margin: 0 auto;
      padding: 0.75rem 1rem;
    }
    .nav-brand {
      font-family: var(--font-mono);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--gray-1000);
      letter-spacing: -0.01em;
    }
    .nav-links {
      display: flex;
      gap: 1.25rem;
    }
    .nav-link {
      font-family: var(--font-mono);
      font-size: 0.8125rem;
      color: var(--gray-600);
      cursor: pointer;
      text-decoration: none;
      transition: color 150ms;
      background: none;
      border: none;
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }
    .nav-link:hover { color: var(--gray-1000); }
    .nav-link.active { color: var(--gray-1000); }

    /* === Docs View === */
    .docs-view { padding: 1.5rem 0 0; }
    .docs-layout {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 2rem;
      margin-top: 1rem;
    }
    @media (max-width: 480px) {
      .docs-layout {
        grid-template-columns: 1fr;
        gap: 1rem;
      }
    }
    .docs-sidebar-title {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--gray-600);
      margin-bottom: 0.75rem;
    }
    .docs-sidebar-link {
      display: block;
      font-size: 0.875rem;
      color: var(--gray-600);
      padding: 0.375rem 0.75rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all 150ms;
      text-decoration: none;
      margin-bottom: 0.125rem;
    }
    .docs-sidebar-link:hover { color: var(--gray-1000); background: rgba(26, 26, 26, 0.3); }
    .light-theme .docs-sidebar-link:hover { background: rgba(0, 0, 0, 0.03); }
    .docs-sidebar-link.active {
      color: var(--gray-1000);
      background: var(--gray-100);
    }
    .docs-content { min-width: 0; overflow: hidden; }
    .docs-subtitle {
      font-size: 0.875rem;
      color: var(--gray-600);
      margin-bottom: 1.5rem;
    }

    /* === Audits View === */
    .audits-view { padding: 1.5rem 0 0; }
    .audits-subtitle {
      font-size: 0.875rem;
      color: var(--gray-600);
      margin-bottom: 1.5rem;
    }
    .audits-header {
      display: grid;
      grid-template-columns: 2rem 1fr repeat(3, 120px);
      gap: 0.75rem;
      padding: 0.75rem 0;
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      color: var(--gray-600);
      border-bottom: 1px solid var(--gray-200);
    }
    .audits-row {
      display: grid;
      grid-template-columns: 2rem 1fr repeat(3, 120px);
      gap: 0.75rem;
      align-items: center;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--gray-200);
      cursor: pointer;
      transition: background 150ms;
    }
    .audits-row:hover { background: rgba(26, 26, 26, 0.3); }
    .light-theme .audits-row:hover { background: rgba(0, 0, 0, 0.03); }
    .audits-results { display: contents; }
    .audits-results .audit-badge { text-align: center; }
    /* Narrow panels: compact audit columns */
    @media (max-width: 600px) {
      .audits-header, .audits-row {
        grid-template-columns: 2rem 1fr auto;
      }
      .audits-results { display: flex; gap: 0.25rem; }
    }

    /* === Copy feedback (checkmark) === */
    .copy-icon svg { transition: opacity 150ms; }

    /* === Webview toast notification === */
    .webview-toast {
      position: fixed;
      bottom: 1rem;
      left: 50%;
      transform: translateX(-50%) translateY(1rem);
      background: var(--green-700);
      color: #fff;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      padding: 0.5rem 1rem;
      border-radius: var(--radius-md);
      opacity: 0;
      transition: opacity 200ms, transform 200ms;
      z-index: 1000;
      pointer-events: none;
      white-space: nowrap;
    }
    .webview-toast.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    /* === Detail overlay (preserves list scroll position) === */
    #detail-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--bg-200);
      z-index: 100;
      overflow-y: auto;
      padding: 0 0.5rem;
    }
    .tab-view #detail-overlay {
      padding: 0 1rem;
    }
    #detail-overlay > .detail-view {
      max-width: 1152px;
      margin: 0 auto;
    }
  `;
}
