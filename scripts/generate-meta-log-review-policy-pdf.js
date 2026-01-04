#!/usr/bin/env node
// Generate a PDF for Meta: written policy that weekly (<=7 days) application event audit logs are reviewed using an automated solution.
const fs = require("fs");
const path = require("path");
function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function wrap(src, max) {
  const out = [];
  src.split(/\r?\n/).forEach(par => {
    if (par.trim() === "") {
      out.push("");
      return;
    }
    let cur = "";
    par.split(/(\s+)/).forEach(tok => {
      if ((cur + tok).length > max) {
        if (cur.trim()) out.push(cur.trimEnd());
        if (tok.length > max) {
          let s = tok;
          while (s.length > max) {
            out.push(s.slice(0, max));
            s = s.slice(max);
          }
          cur = s;
        } else {
          cur = tok;
        }
      } else {
        cur += tok;
      }
    });
    if (cur.trim()) out.push(cur.trimEnd());
  });
  return out;
}
function buildPdf(text) {
  const header = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";
  const obj = (id, b) => `${id} 0 obj\n${b}\nendobj\n`;
  const lines = wrap(text, 94).map(esc);
  const lh = 14,
    top = 740,
    bottom = 40,
    per = Math.floor((top - bottom) / lh);
  const objs = [];
  objs.push(obj(1, "<< /Type /Catalog /Pages 2 0 R >>"));
  objs.push("@@PAGES@@");
  objs.push(obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"));
  let next = 4;
  const pageIds = [];
  for (let p = 0; p * per < lines.length; p++) {
    const seg = lines.slice(p * per, p * per + per);
    let stream = "BT /F1 12 Tf 50 " + top + " Td ";
    seg.forEach((l, i) => {
      stream += (i ? ` 0 -${lh} Td (` : `(`) + l + ") Tj";
    });
    stream += " ET";
    const contentId = next++;
    objs.push(
      obj(
        contentId,
        `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`
      )
    );
    const pageId = next++;
    objs.push(
      obj(
        pageId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
      )
    );
    pageIds.push(pageId);
  }
  const kids = pageIds.map(id => `${id} 0 R`).join(" ");
  objs[1] = obj(2, `<< /Type /Pages /Kids [ ${kids} ] /Count ${pageIds.length} >>`);
  let offset = header.length;
  const offs = [0];
  const parts = [Buffer.from(header, "utf8")];
  objs.forEach(o => {
    offs.push(offset);
    const b = Buffer.from(o, "utf8");
    parts.push(b);
    offset += b.length;
  });
  const xrefStart = offset;
  let x = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
  offs.slice(1).forEach(o => (x += String(o).padStart(10, "0") + " 00000 n \n"));
  const trailer = `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  parts.push(Buffer.from(x, "utf8"));
  parts.push(Buffer.from(trailer, "utf8"));
  return Buffer.concat(parts);
}
function main() {
  const text = `APPLICATION EVENT AUDIT LOG REVIEW POLICY (WEEKLY, AUTOMATED)\nGenerated: ${new Date().toISOString()}\n\nStatement of Compliance\n- Application event audit logs for the backend environment that stores Meta Platform Data are reviewed at least once every seven (7) days.\n- Reviews are performed via an automated solution that runs on a schedule (daily with weekly summary), producing alerts and a persisted report.\n\nAutomated Solution / Program\n- Tooling: Node.js analyzer script (scripts/analyze-logs.js) acts as a lightweight SIEM.\n  - Parses request/access logs and structured app audit events.\n  - Detects brute-force patterns, admin endpoint probing, and 5xx spikes.\n  - Emits JSON reports (security-alerts-<timestamp>.json) and supports Slack webhook notifications.\n- Scheduling: Executed automatically (e.g., cron/Task Scheduler) at least daily; a weekly review is mandated and documented.\n- Evidence Retention: Weekly summaries and alert JSON kept for >=90 days for auditability.\n\nScope of Log Review\n- Authentication events (success/failure), session anomalies.\n- Admin route access and authorization checks.\n- Error rates, unusual traffic spikes, suspicious IP clustering.\n- Data export/download endpoints and privileged mutations.\n\nResponsibilities & Process\n- Security/engineering on-call reviews the automated outputs weekly (<=7 days).\n- If alerts exceed thresholds or unusual patterns appear, an incident ticket is opened, accounts may be locked, credentials rotated, and IP reputation checked.\n- Findings and remediations are recorded and retained with the weekly report.\n\nExceptions\n- None. Any requested deviation would require documented business justification and a time-bounded plan; none are active.\n\nThis policy confirms both the weekly cadence and the automated solution used to meet Meta's requirement.`;
  const pdf = buildPdf(text);
  const downloads = path.join(process.env.USERPROFILE || "C:/Users/asus", "Downloads");
  try {
    fs.mkdirSync(downloads, { recursive: true });
  } catch (e) {}
  const out = path.join(downloads, "meta_written_log_review_policy.pdf");
  fs.writeFileSync(out, pdf);
  console.log("Wrote weekly log review policy PDF:", out);
}
if (require.main === module) {
  main();
}
