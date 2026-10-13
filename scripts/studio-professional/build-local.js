#!/usr/bin/env node
// Ordinary authenticated App; isolated build, no production deployment.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const settings = require('dotenv').parse(fs.readFileSync(path.join(root, 'frontend/.env.development')));
const account = Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith('REACT_APP_FIREBASE_')));
const build = path.join(root, 'reports/studio-professional-editing-20261013/proof/local-app');
const runner = `
  process.env.NODE_ENV = 'production'; process.env.BABEL_ENV = 'production';
  const p = require.resolve('react-scripts/config/webpack.config'); const make = require(p);
  require.cache[p].exports = (...args) => {
    const config = make(...args); config.cache = false;
    const visit = rule => { if (rule.options?.cacheDirectory) rule.options.cacheDirectory = false;
      (rule.oneOf || rule.rules || []).forEach(visit); };
    config.module.rules.forEach(visit); return config;
  };
  require('react-scripts/scripts/build');
`;
const result = spawnSync(process.execPath, ['-e', runner], { cwd: path.join(root, 'frontend'), stdio: 'inherit',
  env: { ...process.env, ...account, REACT_APP_API_URL: 'http://localhost:5120',
    REACT_APP_ENABLE_E2E_BYPASS: 'false', CI: 'true', GENERATE_SOURCEMAP: 'false', BUILD_PATH: `${build}.staging` } });
if (result.status === 0) {
  fs.rmSync(`${build}.previous`, { recursive: true, force: true });
  if (fs.existsSync(build)) fs.renameSync(build, `${build}.previous`);
  fs.renameSync(`${build}.staging`, build);
}
process.exit(result.status ?? 1);
