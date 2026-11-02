import {bindStudioOverlayMedia,prepareStudioOverlayMedia} from '../studioOverlayMedia';
test('successful materialization preserves concurrent creative edits and prevents another upload',()=>{
 const before={id:'art',src:'blob:art',file:{},isLocal:true,x:50},uploaded={...before,src:'https://owned/art',sourceStoragePath:'owned/art',contentHash:'a'.repeat(64)};
 const next=bindStudioOverlayMedia({...before,x:60},before,uploaded);
 expect(next).toMatchObject({x:60,src:'https://owned/art',file:null,isLocal:false,sourceStoragePath:'owned/art'});
 expect(bindStudioOverlayMedia(next,before,uploaded)).toBe(next);
 expect(bindStudioOverlayMedia({...before,src:'blob:replacement'},before,uploaded).src).toBe('blob:replacement');
});


test('a partial failure retains successful bindings and cannot admit retry before sibling uploads settle',async()=>{
 const before=[{id:'one',src:'blob:one',file:{}},{id:'two',src:'blob:two',file:{}}];let current=[...before],finish;
 const wait=new Promise(resolve=>{finish=resolve;});let rejected=false;
 const operation=prepareStudioOverlayMedia(before,async layer=>{
   if(layer.id==='one')throw Error('one upload failed');
   await wait;const uploaded={...layer,src:'https://owned/two',sourceStoragePath:'owned/two'};
   current=current.map(item=>bindStudioOverlayMedia(item,layer,uploaded));return uploaded;
 }).catch(error=>{rejected=true;return error;});
 await Promise.resolve();await Promise.resolve();expect(rejected).toBe(false);
 finish();expect((await operation).message).toBe('one upload failed');
 expect(current[1]).toMatchObject({src:'https://owned/two',isLocal:false,file:null});
 const retry=jest.fn(async layer=>layer);await prepareStudioOverlayMedia(current.filter(layer=>String(layer.src).startsWith('blob:')),retry);
 expect(retry).toHaveBeenCalledTimes(1);expect(retry.mock.calls[0][0].id).toBe('one');
});
