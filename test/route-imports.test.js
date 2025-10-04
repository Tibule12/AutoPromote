// Simple dynamic import test to ensure route modules resolve without missing dependencies.
const required = [
  './src/contentRoutes.js',
  './src/routes/monetizationRoutes.js',
  './src/routes/promotionTaskRoutes.js',
  './src/routes/metricsRoutes.js',
  './src/routes/adminSecurityRoutes.js'
];
let failures = 0;
for (const mod of required) {
  try {
    require(mod);
    console.log('OK import', mod);
  } catch (e) {
    failures++;
    console.error('FAIL import', mod, e.message);
  }
}
if (failures) {
  console.error(`Route import test failed with ${failures} failures.`);
  process.exit(1);
}
console.log('All route imports resolved.');
