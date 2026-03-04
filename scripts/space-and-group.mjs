#!/usr/bin/env node
/**
 * Two passes on all Excalidraw diagrams:
 * 1. Spread elements apart (scale positions outward from center by 1.25x)
 * 2. Group related elements (callout bg+text, box+sub-labels, detection paths)
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIAGRAMS_DIR = join(import.meta.dirname, '..', 'docs', 'architecture');
const SPREAD_FACTOR = 1.25; // 25% more spacing between everything

let groupCounter = 0;
function nextGroupId() { return `grp-${++groupCounter}`; }

/** Check if point (px, py) is inside or near a rectangle */
function isNear(textEl, rectEl, margin = 30) {
  const tx = textEl.x, ty = textEl.y;
  const rx = rectEl.x - margin, ry = rectEl.y - margin;
  const rw = (rectEl.width || 0) + margin * 2;
  const rh = (rectEl.height || 0) + margin * 2;
  return tx >= rx && tx <= rx + rw && ty >= ry && ty <= ry + rh;
}

/** Check if text is directly below a rectangle (within margin px) */
function isBelow(textEl, rectEl, margin = 60) {
  const tx = textEl.x, ty = textEl.y;
  const rx = rectEl.x, rBottom = rectEl.y + (rectEl.height || 0);
  const rw = rectEl.width || 0;
  return ty >= rBottom && ty <= rBottom + margin
    && tx >= rx - 40 && tx <= rx + rw + 40;
}

function processFile(filePath) {
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const els = data.elements;

  // --- Pass 1: Spread elements apart ---
  // Find center of all elements
  let sumX = 0, sumY = 0, count = 0;
  for (const el of els) {
    sumX += el.x + (el.width || 0) / 2;
    sumY += el.y + (el.height || 0) / 2;
    count++;
  }
  const cx = sumX / count;
  const cy = sumY / count;

  // Scale positions outward from center
  for (const el of els) {
    const elCx = el.x + (el.width || 0) / 2;
    const elCy = el.y + (el.height || 0) / 2;
    const dx = elCx - cx;
    const dy = elCy - cy;
    el.x += dx * (SPREAD_FACTOR - 1);
    el.y += dy * (SPREAD_FACTOR - 1);

    // For arrows, also adjust points (they're relative to x,y)
    // No adjustment needed since points are relative
  }

  // --- Pass 2: Group related elements ---
  const texts = els.filter(e => e.type === 'text');
  const rects = els.filter(e => e.type === 'rectangle');
  const calloutBgs = rects.filter(r => r.backgroundColor === '#fff9db');
  const contentRects = rects.filter(r => r.backgroundColor !== '#fff9db');

  let grouped = 0;

  // 2a: Group each callout background with its overlapping annotation text
  for (const bg of calloutBgs) {
    const gid = nextGroupId();
    const nearTexts = texts.filter(t => !t.containerId && isNear(t, bg, 20));
    if (nearTexts.length > 0) {
      bg.groupIds = [...(bg.groupIds || []), gid];
      for (const t of nearTexts) {
        t.groupIds = [...(t.groupIds || []), gid];
      }
      grouped++;
    }
  }

  // 2b: Group content rectangles with their sub-labels (free text directly below)
  for (const rect of contentRects) {
    // Skip tiny rects, title areas, and container outlines
    if ((rect.width || 0) < 50 || (rect.height || 0) < 30) continue;
    if (rect.strokeStyle === 'dashed' && (rect.width || 0) > 400) continue;

    const belowTexts = texts.filter(t =>
      !t.containerId && isBelow(t, rect, 50)
      && !(t.groupIds && t.groupIds.length > 0) // not already grouped
    );

    if (belowTexts.length > 0) {
      const gid = nextGroupId();
      rect.groupIds = [...(rect.groupIds || []), gid];
      for (const t of belowTexts) {
        t.groupIds = [...(t.groupIds || []), gid];
      }
      // Also include bound text if present
      if (rect.boundElements) {
        for (const bound of rect.boundElements) {
          if (bound.type === 'text') {
            const boundText = els.find(e => e.id === bound.id);
            if (boundText) {
              boundText.groupIds = [...(boundText.groupIds || []), gid];
            }
          }
        }
      }
      grouped++;
    }
  }

  // 2c: Group bound text with its container rect (even without sub-labels)
  for (const rect of contentRects) {
    if (!rect.boundElements) continue;
    const boundTextIds = rect.boundElements.filter(b => b.type === 'text').map(b => b.id);
    if (boundTextIds.length === 0) continue;
    // Check if already grouped
    if (rect.groupIds && rect.groupIds.length > 0) continue;

    const gid = nextGroupId();
    rect.groupIds = [...(rect.groupIds || []), gid];
    for (const tid of boundTextIds) {
      const t = els.find(e => e.id === tid);
      if (t) t.groupIds = [...(t.groupIds || []), gid];
    }
    grouped++;
  }

  data.elements = els;
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return { grouped };
}

const files = readdirSync(DIAGRAMS_DIR).filter(f => f.endsWith('.excalidraw'));
console.log(`Processing ${files.length} diagrams (spread ${SPREAD_FACTOR}x + grouping)...\n`);

for (const file of files) {
  const result = processFile(join(DIAGRAMS_DIR, file));
  console.log(`${file}: ${result.grouped} groups created`);
}
console.log('\nDone. Open in Excalidraw to verify.');
