import {studioTitleMatteMarkup} from '../studioTitleMatte';
import {buildTrackMatteStageSvgDataUri} from '../studioCompRigging';
import glyphs from '../motion/titleGlyphs.v1.json';
import metrics from '../motion/textMetrics.v1.json';

test.each([400,600,800,900])('a %s title matte embeds the licensed native glyphs at the existing 36px layout scale',weight=>{
 const layer={id:'type',type:'text',text:'FRAME',width:90,fontWeight:weight,scale:4.15,x:50,y:54,shadow:'none',startTime:0,duration:4};
 const svg=decodeURIComponent(buildTrackMatteStageSvgDataUri({matteLayer:layer,mode:'alpha',time:1,stageAspect:16/9}));
 expect(svg).not.toContain('<text');expect(svg).toContain(glyphs.weights[weight].glyphs.F.path);
 expect(svg).toContain('scale(4.15)');expect(svg).toContain(`scale(${36/glyphs.weights[weight].unitsPerEm} ${-36/glyphs.weights[weight].unitsPerEm})`);
 expect(glyphs.weights[weight].sha256).toBe(metrics.weights[weight].sha256);
});
test('a multiline title uses the same anchors, line height, weight and ordinary animation',()=>{
 const layer={type:'text',text:'F\nR',fontWeight:900,width:90,textAlign:'left',anchorX:0,anchorY:0,
  startTime:0,duration:4,animation:{enter:'zoom',enterDuration:1,exit:'none'}};
 const markup=studioTitleMatteMarkup(layer,{scale:2},16/9,.5,'#ffffff');
 expect(markup).toContain('translate(16 46.2)');expect(markup).toContain('translate(16 96.6)');
 expect(markup).toContain('opacity="0.875"');expect(Number(/scale\(([^)]+)\)/.exec(markup)[1])).toBeCloseTo(1.925,8);
});
