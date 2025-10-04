// Simple dynamic import test to ensure route modules resolve without missing dependencies.
const path = require('path');
const required = [
  'src/contentRoutes.js',
  'src/routes/monetizationRoutes.js',
  'src/routes/promotionTaskRoutes.js',
  'src/routes/metricsRoutes.js',
  'src/routes/adminSecurityRoutes.js'
];
let failures = 0;
for (const rel of required) {
  const abs = path.join(process.cwd(), rel);
  try {
    require(abs);
    console.log('OK import', rel);
  } catch (e) {
    failures++;
    console.error('FAIL import', rel, e.message);
  }
}
if (failures) {
  console.error(`Route import test failed with ${failures} failures.`);
  process.exit(1);
}
console.log('All route imports resolved.');
