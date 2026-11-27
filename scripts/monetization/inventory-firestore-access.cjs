// Static navigation inventory, never a runtime/billing attribution claim.
const fs = require('node:fs');
const path = require('node:path');
const roots = ['src', 'frontend/src', 'autopromote-functions', 'python_media_worker', 'scripts'];
const rows = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
    if (entry.name === '_server' || entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === '__pycache__') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {walk(file); continue;}
    if (!/\.(js|cjs|jsx|py)$/.test(file) || /(^|\/)(__tests__|test)(\/|$)|\.test\.|\.spec\./.test(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const collections = [...line.matchAll(/\.collection\(\s*['"]([A-Za-z0-9_-]+)['"]/g)].map(m=>m[1]);
      const kinds = ['onSnapshot', 'setInterval', 'cron.schedule', 'startVisiblePoller', 'startVisibleSubscription'].filter(k=>line.includes(k));
      // Do not retain raw source lines, identifiers, query values or credentials.
      if (collections.length || kinds.length) rows.push({file,line:i+1,collections,kinds});
    });
  }
}
roots.filter(fs.existsSync).forEach(walk);
fs.writeFileSync('reports/free-first-waste-20261126/firestore-access-inventory.json', JSON.stringify({
  scope:'Static literal collection/listener/timer navigation; dynamic collection names, helpers and non-JS/Python applications need separate inspection. Not measured traffic.',
  generatedFrom:roots,occurrences:rows.length,rows
},null,2)+'\n');
console.log(JSON.stringify({occurrences:rows.length,files:new Set(rows.map(r=>r.file)).size}));
