import {compileStudioNodeEffects,applyStudioNodeEffects,studioDepthScale} from '../studioNodeEffects';
import {evaluateWorldLayerPose,layerRequiresWorldBake,reparentStudioLayerPreservingWorldPose} from '../studioCompRigging';
const spec=patch=>compileStudioNodeEffects({type:'image',...patch});
const pixels=(colors)=>new Uint8ClampedArray(colors.flat());
it('keys green while retaining red and existing alpha; bypass restores original pixels',()=>{
 const src=pixels([[0,212,85,255],[255,0,0,128]]),copy=new Uint8ClampedArray(src);
 applyStudioNodeEffects(src,2,1,spec({chromaKey:{enabled:true,spillSuppression:0}}),0,1);
 expect(src[3]).toBe(0);expect(src[7]).toBe(128);
 applyStudioNodeEffects(copy,2,1,spec({chromaKey:{enabled:false}}));expect([...copy]).toEqual([0,212,85,255,255,0,0,128]);
});
it.each(['chroma','hsl_delta'])('keys %s screen and inverts its matte',mode=>{
 const d=pixels([[0,212,85,255],[255,0,0,255]]);applyStudioNodeEffects(d,2,1,spec({chromaKey:{enabled:true,mode,invert:true}}));expect(d[3]).toBe(255);expect(d[7]).toBe(0);
});
it('luma keys black without tint suppression',()=>{const d=pixels([[0,0,0,255],[255,255,255,255]]);applyStudioNodeEffects(d,2,1,spec({chromaKey:{enabled:true,mode:'luma'}}));expect(d[3]).toBe(0);expect(d[7]).toBe(255);});
it('choke shrinks the retained matte and negative choke grows it',()=>{
 const src=pixels([[0,212,85,255],[255,0,0,255],[0,212,85,255]]),a=new Uint8ClampedArray(src),b=new Uint8ClampedArray(src);
 applyStudioNodeEffects(a,3,1,spec({chromaKey:{enabled:true,choke:1}}),0,1);applyStudioNodeEffects(b,3,1,spec({chromaKey:{enabled:true,choke:-1}}),0,1);expect(a[7]).toBe(0);expect(b[3]).toBe(255);
});
it('warp changes pixels deterministically on programme time',()=>{const src=new Uint8ClampedArray(8*8*4);for(let i=0;i<src.length;i++)src[i]=i%255;const a=new Uint8ClampedArray(src),b=new Uint8ClampedArray(src),c=new Uint8ClampedArray(src),s=spec({displacementWarp:{enabled:true,amountX:3,amountY:2}});applyStudioNodeEffects(a,8,8,s,0,1);applyStudioNodeEffects(b,8,8,s,0,1);applyStudioNodeEffects(c,8,8,s,1,1);expect(a).toEqual(b);expect(a).not.toEqual(src);expect(a).not.toEqual(c);});
it('defocus uses associated alpha and optics spread bright highlights',()=>{
 const src=new Uint8ClampedArray(9*9*4);src.set([255,255,255,255],(4*9+4)*4);const a=new Uint8ClampedArray(src),b=new Uint8ClampedArray(src);
 applyStudioNodeEffects(a,9,9,spec({dofBlur:2}),0,1);expect(a[(4*9+3)*4]).toBe(255);expect(a[(4*9+3)*4+3]).toBeGreaterThan(0);
 applyStudioNodeEffects(b,9,9,spec({opticalFx:{halation:1,anamorphicStreak:1}}),0,.2);expect(b[(4*9+3)*4+3]).toBeGreaterThan(0);
});
it('depth changes shared preview pose and requires canonical export baking',()=>{const layer={id:'i',type:'image',zDepth:100,scale:.5};expect(studioDepthScale(layer)).toBe(2);expect(evaluateWorldLayerPose(layer).scale).toBe(1);expect(layerRequiresWorldBake(layer)).toBe(true);});
it.each([{zDepth:Infinity},{dofBlur:-1},{chromaKey:{mode:'bad'}},{opticalFx:{halation:NaN}},{displacementWarp:{frequency:0}}])('rejects malformed node values %p',value=>expect(()=>spec(value)).toThrow());
it('neutral effects preserve every byte',()=>{const d=pixels([[5,88,170,17],[245,2,91,255]]),before=[...d];applyStudioNodeEffects(d,2,1,spec({}));expect([...d]).toEqual(before);});

it('reparenting and unparenting a depth plane preserve its world scale',()=>{const rig={id:'rig',type:'text',isNullRig:true,scale:2,zDepth:20},layer={id:'i',type:'image',zDepth:40,scale:.5};const world=evaluateWorldLayerPose(layer,[rig,layer]);const parented=reparentStudioLayerPreservingWorldPose(layer,'rig',[rig,layer]);expect(evaluateWorldLayerPose(parented,[rig,parented]).scale).toBeCloseTo(world.scale,3);const detached=reparentStudioLayerPreservingWorldPose(parented,null,[rig,parented]);expect(evaluateWorldLayerPose(detached,[rig,detached]).scale).toBeCloseTo(world.scale,3);});
