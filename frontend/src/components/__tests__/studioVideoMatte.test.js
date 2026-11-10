import { studioVideoMatteUri, studioVideoMatteAlpha } from '../studioVideoMatte';
import { validateStudioTrackMattes, buildTrackMatteStageSvgDataUri } from '../studioCompRigging';

function drawing(data = [0,0,0,255,255,255,255,255,255,0,0,128]) {
  const pixels = { data: new Uint8ClampedArray(data) };
  const ctx = Object.fromEntries(['clearRect','save','restore','translate','rotate','beginPath','rect','roundRect','clip','drawImage','putImageData'].map(k => [k, jest.fn()]));
  ctx.getImageData = jest.fn(() => pixels);
  const canvas = { width:640,height:360,getContext:()=>ctx,toDataURL:()=> 'data:image/png;base64,test' };
  return {canvas,ctx,pixels};
}
const video = { readyState:2,seeking:false,videoWidth:1280,videoHeight:720 };
const layer = { type:'video',startTime:4,duration:4,width:70,height:70,mediaFit:'contain' };
const pose = {x:50,y:50,scale:100/70,rotation:0,opacity:1};
test.each([['alpha',[255,255,128]],['alpha_inverted',[0,0,127]],['luma',[0,255,27]],['luma_inverted',[255,0,228]]])('%s uses decoded alpha and BT709 luma', (mode, expected) => {
  const {canvas,pixels}=drawing();expect(studioVideoMatteAlpha(canvas,mode)).toContain('image/png');
  expect([pixels.data[3],pixels.data[7],pixels.data[11]]).toEqual(expected);
});
test('world pose, source aspect and opacity are drawn on a bounded stage canvas',()=>{
 const {canvas,ctx}=drawing();expect(studioVideoMatteUri({video,layer,pose,time:5,aspect:16/9,canvas})).toBe(canvas);
 expect([canvas.width,canvas.height]).toEqual([640,360]);expect(ctx.translate).toHaveBeenCalledWith(320,180);
 expect(ctx.drawImage).toHaveBeenCalledWith(video,-320,-180,640,360);expect(ctx.globalAlpha).toBe(1);
 studioVideoMatteUri({video,layer,pose,time:8,aspect:16/9,canvas});expect(ctx.globalAlpha).toBe(0);
});
test('pending/absent decoders do not produce a fake rectangular matte',()=>{
 const {canvas}=drawing();expect(studioVideoMatteUri({video:{...video,seeking:true},layer,pose,time:5,aspect:16/9,canvas})).toBeNull();
 const uri=buildTrackMatteStageSvgDataUri({matteLayer:{...layer,id:'m'},overlays:[],time:5,stageAspect:16/9});
 expect(decodeURIComponent(uri)).not.toContain('<rect');expect(decodeURIComponent(uri)).not.toContain('<text');
});
test('an owned shared picture supplies matte pixels while the unused clone decoder is pending',()=>{
 const {canvas,ctx}=drawing(),picture={width:1280,height:720};
 expect(studioVideoMatteUri({video:{readyState:0,seeking:true},picture,layer,pose,time:5,aspect:16/9,canvas})).toBe(canvas);
 expect(ctx.drawImage).toHaveBeenCalledWith(picture,-320,-180,640,360);
 expect(studioVideoMatteUri({video,picture:{width:0,height:0},layer,pose,time:5,aspect:16/9,canvas})).toBeNull();
});
test('cover clips to its transformed rectangle and portrait work stays bounded',()=>{
 const {canvas,ctx}=drawing();studioVideoMatteUri({video,layer:{...layer,mediaFit:'cover',anchorX:0,anchorY:0},pose:{...pose,rotation:90,opacity:.5},time:5,aspect:9/16,canvas});
 expect([canvas.width,canvas.height]).toEqual([360,640]);expect(ctx.rotate).toHaveBeenCalledWith(Math.PI/2);expect(ctx.clip).toHaveBeenCalled();expect(ctx.globalAlpha).toBe(.5);
});
test('implicit frame corners and animated crop clip the decoded source inside its own box',()=>{
 const {canvas,ctx}=drawing();studioVideoMatteUri({video,layer:{...layer,frameShape:'round',borderRadius:28},pose:{...pose,cropX:10,cropY:5},time:5,aspect:16/9,canvas});
 expect(ctx.roundRect).toHaveBeenCalledWith(-320,-180,640,360,{x:44.800000000000004,y:25.200000000000003});
 expect(ctx.rect).toHaveBeenLastCalledWith(-256,-162,512,324);
 expect(ctx.clip).toHaveBeenCalledTimes(3);
});
test('shared authoring validation accepts a silent 2D video matte and refuses unpaired source effects',()=>{
 const source={id:'matte',type:'video'},fill={id:'fill',type:'video',trackMatte:{mode:'luma',sourceLayerId:'matte'}};
 expect(validateStudioTrackMattes([source,fill])).toBe(true);
 for(const effect of [{perspective:{}},{mask:{enabled:true}},{motionBlur:{enabled:true}},{layerShadow:{enabled:true}},{glow:{enabled:true}},{useOverlayAudio:true},{bRollMode:'fullscreen'}])expect(()=>validateStudioTrackMattes([{...source,...effect},fill])).toThrow(/Video matte sources/);
});

test('an ordinary transparent bitmap matte begins transparent until its actual pixels are available',()=>{
 const uri=buildTrackMatteStageSvgDataUri({matteLayer:{id:'circle',type:'image',src:'blob:circle',width:100,height:100,startTime:0,duration:6},overlays:[],time:2,stageAspect:16/9});
 expect(decodeURIComponent(uri)).not.toContain('<rect');expect(decodeURIComponent(uri)).not.toContain('<ellipse');
 const {canvas,ctx}=drawing(),picture={naturalWidth:1280,naturalHeight:720};
 expect(studioVideoMatteUri({picture,layer,pose,time:5,aspect:16/9,canvas})).toBe(canvas);expect(ctx.drawImage).toHaveBeenCalledWith(picture,-320,-180,640,360);
});
