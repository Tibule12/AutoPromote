const fs = require("fs");
const path = require("path");

const out = path.join(
  process.env.USERPROFILE || "C:\\Users\\asus",
  "Downloads",
  "autopromote_meta_written_explanation.pdf"
);

const text = `We test our cloud environment and security configuration at least once every 12 months and whenever we make significant infrastructure or permissions changes. Scope: our cloud environment includes Google Firebase (Cloud Firestore and Firebase services) used for persistent storage of Platform Data and the Render.com application runtime used for hosting the backend. Testing methodology: we run automated dependency and static-analysis scans (e.g., npm audit, Semgrep), static application security checks, and manual reviews of Firebase Security Rules and IAM/service-account permissions. We also review CORS, secrets, and environment variables for secure configuration.

Triage and remediation: findings are triaged by severity. Critical/high severity issues are remediated immediately (within 72 hours) or mitigated with compensating controls until fixed; medium severity within 14 days; low severity within 90 days. We re-run scans after remediation to verify fixes. Evidence we provide includes the latest dependency scan report and static-analysis report, the active Firestore security rules file, configuration showing the app uses Render for hosting and Firebase for persistent storage, and code snippets showing encryption/handling of API tokens.

Data protection: Meta Platform Data is stored in Google Firebase (Cloud Firestore). Google Cloud encrypts data at rest by default. Access to Firebase is restricted using service account credentials stored in provider-managed secrets; tokens from external platforms are not stored in plaintext — where persisted we store them encrypted (application-level encryption) and remove plaintext tokens. The backend is hosted on Render.com but persistent Platform Data resides only in Firebase.

Evidence we can attach:
- Semgrep / static analysis report (PDF)
- Dependency scan report (PDF)
- firestore.rules (active Firestore Security Rules)
- Redacted firebaseAdmin initialization (shows use of firebase-admin and admin.firestore())
- Code snippet showing token encryption and deletion before storage (e.g., facebookRoutes.js)
- .env.example (shows env-based secret usage)

If you need a ZIP bundle with redacted files prepared for upload, I can assemble that next.\n`;

function escapeTextForPdf(s) {
  // Escape parentheses and backslashes for PDF literal string
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const lines = text.split(/\r?\n/).map(l => escapeTextForPdf(l));

// Build PDF parts
const header = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";

const obj = (id, body) => `${id} 0 obj\n${body}\nendobj\n`;

const obj1 = "<< /Type /Catalog /Pages 2 0 R >>";
const obj2 = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
const obj4 = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

// Build content stream with simple line positioning
let contentStream = "BT /F1 12 Tf 50 740 Td ";
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (i === 0) {
    contentStream += `(${line}) Tj`;
  } else {
    contentStream += ` 0 -14 Td (${line}) Tj`;
  }
}
contentStream += " ET";

const contentLength = Buffer.byteLength(contentStream, "utf8");
const obj5 = `<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream`;

const obj3 = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`;

// Assemble objects in order 1,2,3,4,5
const objects = [];
objects.push(obj(1, obj1));
objects.push(obj(2, obj2));
objects.push(obj(3, obj3));
objects.push(obj(4, obj4));
objects.push(obj(5, obj5));

// Calculate xref offsets
let offset = Buffer.byteLength(header, "utf8");
const offsets = [0]; // 0th entry
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

const outBuf = Buffer.concat(parts);

fs.writeFileSync(out, outBuf);
console.log("PDF written to", out);
