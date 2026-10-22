import { buildStudioLogoMotion, AUTOPROMOTE_LOGO_SVG } from '../studioLogoMotion';
import { buildStudioGraphicsPackage, validateStudioGraphicsPackage } from '../studioGraphicsPackage';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';

const options = {programmeDuration:10,measure:s=>s.length*20};
const validate = spec => validateStudioGraphicsPackage(spec,{duration:spec.duration,aspect:spec.width/spec.height});

test('default mark preserves all three public logo strokes as independently editable components',()=>{
  const spec=buildStudioLogoMotion(options);validate(spec);
  const parts=spec.layers.filter(l=>l.name.startsWith('Mark /'));
  expect(parts).toHaveLength(3);
  expect(parts.map(l=>new DOMParser().parseFromString(l.svg,'image/svg+xml').querySelector('path').getAttribute('d')))
    .toEqual(['M5 25 16 7','M16 7 27 25','M10 21h12']);
  expect(spec.groups[0].layerIds).toEqual(parts.map(l=>l.id));
  expect(spec.layers.filter(l=>l.name.startsWith('Wordmark /')).map(l=>l.text).join('')).toBe('AutoPromote');
});

test.each([[1280,720,8],[720,1280,10],[1080,1080,14]])('bounded layers and keys fit %s × %s at %s seconds',(width,height,duration)=>{
  const spec=buildStudioLogoMotion({...options,width,height,duration,programmeDuration:duration});validate(spec);
  expect(spec.layers.every(l=>l.startTime>=0 && l.startTime+l.duration<=duration+1/90000)).toBe(true);
  expect(spec.layers.every(l=>l.keys.every(k=>k.time>=l.startTime-1/90000 && k.time<=l.startTime+l.duration+1/90000))).toBe(true);
});

test('custom SVG dimensions are normalised without duplicate attributes or foreign requests',()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><defs><linearGradient id="g"><stop stop-color="#fff"/></linearGradient></defs><script>alert(1)</script><path d="M1 2L30 40" stroke="url(#g)"/><image href="https://example.com/track"/></svg>';
  const spec=buildStudioLogoMotion({...options,svg});validate(spec);
  for(const l of spec.layers.filter(l=>l.svg)){
    expect(l.svg).not.toMatch(/https:\/\/example|<script/);
    expect(new DOMParser().parseFromString(l.svg,'image/svg+xml').querySelector('parsererror')).toBeNull();
  }
  expect(AUTOPROMOTE_LOGO_SVG).toContain('M5 25 16 7');
});

test('invalid names, colours, viewports and insufficient programme duration fail before authoring',()=>{
  for(const bad of [{duration:7},{duration:15},{programmeDuration:9},{programmeDuration:undefined},
    {brandName:'<script>'},{brandName:'x'.repeat(25)},{accent:'url(https://example.com)'},{width:Infinity},
    {width:4096,height:16},{svg:'<svg/>'}]) expect(()=>buildStudioLogoMotion({...options,...bad})).toThrow();
});

test('transparent-background option preserves the source and every authored key reaches the shared compiler',async()=>{
  const spec=buildStudioLogoMotion({...options,includeBackground:false});
  expect(spec.layers.some(l=>l.name.startsWith('Stage /'))).toBe(false);
  let id=0;const result=await buildStudioGraphicsPackage({input:spec,overlays:[],keyframes:[],compounds:[],order:[],
    duration:10,aspect:16/9,createId:prefix=>prefix+(++id),rasterize:async()=>new File(['png'],'mark.png'),createUrl:()=> 'blob:mark'});
  const document=adaptStudioSnapshotToDocument({projectId:'logo',snapshot:{timeline:[{id:'shot',sourceClipId:'source',startRequest:0,endRequest:10,duration:10}],
    overlays:result.overlays,motionKeyframes:result.keyframes,compoundClips:result.compounds,compositionOrder:result.order,reframeAspect:'16:9'}});
  const plan=compileStudioCompositionForRender(document);
  for(const l of result.layers){
    const expected=result.keys.filter(k=>k.targetId===l.id).map(({id,property,time,value,easing,curve})=>({id,property,time,value,easing,...curve?{curve}:{}}));
    expect(plan.layers.find(p=>p.id===l.id).motion_keyframes||[]).toEqual(expected);
  }
  expect(plan.groups).toHaveLength(2);
});

test('a bitmap identity keeps the original encoded image and lettering inside three native masked bands',()=>{
  const bitmap={dataUrl:'data:image/png;base64,aGVsbG8=',width:1254,height:1254,bounds:[33,494,1200,269]};
  const spec=buildStudioLogoMotion({...options,bitmap});validate(spec);
  const bands=spec.layers.filter(l=>l.name.startsWith('Mark / image band'));
  expect(bands).toHaveLength(3);expect(bands.every(l=>l.svg.includes(bitmap.dataUrl))).toBe(true);
  expect(bands.map(l=>l.mask.path)).toHaveLength(3);
  expect(spec.layers.filter(l=>l.name.startsWith('Wordmark /'))).toHaveLength(0);
  expect(spec.groups).toHaveLength(1);
  const lockup=spec.layers.find(l=>l.name==='Mark / continuous original lockup');
  expect(lockup.mask).toBeUndefined();expect(lockup.svg).toContain(bitmap.dataUrl);
  expect(bands.every(l=>l.startTime+l.duration<=2.6+1/90000)).toBe(true);
  for(const bad of [{...bitmap,dataUrl:'https://example.com/logo.png'}, {...bitmap,bounds:[-1,0,20,20]},
    {...bitmap,bounds:[0,0,1255,200]}, {...bitmap,dataUrl:'data:image/png;base64,'+'A'.repeat(500000)}])
    expect(()=>buildStudioLogoMotion({...options,bitmap:bad})).toThrow();
});
