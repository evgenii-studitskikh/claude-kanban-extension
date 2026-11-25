// Builds a Chrome Web Store upload: release/claude-kanban-<version>.zip
// Usage: npm run package   (run `npm run build` first; the npm script does it)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (manifest.version !== pkg.version) {
  console.error(`Version mismatch: manifest ${manifest.version} vs package.json ${pkg.version}`);
  process.exit(1);
}
mkdirSync('release', { recursive: true });
const out = `release/claude-kanban-${manifest.version}.zip`;
rmSync(out, { force: true });
// manifest.json must be at the root of the zip, so zip from inside dist/.
execFileSync('zip', ['-r', '-X', `../${out}`, '.'], { cwd: 'dist', stdio: 'inherit' });
console.log(`Created ${out}`);
