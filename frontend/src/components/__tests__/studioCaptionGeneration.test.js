import { captionsForSource, mergeSourceCaptions } from '../studioCaptionGeneration';

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
