// Builds a portable Windows app (a folder with Advanced Tasker.exe) using
// @electron/packager — no installer, no code-signing helper, so it works without
// Windows Developer Mode. Run: node scripts/build-portable.mjs
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const stage = resolve(root, 'build/portable-app');

console.log('› Exporting web bundle…');
execSync('npm run export:web', { stdio: 'inherit' });

console.log('› Staging app…');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(resolve(root, 'electron/main.js'), resolve(stage, 'main.js'));
cpSync(resolve(root, 'dist'), resolve(stage, 'dist'), { recursive: true });
// A self-contained package.json so packager uses main.js as the entry.
writeFileSync(
  resolve(stage, 'package.json'),
  JSON.stringify(
    { name: 'advanced-tasker', productName: 'Advanced Tasker', version: '1.0.0', main: 'main.js' },
    null,
    2,
  ) + '\n',
);
const hasIcon = existsSync(resolve(root, 'build/icon.ico'));
if (hasIcon) cpSync(resolve(root, 'build/icon.ico'), resolve(stage, 'icon.ico'));

console.log('› Packaging…');
const iconArg = hasIcon ? ` --icon="${resolve(stage, 'icon.ico')}"` : '';
execSync(
  `npx electron-packager "${stage}" "Advanced Tasker" --platform=win32 --arch=x64 ` +
    `--out=release --overwrite${iconArg}`,
  { stdio: 'inherit' },
);

console.log('\n✓ Portable app: release/Advanced Tasker-win32-x64/Advanced Tasker.exe');
console.log('  (copy that folder anywhere and double-click the .exe — no install needed)');
