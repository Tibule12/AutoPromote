#!/usr/bin/env node
// Codec-only local review copy. The authenticated native export remains the
// canonical platform movie. No picture edit or replacement render occurs here.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const probe = file => JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries',
  'stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,start_time:format=duration',
  '-of','json',file], {encoding:'utf8'}));
function videoHash(file) {
  return execFileSync('ffmpeg',['-nostdin','-v','error','-i',file,'-map','0:v:0',
    '-c:v','copy','-f','hash','-hash','sha256','-'],{encoding:'utf8'}).trim();
}
function createEditorPreview(source, output = source.replace(/\.mp4$/, '.ide-preview.mp4')) {
  source=path.resolve(source);output=path.resolve(output);
  assert(source !== output && source.endsWith('.mp4') && output.endsWith('.mp4'));
  assert(!fs.existsSync(output), 'Preserve the existing review copy');
  const before=probe(source),video=before.streams.find(s=>s.codec_type==='video');
  assert.equal(video.codec_name,'h264');
  assert(before.streams.some(s=>s.codec_type==='audio'), 'Review copy requires actual audio');
  const temporary=output.replace(/\.mp4$/,'.partial.mp4');
  assert(!fs.existsSync(temporary));
  execFileSync('ffmpeg',['-nostdin','-v','error','-i',source,'-map','0:v:0','-map','0:a:0',
    '-c:v','copy','-c:a','libmp3lame','-b:a','192k','-movflags','+faststart',temporary]);
  const after=probe(temporary),copied=after.streams.find(s=>s.codec_type==='video');
  for (const key of ['codec_name','width','height','r_frame_rate','nb_frames']) assert.equal(copied[key],video[key]);
  assert(Math.abs(Number(copied.start_time)-Number(video.start_time))<1/24);
  assert.equal(after.streams.find(s=>s.codec_type==='audio').codec_name,'mp3');
  const originalVideoHash=videoHash(source),copiedVideoHash=videoHash(temporary);
  assert.equal(copiedVideoHash,originalVideoHash,'Copy every original encoded video packet unchanged');
  execFileSync('ffmpeg',['-nostdin','-v','error','-i',temporary,'-f','null','-']);
  fs.renameSync(temporary,output);
  const receipt={purpose:'Local editor-compatible review; use the native AAC master for platform publishing',
    source,sourceSha256:sha(source),output,outputSha256:sha(output),
    videoBitstreamHash:copiedVideoHash,videoPacketsUnchanged:true,
    audioCodec:'mp3',independentFullDecode:true,seconds:Number(after.format.duration),
    nativeRenderReplaced:false,publishingWrites:0,
    compatibilitySource:'https://code.visualstudio.com/api/extension-guides/webview#supported-media-formats',
    limitation:'Codec compatibility is documented; this does not prove the user’s exact IDE/player was the cause of earlier silence.'};
  fs.writeFileSync(output+'.receipt.json',JSON.stringify(receipt,null,2)+'\n');
  return receipt;
}
module.exports={createEditorPreview};
if(require.main===module) {
  const source=process.argv[2];assert(source,'Provide an existing native MP4 export');
  console.log(JSON.stringify(createEditorPreview(source,process.argv[3])));
}
