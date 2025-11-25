const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

async function copyRecursive(src, dest) {
  const stat = await fsp.stat(src);
  if (stat.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src);
    for (const e of entries) {
      await copyRecursive(path.join(src, e), path.join(dest, e));
    }
  } else {
    // Ensure dest dir exists
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.copyFile(src, dest);
  }
}

async function main() {
  const functionsDir = __dirname; // autopromote-functions
  const repoRoot = path.resolve(functionsDir, '..');
  const sourceDir = path.join(repoRoot, 'src');
    const destPkgDir = path.join(functionsDir, '_server');

  try {
    // Create destination package dir
    await fsp.mkdir(destPkgDir, { recursive: true });
    // Copy package.json minimal
    const rootPkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(rootPkgPath)) {
      const rootPkg = JSON.parse(await fsp.readFile(rootPkgPath, 'utf8'));
      const destPkgJson = {
        name: rootPkg.name || 'autopromote-server',
        main: rootPkg.main || 'src/server.js',
        version: rootPkg.version || '1.0.0'
      };
      await fsp.writeFile(path.join(destPkgDir, 'package.json'), JSON.stringify(destPkgJson, null, 2), 'utf8');
    }
    // Copy src directory recursively
    if (fs.existsSync(sourceDir)) {
      await copyRecursive(sourceDir, path.join(destPkgDir, 'src'));
      console.log('[copy-server] Copied server src into functions/_server');
    } else {
      console.warn('[copy-server] No server src found at', sourceDir);
    }

    // Copy a few root-level files that src modules expect to import from project root
    // e.g., src/firebaseAdmin.js expects to require('../firebaseAdmin') which would
    // look for a file at functions/_server/firebaseAdmin.js
    const rootFilesToCopy = ['firebaseAdmin.js', 'firebaseClient.js', 'firebaseConfig.server.js'];
    for (const fname of rootFilesToCopy) {
      const srcPath = path.join(repoRoot, fname);
      const destPath = path.join(destPkgDir, fname);
      if (fs.existsSync(srcPath)) {
        await copyRecursive(srcPath, destPath);
        console.log(`[copy-server] Copied ${fname} into functions/_server`);
      }
    }
  } catch (err) {
    console.error('[copy-server] Error copying server package into functions:', err.message || err);
    process.exit(1);
  }

    // Copy the `lib` directory if present (some modules import from ../../lib/*)
    const libDir = path.join(repoRoot, 'lib');
    if (fs.existsSync(libDir)) {
      await copyRecursive(libDir, path.join(destPkgDir, 'lib'));
      console.log('[copy-server] Copied lib/ into functions/_server/lib');
    }
}

main();
