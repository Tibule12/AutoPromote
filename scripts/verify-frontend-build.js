const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(__dirname, '..', 'frontend', 'build', 'index.html'),
  path.join(__dirname, '..', 'frontend', 'docs', 'index.html'),
];

const resolvedArtifact = candidates.find(candidate => fs.existsSync(candidate));

if (!resolvedArtifact) {
  console.error(
    `Frontend build missing. Checked: ${candidates.join(', ')}. Run 'npm --prefix frontend run build' and ensure it succeeds.`
  );
  process.exit(1);
}

console.log('Frontend build verified:', resolvedArtifact);
process.exit(0);
