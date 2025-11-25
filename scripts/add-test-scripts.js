const fs = require('fs');
const fp = 'package.json';
let s = fs.readFileSync(fp, 'utf8');
let pkg = JSON.parse(s);
if (!pkg.scripts) pkg.scripts = {};
const addedScripts = [];
if (!pkg.scripts['test:unit']) { pkg.scripts['test:unit'] = 'node test/basic-sanity.js'; addedScripts.push('test:unit'); }
if (!pkg.scripts['test:routes']) { pkg.scripts['test:routes'] = 'node test/route-imports.test.js'; addedScripts.push('test:routes'); }
if (!pkg.scripts['test']) { pkg.scripts['test'] = 'npm run test:unit'; addedScripts.push('test'); }
fs.writeFileSync(fp, JSON.stringify(pkg, null, 2) + '\n');
console.log('Updated package.json - added scripts:', addedScripts.join(', '));
