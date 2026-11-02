// Review packaging only. Every evaluated edit is in the native Studio project.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {hash} = require('../../src/creativeTemplates/contract');
const folder = path.resolve(__dirname, '../../reports/studio-motion-flow-takeover-20261031/video-texture');
const target = '/home/tibule12/Videos/AutoPromote Motion and Flow - 2026-10-31/Open World';
function review() {
  fs.mkdirSync(target, {recursive:true});
  const receipt = JSON.parse(fs.readFileSync(path.join(folder,'native-motion-flow/render-receipt.json')));
  const edited = path.join(folder,'native-motion-flow/final.mp4'), raw = path.join(folder,'native-raw-source/final.mp4');
  assert.equal(hash(fs.readFileSync(edited)), receipt.outputSha256);
  const backup = JSON.parse(fs.readFileSync(path.join(folder,'Editable Project.autopromote.json')));
  assert.equal(hash(backup.snapshot.studioDocument), receipt.projectHash);
  const copy = (from, name) => fs.copyFileSync(path.join(folder,from), path.join(target,name));
  copy('native-motion-flow/final.mp4','Open World - Studio edit.mp4');
  copy('native-raw-source/final.mp4','Raw sequence.mp4');
  copy('Editable Project.autopromote.json','Open World.autopromote.json');
  copy('native-motion-flow/render-receipt.json','Native export receipt.json');
  copy('README.md','Technical findings.md');
  copy('validation.json','Validation.json');
  copy('paired-review.jpg','Preview versus export.jpg');
  copy('preview-samples.json','Preview timestamps.json');
  for (const name of ['Feedback.md','output-verification.json','export-contact-sheet.jpg','export-playback.json','playback.json',
    'runtime-manifest.json','native-project-recovery.json','native-3d-authoring.json','open-world-source-manifest.json']) copy(name,name);
  copy('complete-export-playback-in-studio.mp4','Studio - complete final playback.mp4');
  copy('live-playback-in-studio.mp4','Studio - live editable playback.mp4');
  fs.cpSync(path.join(folder,'open-world-sources'),path.join(target,'Sources'),{recursive:true});
  fs.copyFileSync(path.resolve(folder,'../../studio-break-loop-depth-20261015/assets/Break-loop-score-master.wav'),path.join(target,'Sources','Background score.wav'));
  execFileSync('ffmpeg',['-v','error','-y','-threads','2','-i',raw,'-threads','2','-i',edited,
    '-filter_complex_threads','1','-filter_complex',
    "[0:v]scale=640:360,setsar=1[a];[1:v]scale=640:360,setsar=1[b];[a][b]hstack=inputs=2,pad=1280:410:0:50:color=0x090d14,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='RAW SEQUENCE':x=24:y=16:fontsize=18:fontcolor=white,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='NATIVE STUDIO EDIT':x=664:y=16:fontsize=18:fontcolor=white[v]",
    '-map','[v]','-map','1:a:0','-c:v','libx264','-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','copy','-t','60',
    '-movflags','+faststart',path.join(target,'Raw versus Studio edit.mp4')],{timeout:180000});
  const files=[];
  function inventory(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,item.name);if(item.isDirectory())inventory(file);
    else if(item.name!=='Review manifest.json')files.push({name:path.relative(target,file),bytes:fs.statSync(file).size,sha256:hash(fs.readFileSync(file))});
  }}
  inventory(target);
  fs.writeFileSync(path.join(target,'Review manifest.json'),JSON.stringify({projectId:receipt.projectId,projectHash:receipt.projectHash,
    nativeOutputSha256:receipt.outputSha256,comparisonScope:'Synchronized utility packaging of two native Studio movies; no evaluated effects authored externally.',
    creativeStatus:'FOR_OWNER_REVIEW',files},null,2));
  console.log(JSON.stringify({target,nativeOutputSha256:receipt.outputSha256,files:files.length}));
}
if(process.argv[2]==='review')review();
else throw Error('Use review after native export and recovery checks.');
