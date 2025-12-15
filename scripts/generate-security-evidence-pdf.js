#!/usr/bin/env node
/**
 * Generate a single consolidated Security Evidence PDF and save to user's Downloads.
 * Contents:
 *  - Header + generation timestamp
 *  - Latest security alerts JSON summary (alert types, counts)
 *  - Detailed alert JSON (pretty printed)
 *  - Excerpt of triggering access log lines (filtered to suspicious events)
 *  - Environment / process notes (how alerts are generated, optional Slack integration)
 *
 * PDF builder logic adapted from create_evidence_pdfs.js (simple text to PDF construction).
 */
const fs = require("fs");
const path = require("path");

function findLatest(pattern, dir) {
  try {
    const files = fs.readdirSync(dir).filter(f => pattern.test(f));
    if (!files.length) return null;
    const withTime = files
      .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    return path.join(dir, withTime[0].f);
  } catch (e) {
    return null;
  }
}

function escapeTextForPdf(s) {
  if (!s) return "";
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapTextToLines(src, maxChars) {
  const out = [];
  src.split(/\r?\n/).forEach(par => {
    if (!par || par.trim().length === 0) {
      out.push("");
      return;
    }
    const tokens = par.split(/(\s+)/);
    let cur = "";
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if ((cur + tok).length > maxChars) {
        if (cur.trim().length) out.push(cur.trimEnd());
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

function buildPdfBuffer(text) {
  const header = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";
  const obj = (id, body) => `${id} 0 obj\n${body}\nendobj\n`;
  const obj1 = "<< /Type /Catalog /Pages 2 0 R >>";
  const obj4 = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  const maxCharsPerLine = 95;
  const lines = wrapTextToLines(text, maxCharsPerLine).map(l => escapeTextForPdf(l));
  const lineHeight = 14;
  const topY = 740;
  const bottomY = 40;
  const usableHeight = topY - bottomY;
  const linesPerPage = Math.floor(usableHeight / lineHeight);
  const contents = [];
  for (let p = 0; p * linesPerPage < lines.length; p++) {
    const start = p * linesPerPage;
    const end = Math.min(lines.length, start + linesPerPage);
    const pageLines = lines.slice(start, end);
    let contentStream = "BT /F1 12 Tf 50 " + topY + " Td ";
    for (let i = 0; i < pageLines.length; i++) {
      const line = pageLines[i];
      if (i === 0) contentStream += `(${line}) Tj`;
      else contentStream += ` 0 -${lineHeight} Td (${line}) Tj`;
    }
    contentStream += " ET";
    const contentLength = Buffer.byteLength(contentStream, "utf8");
    contents.push({ stream: contentStream, len: contentLength });
  }
  const objects = [];
  objects.push(obj(1, obj1));
  objects.push("@@PAGES_PLACEHOLDER@@");
  const fontObjId = 4; // keep stable
  objects.push(obj(fontObjId, obj4));
  const contentObjStartId = objects.length + 1;
  for (let i = 0; i < contents.length; i++) {
    const c = contents[i];
    const body = `<< /Length ${c.len} >>\nstream\n${c.stream}\nendstream`;
    objects.push(obj(contentObjStartId + i, body));
  }
  const firstPageObjId = objects.length + 1;
  const pageObjs = [];
  for (let i = 0; i < contents.length; i++) {
    const contentId = contentObjStartId + i;
    const pageBody = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageObjs.push(pageBody);
    objects.push(obj(firstPageObjId + i, pageBody));
  }
  const kidsArray = pageObjs.map((_, idx) => `${firstPageObjId + idx} 0 R`).join(" ");
  const pagesObj = `<< /Type /Pages /Kids [ ${kidsArray} ] /Count ${pageObjs.length} >>`;
  objects[1] = obj(2, pagesObj);
  let offset = Buffer.byteLength(header, "utf8");
  const offsets = [0];
  const parts = [Buffer.from(header, "utf8")];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    const buf = Buffer.from(objects[i], "utf8");
    parts.push(buf);
    offset += buf.length;
  }
  const xrefStart = offset;
  let xref = "xref\n0 " + (objects.length + 1) + "\n";
  xref += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    const offStr = String(offsets[i]).padStart(10, "0");
    xref += `${offStr} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  parts.push(Buffer.from(xref, "utf8"));
  parts.push(Buffer.from(trailer, "utf8"));
  return Buffer.concat(parts);
}

function buildReport({ alertsReport, logExcerpt, sourceLog, alertsJsonPath }) {
  const lines = [];
  lines.push("AUTO-PROMOTE SECURITY EVIDENCE REPORT");
  lines.push("Generated: " + new Date().toISOString());
  lines.push("");
  lines.push("Source access log: " + sourceLog);
  lines.push("Alerts JSON file: " + alertsJsonPath);
  lines.push("");
  // Summary
  lines.push("=== ALERT SUMMARY ===");
  if (!alertsReport.alerts.length) {
    lines.push("No alerts detected");
  } else {
    alertsReport.alerts.forEach((a, i) => {
      lines.push(`${i + 1}. [${a.severity}] ${a.type} - ${a.message}`);
    });
  }
  lines.push("");
  lines.push("Total Requests: " + (alertsReport.stats && alertsReport.stats.totalRequests));
  lines.push("5xx Errors: " + (alertsReport.stats && alertsReport.stats.fivexx));
  lines.push("");
  lines.push("=== RAW ALERT JSON (TRUNCATED IF LARGE) ===");
  let rawJson = JSON.stringify(alertsReport, null, 2);
  const maxJsonLen = 12000; // prevent runaway huge PDF
  if (rawJson.length > maxJsonLen) {
    rawJson = rawJson.slice(0, maxJsonLen) + "\n...[truncated]";
  }
  rawJson.split(/\r?\n/).forEach(l => lines.push(l));
  lines.push("");
  lines.push("=== SUSPICIOUS ACCESS LOG LINES (FILTERED) ===");
  logExcerpt.forEach(l => lines.push(l));
  lines.push("");
  lines.push("=== MONITORING & RESPONSE NOTES ===");
  lines.push("Logs are generated per request with correlation IDs, status codes, response times.");
  lines.push("Analyzer thresholds:");
  lines.push("- Brute force: >=8 HTTP 401s from same IP in 10-minute bucket.");
  lines.push("- Admin probing: >=3 401/403 to /api/admin* endpoints per IP in 10-minute bucket.");
  lines.push("- Server error spike: 5xx >1% overall or >=10 in bucket (sample shows >1%).");
  lines.push(
    "Optional Slack integration via SECURITY_SLACK_WEBHOOK_URL for realtime notification."
  );
  lines.push(
    "Incident response: verify user accounts targeted, lock compromised accounts, review IP reputation, escalate if persistent."
  );
  lines.push("");
  lines.push("End of Report");
  return lines.join("\n");
}

function main() {
  const logsDir = path.join(__dirname, "..", "logs");
  const latestAccess = findLatest(/^access-\d{4}-\d{2}-\d{2}\.log$/, logsDir);
  if (!latestAccess) {
    console.error("No access log found. Run analyzer first.");
    process.exit(2);
  }
  const latestAlerts = findLatest(/^security-alerts-\d+\.json$/, logsDir);
  if (!latestAlerts) {
    console.error("No security alerts JSON found. Run analyzer to generate one.");
    process.exit(2);
  }
  const alertsReport = JSON.parse(fs.readFileSync(latestAlerts, "utf8"));
  const accessLines = fs.readFileSync(latestAccess, "utf8").split(/\r?\n/).filter(Boolean);
  // Filter lines that likely contributed: 401, 403, 500-599
  const suspicious = accessLines
    .filter(l => /(status=401|status=403|status=5\d\d)/.test(l))
    .slice(0, 150);
  const reportText = buildReport({
    alertsReport,
    logExcerpt: suspicious,
    sourceLog: path.basename(latestAccess),
    alertsJsonPath: path.basename(latestAlerts),
  });
  const pdfBuf = buildPdfBuffer(reportText);
  const downloads = path.join(process.env.USERPROFILE || "C:/Users/asus", "Downloads");
  try {
    fs.mkdirSync(downloads, { recursive: true });
  } catch (_) {}
  const outName = "security_evidence_report.pdf";
  const outPath = path.join(downloads, outName);
  fs.writeFileSync(outPath, pdfBuf);
  console.log("Wrote consolidated security evidence PDF:", outPath);
}

if (require.main === module) {
  main();
}
