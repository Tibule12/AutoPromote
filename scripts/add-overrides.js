const fs = require('fs');
const fp = 'package.json';
const pkg = JSON.parse(fs.readFileSync(fp, 'utf8'));
pkg.overrides = pkg.overrides || {};
pkg.overrides['@grpc/grpc-js'] = '1.14.0';
fs.writeFileSync(fp, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('Added overrides for @grpc/grpc-js:1.14.0');
