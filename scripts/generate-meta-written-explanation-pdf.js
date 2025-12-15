#!/usr/bin/env node
// Generate a PDF containing the Meta-requested written MFA & remote access explanation.
// Saves to user Downloads as meta_mfa_written_explanation.pdf
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
  const lines = wrap(text, 95).map(esc);
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
  const explanation = `META MFA & REMOTE ACCESS WRITTEN EXPLANATION\nGenerated: ${new Date().toISOString()}\n\n1. Confirmation\nWe require Multi-Factor Authentication (MFA) for all remote access to production systems and any account that can access Meta Platform Data.\n\n2. Removal of Direct Server Access\nDirect network service access paths (SSH 22, RDP 3389, VNC 5900, DB ports 3306/5432/27017, Redis 6379, alt HTTP 8080) are blocked. Only HTTPS (80/443) is exposed through managed hosting.\n\n3. MFA-Enforced Administrative Workflows\nAll administrative actions (deploy, config, logs, database operations) occur via provider consoles/APIs (Render, GitHub, Google/Firebase) with MFA enabled. No password-only privileged access exists.\n\n4. Implementation Evidence (Attached Separately)\n- Policy PDF: mfa_remote_access_policy.pdf (states: all admin/dev accounts must have MFA; any production access requires MFA + unique credentials).\n- SSH Block Screenshot: security_mfa_remote_access_<timestamp>.png (failed ssh handshake attempts).\n- Multi-Port Scan: multiport_scan_<timestamp>.txt (all privileged ports closed).\n- Implementation Summary PDF: mfa_remote_access_implementation_evidence.pdf (aggregates, interprets artifacts).\n- Provider MFA Screenshots: Render 2FA, GitHub 2FA + org policy, Google/Firebase 2-Step Verification (redacted).\n\n5. Monitoring & Detection\nSecurity analyzer identifies brute force (>=8 401s / IP / 10 min), admin probing (>=3 401/403 to /api/admin*), and 5xx spikes; optional Slack alerting for rapid response.\n\n6. Review & Enforcement\nQuarterly policy review; automated/regular multi-port scans; immediate investigation on any privileged port opening or repeated brute-force alert. MFA status verified during onboarding/offboarding. No active exceptions.\n\n7. Risk Reduction Summary\nCombined network surface minimization + enforced MFA + active anomaly detection prevents unauthorized remote access and reduces impact of credential compromise.\n\nEnd of Explanation`;
  const pdf = buildPdf(explanation);
  const downloads = path.join(process.env.USERPROFILE || "C:/Users/asus", "Downloads");
  try {
    fs.mkdirSync(downloads, { recursive: true });
  } catch (e) {}
  const out = path.join(downloads, "meta_mfa_written_explanation.pdf");
  fs.writeFileSync(out, pdf);
  console.log("Wrote Meta written explanation PDF:", out);
}
if (require.main === module) {
  main();
}
