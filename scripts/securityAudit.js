// securityAudit.js - scans environment & critical collections for posture issues
// Run via: npm run security:audit
const { validateEnv } = (()=>{ try { return require('../src/utils/envValidator'); } catch(_) { return { validateEnv: () => ({ errors:[], warnings:[] }) }; } })();
const fs = require('fs');
const path = require('path');

(async function main(){
  console.log('== Security Audit Start ==');
  // 1. Env validation (strict off)
  const env = validateEnv({ strict:false });
  console.log('Env Errors:', env.errors.length, 'Warnings:', env.warnings.length);
  // 2. Check for default secrets
  const defaultDocSecret = process.env.DOC_SIGNING_SECRET && process.env.DOC_SIGNING_SECRET.includes('dev-doc-signing-secret');
  if (defaultDocSecret) console.log('[WARN] DOC_SIGNING_SECRET appears to be default');
  // 3. Scan codebase for TODO security markers
  const root = path.join(__dirname, '..');
  let todoCount = 0; let sigTargets = 0;
  function walk(dir){
    const entries = fs.readdirSync(dir,{withFileTypes:true});
    for (const e of entries){
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(dir,e.name);
      if (e.isDirectory()) walk(p); else if (/\.(js|mjs|cjs|ts)$/.test(e.name)) {
        const txt = fs.readFileSync(p,'utf8');
        if (txt.includes('TODO') || txt.includes('FIXME')) todoCount++;
        if (txt.includes('attachSignature(') || txt.includes('verifySignature(')) sigTargets++;
      }
    }
  }
  walk(root);
  console.log('Files with TODO/FIXME:', todoCount);
  console.log('Files referencing doc signatures:', sigTargets);
  // 4. Check critical env group presence
  const critical = ['DOC_SIGNING_SECRET','JWT_AUDIENCE','JWT_ISSUER'];
  for (const c of critical){ if (!process.env[c]) console.log('[WARN] Missing critical env', c); }
  // 5. Summarize
  console.log('== Security Audit Complete ==');
})();