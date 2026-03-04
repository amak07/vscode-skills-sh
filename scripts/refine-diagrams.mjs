#!/usr/bin/env node
/**
 * Refine Excalidraw diagrams for readability:
 * 1. Bump all fontSize < 16 to 16
 * 2. Wrap free-floating annotation text in callout boxes
 * 3. Normalize font size hierarchy
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIAGRAMS_DIR = join(import.meta.dirname, '..', 'docs', 'architecture');
const CALLOUT_BG = '#fff9db';      // Light yellow for annotation callouts
const CALLOUT_STROKE = '#e8590c';  // Orange border (visible but not dominant)
const CALLOUT_PADDING = 12;
const MIN_FONT_SIZE = 16;

let seedCounter = 90000;
function nextSeed() { return seedCounter++; }
function nextId() { return `callout-bg-${seedCounter++}`; }

function estimateTextBounds(textEl) {
  const lines = textEl.text.split('\n');
  const maxLineLen = Math.max(...lines.map(l => l.length));
  const charWidth = textEl.fontSize * 0.55; // approximate
  const lineHeight = textEl.fontSize * (textEl.lineHeight || 1.25);
  return {
    width: maxLineLen * charWidth + CALLOUT_PADDING * 2,
    height: lines.length * lineHeight + CALLOUT_PADDING * 2,
  };
}

function processFile(filePath) {
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const newElements = [];
  let bumped = 0;
  let callouts = 0;

  for (const el of data.elements) {
    if (el.type === 'text') {
      // Bump small fonts
      if (el.fontSize < MIN_FONT_SIZE) {
        bumped++;
        el.fontSize = MIN_FONT_SIZE;
      }

      // Wrap free-floating annotation text in callout boxes
      // Annotations are: free-floating (no containerId), were originally small (13-16px),
      // and are NOT titles/headings (fontSize < 22 after bump)
      const isAnnotation = !el.containerId
        && el.fontSize <= 16
        && el.strokeColor !== '#1e1e1e'  // not a title
        && (el.text.includes('—') || el.text.includes('...') || el.text.includes('\n')
            || el.text.includes('?') || el.text.includes('→')
            || el.text.toLowerCase().includes('why') || el.text.toLowerCase().includes('bypass')
            || el.text.toLowerCase().includes('no api') || el.text.toLowerCase().includes('never')
            || el.text.toLowerCase().includes('promise') || el.text.toLowerCase().includes('csp')
            || el.text.toLowerCase().includes('dirent') || el.text.toLowerCase().includes('canonical')
            || el.text.toLowerCase().includes('parallel') || el.text.toLowerCase().includes('serves')
            || el.text.toLowerCase().includes('same binary') || el.text.toLowerCase().includes('generic')
            || el.text.toLowerCase().includes('user clicks skill') || el.text.toLowerCase().includes('webview cannot')
            || el.text.toLowerCase().includes('windows') || el.text.toLowerCase().includes('most reliable')
            || el.text.toLowerCase().includes('lock file is') || el.text.toLowerCase().includes('safety net'));

      if (isAnnotation) {
        const bounds = estimateTextBounds(el);
        const bgRect = {
          id: nextId(),
          type: 'rectangle',
          x: el.x - CALLOUT_PADDING,
          y: el.y - CALLOUT_PADDING,
          width: bounds.width,
          height: bounds.height,
          angle: 0,
          strokeColor: '#ced4da',
          backgroundColor: CALLOUT_BG,
          fillStyle: 'solid',
          strokeWidth: 1,
          strokeStyle: 'solid',
          roughness: 1,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: { type: 3 },
          seed: nextSeed(),
          version: 1,
          versionNonce: nextSeed(),
          isDeleted: false,
          boundElements: null,
          updated: 1709000000000,
          link: null,
          locked: false,
        };
        // Insert background BEFORE the text so it renders behind
        newElements.push(bgRect);
        callouts++;
      }
    }
  }

  // Merge: backgrounds first, then original elements (so text is on top)
  data.elements = [...newElements, ...data.elements];

  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return { bumped, callouts, total: data.elements.length };
}

// Process all .excalidraw files
const files = readdirSync(DIAGRAMS_DIR).filter(f => f.endsWith('.excalidraw'));
console.log(`Processing ${files.length} diagrams...\n`);

for (const file of files) {
  const filePath = join(DIAGRAMS_DIR, file);
  const result = processFile(filePath);
  console.log(`${file}:`);
  console.log(`  Font bumps: ${result.bumped}`);
  console.log(`  Callout boxes added: ${result.callouts}`);
  console.log(`  Total elements: ${result.total}\n`);
}

console.log('Done. Open in Excalidraw to verify.');
