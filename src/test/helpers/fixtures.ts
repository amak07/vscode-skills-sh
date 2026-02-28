// --- SKILL.md content ---

export const VALID_SKILL_MD = `---
name: "react-best-practices"
description: "Best practices for React development"
license: "MIT"
compatibility: "claude-code, cursor"
allowed-tools: "Read, Write, Bash"
---

# React Best Practices

Guidelines for React development.
`;

export const MINIMAL_SKILL_MD = `---
name: "minimal-skill"
description: ""
---
`;

export const NO_NAME_SKILL_MD = `---
description: "A skill with no name"
---
`;

export const EMPTY_CONTENT = '';

export const NO_FRONTMATTER = `# Just markdown

No frontmatter at all.
`;

export const EXTRA_METADATA_SKILL_MD = `---
name: "extended-skill"
description: "A skill with extra fields"
customField: "custom value"
anotherField: "another value"
---

Body content here.
`;

// --- Lock file ---

export const SAMPLE_LOCK_FILE = {
  version: 1,
  skills: {
    'vercel-react-best-practices': {
      source: 'vercel-labs/agent-skills',
      sourceType: 'github',
      skillPath: 'skills/react-best-practices/SKILL.md',
      skillFolderHash: 'abc123def456',
      installedAt: '2026-01-15T00:00:00Z',
    },
    'supabase-auth': {
      source: 'supabase-community/agent-skills',
      sourceType: 'github',
      skillPath: 'skills/supabase-auth/SKILL.md',
      skillFolderHash: 'def456ghi789',
    },
  },
};

// --- API responses ---

export const SAMPLE_SEARCH_RESPONSE = {
  query: 'react',
  searchType: 'fuzzy',
  skills: [
    { id: '1', skillId: 'react-best-practices', name: 'React Best Practices', installs: 74800, source: 'vercel-labs/agent-skills' },
    { id: '2', skillId: 'react-email', name: 'React Email', installs: 12300, source: 'vercel-labs/agent-skills' },
  ],
  count: 2,
  duration_ms: 12,
};

export const SAMPLE_LEADERBOARD_RESPONSE = {
  skills: [
    { source: 'vercel-labs/agent-skills', skillId: 'react-best-practices', name: 'React Best Practices', installs: 74800 },
  ],
  total: 150,
  hasMore: true,
  page: 0,
};

export const SAMPLE_GITHUB_TREE = {
  tree: [
    { path: 'skills/react-best-practices', type: 'tree', sha: 'abc123def456' },
    { path: 'skills/react-best-practices/SKILL.md', type: 'blob', sha: 'blob1' },
    { path: 'skills/react-email', type: 'tree', sha: 'def456ghi789' },
    { path: 'skills/react-email/SKILL.md', type: 'blob', sha: 'blob2' },
  ],
};

// --- Manifest ---

export const SAMPLE_MANIFEST = {
  skills: [
    { source: 'vercel-labs/agent-skills', skills: ['react-best-practices', 'react-email'] },
    { source: 'supabase-community/agent-skills', skills: ['supabase-auth'] },
  ],
};

// --- HTML fixtures ---

export const SAMPLE_DETAIL_HTML = `<html><body>
<div class="stat-value">121.0K</div>
<span>Weekly Installs</span></div><div class="stat-value">121.0K</div>
<span>First Seen</span></div><div class="stat-value">Jan 16, 2026</div>
<span>GitHub Stars</span></div><div class="sidebar-value"><svg></svg><span>6.8K</span></div>
<div class="prose prose-invert max-w-none">
  <h1>React Best Practices</h1>
  <p>Guidelines for building React apps.</p>
</div></div></div><div class="col-span-3">
</body></html>`;

export const SAMPLE_AUDITS_HTML = `<html><body>
<a class="group grid grid-cols-6" href="/vercel-labs/agent-skills/react-best-practices">
  <div class="font-mono">1</div>
  <div class="min-w-0"><h3 class="font-semibold text-foreground">React Best Practices</h3>
  <p class="font-mono truncate">vercel-labs/agent-skills</p></div>
  <div><span class="text-green-500 bg-green-500/10"><svg></svg>Safe</span></div>
  <div><span class="text-green-500 bg-green-500/10"><svg></svg>0 alerts</span></div>
  <div><span class="text-amber-500 bg-amber-500/10"><svg></svg>Med Risk</span></div>
</a>
</body></html>`;
