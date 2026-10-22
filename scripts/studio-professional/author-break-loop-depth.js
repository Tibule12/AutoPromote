#!/usr/bin/env node
// Source artwork/choreography only. The ordinary signed-in Graphics import
// creates the editable layers; Studio owns evaluation, history and rendering.
const fs=require('fs'),path=require('path');
const root=path.resolve('reports/studio-break-loop-depth-20261015');
const spec=JSON.parse(fs.readFileSync('reports/studio-break-the-loop-20261015/assets/break-the-loop.graphics.json'));
const INK='#121215',PAPER='#f4efe6',RED='#ff5436',curve=[.16,1,.3,1],snap=[.18,1.18,.3,1];
const tick=v=>Math.round(v*90000)/90000;
const key=(layer,property,points)=>points.forEach(([time,value,easing='bezier',c=curve])=>layer.keys.push({property,time:tick(time),value,easing,...(easing==='bezier'?{curve:c}:{})}));
const text=(id,copy,start,end,x,y,scale,color=PAPER,extra={})=>({id,name:copy,type:'text',text:copy,startTime:start,duration:tick(end-start),x,y,scale,color,rotation:0,opacity:1,width:95,fontWeight:900,textAlign:'center',keys:[],...extra});
const rect=(color,w=1280,h=720)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${color}"/></svg>`;
const art=(id,svg,start,end,x,y,width,height)=>({id,name:id,type:'artwork',svg,startTime:start,duration:tick(end-start),x,y,width,height,scale:1,rotation:0,opacity:1,keys:[]});
// The new native ink source is the background. No opaque layer conceals stock.
const remove=new Set(spec.layers.filter(l=>l.name.startsWith('Loop /')||l.name==='Ink / programme'||l.name==='Frame / registration'||['ON','REPEAT','01','02','03'].includes(l.name)).map(l=>l.id));
spec.layers=spec.layers.filter(l=>!remove.has(l.id));spec.groups=spec.groups.filter(g=>g.id!=='01 / repeating orbit');
const intro=[];
// Receding outlined type creates a perspective tunnel. Every depth plane is
// editable text with ordinary position/scale/rotation/opacity keys.
for(let i=0;i<8;i++){
 const scale=.65+i*.49,start=0,end=3.91667;
 const l=text(`tunnel-${i}`,'LOOP',start,end,50,50,scale,INK,{name:`01 · LOOP depth ${8-i}`,strokeWidth:2,strokeColor:i%3===0?RED:PAPER});
 key(l,'scale',[[0,Math.max(.1,scale*.28)],[.8+i*.04,scale,'bezier',snap],[2.65,scale,'linear'],[3.91667,Math.min(5,scale*1.8),'ease_in']]);
 key(l,'rotation',[[0,-35+i*2],[1.2,0],[2.7,0,'hold'],[3.91667,20+i*2,'ease_in']]);
 key(l,'x',[[0,50],[2.6,50,'hold'],[3.91667,57,'ease_in']]);
 key(l,'opacity',[[0,0,'linear'],[.12+i*.035,.3+i*.08,'linear'],[3.5,.3+i*.08,'hold'],[3.91667,0,'linear']]);
 intro.push(l);
}
const face=text('loop-face','LOOP',.3,3.91667,50,50,4.8,PAPER,{name:'01 · LOOP face'});
key(face,'scale',[[.3,.2],[1.15,4.8,'bezier',snap],[2.7,4.8,'hold'],[3.91667,1.8,'ease_in']]);
key(face,'rotation',[[.3,-18],[1.15,0],[2.7,0,'hold'],[3.91667,35,'ease_in']]);
key(face,'y',[[.3,54],[1.15,50],[2.7,50,'hold'],[3.91667,40,'ease_in']]);
key(face,'opacity',[[.3,0,'linear'],[.55,1,'linear'],[3.6,1,'hold'],[3.91667,0,'linear']]);intro.push(face);
const top=text('intro-kicker','THE SAME THING.',.65,3.5,50,22,.55,RED,{name:'01 · THE SAME THING.',fontWeight:600});
key(top,'y',[[.65,25],[1.05,22],[3.15,22,'hold'],[3.5,18,'ease_in']]);key(top,'opacity',[[.65,0,'linear'],[1.05,1,'linear'],[3.15,1,'hold'],[3.5,0,'linear']]);intro.push(top);
const bottom=text('intro-kicker-2','UNTIL YOU CHANGE IT.',1.2,3.5,50,79,.55,RED,{name:'01 · UNTIL YOU CHANGE IT.',fontWeight:600});
key(bottom,'opacity',[[1.2,0,'linear'],[1.6,1,'linear'],[3.15,1,'hold'],[3.5,0,'linear']]);intro.push(bottom);
// One material change carries the word layout: the paper sheet swings in,
// then slides away as RHYTHM leaves the page and becomes individual letters.
const page=art('03 · Paper sweep',rect(PAPER),8.15,11.4,50,50,100,100);
key(page,'y',[[8.15,100],[8.7,50],[10.85,50,'hold'],[11.4,0,'ease_in']]);
key(page,'rotation',[[8.15,-16],[8.7,0],[10.85,0,'hold'],[11.4,12,'ease_in']]);
key(page,'scale',[[8.15,1.2],[8.7,1.2],[11.4,1.2,'hold']]);
const base=[page,...intro];
// Retain the authored six arcs and timed impact. Depth copies travel with each
// BREAK letter, settle against its face and collapse before the next layout.
const depth=[];
for(const l of spec.layers){
 if(l.id.startsWith('break-')){
  const copies=[];
  for(let i=2;i>=1;i--){const c=JSON.parse(JSON.stringify(l));c.id=`${l.id}-depth-${i}`;c.name=`02 · ${l.text} depth ${i}`;c.color=i===2?'#6b251f':RED;
   c.x+=i*.7;c.y+=i*1.2;c.keys=c.keys.map(k=>({...k,value:k.property==='x'?Math.min(100,k.value+i*.7):k.property==='y'?Math.min(100,k.value+i*1.2):k.value}));copies.push(c);}
  depth.push(...copies,l); const g=spec.groups.find(g=>g.layerIds.includes(l.id));if(g)g.layerIds=g.layerIds.flatMap(id=>id===l.id?[...copies.map(c=>c.id),id]:[id]);
 } else depth.push(l);
}
spec.layers=[...base,...depth];
for(const l of spec.layers){
 if(['make','rhythm-small'].includes(l.id))l.color=INK;
 if(l.id==='make')l.name='03 · MAKE';if(l.id==='your')l.name='03 · YOUR';if(l.id==='own')l.name='03 · OWN';
 if(l.id==='rhythm-small'){
  l.name='03 · RHYTHM handoff';l.duration=2;l.keys=l.keys.map(k=>({...k,time:Math.min(11.4,k.time)}));
  // Arrive in exactly the same ink-stage geometry as the six editable letters.
  l.keys=l.keys.filter(k=>!(k.property==='opacity'&&k.time>=11.35));key(l,'opacity',[[11.399,1,'hold']]);
 }
 if(l.id.startsWith('wave-letter-')){
  const i=Number(l.id.split('-').at(-1));l.name=`04 · RHYTHM ${i+1} / ${l.text}`;
  // Deliberate travelling arch, then all letters resolve together. Fewer,
  // intentional poses replace the previous continuous wobble.
  l.keys=[];const x=25+i*10;
  key(l,'y',[[11.4,49],[11.65+i*.11,49],[12.25+i*.11,35,'bezier',snap],[12.95+i*.11,49],[14.3,49,'hold'],[15.2,54,'ease_in']]);
  key(l,'rotation',[[11.4,0],[11.65+i*.11,0],[12.25+i*.11,(i-2.5)*5,'bezier',snap],[12.95+i*.11,0],[14.3,0,'hold'],[15.2,(i-2.5)*22,'ease_in']]);
  key(l,'scale',[[11.4,4.6],[14.3,4.6,'hold'],[15.2,.1,'ease_in']]);
  key(l,'x',[[11.4,x],[14.3,x,'hold'],[15.2,50,'ease_in']]);
  key(l,'opacity',[[11.4,1,'hold'],[14.9,1,'hold'],[15.25,0,'linear']]);
 }
 if(l.name.startsWith('Rhythm / bar')){
  const i=Number(l.name.split(' ').at(-1));if(i%2===0){l.remove=true;continue;}l.name=`04 · Rhythm pulse ${Math.ceil(i/2)}`;l.keys=l.keys.filter((k,index)=>k.property!=='scale'||index%2===0);
 }
 if(l.id==='move-final'){l.name='05 · MOVE';l.keys=l.keys.filter(k=>k.property!=='rotation');key(l,'rotation',[[15,-18],[16.1,0,'bezier',snap]]);}
 if(l.id==='different-final')l.name='05 · DIFFERENT';
 if(l.name==='Final / travelling dot'){l.name='05 · Punctuation';l.keys=l.keys.map(k=>k.property==='y'?{...k,value:Math.min(100,k.value)}:k);}
 if(l.name==='Final / underline')l.name='05 · Underline';
 if(l.id==='final-signature'){l.name='05 · BREAK THE LOOP.';l.color=PAPER;l.opacity=.6;}
 if(l.name.startsWith('BREAK /'))l.name=`02 · ${l.name}`;
 if(l.name==='THE LOOP.')l.name='02 · THE LOOP.';
 if(l.name.startsWith('Break / arc'))l.name=l.name.replace('Break / arc','02 · Ring fragment');
 if(l.name==='Transition / slash')l.name='03 · Red sweep';
 if(l.name==='Impact / flash')l.name='02 · Impact';
}
spec.layers=spec.layers.filter(l=>!l.remove);
spec.groups[0].name='02 · BREAK THE LOOP';
// Match the later native Studio correction: finish the outgoing group before
// MAKE enters the paper reveal. Studio transport snaps these poses to 24fps.
spec.groups[0].duration=tick(8+4/24-spec.groups[0].startTime);
key(spec.groups[0],'opacity',[[7+20/24,1,'ease_in_out'],[8+4/24,0,'ease_in_out']]);
// Fix the handed-off letters to match the exact proportional Inter word.
const {execFileSync}=require('child_process');
const widths=JSON.parse(execFileSync('../AutoPromote/python_media_worker/.venv/bin/python',['-c',`from PIL import ImageFont\nimport json\nf=ImageFont.truetype('python_media_worker/assets/fonts/Inter-Black.ttf',36)\ns='RHYTHM';print(json.dumps([f.getlength(s[:i])+f.getlength(c)/2-f.getlength(s)/2 for i,c in enumerate(s)]))`],{encoding:'utf8'}));
for(let i=0;i<6;i++){const l=spec.layers.find(l=>l.id===`wave-letter-${i}`),x=50+widths[i]*4.6/1280*100;l.x=x;l.keys=l.keys.map(k=>k.property==='x'&&k.time<15?{...k,value:x}:k);}
spec.name='BREAK THE LOOP — depth and rhythm';
fs.writeFileSync(path.join(root,'assets/break-loop-depth.graphics.json'),JSON.stringify(spec,null,2));
fs.writeFileSync(path.join(root,'design.json'),JSON.stringify({idea:'A typographic tunnel collapses into physical letter depth, a paper sweep changes the palette, and one word leaves the page as a travelling arch before resolving into punctuation.',duration:20,layers:spec.layers.length,groups:spec.groups.length,keys:[...spec.layers,...spec.groups].reduce((sum,l)=>sum+l.keys.length,0),background:'One plain ink source; no stock footage or unrelated camera cuts.',depth:'Editable 2D type planes; no claim of true 3D geometry.',nativeImportRequired:true},null,2));
console.log(`Authored ${spec.layers.length} layers and ${spec.groups.length} groups.`);
