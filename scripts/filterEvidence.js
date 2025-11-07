#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Usage: node scripts/filterEvidence.js [evidenceFile]
// If no file is provided, it will pick the most recent file matching evidence/*_evidence_*.json

function findLatestEvidence(){
  const dir = path.join(__dirname, '..', 'evidence');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => /_evidence_.*\.json$/.test(f)).map(f=>({f, t: fs.statSync(path.join(dir,f)).mtime.getTime()}));
  if (!files.length) return null;
  files.sort((a,b)=>b.t-a.t);
  return path.join(dir, files[0].f);
}

const arg = process.argv[2];
const file = arg || findLatestEvidence();
if (!file) {
  console.error('No evidence file found in evidence/ and no file argument provided. Run the export script first.');
  process.exit(2);
}

try {
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  console.log('Loaded', data.length, 'entries from', file);
  const adminMatches = data.filter(e => {
    const s = JSON.stringify(e).toLowerCase();
    return s.includes('admin') || (e.type && /admin/i.test(e.type)) || (e.eventType && /admin/i.test(e.eventType)) || (e.action && /admin/i.test(e.action));
  });
  if (adminMatches.length === 0) {
    console.log('\nNo admin-related events found in this export.');
    console.log('Tips: perform an admin action (login or change a setting) and re-run the export.');
    process.exit(0);
  }
  console.log('\nFound', adminMatches.length, 'admin-related entries. Showing up to 20:');
  adminMatches.slice(0,20).forEach((e,i)=>{
    const id = e.id || e._id || '(no-id)';
    const t = e.at || e.timestamp || e.createdAt || '(no-timestamp)';
    const type = e.type || e.eventType || e.action || '(no-type)';
    console.log(`\n[${i+1}] id=${id}\n  type=${type}\n  timestamp=${t}\n  sample=${JSON.stringify(e, null, 2).slice(0,250)}${JSON.stringify(e, null, 2).length>250? '...':''}`);
  });
} catch (err) {
  console.error('Failed to read or parse', file, err && err.message ? err.message : err);
  process.exit(1);
}
