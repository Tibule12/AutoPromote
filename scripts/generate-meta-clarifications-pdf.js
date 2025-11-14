#!/usr/bin/env node
// Build a PDF from meta_clarifications_response.txt (inject timestamp) and save to Downloads.
const fs = require('fs');
const path = require('path');

function escape(s){return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function wrapLines(src,max){const out=[];src.split(/\r?\n/).forEach(par=>{if(par.trim()===''){out.push('');return;}let line='';par.split(/(\s+)/).forEach(tok=>{if((line+tok).length>max){if(line.trim())out.push(line.trimEnd());line=tok; if(tok.length>max){while(tok.length>max){out.push(tok.slice(0,max));tok=tok.slice(max);} line=tok;} } else line+=tok;}); if(line.trim()) out.push(line.trimEnd());}); return out;}
function buildPdf(text){const header='%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n'; const obj=(id,body)=>`${id} 0 obj\n${body}\nendobj\n`; const font='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'; const lines=wrapLines(text,95).map(escape); const lh=14, top=740, bottom=40, usable=top-bottom, perPage=Math.floor(usable/lh); const pages=[]; for(let p=0;p*perPage<lines.length;p++){const subset=lines.slice(p*perPage,p*perPage+perPage); let stream='BT /F1 12 Tf 50 '+top+' Td '; subset.forEach((l,i)=>{ if(i===0) stream+=`(${l}) Tj`; else stream+=` 0 -${lh} Td (${l}) Tj`;}); stream+=' ET'; pages.push(stream);} const objects=[]; objects.push(obj(1,'<< /Type /Catalog /Pages 2 0 R >>')); objects.push('@@PAGES@@'); objects.push(obj(3,font)); let nextId=4; const contentIds=[]; pages.forEach(s=>{const body=`<< /Length ${Buffer.byteLength(s,'utf8')} >>\nstream\n${s}\nendstream`; objects.push(obj(nextId,body)); contentIds.push(nextId); nextId++;}); const pageIds=[]; contentIds.forEach(cid=>{objects.push(obj(nextId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${cid} 0 R >>`)); pageIds.push(nextId); nextId++;}); const kids=pageIds.map(id=>`${id} 0 R`).join(' '); const pagesObj=`<< /Type /Pages /Kids [ ${kids} ] /Count ${pageIds.length} >>`; objects[1]=obj(2,pagesObj); let offset=header.length; const offsets=[0]; const parts=[Buffer.from(header,'utf8')]; objects.forEach(o=>{offsets.push(offset); const b=Buffer.from(o,'utf8'); parts.push(b); offset+=b.length;}); const xrefStart=offset; let xref='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'; offsets.slice(1).forEach(off=>{xref+=String(off).padStart(10,'0')+' 00000 n \n';}); const trailer=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`; parts.push(Buffer.from(xref,'utf8')); parts.push(Buffer.from(trailer,'utf8')); return Buffer.concat(parts);} 

function main(){
  const evidenceDir=path.join(__dirname,'..','evidence');
  const src=path.join(evidenceDir,'meta_clarifications_response.txt');
  if(!fs.existsSync(src)){console.error('Source clarification file missing:',src);process.exit(2);} 
  let content=fs.readFileSync(src,'utf8');
  content=content.replace('{ISO_TIMESTAMP}', new Date().toISOString());
  const pdf=buildPdf(content);
  const downloads=path.join(process.env.USERPROFILE||'C:/Users/asus','Downloads');
  try{fs.mkdirSync(downloads,{recursive:true});}catch(_){}
  const out=path.join(downloads,'meta_clarifications_response.pdf');
  fs.writeFileSync(out,pdf);
  console.log('Wrote Meta clarifications PDF:', out); 
}
if(require.main===module){main();}
