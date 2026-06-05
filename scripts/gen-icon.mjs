// Generates the app icon (build/icon.png + build/icon.ico) from an inline SVG.
// Run: node scripts/gen-icon.mjs   (needs devDeps: sharp, png-to-ico)
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// An outline (a task with two indented subtasks; the last one done) on the app's
// indigo→blue gradient, with the green "done" accent from the status palette.
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="url(#g)"/>
  <!-- row 1: top-level task -->
  <circle cx="300" cy="356" r="30" fill="#ffffff"/>
  <rect x="362" y="328" width="372" height="56" rx="28" fill="#ffffff"/>
  <!-- row 2: indented subtask -->
  <circle cx="388" cy="518" r="26" fill="#ffffff" opacity="0.85"/>
  <rect x="446" y="492" width="288" height="52" rx="26" fill="#ffffff" opacity="0.85"/>
  <!-- row 3: indented, done -->
  <circle cx="388" cy="682" r="36" fill="#22c55e"/>
  <path d="M370 682 l12 13 l23 -27" fill="none" stroke="#ffffff" stroke-width="10"
        stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="446" y="656" width="288" height="52" rx="26" fill="#ffffff" opacity="0.6"/>
</svg>`;

const out = resolve(process.cwd(), 'build');
mkdirSync(out, { recursive: true });

const render = (size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

// Master PNG (electron-builder converts this for the installer).
writeFileSync(resolve(out, 'icon.png'), await render(1024));

// Multi-resolution ICO (used by the portable packager / window).
const pngs = await Promise.all([256, 128, 64, 48, 32, 16].map(render));
writeFileSync(resolve(out, 'icon.ico'), await pngToIco(pngs));

console.log('Wrote build/icon.png and build/icon.ico');
