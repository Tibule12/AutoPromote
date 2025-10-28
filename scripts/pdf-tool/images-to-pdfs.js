const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const workspaceRoot = path.resolve(__dirname, '..', '..');
const imagesDir = path.join(workspaceRoot, 'facebook_app_review');
const outDir = path.join(workspaceRoot, 'evidence', 'highlighted_pdfs');
ensureDir(outDir);

const exts = ['.png', '.jpg', '.jpeg'];

const files = fs.readdirSync(imagesDir).filter(f => exts.includes(path.extname(f).toLowerCase()));
if (files.length === 0) {
  console.log('No image files found in', imagesDir);
  process.exit(0);
}

files.forEach(file => {
  const src = path.join(imagesDir, file);
  const base = path.parse(file).name;
  const out = path.join(outDir, base + '.pdf');

  const doc = new PDFDocument({ autoFirstPage: false });
  const outStream = fs.createWriteStream(out);
  doc.pipe(outStream);

  // Add a single page and fit the image within margins
  const pageOpts = { size: 'A4', margin: 36 };
  doc.addPage(pageOpts);

  try {
    const imgBounds = doc.openImage(src);
    const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const maxHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

    // Fit preserving aspect ratio
    let fitWidth = imgBounds.width;
    let fitHeight = imgBounds.height;
    const widthRatio = maxWidth / fitWidth;
    const heightRatio = maxHeight / fitHeight;
    const ratio = Math.min(widthRatio, heightRatio, 1);
    fitWidth = Math.floor(fitWidth * ratio);
    fitHeight = Math.floor(fitHeight * ratio);

    const x = doc.page.margins.left + Math.floor((maxWidth - fitWidth) / 2);
    const y = doc.page.margins.top + Math.floor((maxHeight - fitHeight) / 2);

    doc.image(src, x, y, { width: fitWidth, height: fitHeight });
  } catch (err) {
    // If image can't be opened by PDFKit (rare), write a note instead
    doc.fontSize(12).fillColor('red').text('Failed to embed image: ' + file, { align: 'left' });
  }

  doc.end();
  outStream.on('finish', () => console.log('Wrote image PDF:', out));
});

console.log('Image->PDF conversion requested. Check', outDir);
