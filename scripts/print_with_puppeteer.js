const fs = require('fs');
const path = require('path');
const os = require('os');

async function ensurePuppeteer() {
  try {
    return require('puppeteer');
  } catch (e) {
    console.error('Puppeteer not installed. Please run `npm install puppeteer` in the repo root and re-run this script.');
    process.exit(2);
  }
}

async function renderFile(puppeteer, srcRelative, outName) {
  const cwd = path.resolve(__dirname, '..');
  const srcPath = path.join(cwd, srcRelative);
  if (!fs.existsSync(srcPath)) {
    console.warn('Missing source file, skipping:', srcPath);
    return null;
  }
  const content = fs.readFileSync(srcPath, 'utf8');
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${outName}</title></head><body><pre style="white-space:pre-wrap;word-wrap:break-word;">${escaped}</pre></body></html>`;

  const tmpDir = path.join(os.tmpdir(), 'puppeteer_profile_' + Date.now());
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'], userDataDir: tmpDir });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const downloads = path.join(os.homedir(), 'Downloads');
  if (!fs.existsSync(downloads)) { fs.mkdirSync(downloads, { recursive: true }); }
  const outPath = path.join(downloads, `pdf_${outName}_${Date.now()}.pdf`);
  await page.pdf({ path: outPath, format: 'A4', printBackground: true });
  await browser.close();
  return outPath;
}

(async () => {
  const puppeteer = await ensurePuppeteer();
  const jobs = [
    { src: 'evidence/dependency-scan-report.txt', name: 'dependency_scan_report' },
    { src: 'evidence/npm-audit.json', name: 'npm_audit' },
    { src: 'evidence/snyk_test_.json', name: 'snyk_test' },
    { src: 'evidence/snyk_monitor_.json', name: 'snyk_monitor' }
  ];

  // Include Semgrep SAST reports if present
  jobs.push({ src: 'evidence/semgrep_report_20251101112958.json', name: 'semgrep_report_20251101112958' });
  jobs.push({ src: 'evidence/semgrep_report.json', name: 'semgrep_report' });
  for (const j of jobs) {
    try {
      const out = await renderFile(puppeteer, j.src, j.name);
      if (out) console.log('Wrote PDF:', out);
    } catch (err) {
      console.error('Error rendering', j.src, err && err.message ? err.message : err);
    }
  }
  console.log('Done');
})();
