import { captionsForSource, mergeSourceCaptions, generatedCaptionId, captionForSourceWindow } from '../studioCaptionGeneration';

test('regenerating one source keeps reviewed captions and timing on other sources', () => {
  const a = {id:'a', sourceClipId:'camera-a', start:2, end:3, text:'Reviewed', textReviewed:true};
  const b = {id:'b', sourceClipId:'camera-b', start:2, end:3, text:'Old'};
  const next = {id:'new', sourceClipId:'camera-b', start:1, end:2, text:'New'};
  expect(mergeSourceCaptions([a,b], [next], 'camera-b', 'camera-a')).toEqual([a,next]);
  expect(captionsForSource([a,b], 'camera-b', 'camera-a')).toEqual([b]);
});

test('legacy unbound captions belong to the original source', () => {
  const legacy = {id:'legacy', text:'Original source', start:0, end:1};
  const next = {id:'new', sourceClipId:'second', text:'Second source', start:0, end:1};
  expect(mergeSourceCaptions([legacy], [next], 'second', 'original')).toEqual([legacy,next]);
  expect(mergeSourceCaptions([legacy,next], [], 'original', 'original')).toEqual([next]);
});


test('recognizer cue numbering cannot couple edits between sources or repeated line IDs',()=>{
 const raw=[{id:'1',text:'First line',start:0,end:1},{id:'1',text:'Repeated provider ID',start:1,end:2}];
 const bind=sourceId=>raw.map((s,index)=>({...s,sourceClipId:sourceId,id:generatedCaptionId(sourceId,s.id,index)}));
 const a=bind('camera:a'),b=bind('camera:b');const merged=mergeSourceCaptions(a,b,'camera:b','camera:a');
 expect(new Set(merged.map(s=>s.id)).size).toBe(4);
 const edited=merged.map(s=>s.id===b[0].id?{...s,text:'Reviewed second camera'}:s);
 expect(captionsForSource(edited,'camera:a','camera:a')).toEqual(a);
 expect(bind('camera:b').map(s=>s.id)).toEqual(b.map(s=>s.id));
});


test('caption review follows its camera even when another source has overlapping timestamps',()=>{
 const guest={id:'guest-line',sourceClipId:'guest',start:0,end:2,text:'Guest speech'};
 expect(captionForSourceWindow([guest],'host',{start:0,end:8})).toBeUndefined();
 expect(captionForSourceWindow([guest],'guest',{start:0,end:3})).toBe(guest);
 expect(captionForSourceWindow([guest],'guest',{start:2,end:3})).toBeUndefined();
 const imported={id:'unbound-subtitle',start:1,end:2,text:'Imported subtitle'};
 expect(captionForSourceWindow([imported],'host',{start:0,end:8})).toBe(imported);
});
