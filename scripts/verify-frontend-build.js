const fs = require('fs');
const path = require('path');

const frontIndex = path.join(__dirname, '..', 'frontend', 'build', 'index.html');

if (!fs.existsSync(frontIndex)) {
  console.error(`Frontend build missing at ${frontIndex}. Run 'npm --prefix frontend run build' and ensure it succeeds.`);
  process.exit(1);
}

console.log('Frontend build verified:', frontIndex);
process.exit(0);
