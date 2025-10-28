const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const workspaceRoot = path.resolve(__dirname, '..', '..');
const evidenceDir = path.join(workspaceRoot, 'evidence');
const outDir = path.join(evidenceDir, 'highlighted_pdfs');
ensureDir(outDir);

const filesToProcess = [
  {
    src: path.join(evidenceDir, 'dependency-scan-report.txt'),
    out: path.join(outDir, 'dependency-scan-report.pdf'),
    highlights: [/vulnerab/i, /high/i, /moderate/i, /critical/i, /generated/i, /\d{4}-\d{2}-\d{2}/]
  },
  {
    src: path.join(evidenceDir, 'dependency-vulns.csv'),
    out: path.join(outDir, 'dependency-vulns.pdf'),
    highlights: [/high/i, /critical/i, /severity/i, /vulnerability/i]
  },
  {
    src: path.join(evidenceDir, 'automated-alert.md'),
    out: path.join(outDir, 'automated-alert.pdf'),
    highlights: [/alert/i, /ticket/i, /assigned/i, /timestamp|date|time/i, /created/i]
  },
  {
    src: path.join(evidenceDir, 'sample-admin-audit-log.csv'),
    out: path.join(outDir, 'sample-admin-audit-log.pdf'),
    highlights: [/admin|administrator|login|failed|suspend|role/i, /\d{4}-\d{2}-\d{2}/]
  },
  {
    src: path.join(evidenceDir, 'sample-admin-audit-log.csv'),
    out: path.join(outDir, 'admin-logs-attributes.pdf'),
    highlights: [/timestamp|event_type|actor|admin_id|action|role|source/i]
  },
  {
    src: path.join(workspaceRoot, 'docs', 'security-event-investigation-policy.md'),
    out: path.join(outDir, 'security-event-investigation-policy.pdf'),
    highlights: [/Triage|Containment|Evidence collection|Escalation|Remediation/i]
  },
  {
    src: path.join(workspaceRoot, 'docs', 'audit-logs-collection-review-policy.md'),
    out: path.join(outDir, 'audit-logs-collection-review-policy.pdf'),
    highlights: [/weekly|7 days|Review frequency|What we log|Retention|Escalation/i]
  },
  {
    src: path.join(workspaceRoot, 'docs', 'code-backend-updates-policy.md'),
    out: path.join(outDir, 'code-backend-updates-policy.pdf'),
    highlights: [/patch|dependency|update|scan|vulnerab/i]
  },
  {
    src: path.join(workspaceRoot, 'docs', 'mfa-account-protection-policy.md'),
    out: path.join(outDir, 'mfa-account-protection-policy.pdf'),
    highlights: [/MFA|multi-factor|two-factor|hardware key|YubiKey|TOTP|enforce|enforcement/i]
  },
  {
    src: path.join(workspaceRoot, 'docs', 'vulnerability-testing-policy.md'),
    out: path.join(outDir, 'vulnerability-testing-policy.pdf'),
    highlights: [/scan|penetration|SCA|SAST|remediation|critical|high|ticket/i]
  },
  {
    src: path.join(workspaceRoot, 'docs', 'no-platform-data-on-personal-devices-policy.md'),
    out: path.join(outDir, 'no-platform-data-on-personal-devices-policy.pdf'),
    highlights: [/personal device|no platform data|DLP|access log|export/i]
  },
  {
    src: path.join(workspaceRoot, 'docs', 'encryption-at-rest-evidence.md'),
    out: path.join(outDir, 'encryption-at-rest-evidence.pdf'),
    highlights: [/encryption at rest|CMK|customer-managed key|encrypted/i]
  },
  {
    src: path.join(workspaceRoot, 'docs', 'facebook-evidence-cover.md'),
    out: path.join(outDir, 'facebook-evidence-cover.pdf'),
    highlights: [/evidence|open|dependency-scan|vulnerab/i]
  }
];

function lineMatches(line, patterns) {
  return patterns.some((r) => r.test(line));
}

function renderFileToPdf(item) {
  if (!fs.existsSync(item.src)) {
    console.warn('Skipping missing file:', item.src);
    return;
  }

  const content = fs.readFileSync(item.src, 'utf8').replace(/\r\n/g, '\n');
  const lines = content.split('\n');

  ensureDir(path.dirname(item.out));
  const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: false });
  const outStream = fs.createWriteStream(item.out);
  doc.pipe(outStream);

  const fontSize = 10;
  const lineHeight = 14;
  const pageWidth = 595.28 - 100; // A4 width in points minus margins

  doc.addPage();
  doc.fontSize(14).text(path.basename(item.src), { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(fontSize);

  let y = doc.y;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const matches = lineMatches(line, item.highlights);

    // handle page break
    if (y + lineHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.y;
    }

    if (matches) {
      // draw highlight rectangle behind text
      const x = doc.page.margins.left;
      const textWidth = Math.min(doc.widthOfString(line) + 4, pageWidth);
      doc.rect(x - 2, y - 2, textWidth + 4, lineHeight).fillOpacity(0.35).fill('#fff176');
      doc.fillOpacity(1);
      doc.fillColor('#000000');
      doc.text(line, { continued: false, paragraphGap: 0, lineGap: 0 });
    } else {
      doc.fillColor('#000000');
      doc.text(line, { continued: false, paragraphGap: 0, lineGap: 0 });
    }

    y = doc.y;
  }

  doc.end();
  outStream.on('finish', () => {
    console.log('Wrote PDF:', item.out);
  });
}

for (const f of filesToProcess) {
  try {
    renderFileToPdf(f);
  } catch (err) {
    console.error('Failed to render', f.src, err.message);
  }
}

console.log('PDF generation requested. Check', outDir);
