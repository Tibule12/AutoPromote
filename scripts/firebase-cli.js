const fs = require('node:fs');
const path = require('node:path');

// Use this checkout's locked CLI. npx can resolve a different cached/global
// installation, hiding dependency failures that a clean CI install exposes.
function resolveFirebaseCli(root = path.resolve(__dirname, '..')) {
  const directory = path.join(root, 'node_modules', 'firebase-tools');
  const manifest = path.join(directory, 'package.json');
  if (!fs.existsSync(manifest)) {
    throw new Error('Repository firebase-tools is missing. Run npm ci --include=dev before emulator tests.');
  }
  const metadata = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const relative = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin?.firebase;
  const executable = relative && path.resolve(directory, relative);
  if (!executable || !executable.startsWith(directory + path.sep) || !fs.existsSync(executable)) {
    throw new Error('Repository firebase-tools has no runnable Firebase CLI. Reinstall with npm ci --include=dev.');
  }
  return executable;
}

function firebaseCliFailure(result) {
  const detail = result.error?.message || String(result.stderr || result.stdout || '').trim();
  return `Firebase CLI startup failed (exit ${result.status ?? 'unknown'})${detail ? `:\n${detail.slice(0, 6000)}` : '.'}`;
}

module.exports = { resolveFirebaseCli, firebaseCliFailure };
