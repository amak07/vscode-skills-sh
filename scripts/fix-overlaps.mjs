#!/usr/bin/env node
/**
 * Fix overlapping callout boxes: push annotations away from content elements.
 * For each callout bg + text group, ensure MIN_GAP from the nearest content box.
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIAGRAMS_DIR = join(import.meta.dirname, '..', 'docs', 'architecture');
const MIN_GAP = 100; // minimum px between bottom of content box and top of annotation

function getBottom(el) { return el.y + (el.height || 0); }
function getRight(el) { return el.x + (el.width || 0); }

function processFile(filePath) {
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const els = data.elements;

  const calloutBgs = els.filter(e => e.type === 'rectangle' && e.backgroundColor === '#fff9db');
  const contentRects = els.filter(e =>
    e.type === 'rectangle'
    && e.backgroundColor !== '#fff9db'
    && e.backgroundColor !== 'transparent'
    && (e.width || 0) > 50
    && (e.height || 0) > 30
  );
  const diamonds = els.filter(e => e.type === 'diamond');
  const contentBoxes = [...contentRects, ...diamonds];

  let fixes = 0;

  for (const callout of calloutBgs) {
    // Find the callout's grouped text elements
    const calloutGroups = callout.groupIds || [];
    const groupedTexts = calloutGroups.length > 0
      ? els.filter(e => e.type === 'text' && e.groupIds?.some(g => calloutGroups.includes(g)))
      : [];

    // Find nearest content box that overlaps horizontally and is above/overlapping
    let worstOverlap = 0;
    let pushNeeded = 0;

    for (const box of contentBoxes) {
      // Check horizontal overlap
      const hOverlap = Math.min(getRight(callout), getRight(box)) - Math.max(callout.x, box.x);
      if (hOverlap <= 0) continue; // no horizontal overlap

      const boxBottom = getBottom(box);
      const gap = callout.y - boxBottom;

      // If callout overlaps with or is too close to this content box
      if (gap < MIN_GAP) {
        const needed = MIN_GAP - gap;
        if (needed > pushNeeded) {
          pushNeeded = needed;
        }
      }
    }

    if (pushNeeded > 0) {
      // Push callout and its grouped texts down
      callout.y += pushNeeded;
      for (const t of groupedTexts) {
        t.y += pushNeeded;
      }
      // Also push any non-grouped text that was inside the callout's original bounds
      for (const t of els.filter(e => e.type === 'text' && !calloutGroups.some(g => (e.groupIds || []).includes(g)))) {
        if (t.x >= callout.x - 5 && t.x <= getRight(callout) + 5
            && t.y >= callout.y - pushNeeded - 5 && t.y <= getBottom(callout) - pushNeeded + 5) {
          t.y += pushNeeded;
        }
      }
      fixes++;
    }
  }

  // Also push down arrows that point from detection boxes to convergence diamond
  // (they need to be longer now to span the gap)
  for (const arrow of els.filter(e => e.type === 'arrow')) {
    if (!arrow.startBinding || !arrow.endBinding) continue;
    const startEl = els.find(e => e.id === arrow.startBinding.elementId);
    const endEl = els.find(e => e.id === arrow.endBinding.elementId);
    if (!startEl || !endEl) continue;

    // If arrow connects a content rect to a diamond below it,
    // make sure the arrow endpoint Y matches the diamond
    if (endEl.type === 'diamond' && startEl.type === 'rectangle') {
      // Arrow points are relative, recalculate if diamond was pushed
      // Actually arrows auto-connect in Excalidraw, so just updating
      // the endpoint element position is enough. But we need to check
      // if the diamond needs to move down too.
    }
  }

  // If any annotations were pushed down, check if the convergence diamond
  // and elements below it also need to move down
  if (fixes > 0) {
    // Find the lowest annotation Y
    const annotationBottoms = calloutBgs.map(c => getBottom(c));
    const maxAnnotBottom = Math.max(...annotationBottoms, 0);

    // Push down any elements that are below the annotation zone but too close
    for (const el of els) {
      if (el.type === 'rectangle' && el.backgroundColor === '#fff9db') continue; // skip callouts
      if (el.type === 'text' && (el.groupIds || []).some(g =>
        calloutBgs.some(c => (c.groupIds || []).includes(g)))) continue; // skip grouped annotation text

      const elTop = el.y;
      // If this element is in the "below annotations" zone and overlapping
      if (elTop > maxAnnotBottom - 200 && elTop < maxAnnotBottom + 20) {
        // Check if any callout overlaps with it
        for (const callout of calloutBgs) {
          const hOverlap = Math.min(getRight(el), getRight(callout)) - Math.max(el.x, callout.x);
          const vOverlap = Math.min(getBottom(el), getBottom(callout)) - Math.max(el.y, callout.y);
          if (hOverlap > 0 && vOverlap > 0) {
            el.y = getBottom(callout) + 30;
          }
        }
      }
    }
  }

  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return { fixes };
}

const files = readdirSync(DIAGRAMS_DIR).filter(f => f.endsWith('.excalidraw'));
console.log(`Fixing overlaps (min gap: ${MIN_GAP}px)...\n`);

for (const file of files) {
  const result = processFile(join(DIAGRAMS_DIR, file));
  console.log(`${file}: ${result.fixes} callouts repositioned`);
}
console.log('\nDone.');
