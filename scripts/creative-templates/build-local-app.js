#!/usr/bin/env node
// Build the ordinary App for local QA, using the existing account configuration
// rather than the checked-in production placeholders. This does not deploy.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const settings = require('dotenv').parse(fs.readFileSync(path.join(root, 'frontend/.env.development')));
const account = Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith('REACT_APP_FIREBASE_')));
const build = path.join(root, 'reports/model-capability-runtime-v1-20261009/proof/launch-template/local-app');
const staged = `${build}.staging`;
// This workstation experienced origin-storage loss under disk pressure. Local
// review builds do not need multi-gigabyte persistent compiler caches. Keep
// production build configuration untouched and disable caches only in this
// process before invoking the ordinary react-scripts build.
const runner = `
  process.env.NODE_ENV = 'production';
  process.env.BABEL_ENV = 'production';
  const configPath = require.resolve('react-scripts/config/webpack.config');
  const makeConfig = require(configPath);
  require.cache[configPath].exports = (...args) => {
    const config = makeConfig(...args);
    config.cache = false;
    const visit = rule => {
      if (rule.options?.cacheDirectory) rule.options.cacheDirectory = false;
      (rule.oneOf || rule.rules || []).forEach(visit);
    };
    config.module.rules.forEach(visit);
    return config;
  };
  require('react-scripts/scripts/build');
`;
const result = spawnSync(process.execPath, ['-e', runner], { cwd: path.join(root, 'frontend'), stdio: 'inherit',
  env: { ...process.env, ...account, REACT_APP_API_URL: 'http://localhost:5119', CI: process.env.CI || 'false',
    GENERATE_SOURCEMAP: 'false', BUILD_PATH: staged } });
// Retain the previous build throughout compilation: cold-reopen QA must never
// encounter an index/chunk directory that react-scripts temporarily deleted.
if (result.status === 0) {
  const previous = `${build}.previous`;
  fs.rmSync(previous, { recursive: true, force: true });
  if (fs.existsSync(build)) fs.renameSync(build, previous);
  fs.renameSync(staged, build);
}
process.exit(result.status ?? 1);
