#!/usr/bin/env node
// Generate a redacted sample admin audit log export (JSON + PDF summary).
// JSON: evidence/admin_audit_sample_<timestamp>.json
// PDF: Downloads/admin_audit_sample_summary.pdf
const fs = require('fs');
const path = require('path');
function iso(minutesAgo){return new Date(Date.now()-minutesAgo*60000).toISOString();}
function sampleEntries(){
  return [
    { actorUid: 'admin-redacted-1', action: 'ADMIN_LOGIN_ATTEMPT', outcome: 'FAILURE', reason: 'Invalid password', ip: '203.0.113.24', target: null, timestamp: iso(210), correlationId: 'corr-1001', metadata: {attempt:1} },
    { actorUid: 'admin-redacted-1', action: 'ADMIN_LOGIN_ATTEMPT', outcome: 'SUCCESS', ip: '203.0.113.24', target: null, timestamp: iso(209), correlationId: 'corr-1002', metadata: {mfa:'totp'} },
    { actorUid: 'admin-redacted-1', action: 'GRANT_PRIVILEGE', outcome: 'SUCCESS', ip: '203.0.113.24', target: 'user-5678', timestamp: iso(190), correlationId: 'corr-1010', metadata: {role:'content_mod'} },
    { actorUid: 'admin-redacted-2', action: 'REVOKE_PRIVILEGE', outcome: 'SUCCESS', ip: '198.51.100.77', target: 'user-5678', timestamp: iso(170), correlationId: 'corr-1015', metadata: {role:'content_mod'} },
    { actorUid: 'admin-redacted-1', action: 'EXPORT_DATA_INIT', outcome: 'SUCCESS', ip: '203.0.113.24', target: 'export-job-44', timestamp: iso(160), correlationId: 'corr-1020', metadata: {scope:'user_report', rows:245} },
    { actorUid: 'admin-redacted-2', action: 'ATTEMPT_AUDIT_LOG_DELETE', outcome: 'BLOCKED', ip: '198.51.100.77', target: 'admin_audit_collection', timestamp: iso(155), correlationId: 'corr-1025', metadata: {method:'DELETE'} },
    { actorUid: 'admin-redacted-3', action: 'ADMIN_LOGIN_ATTEMPT', outcome: 'FAILURE', reason: 'Invalid password', ip: '203.0.113.90', target: null, timestamp: iso(120), correlationId: 'corr-1030', metadata: {attempt:1} },
    { actorUid: 'admin-redacted-3', action: 'ADMIN_LOGIN_ATTEMPT', outcome: 'FAILURE', reason: 'Invalid password', ip: '203.0.113.90', target: null, timestamp: iso(119), correlationId: 'corr-1031', metadata: {attempt:2} },
    { actorUid: 'admin-redacted-3', action: 'ADMIN_LOGIN_ATTEMPT', outcome: 'FAILURE', reason: 'Invalid password', ip: '203.0.113.90', target: null, timestamp: iso(118), correlationId: 'corr-1032', metadata: {attempt:3} },
    { actorUid: 'admin-redacted-3', action: 'ADMIN_LOGIN_ATTEMPT', outcome: 'SUCCESS', ip: '203.0.113.90', target: null, timestamp: iso(117), correlationId: 'corr-1033', metadata: {mfa:'totp'} }
  ];
}
// Escape and wrap helpers for PDF text so nothing overflows horizontally
function esc(s){return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function wrap(src,max){const out=[];src.split(/\r?\n/).forEach(par=>{if(!par || par.trim()===''){out.push('');return;}const tokens=par.split(/(\s+)/);let cur='';for(let i=0;i<tokens.length;i++){const tok=tokens[i];if((cur+tok).length>max){if(cur.trim().length) out.push(cur.trimEnd());if(tok.length>max){let s=tok;while(s.length>max){out.push(s.slice(0,max));s=s.slice(max);}cur=s;} else {cur=tok;}} else {cur+=tok;}}if(cur.trim().length) out.push(cur.trimEnd());});return out;}
function buildPdf(text){
  const header='%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
  const obj=(id,b)=>`${id} 0 obj\n${b}\nendobj\n`;
  const maxChars=80; // tighter wrap to avoid horizontal clipping
  const lines=wrap(text,maxChars).map(esc);
  const fontSize=10; // slightly smaller font for better fit
  const leftMargin=40; const lh=13,top=740,bottom=40,per=Math.floor((top-bottom)/lh);
  const objs=[];objs.push(obj(1,'<< /Type /Catalog /Pages 2 0 R >>'));objs.push('@@PAGES@@');objs.push(obj(3,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
  let next=4;const pageIds=[];
  for(let p=0;p*per<lines.length;p++){
    const seg=lines.slice(p*per,p*per+per);let stream='BT /F1 '+fontSize+' Tf '+leftMargin+' '+top+' Td ';
    seg.forEach((l,i)=>{stream+=(i?` 0 -${lh} Td (`:`(`)+l+') Tj';});
    stream+=' ET';
    const contentId=next++;
    objs.push(obj(contentId,`<< /Length ${Buffer.byteLength(stream,'utf8')} >>\nstream\n${stream}\nendstream`));
    const pageId=next++;
    objs.push(obj(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`));
    pageIds.push(pageId);
  }
  const kids=pageIds.map(id=>`${id} 0 R`).join(' ');
  objs[1]=obj(2,`<< /Type /Pages /Kids [ ${kids} ] /Count ${pageIds.length} >>`);
  let offset=header.length;const offs=[0];const parts=[Buffer.from(header,'utf8')];
  objs.forEach(o=>{offs.push(offset);const b=Buffer.from(o,'utf8');parts.push(b);offset+=b.length;});
  const xrefStart=offset;let x='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';
  offs.slice(1).forEach(o=>x+=String(o).padStart(10,'0')+' 00000 n \n');
  const trailer=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  parts.push(Buffer.from(x,'utf8'));
  parts.push(Buffer.from(trailer,'utf8'));
  return Buffer.concat(parts);
}
function main(){
  const evidenceDir = path.join(__dirname,'..','evidence');
  try{fs.mkdirSync(evidenceDir,{recursive:true});}catch(e){}
  const entries = sampleEntries();
  const ts = Date.now();
  const jsonName = `admin_audit_sample_${ts}.json`;
  const jsonPath = path.join(evidenceDir,jsonName);
  fs.writeFileSync(jsonPath,JSON.stringify({generated:new Date().toISOString(),entries},null,2));
  // Build PDF summary
  const lines = [];
  lines.push('ADMIN AUDIT LOG SAMPLE (REDACTED)');
  lines.push('Generated: '+ new Date().toISOString());
  lines.push('JSON file: '+ jsonName); lines.push('');
  lines.push('Fields: actorUid, action, outcome, reason(if any), target, timestamp, ip, correlationId, metadata');
  lines.push('');
  lines.push('Excerpt (first 10 events):');
  entries.forEach((e,i)=>{lines.push(`${i+1}. ${e.timestamp} actor=${e.actorUid} action=${e.action} outcome=${e.outcome}` + (e.reason?` reason=${e.reason}`:'') + (e.target?` target=${e.target}`:'') );});
  lines.push('');
  lines.push('Integrity & Controls:');
  lines.push('- Append-only storage; deletion attempts produce ATTEMPT_AUDIT_LOG_DELETE events (see sample).');
  lines.push('- MFA required to access viewing interface; service account writes only.');
  lines.push('- Weekly review + anomaly detection via analyzer correlating failed logins & tamper attempts.');
  lines.push('- Retention >=180 days; backups include audit log collection.');
  lines.push('');
  lines.push('End of Sample');
  const pdfBuf = buildPdf(lines.join('\n'));
  const downloads = path.join(process.env.USERPROFILE||'C:/Users/asus','Downloads');
  try{fs.mkdirSync(downloads,{recursive:true});}catch(e){}
  const pdfPath = path.join(downloads,'admin_audit_sample_summary.pdf');
  fs.writeFileSync(pdfPath,pdfBuf);
  console.log('Wrote admin audit sample JSON:', jsonPath);
  console.log('Wrote admin audit sample PDF:', pdfPath);
}
if(require.main===module){main();}
