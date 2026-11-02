import {studioSharedOverlayFrame,studioOverlayDecodeKey,studioSecondaryOverlayFrame} from '../studioSharedOverlayFrame';
const hash='a'.repeat(64),picture={width:1280,height:720};
const layer={id:'foreground',type:'video',sourceStoragePath:'owned/shot',contentHash:hash,sourceStartTime:4,startTime:16,duration:4,sourceDuration:12};
const frame={picture,sourceTime:5,storagePath:'owned/shot',contentHash:hash};
test('independent masks and poses share the identical owned decoded picture without changing the edit',()=>{
 const before=JSON.stringify(layer);
 expect(studioSharedOverlayFrame({...layer,mask:{enabled:true},scale:2},frame,17)).toBe(picture);
 expect(JSON.stringify(layer)).toBe(before);
});
test.each([{useOverlayAudio:true},{sourceStoragePath:'different'},{contentHash:'b'.repeat(64)},{sourceStartTime:4.01},{duration:.5}])('an unaligned or audible overlay retains its own decoder: %j',patch=>{
 expect(studioSharedOverlayFrame({...layer,...patch},frame,17)).toBe(null);
});
test('source boundaries, missing identity and solo preview cannot borrow a programme frame',()=>{
 expect(studioSharedOverlayFrame(layer,frame,15)).toBe(null);
 expect(studioSharedOverlayFrame(layer,frame,20)).toBe(null);
 expect(studioSharedOverlayFrame({...layer,contentHash:null},frame,17)).toBe(null);
 expect(studioSharedOverlayFrame(layer,frame,17,'foreground')).toBe(null);
});
test('independent UV regions and masks share one secondary source clock, retaining source identity',()=>{
 const owner={...layer,id:'owner'},video={seeking:false,readyState:4,paused:true,currentTime:5};
 const piece={...layer,perspective:{sourceRect:[20,0,30,100]}};
 expect(studioOverlayDecodeKey(piece)).toBe(studioOverlayDecodeKey(owner));
 expect(studioSecondaryOverlayFrame(piece,owner,video,17)).toEqual({picture:video,sourceTime:5,ownerId:'owner'});
 for(const patch of [{sourceStoragePath:'another-owner/shot'},{contentHash:'b'.repeat(64)},{sourceStartTime:4.1},{useOverlayAudio:true},{sourceEndBehavior:'loop'}])
  expect(studioSecondaryOverlayFrame({...piece,...patch},owner,video,17)).toBeNull();
 expect(studioSecondaryOverlayFrame(piece,owner,{...video,seeking:true},17)).toBeNull();
 expect(studioSecondaryOverlayFrame(piece,owner,{...video,currentTime:4.5},17)).toBeNull();
 expect(studioSecondaryOverlayFrame(piece,owner,video,20)).toBeNull();
 expect(studioSecondaryOverlayFrame(piece,owner,video,17,'foreground')).toBeNull();
});
