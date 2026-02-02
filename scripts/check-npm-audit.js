#!/usr/bin/env node
// scripts/check-npm-audit.js
// Run a safe `npm audit fix`, then fail install if any high/critical
// vulnerabilities remain. Intended to be invoked from `prepare` or
// `postinstall` so `npm install` surfaces unresolved high/critical issues.

const { execSync } = require('child_process');

function runAuditJson(cwd = process.cwd()) {
  try {
    const out = execSync('npm audit --json', { cwd, encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    // npm audit may exit non-zero; attempt to parse stdout if available
    try {
      return JSON.parse(e.stdout || e.message || '{}');
    } catch (e2) {
      console.error('[check-npm-audit] failed to parse audit output', e && e.message);
      return null;
    }
  }
}

function hasHighOrCritical(auditJson) {
  if (!auditJson || !auditJson.metadata || !auditJson.metadata.vulnerabilities) return false;
  const { vulnerabilities } = auditJson.metadata;
  return (vulnerabilities.high || 0) > 0 || (vulnerabilities.critical || 0) > 0;
}

(async () => {
  console.log('[check-npm-audit] running initial `npm audit`...');
  let audit = runAuditJson();
  if (!audit) {
    console.warn('[check-npm-audit] unable to inspect vulnerabilities (audit returned no JSON). Continuing.');
    return process.exit(0);
  }

  const totalVulns = Object.values(audit.metadata?.vulnerabilities || {}).reduce((a, b) => a + b, 0);
  if (totalVulns === 0) {
    console.log('[check-npm-audit] no vulnerabilities found. ✅');
    return process.exit(0);
  }

  console.log(`[check-npm-audit] found vulnerabilities: ${JSON.stringify(audit.metadata.vulnerabilities)}`);
  console.log('[check-npm-audit] attempting `npm audit fix` (safe fixes only)...');
  try {
    execSync('npm audit fix', { stdio: 'inherit' });
  } catch (e) {
    console.warn('[check-npm-audit] `npm audit fix` failed or made no changes.');
  }

  console.log('[check-npm-audit] re-running `npm audit` to verify remaining issues...');
  audit = runAuditJson();
  if (!audit) {
    console.warn('[check-npm-audit] unable to re-inspect vulnerabilities; please run `npm audit` locally.');
    return process.exit(0);
  }

  if (hasHighOrCritical(audit)) {
    console.error('[check-npm-audit] High or Critical vulnerabilities remain after `npm audit fix`.');
    console.error('[check-npm-audit] Remaining counts:', audit.metadata.vulnerabilities);
    console.error('[check-npm-audit] Please inspect `npm audit` output and apply upgrades/overrides as appropriate.');
    console.error('[check-npm-audit] If you are intentionally keeping a dependency, add a documented `overrides` entry in package.json or fix upstream.');
    process.exit(1);
  }

  console.log('[check-npm-audit] Vulnerabilities resolved (or reduced to low/moderate).');
  process.exit(0);
})();
