'use strict';
// Temporary, hash-checked mitigations while no patched npm release exists.
// node-forge: https://github.com/digitalbazaar/forge/pull/1152 (head ceba34402e329f0365134f23fe19898756527d65)
// braces: https://github.com/micromatch/braces/issues/70
// Keep vulnerable version numbers visible; this does not dismiss advisories.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const patches = [
  {
    "name": "node-forge",
    "version": "1.4.0",
    "file": "lib/rsa.js",
    "before": "obj.value.length !== 2) {",
    "after": "obj.value.length !== 2 ||\n            obj.value[0].value.length !==\n              (('parameters' in capture) ? 2 : 1)) {",
    "originalSha256": "fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50",
    "patchedSha256": "c9b1e3799e230528b6d6815c1f6cd3c6058b9d45975264b55d995abb976589af"
  },
  {
    "name": "braces",
    "version": "3.0.3",
    "file": "lib/parse.js",
    "before": "  const push = node => {",
    "after": "  const push = node => {\n    if (node.nodes && stack.length >= 100) throw new SyntaxError('Brace pattern exceeds security nesting limit');",
    "originalSha256": "e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310",
    "patchedSha256": "aeab362af68802103e461f50e00c1fcf4dd1b63fcdbca17e135d209b87a96832"
  },
  {
    "name": "braces",
    "version": "3.0.3",
    "file": "lib/compile.js",
    "before": "const compile = (ast, options = {}) => {",
    "after": "const compile = (ast, options = {}) => {\n  require('./security-depth')(ast);",
    "originalSha256": "dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f",
    "patchedSha256": "a1b277632609b0e83ae90edef29afce6f1633ab06c137de09f1e68092a64b316"
  },
  {
    "name": "braces",
    "version": "3.0.3",
    "file": "lib/expand.js",
    "before": "const expand = (ast, options = {}) => {",
    "after": "const expand = (ast, options = {}) => {\n  require('./security-depth')(ast);",
    "originalSha256": "41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7",
    "patchedSha256": "7f5dad59b68fdec42ad50e914bc6743fa701e2c468d56e60b9fe658039e32119"
  },
  {
    "name": "braces",
    "version": "3.0.3",
    "file": "lib/stringify.js",
    "before": "module.exports = (ast, options = {}) => {",
    "after": "module.exports = (ast, options = {}) => {\n  require('./security-depth')(ast);",
    "originalSha256": "379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a",
    "patchedSha256": "3311a8cdb1473e2e52560aac8d718504d69d40fed2724fc9debc2e5e80ff9897"
  }
];
const depthGuard = "'use strict';\n// GHSA-vfj7-8cjw-p6xm: bound recursive walkers, including direct AST callers.\nmodule.exports = function assertDepth(ast) {\n  const pending = [{ node: ast, depth: 0 }];\n  let visited = 0;\n  while (pending.length) {\n    const { node, depth } = pending.pop();\n    if (++visited > 50000 || depth > 100) throw new SyntaxError('Brace AST exceeds security nesting limit');\n    if (node && Array.isArray(node.nodes)) {\n      if (node.nodes.length > 50000) throw new SyntaxError('Brace AST exceeds security node limit');\n      for (const child of node.nodes) pending.push({ node: child, depth: depth + 1 });\n    }\n  }\n};\n";
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function writeAtomic(file, value) {
  const temporary = file + '.security-' + process.pid;
  fs.writeFileSync(temporary, value, { mode: fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o644 });
  fs.renameSync(temporary, file);
}
function applyDependencySecurityPatches(projectDir = process.cwd()) {
  const lockFile = path.join(projectDir, 'package-lock.json');
  if (!fs.existsSync(lockFile)) throw new Error('Dependency patching requires package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  let changed = 0;
  for (const [relative, metadata] of Object.entries(lock.packages || {})) {
    for (const patch of patches) {
      if (!relative.endsWith('node_modules/' + patch.name) || metadata.version !== patch.version) continue;
      const folder = path.resolve(projectDir, relative);
      if (!folder.startsWith(path.resolve(projectDir, 'node_modules') + path.sep)) throw new Error('Invalid dependency patch path');
      if (!fs.existsSync(path.join(folder, 'package.json'))) continue; // omitted dev dependency
      if (!fs.realpathSync(folder).startsWith(fs.realpathSync(path.join(projectDir, 'node_modules')) + path.sep)) throw new Error('Dependency patch escapes installation');
      const file = path.join(folder, patch.file);
      const source = fs.readFileSync(file, 'utf8'), digest = sha(source);
      if (digest !== patch.patchedSha256) {
        if (digest !== patch.originalSha256) throw new Error('Unrecognized dependency source: ' + patch.name + '/' + patch.file);
        const modified = source.replace(patch.before, patch.after);
        if (sha(modified) !== patch.patchedSha256) throw new Error('Dependency patch integrity failed');
        writeAtomic(file, modified); changed++;
      }
      if (patch.name === 'braces') {
        const guardFile = path.join(folder, 'lib/security-depth.js');
        if (fs.existsSync(guardFile) && sha(fs.readFileSync(guardFile)) !== sha(depthGuard)) throw new Error('Unrecognized brace security guard');
        if (!fs.existsSync(guardFile)) writeAtomic(guardFile, depthGuard);
      }
    }
  }
  return changed;
}
if (require.main === module) console.log('Applied dependency security patches:', applyDependencySecurityPatches());
module.exports = { applyDependencySecurityPatches };
