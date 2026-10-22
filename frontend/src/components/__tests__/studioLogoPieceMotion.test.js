import { buildStudioLogoMotion } from '../studioLogoMotion';
import { cropStudioLogoBitmap } from '../studioLogoPieceMotion';
import { validateStudioGraphicsPackage, buildStudioGraphicsPackage } from '../studioGraphicsPackage';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';

function bitmap(){
  const width=120,height=40,pixels=new Uint8ClampedArray(width*height*4);
  for(let y=2;y<38;y++)for(let x=0;x<29;x++)pixels[(y*width+x)*4+3]=255;
  for(let y=15;y<29;y++)for(let x=37;x<120;x++)pixels[(y*width+x)*4+3]=255;
  return {width,height,pixels,bounds:[0,2,120,36],dataUrl:'data:image/png;base64,'+'A'.repeat(315000)};
}
const options=()=>({bitmap:bitmap(),pieceConstruction:true,separateBitmap:true,programmeDuration:10,measure:s=>s.length*22,
  encodeCrop:jest.fn(()=> 'data:image/png;base64,aGVsbG8=')});

test('native crops copy exact RGBA rows without changing the original pixels',()=>{
  const source=bitmap();source.pixels.forEach((_,i)=>{source.pixels[i]=i%251;});const before=source.pixels.slice();
  let written;const ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>{written=image.data;}};
  const spy=jest.spyOn(document,'createElement').mockReturnValue({getContext:()=>ctx,toDataURL:()=> 'data:image/png;base64,aGVsbG8='});
  try{cropStudioLogoBitmap(source,[7,9,3,2]);
    expect([...written]).toEqual([...before.slice((9*120+7)*4,(9*120+10)*4),...before.slice((10*120+7)*4,(10*120+10)*4)]);
    expect(source.pixels).toEqual(before);
  }finally{spy.mockRestore();}
});

test.each([[1280,720,8],[720,1280,10],[1080,1080,14]])('pieces fit import budgets, positions and programme clock at %s × %s / %ss',(width,height,duration)=>{
  const opts=options(),spec=buildStudioLogoMotion({...opts,width,height,duration,programmeDuration:duration});
  validateStudioGraphicsPackage(spec,{duration,aspect:width/height});
  expect(spec.layers.filter(l=>l.name.startsWith('Wordmark pieces /'))).toHaveLength(22);
  expect(opts.encodeCrop.mock.calls.map(c=>c[1][2]).reduce((a,b)=>a+b,0)).toBe(83);
  const words=spec.layers.filter(l=>l.name.startsWith('Words /'));
  expect(words.every(l=>l.fontWeight===800)).toBe(true);
  expect(new Set(words.map(l=>l.text))).toEqual(new Set(['Create.','Schedule.','Publish.','Move','forward.']));
  for(const word of new Set(words.map(l=>l.text))){
    const rows=words.filter(l=>l.text===word);expect(rows.filter(l=>l.mask?.enabled)).toHaveLength(3);
    expect(rows.find(l=>!l.mask)).toBeTruthy();
  }
  expect(spec.layers.every(l=>l.keys.every(k=>k.time>=l.startTime-1/90000&&k.time<=l.startTime+l.duration+1/90000))).toBe(true);
  expect(spec.layers.find(l=>l.name==='Mark / continuous original lockup').svg).toContain(opts.bitmap.dataUrl);
});

test('piece controls reject invalid counts, missing pixels and external cropped assets before graph mutation',()=>{
  for(const value of [1,17,2.5,NaN])expect(()=>buildStudioLogoMotion({...options(),pieceColumns:value})).toThrow('slices');
  expect(()=>buildStudioLogoMotion({...options(),bitmap:undefined})).toThrow('Choose a bitmap');
  expect(()=>buildStudioLogoMotion({...options(),separateBitmap:false})).toThrow('separate');
  expect(()=>buildStudioLogoMotion({...options(),bitmap:{...bitmap(),pixels:[]}})).toThrow('decoded');
  expect(()=>buildStudioLogoMotion({...options(),encodeCrop:()=> 'https://example.com/piece.png'})).toThrow('cropped');
});

test('all piece masks and property keys reach the one canonical render compiler',async()=>{
  const spec=buildStudioLogoMotion(options());let id=0;
  const result=await buildStudioGraphicsPackage({input:spec,overlays:[],keyframes:[],compounds:[],order:[],duration:10,aspect:16/9,
    createId:prefix=>prefix+(++id),rasterize:async()=>new File(['png'],'piece.png'),createUrl:()=> 'blob:piece'});
  const doc=adaptStudioSnapshotToDocument({projectId:'pieces',snapshot:{timeline:[{id:'shot',sourceClipId:'source',startRequest:0,endRequest:10,duration:10}],
    overlays:result.overlays,motionKeyframes:result.keyframes,compoundClips:result.compounds,compositionOrder:result.order,reframeAspect:'16:9'}});
  const plan=compileStudioCompositionForRender(doc);
  expect(plan.groups).toHaveLength(6);
  for(const layer of result.layers){
    const compiled=plan.layers.find(l=>l.id===layer.id);
    expect(compiled.motion_keyframes||[]).toEqual(result.keys.filter(k=>k.targetId===layer.id).map(({targetId,...k})=>k));
    if(layer.mask)expect(compiled.effects.mask).toEqual(layer.mask);
  }
});
