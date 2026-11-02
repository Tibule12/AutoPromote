#!/usr/bin/env node
// Review packaging of already-native renders. Never authors evaluated effects.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { hash } = require('../../src/creativeTemplates/contract');
const base = path.resolve(__dirname,'../../reports/studio-motion-flow-takeover-20261031');
const project = path.join(base,'cinematic');
const destination = '/home/tibule12/Videos/AutoPromote Motion and Flow - 2026-10-31';
fs.mkdirSync(destination,{recursive:true});
const receipt = JSON.parse(fs.readFileSync(path.join(project,'native-motion-flow/render-receipt.json')));
const backup = JSON.parse(fs.readFileSync(path.join(project,'Editable Project.autopromote.json')));
const portable = JSON.parse(fs.readFileSync(path.join(project,'Portable Project.autopromote.json')));
assert.equal(hash(backup.snapshot.studioDocument),receipt.projectHash,'Movie must match current native project exactly');
assert.equal(hash(portable.snapshot.studioDocument),receipt.projectHash,'Portable media cannot change the canonical edit');
const movie = path.join(project,'native-motion-flow/final.mp4');
assert.equal(hash(fs.readFileSync(movie)),receipt.outputSha256,'Native movie receipt binding required');
const copy = (from,to) => fs.copyFileSync(from,path.join(destination,to));
const selected = path.join(destination,'Evidence Reconstruction - motion study.mp4');
if(fs.existsSync(selected) && hash(fs.readFileSync(selected))!==receipt.outputSha256)
  fs.renameSync(selected,path.join(destination,`Earlier motion study - ${hash(fs.readFileSync(selected)).slice(0,12)}.mp4`));
copy(movie,'Evidence Reconstruction - motion study.mp4');
copy(path.join(base,'native-raw-source/final.mp4'),'Raw cut - synchronized source.mp4');
copy(path.join(project,'Editable Project.autopromote.json'),'Evidence Reconstruction.autopromote.json');
copy(path.join(project,'Portable Project.autopromote.json'),'Evidence Reconstruction - portable.autopromote.json');
for(const name of ['output-verification.json','portable-restore.json','playback.json','export-playback.json'])
  copy(path.join(project,name),name);
copy(path.join(project,'native-motion-flow/render-receipt.json'),'Native export receipt.json');
copy(path.join(project,'native-motion-flow/recovered-download.json'),'Native download verification.json');
copy(path.join(project,'complete-export-playback-in-studio.mp4'),'Studio - complete final playback.mp4');
copy(path.join(project,'editing-in-studio.mp4'),'Studio - last recorded native session.mp4');
for(const t of ['5.00','11.00','12.50'])copy(path.join(project,`preview-${t}.png`),`Studio frame - ${t}s.png`);
copy(path.join(project,'export-contact-sheet.jpg'),'Final frames.jpg');
// This sole utility operation places two verified movies next to each other.
// The evaluated animation, masks, typography and grade stay in the native edit.
const comparison = path.join(destination,'Raw versus Studio edit.mp4');
execFileSync('ffmpeg',['-v','error','-y','-threads','2','-i',path.join(base,'native-raw-source/final.mp4'),
  '-threads','2','-i',movie,'-filter_complex_threads','1','-filter_complex',
  "[0:v]scale=640:360:flags=lanczos,setsar=1[raw];[1:v]scale=640:360:flags=lanczos,setsar=1[edited];"+
  "[raw][edited]hstack=inputs=2,pad=1280:410:0:50:color=0x090e18,"+
  "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='RAW SOURCE':x=24:y=16:fontsize=18:fontcolor=white,"+
  "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='AUTOPROMOTE STUDIO EDIT':x=664:y=16:fontsize=18:fontcolor=white[v]",
  '-map','[v]','-map','1:a:0','-c:v','libx264','-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p',
  '-c:a','copy','-t','15.75','-movflags','+faststart',comparison],{timeout:180000});
const files=fs.readdirSync(destination).filter(name=>fs.statSync(path.join(destination,name)).isFile() && name!=='Review manifest.json')
  .map(name=>({name,bytes:fs.statSync(path.join(destination,name)).size,sha256:hash(fs.readFileSync(path.join(destination,name)))}));
fs.writeFileSync(path.join(destination,'Review manifest.json'),JSON.stringify({projectId:receipt.projectId,
  projectHash:receipt.projectHash,nativeOutputSha256:receipt.outputSha256,
  comparisonScope:'Static review packaging of verified raw and edited native movies; no evaluated effects created here.',files},null,2));
console.log(JSON.stringify({reviewFolder:destination,nativeOutputSha256:receipt.outputSha256,files:files.length}));
