import { buildStudioLogoMotion } from '../studioLogoMotion';
import { validateStudioGraphicsPackage, buildStudioGraphicsPackage } from '../studioGraphicsPackage';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';

const options=()=>{
  const width=120,height=40,pixels=new Uint8ClampedArray(width*height*4);
  for(let y=2;y<38;y++)for(let x=0;x<29;x++)pixels[(y*width+x)*4+3]=255;
  for(let y=15;y<29;y++)for(let x=37;x<120;x++)pixels[(y*width+x)*4+3]=255;
  return {bitmap:{width,height,pixels,bounds:[0,2,120,36],dataUrl:'data:image/png;base64,'+'A'.repeat(315000)},
    pieceConstruction:true,separateBitmap:true,pieceStyle:'diamond',programmeDuration:10,measure:s=>s.length*22,
    encodeCrop:()=> 'data:image/png;base64,aGVsbG8='};
};
test.each([[1280,720,8,2],[720,1280,10,11],[1080,1080,14,16]])('alternate arrangement stays bounded at %s × %s / %ss with %s slices',(width,height,duration,pieceColumns)=>{
  const spec=buildStudioLogoMotion({...options(),width,height,duration,programmeDuration:duration,pieceColumns});
  validateStudioGraphicsPackage(spec,{duration,aspect:width/height});
  expect(spec.layers.filter(l=>l.name.startsWith('Wordmark pieces /'))).toHaveLength(pieceColumns*2);
  expect(spec.layers.filter(l=>l.name.startsWith('Words /')&&l.mask?.enabled)).toHaveLength(20);
  expect(spec.layers.filter(l=>l.type==='text').every(l=>l.fontWeight===800)).toBe(true);
  expect(spec.layers.every(l=>l.keys.every(k=>k.time>=l.startTime-1/90000&&k.time<=l.startTime+l.duration+1/90000))).toBe(true);
  expect(spec.groups).toHaveLength(6);
  for(const layer of spec.layers.filter(l=>l.name.startsWith('Wordmark pieces /')))
    expect(layer.keys.filter(k=>k.property==='y').every(k=>k.value<=56-layer.height*.6)).toBe(true);
});
test('four title wedges partition the entire text box without holes or double coverage',()=>{
  const spec=buildStudioLogoMotion(options()),parts=spec.layers.filter(l=>l.name.startsWith('Words / Create.')&&l.mask);
  const polygons=parts.map(l=>l.mask.path.match(/[\d.]+% [\d.]+%/g).map(p=>p.match(/[\d.]+/g).map(Number)));
  const inside=(polygon,x,y)=>{let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [xi,yi]=polygon[i],[xj,yj]=polygon[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;
  }return hit;};
  for(let y=.37;y<100;y+=4.3)for(let x=.61;x<100;x+=3.7)expect(polygons.filter(p=>inside(p,x,y))).toHaveLength(1);
});
test('comparison keeps the first arrangement unchanged and uses a word-first, centre-out second arrangement',()=>{
  const opts=options(),first=buildStudioLogoMotion({...opts,pieceStyle:'spring'}),second=buildStudioLogoMotion(opts);
  expect(first).toEqual(buildStudioLogoMotion({...opts,pieceStyle:undefined}));
  expect(second.layers.find(l=>l.name==='Words / Create. / piece 1').startTime).toBe(0);
  expect(second.layers.find(l=>l.name==='Construction / symbol ribbon 1').startTime).toBeGreaterThan(4);
  expect(second.layers.find(l=>l.name==='Wordmark pieces / 6 upper').startTime).toBeLessThan(second.layers.find(l=>l.name==='Wordmark pieces / 1 upper').startTime);
  const settled=second.layers.find(l=>l.name==='Mark / continuous original lockup');expect(settled.svg).toContain(opts.bitmap.dataUrl);expect(settled.mask).toBeUndefined();
  expect(()=>buildStudioLogoMotion({...opts,pieceStyle:'unsupported'})).toThrow('Choose Spring');
  expect(buildStudioLogoMotion({...opts,includeBackground:false}).layers.some(l=>l.name.startsWith('Stage /'))).toBe(false);
});
test('alternate masks, group membership and complete keys compile through the existing engine',async()=>{
  let id=0;const result=await buildStudioGraphicsPackage({input:buildStudioLogoMotion(options()),overlays:[],keyframes:[],compounds:[],order:[],duration:10,aspect:16/9,
    createId:prefix=>prefix+(++id),rasterize:async()=>new File(['png'],'piece.png'),createUrl:()=> 'blob:piece'});
  const doc=adaptStudioSnapshotToDocument({projectId:'diamond',snapshot:{timeline:[{id:'shot',sourceClipId:'source',startRequest:0,endRequest:10,duration:10}],
    overlays:result.overlays,motionKeyframes:result.keyframes,compoundClips:result.compounds,compositionOrder:result.order,reframeAspect:'16:9'}});
  const plan=compileStudioCompositionForRender(doc);expect(plan.groups).toHaveLength(6);
  for(const layer of result.layers){const compiled=plan.layers.find(l=>l.id===layer.id);
    expect(compiled.motion_keyframes||[]).toEqual(result.keys.filter(k=>k.targetId===layer.id).map(({targetId,...k})=>k));
    if(layer.mask)expect(compiled.effects.mask).toEqual(layer.mask);
  }
});
