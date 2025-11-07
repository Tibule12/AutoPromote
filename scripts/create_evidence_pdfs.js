const fs = require('fs');
const path = require('path');

const userProfile = process.env.USERPROFILE || 'C:\\Users\\asus';
const downloads = path.join(userProfile, 'Downloads');
const repoEvidence = path.join(__dirname, '..', 'evidence');

const files = [
  'firestore.rules',
  'firestore_init_snippet.txt',
  'token_handling_snippet.txt',
  'env_example.txt',
  'README.txt'
];

function escapeTextForPdf(s) {
  if (!s) return '';
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdfBuffer(text) {
  // Paginate content: calculate lines per page and create multiple page objects.
  const header = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
  const obj = (id, body) => `${id} 0 obj\n${body}\nendobj\n`;
  const obj1 = '<< /Type /Catalog /Pages 2 0 R >>';
  const obj4 = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

  // Wrap long lines to avoid horizontal clipping in the generated PDF.
  const maxCharsPerLine = 95; // approx characters per line for 12pt Helvetica and page margins
  function wrapTextToLines(src, maxChars) {
    const out = [];
    src.split(/\r?\n/).forEach(par => {
      if (!par || par.trim().length === 0) { out.push(''); return; }
      // Split by words but keep whitespace tokens so we preserve spacing when building lines
      const tokens = par.split(/(\s+)/);
      let cur = '';
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if ((cur + tok).length > maxChars) {
          if (cur.trim().length) out.push(cur.trimEnd());
          // If single token too long, hard-break it
          if (tok.length > maxChars) {
            let s = tok;
            while (s.length > maxChars) {
              out.push(s.slice(0, maxChars));
              s = s.slice(maxChars);
            }
            cur = s;
          } else {
            cur = tok;
          }
        } else {
          cur += tok;
        }
      }
      if (cur.trim().length) out.push(cur.trimEnd());
    });
    return out;
  }
  const lines = wrapTextToLines(text, maxCharsPerLine).map(l => escapeTextForPdf(l));
  const lineHeight = 14; // PDF text line height
  const topY = 740;
  const bottomY = 40;
  const usableHeight = topY - bottomY;
  const linesPerPage = Math.floor(usableHeight / lineHeight);

  // Build content streams and page objects for each page
  const contents = [];
  const pages = [];
  for (let p = 0; p * linesPerPage < lines.length; p++) {
    const start = p * linesPerPage;
    const end = Math.min(lines.length, start + linesPerPage);
    const pageLines = lines.slice(start, end);
    let contentStream = 'BT /F1 12 Tf 50 ' + topY + ' Td ';
    for (let i = 0; i < pageLines.length; i++) {
      const line = pageLines[i];
      if (i === 0) {
        contentStream += `(${line}) Tj`;
      } else {
        contentStream += ` 0 -${lineHeight} Td (${line}) Tj`;
      }
    }
    contentStream += ' ET';
    const contentLength = Buffer.byteLength(contentStream, 'utf8');
    contents.push({ stream: contentStream, len: contentLength });
  }

  // Build objects: catalog (1), pages (2), font (4), content objects (5..)
  const objects = [];
  objects.push(obj(1, obj1));

  // Placeholder for pages object - we'll fill Kids and Count later
  const pagesObjIndex = objects.length + 1; // will be 2
  objects.push('@@PAGES_PLACEHOLDER@@');

  // Font object id we'll set to 4 (consistent with earlier script)
  const fontObjId = objects.length + 1; // will be 4
  objects.push(obj(fontObjId, obj4));

  // Content objects start here
  const contentObjStartId = objects.length + 1;
  for (let i = 0; i < contents.length; i++) {
    const c = contents[i];
    const body = `<< /Length ${c.len} >>\nstream\n${c.stream}\nendstream`;
    objects.push(obj(contentObjStartId + i, body));
  }

  // Page objects (each references corresponding content object)
  const firstPageObjId = objects.length + 1;
  const pageObjs = [];
  for (let i = 0; i < contents.length; i++) {
    const contentId = contentObjStartId + i;
    const pageBody = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageObjs.push(pageBody);
    objects.push(obj(firstPageObjId + i, pageBody));
  }

  // Now replace pages placeholder with actual Pages object (Kids and Count)
  const kidsArray = pageObjs.map((_, idx) => `${firstPageObjId + idx} 0 R`).join(' ');
  const pagesObj = `<< /Type /Pages /Kids [ ${kidsArray} ] /Count ${pageObjs.length} >>`;
  objects[pagesObjIndex - 1] = obj(2, pagesObj);

  // Assemble PDF with xref
  let offset = Buffer.byteLength(header, 'utf8');
  const offsets = [0];
  const parts = [Buffer.from(header, 'utf8')];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    const buf = Buffer.from(objects[i], 'utf8');
    parts.push(buf);
    offset += buf.length;
  }
  const xrefStart = offset;
  let xref = 'xref\n0 ' + (objects.length + 1) + '\n';
  xref += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    xref += `${offStr} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'utf8'));
  parts.push(Buffer.from(trailer, 'utf8'));
  const outBuf = Buffer.concat(parts);
  return outBuf;
}

(async function(){
  try {
    for (const f of files) {
      const p = path.join(repoEvidence, f);
      if (!fs.existsSync(p)) {
        console.log('Skipping, not found:', p);
        continue;
      }
      const text = fs.readFileSync(p, 'utf8');
      const pdfBuf = buildPdfBuffer(text);
      const base = path.basename(f, path.extname(f));
      const outName = `evidence_${base}.pdf`;
      const outPath = path.join(downloads, outName);
      fs.writeFileSync(outPath, pdfBuf);
      console.log('Wrote PDF:', outPath);
    }
    console.log('All done.');
  } catch (e) {
    console.error('Failed to create PDFs:', e.message);
    process.exit(1);
  }
})();
