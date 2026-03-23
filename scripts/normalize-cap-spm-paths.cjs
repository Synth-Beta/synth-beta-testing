/**
 * Capacitor regenerates ios/App/CapApp-SPM/Package.swift on `cap sync`.
 * On Windows, local `path:` entries may use backslashes; SwiftPM expects `/`.
 * Run after `cap sync` so macOS / Xcode resolves Capacitor plugin packages.
 */
const fs = require('fs');
const path = require('path');

const pkgSwift = path.join(__dirname, '..', 'ios', 'App', 'CapApp-SPM', 'Package.swift');
if (!fs.existsSync(pkgSwift)) {
  process.exit(0);
}

let s = fs.readFileSync(pkgSwift, 'utf8');
const next = s.replace(/path:\s*"([^"]+)"/g, (m, p) => {
  if (!p.includes('\\')) return m;
  return `path: "${p.replace(/\\/g, '/')}"`;
});

if (next !== s) {
  fs.writeFileSync(pkgSwift, next, 'utf8');
  console.log('[normalize-cap-spm-paths] Rewrote Package.swift local paths to use forward slashes.');
}
