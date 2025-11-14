#!/usr/bin/env node
// Convert mfa_remote_access_policy.txt to PDF and save to Downloads
const fs = require('fs');
const path = require('path');
function esc(s){return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function wrap(src,max){const out=[];src.split(/\r?\n/).forEach(par=>{if(par.trim()===''){out.push('');return;}let cur='';par.split(/(\s+)/).forEach(tok=>{if((cur+tok).length>max){if(cur.trim())out.push(cur.trimEnd()); if(tok.length>max){let s=tok;while(s.length>max){out.push(s.slice(0,max));s=s.slice(max);} cur=s;} else{cur=tok;} } else {cur+=tok;}}); if(cur.trim()) out.push(cur.trimEnd());}); return out;}
function pdf(text){
	const header='%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
	const obj=(id,body)=>`${id} 0 obj\n${body}\nendobj\n`;
	const lines=wrap(text,95).map(esc);
	const lh=14, top=740, bottom=40, per=Math.floor((top-bottom)/lh);
	const objs=[];
	// Catalog and placeholder for Pages
	objs.push(obj(1,'<< /Type /Catalog /Pages 2 0 R >>'));
	objs.push('@@PAGES@@');
	// Font object
	objs.push(obj(3,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
	let nextId=4;
	const pageIds=[];
	for(let p=0;p*per<lines.length;p++){
		const seg=lines.slice(p*per, p*per+per);
		let stream='BT /F1 12 Tf 50 '+top+' Td ';
		seg.forEach((l,i)=>{stream+=(i?` 0 -${lh} Td (`:`(`)+l+') Tj';});
		stream+=' ET';
		// Create content object
		const contentId = nextId++;
		objs.push(obj(contentId,`<< /Length ${Buffer.byteLength(stream,'utf8')} >>\nstream\n${stream}\nendstream`));
		// Create page object referencing the content
		const pageId = nextId++;
		objs.push(obj(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`));
		pageIds.push(pageId);
	}
	const kids = pageIds.map(id=>`${id} 0 R`).join(' ');
	objs[1]=obj(2,`<< /Type /Pages /Kids [ ${kids} ] /Count ${pageIds.length} >>`);
	// Assemble PDF
	let offset=header.length; const offs=[0]; const parts=[Buffer.from(header,'utf8')];
	objs.forEach(o=>{offs.push(offset); const b=Buffer.from(o,'utf8'); parts.push(b); offset+=b.length;});
	const xrefStart=offset; let x='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';
	offs.slice(1).forEach(o=>x+=String(o).padStart(10,'0')+' 00000 n \n');
	const trailer=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
	parts.push(Buffer.from(x,'utf8')); parts.push(Buffer.from(trailer,'utf8'));
	return Buffer.concat(parts);
}
function main(){
	const ev=path.join(__dirname,'..','evidence','mfa_remote_access_policy.txt');
	if(!fs.existsSync(ev)){ console.error('Missing policy file', ev); process.exit(2);} 
	let txt=fs.readFileSync(ev,'utf8');
	txt=txt.replace('{ISO_TIMESTAMP}', new Date().toISOString());
	const outBuf=pdf(txt);
	const downloads=path.join(process.env.USERPROFILE||'C:/Users/asus','Downloads');
	try{fs.mkdirSync(downloads,{recursive:true});}catch(_){}
	const out=path.join(downloads,'mfa_remote_access_policy.pdf');
	fs.writeFileSync(out,outBuf);
	console.log('Wrote MFA remote access policy PDF:', out);
}
if(require.main===module){main();}
