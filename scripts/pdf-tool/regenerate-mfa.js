const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const mdPath = path.join(repoRoot, 'docs', 'mfa-account-protection-policy.md');
if (!fs.existsSync(mdPath)) {
  console.error('Source markdown not found:', mdPath);
  process.exit(1);
}
const md = fs.readFileSync(mdPath, 'utf8');

const outDir = path.join(repoRoot, 'evidence', 'highlighted_pdfs');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'mfa-account-protection-policy-regenerated.pdf');

const doc = new PDFDocument({ autoFirstPage: true });
const outStream = fs.createWriteStream(outPath);
doc.pipe(outStream);

// One-line cover note for reviewers
doc.fontSize(12).fillColor('black').text('Cover note: Evidence for MFA / Account Protection — highlights policy and references to implementation screenshots.', { align: 'left' });
doc.moveDown();

// Add the markdown content as plain text (simple rendering)
doc.fontSize(10).fillColor('black');
const lines = md.split(/\r?\n/);
for (const line of lines) {
  doc.text(line);
}

doc.end();

outStream.on('finish', () => {
  console.log('Wrote regenerated PDF:', outPath);

  // Copy to Downloads evidence folder and Downloads root
  const downloadsRoot = path.join('C:', 'Users', 'asus', 'Downloads');
  const uploadFolder = path.join(downloadsRoot, 'AutoPromote_Facebook_Evidence');
  if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder, { recursive: true });

  const destInUploads = path.join(uploadFolder, 'mfa-account-protection-policy.pdf');
  const destInDownloads = path.join(downloadsRoot, 'mfa-account-protection-policy.pdf');
  try {
    fs.copyFileSync(outPath, destInUploads);
    fs.copyFileSync(outPath, destInDownloads);
    console.log('Copied regenerated PDF to:', destInUploads);
    console.log('Also copied to:', destInDownloads);
  } catch (err) {
    console.error('Error copying regenerated PDF:', err.message);
    process.exit(1);
  }
});
