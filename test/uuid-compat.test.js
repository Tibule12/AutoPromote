// Test for lib/uuid-compat.js
const { v4 } = require('../lib/uuid-compat');

function assert(cond, msg){ if(!cond){ console.error('FAIL:', msg); process.exit(1);} }

const id = v4();
console.log('Generated ID:', id);
assert(typeof id === 'string', 'v4 should return a string');
assert(id.length >= 8, 'uuid seems too short');
// simple format check for a UUID (hex and dashes) — not exhaustive
assert(/[0-9a-fA-F]/.test(id), 'uuid contains hex digits');
console.log('uuid-compat smoke test OK');
