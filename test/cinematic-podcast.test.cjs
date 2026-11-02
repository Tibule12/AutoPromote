const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createCinematicParameters,buildCinematicGraph,validateCinematicScene,PODCAST_PRESET}=require('../frontend/src/components/threeD/cinematicContract');
const {adaptStudioSnapshotToDocument}=require('../src/generated/studioDirectorReplayKernel.cjs');
const {compileLocalProgramme}=require('../src/cinematic/programmePlan.cjs');
const {hash}=require('../src/cinematic/localServer.cjs');
const scene=()=>({id:'podcast',sceneType:'cinematic_evidence',startTime:0,endTime:8,duration:8,cinematic:createCinematicParameters('a'.repeat(64),'b'.repeat(64),PODCAST_PRESET)});
test('podcast set has real camera, separate alpha surface, typography and lights without invented clock evidence',()=>{
 const s=scene(),g=buildCinematicGraph(s);
 assert.equal(g.preset,PODCAST_PRESET);assert.equal(g.nodes.find(n=>n.id==='presenter').surfaceStyle,'cutout');
 assert.equal(g.nodes.filter(n=>n.type==='area_light').length,2);
 assert(g.nodes.find(n=>n.type==='perspective_camera').keyframes.some(k=>k.position[0]!==g.nodes.find(n=>n.type==='perspective_camera').keyframes[0].position[0]));
 assert(!g.nodes.some(n=>n.type==='clock_reconstruction'));assert.equal(g.audio.sourceId,'b'.repeat(64));
 for(const [section,field,value]of [['camera','pushIn',.3],['camera','screenYaw',-20],['lighting','key',1100],['material','color','#234567'],['content','headline','A TRUE CONVERSATION']]){
  const changed=structuredClone(s);changed.cinematic[section][field]=value;assert.notDeepEqual(buildCinematicGraph(changed),g);
 }
 const old=scene();old.cinematic.content.clockA='02:12:00';assert.throws(()=>validateCinematicScene(old),/content/);
});
test('native built-in sound is canonical, muted correctly and external audio is rejected',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'podcast-sound-'));const file=path.join(dir,'source');fs.writeFileSync(file,'local fixture identity');const digest=hash(fs.readFileSync(file));
 const snapshot={orderedClips:[{id:'main',start:0,end:4}],selectedClipId:'main',timeline:[{id:'cut',sourceClipId:'main',contentHash:digest,startRequest:0,endRequest:4}],
  overlays:[],motionScenes:[],threeDScenes:[],reframeAspect:'16:9',smartCropMode:'off',previewSpeed:1,mainFrame:{enabled:false},trackStates:{},
  soundEffects:[{id:'reveal',builtIn:true,kind:'sfx',tone:'cinematic_hit',startTime:1,duration:.7,volume:.16}]};
 const compile=s=>compileLocalProgramme(adaptStudioSnapshotToDocument({projectId:'sound',snapshot:s}),{asset:()=>({id:digest,path:file,duration:4,hasAudio:true,width:1280,height:720}),rendered:()=>null});
 try{
  assert.equal(compile(snapshot).plan.soundEffects[0].tone,'cinematic_hit');
  assert.deepEqual(compile({...snapshot,trackStates:{sfx:{muted:true}}}).plan.soundEffects,[]);
  const bad=structuredClone(snapshot);bad.soundEffects[0].builtIn=false;bad.soundEffects[0].url='https://not-local.invalid/audio';assert.throws(()=>compile(bad),/built-in/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
