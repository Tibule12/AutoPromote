import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import StudioGeneratedBRollPanel from '../StudioGeneratedBRollPanel';
const input={projectId:'project-one',sourceStoragePath:'studio/sources/owner/source.mp4',
  duration:120,captions:[{id:'cue',start:20,end:24,text:'Making bread.',reviewRequired:false}]};
const shot={id:'shot-1',status:'ready_for_review',title:'Bread',start:20,duration:3,evidenceQuote:'Making bread.',
  seed:42,asset:{contentHash:'a'.repeat(64),url:'https://example.test/video',generationProvenance:{model:'Wan'}}};
const ready={id:'job-one',projectId:input.projectId,status:'ready_for_review',inputState:input,shots:[shot]};
let accept,remember,getRequest;
const response=data=>({ok:true,status:200,json:async()=>data});
const setup=props=>render(<StudioGeneratedBRollPanel projectId="project-one" apiBase="http://api.test"
  getToken={async()=> 'unit-test-token'} getRequest={getRequest} onAccept={accept} onRemember={remember} {...props}/>);
beforeEach(()=>{accept=jest.fn();remember=jest.fn();getRequest=jest.fn(async()=>input);global.fetch=jest.fn();});
afterEach(()=>{delete global.fetch;});
test('recovers only server-owned project jobs without dispatching another generation',async()=>{
  fetch.mockResolvedValue(response({jobs:[ready]}));setup({});
  await screen.findByText('Use this generated shot');
  expect(remember).toHaveBeenCalledWith(ready.id);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toContain('?projectId=project-one');
  expect(fetch.mock.calls[0][1].method).toBe('GET');
});
test('a changed transcript blocks accepting a stale generated plan before review dispatch',async()=>{
  fetch.mockResolvedValue(response({job:ready}));getRequest.mockResolvedValue({...input,captions:[{...input.captions[0],text:'Different words.'}]});
  setup({jobId:ready.id});fireEvent.click(await screen.findByText('Use this generated shot'));
  expect(await screen.findByRole('alert')).toHaveTextContent('transcript or timeline changed');
  expect(accept).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(1);
});
test('review dispatch binds the exact artifact hash and uses the ordinary placement callback',async()=>{
  fetch.mockResolvedValueOnce(response({job:ready})).mockResolvedValueOnce(response({job:{...ready,shots:[{...shot,status:'accepted'}]}}));
  setup({jobId:ready.id});fireEvent.click(await screen.findByText('Use this generated shot'));
  await waitFor(()=>expect(accept).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({shotId:'shot-1',decision:'accept',contentHash:'a'.repeat(64)});
  expect(accept.mock.calls[0][0].status).toBe('accepted');
});
test('a definitive transcript rejection retries the corrected edit with a fresh request',async()=>{
  fetch.mockResolvedValueOnce(response({jobs:[]}))
    .mockResolvedValueOnce({ok:false,status:409,json:async()=>({code:'BROLL_TRANSCRIPT_REVIEW_REQUIRED'})})
    .mockResolvedValueOnce(response({job:{...ready,status:'queued',shots:[]}}));
  setup({});
  await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText('Generate B-roll for this edit'));
  await screen.findByRole('alert');
  const corrected={...input,captions:[{...input.captions[0],text:'Corrected bread wording.'}]};
  getRequest.mockResolvedValue(corrected);
  fireEvent.click(screen.getByText('Generate B-roll for this edit'));
  await waitFor(()=>expect(remember).toHaveBeenCalledWith(ready.id));
  const first=JSON.parse(fetch.mock.calls[1][1].body),second=JSON.parse(fetch.mock.calls[2][1].body);
  expect(second.captions).toEqual(corrected.captions);
  expect(second.requestId).not.toEqual(first.requestId);
});
test('an uncertain network outcome keeps the same idempotent request on retry',async()=>{
  fetch.mockResolvedValueOnce(response({jobs:[]})).mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValueOnce(response({job:{...ready,status:'queued',shots:[]}}));
  setup({});await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText('Generate B-roll for this edit'));await screen.findByRole('alert');
  fireEvent.click(screen.getByText('Generate B-roll for this edit'));
  await waitFor(()=>expect(remember).toHaveBeenCalledWith(ready.id));
  expect(fetch.mock.calls[2][1].body).toEqual(fetch.mock.calls[1][1].body);
  expect(getRequest).toHaveBeenCalledTimes(1);
});
test('review controls wait for the generation job to finish',async()=>{
  fetch.mockResolvedValue(response({job:{...ready,status:'generating'}}));setup({jobId:ready.id});
  expect(await screen.findByText('Use this generated shot')).toBeDisabled();
  expect(screen.getByText('Reject shot')).toBeDisabled();
});
test('a rejected take can rerun visual review using its same exact hash',async()=>{
  const rejected={...ready,status:'partial',shots:[{...shot,asset:undefined,status:'rejected',review:{artifactSha256:'b'.repeat(64)}}]};
  fetch.mockResolvedValueOnce(response({job:rejected})).mockResolvedValueOnce(response({job:{...rejected,status:'reviewing'}}));
  setup({jobId:ready.id});fireEvent.click(await screen.findByText('Recheck visual review'));
  await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls[1][0]).toContain('/job-one/recheck');
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({shotId:'shot-1',contentHash:'b'.repeat(64)});
  expect(accept).not.toHaveBeenCalled();
});
