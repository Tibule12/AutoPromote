import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StudioSubjectMaskControls from "../StudioSubjectMaskControls";
import { stable } from "../studioSubjectVfxContract";
import { buildStudioLayersFromSnapshot, projectStudioLinkedTimingToSnapshot } from '../studioProjectDocument';
const digest="c".repeat(64), jobId="a".repeat(64);
const scene={version:1,id:"scene-a",sourceId:"source-a",sourceStoragePath:"studio/sources/owner/source.mp4",
  sourceRange:{start:0,end:6},prompt:{points:[[.4,.3]],labels:[1],shotPrompts:[]},
  effects:[{id:"set",type:"background_replace",start:0,end:6,asset_id:"plate",asset_sha256:"d".repeat(64),blur:2,exposure:0,saturation:1}]};
const document={projectId:"project-a",revision:5,assets:[{sourceId:"source-a",contentHash:digest,storagePath:scene.sourceStoragePath}]};
const reference={kind:"model_capability",schemaVersion:1,artifactHash:"b".repeat(64),sourceAssetId:"source-a",sourceContentHash:digest,
  capability:"segment_subject",sourceRange:{space:"source",startTick:0,endTick:540000}};
const response=data=>({ok:true,json:async()=>data});
function Harness({initial={scene,enabled:true}}={}){const[item,setItem]=useState(initial);return <>
  <StudioSubjectMaskControls item={item} onChange={setItem} getDocument={()=>document} getToken={async()=>"fixture-token"}
    apiBase="http://fixture.invalid" createId={()=>"request-a"}/><pre data-testid="saved-mask">{JSON.stringify(item)}</pre></>;}
afterEach(()=>delete global.fetch);
test('completed mask replacement and cold reopen retain the selected cleanup recipe for the next refinement',async()=>{
 const component={id:'prop-a',box:[.4,.4,.8,.9],points:[{position:[.5,.6],label:1},{position:[.7,.6],label:0}],propagate:false};
 const initial={scene,enabled:true,modelArtifactRef:reference,maskComponents:[component],maskJob:{finished:true,
  selectionJson:stable({box:[.05,.02,.75,.99],refinement:{radius:15,colourComponentIds:['prop-a']}})}};
 global.fetch=jest.fn().mockResolvedValueOnce(response({ok:true,projectId:document.projectId,revision:document.revision}))
  .mockResolvedValueOnce(response({jobId})).mockResolvedValueOnce(response({jobId,status:'completed'}))
  .mockResolvedValueOnce(response({scene,enabled:true,modelArtifactRef:reference}));
 const view=render(<Harness initial={initial}/>);
 expect(screen.getByLabelText('Edge refinement radius')).toHaveValue(15);
 expect(screen.getByRole('checkbox',{name:'Clean fine edges of foreground object 1'})).toBeChecked();
 fireEvent.click(screen.getByRole('button',{name:'Refine foreground selection'}));
 fireEvent.click(screen.getByRole('button',{name:'Create subject mask'}));
 await screen.findByRole('button',{name:'Subject mask attached'});
 const saved=JSON.parse(screen.getByTestId('saved-mask').textContent);
 expect(saved.maskRefinementRadius).toBe(15);expect(saved.maskColourComponentIds).toEqual(['prop-a']);
 expect(JSON.parse(saved.maskJob.selectionJson)).not.toHaveProperty('refinement');
 view.unmount();
 const layers=buildStudioLayersFromSnapshot({subjectVfxScenes:[saved]});
 const reopened=projectStudioLinkedTimingToSnapshot(JSON.parse(JSON.stringify({layers}))).subjectVfxScenes[0];
 global.fetch=jest.fn().mockResolvedValueOnce(response({ok:true,projectId:document.projectId,revision:document.revision}))
  .mockRejectedValueOnce(new Error('Captured restored recipe'));
 render(<Harness initial={reopened}/>);
 expect(screen.getByLabelText('Edge refinement radius')).toHaveValue(15);
 expect(screen.getByRole('checkbox',{name:'Clean fine edges of foreground object 1'})).toBeChecked();
 fireEvent.click(screen.getByRole('button',{name:'Refine saved mask edges'}));
 await screen.findByText('Captured restored recipe');
 expect(JSON.parse(fetch.mock.calls[1][1].body).parameters.refinement).toMatchObject({radius:15,colourComponentIds:['prop-a']});
});

test('changing the radius saves it and invalid drafts cannot start a request',()=>{
 render(<Harness initial={{scene,enabled:true,modelArtifactRef:reference,maskRefinementRadius:15}}/>);
 const radius=screen.getByLabelText('Edge refinement radius');
 fireEvent.change(radius,{target:{value:'18'}});expect(JSON.parse(screen.getByTestId('saved-mask').textContent).maskRefinementRadius).toBe(18);
 fireEvent.change(radius,{target:{value:'25'}});expect(screen.getByRole('button',{name:'Refine saved mask edges'})).toBeDisabled();
 fireEvent.blur(radius);expect(radius).toHaveValue(18);expect(screen.getByRole('button',{name:'Refine saved mask edges'})).toBeEnabled();
});

test('selecting another scene loads its own saved radius instead of carrying the previous scene draft',()=>{
 const props={onChange:jest.fn(),getDocument:()=>document,getToken:async()=>'fixture-token',apiBase:'http://fixture.invalid',createId:()=> 'request-a'};
 const view=render(<StudioSubjectMaskControls {...props} item={{scene,modelArtifactRef:reference,maskRefinementRadius:15}}/>);
 expect(screen.getByLabelText('Edge refinement radius')).toHaveValue(15);
 view.rerender(<StudioSubjectMaskControls {...props} item={{scene:{...scene,id:'scene-b',sourceId:'source-b'},modelArtifactRef:{...reference,sourceAssetId:'source-b'}}}/>);
 expect(screen.getByLabelText('Edge refinement radius')).toHaveValue(10);
});

test('cancelling a pending legacy refinement retains the recipe after removing its job metadata',async()=>{
 const component={id:'prop-a',box:[.4,.4,.8,.9],points:[{position:[.5,.6],label:1},{position:[.7,.6],label:0}],propagate:false};
 global.fetch=jest.fn().mockResolvedValue(response({status:'cancelled'}));
 render(<Harness initial={{scene,enabled:true,modelArtifactRef:reference,maskComponents:[component],
  maskJob:{jobId,finished:false,selectionJson:stable({refinement:{maskArtifactHash:reference.artifactHash,radius:15,colourComponentIds:['prop-a']}})}}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Cancel mask request'}));
 await screen.findByText('Mask request cancelled.');
 const saved=JSON.parse(screen.getByTestId('saved-mask').textContent);
 expect(saved).not.toHaveProperty('maskJob');expect(saved.maskRefinementRadius).toBe(15);
 expect(saved.maskColourComponentIds).toEqual(['prop-a']);expect(saved.modelArtifactRef).toEqual(reference);
});

test('fine colour correction is opt-in for the selected fixed object and stays in the refinement request',async()=>{
 const points=[{position:[.5,.6],label:1},{position:[.7,.6],label:0}];
 const component={id:'prop-a',box:[.4,.4,.8,.9],points,propagate:false};
 global.fetch=jest.fn().mockResolvedValueOnce(response({ok:true,projectId:document.projectId,revision:document.revision}))
  .mockRejectedValueOnce(new Error('Stop after capturing refinement'));
 render(<Harness initial={{scene,enabled:true,modelArtifactRef:reference,maskComponents:[component]}}/>);
 const selected=screen.getByRole('checkbox',{name:'Clean fine edges of foreground object 1',exact:true});expect(selected).not.toBeChecked();
 fireEvent.click(selected);expect(JSON.parse(screen.getByTestId('saved-mask').textContent).maskColourComponentIds).toEqual(['prop-a']);
 fireEvent.click(screen.getByRole('button',{name:'Refine saved mask edges'}));await screen.findByText('Stop after capturing refinement');
 const input=JSON.parse(fetch.mock.calls[1][1].body);expect(input.parameters.refinement.colourComponentIds).toEqual(['prop-a']);
 expect(input.parameters.components).toEqual([component]);expect(input.dependencyHashes).toEqual([reference.artifactHash]);
});
test('a reopened correction submits the saved person box rather than the default framing',async()=>{
 global.fetch=jest.fn().mockResolvedValueOnce(response({ok:true,projectId:document.projectId,revision:document.revision}))
  .mockResolvedValueOnce(response({jobId})).mockResolvedValueOnce(response({jobId,status:'completed'}))
  .mockResolvedValueOnce(response({scene,enabled:true,modelArtifactRef:reference}));
 render(<Harness initial={{scene,enabled:true,maskBox:[.26,.06,.98,1]}}/>);
 expect(screen.getByLabelText('Subject box right')).toHaveValue(.98);
 fireEvent.click(screen.getByRole('button',{name:'Create subject mask'}));
 await screen.findByRole('button',{name:'Subject mask attached'});
 expect(JSON.parse(fetch.mock.calls[1][1].body).parameters.initialBox).toEqual([.26,.06,.98,1]);
 expect(JSON.parse(screen.getByTestId('saved-mask').textContent).maskBox).toEqual([.26,.06,.98,1]);
});
test('later-frame subject and background clicks reach the worker without being replaced by a box',async()=>{
  const corrected={...scene,prompt:{...scene.prompt,shotPrompts:[{time:2,points:[[.5,.4],[.2,.2]],labels:[1,0]}]}};
  global.fetch=jest.fn().mockResolvedValueOnce(response({ok:true,projectId:document.projectId,revision:document.revision}))
    .mockResolvedValueOnce(response({jobId})).mockResolvedValueOnce(response({jobId,status:'completed'}))
    .mockResolvedValueOnce(response({scene:corrected,enabled:true,modelArtifactRef:reference}));
  render(<Harness initial={{scene:corrected,enabled:true}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Create subject mask'}));
  await screen.findByRole('button',{name:'Subject mask attached'});
  expect(JSON.parse(fetch.mock.calls[1][1].body).parameters.shotPrompts).toEqual([
    {frameIndex:48,box:[.05,.02,.75,.99],points:[{position:[.5,.4],label:1},{position:[.2,.2],label:0}]}
  ]);
});
test("a lost submission resumes the same saved request and attaches an owned capability reference",async()=>{
  global.fetch=jest.fn().mockResolvedValueOnce(response({ok:true,projectId:document.projectId,revision:document.revision}))
    .mockRejectedValueOnce(new Error("Network response lost"));
  render(<Harness/>);
  fireEvent.click(screen.getByRole("button",{name:"Create subject mask"}));
  await screen.findByText("Network response lost");
  const first=JSON.parse(fetch.mock.calls[1][1].body);
  expect(first.capability).toBe("segment_subject");expect(first).not.toHaveProperty("model");
  fetch.mockResolvedValueOnce(response({jobId})).mockResolvedValueOnce(response({jobId,status:"completed"}))
    .mockResolvedValueOnce(response({scene,enabled:true,modelArtifactRef:reference}));
  fireEvent.click(screen.getByRole("button",{name:"Resume subject mask"}));
  await waitFor(()=>expect(screen.getByRole("button",{name:"Subject mask attached"})).toBeDisabled());
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual(first);
  expect(screen.getByTestId("saved-mask")).toHaveTextContent(reference.artifactHash);
  expect(fetch.mock.calls.filter(([url])=>url.includes("projects/revisions"))).toHaveLength(1);
});
test("an unregistered project cannot dispatch paid inference",async()=>{
  global.fetch=jest.fn().mockResolvedValueOnce({ok:false,json:async()=>({error:"project_revision_conflict"})});
  render(<Harness/>);fireEvent.click(screen.getByRole("button",{name:"Create subject mask"}));
  await screen.findByText("project_revision_conflict");expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("saved-mask")).not.toHaveTextContent('"maskJob"');
});
test("separate fixed equipment selection is persisted in the capability request and retained on attachment",async()=>{
  global.fetch=jest.fn().mockResolvedValueOnce(response({ok:true,projectId:document.projectId,revision:document.revision}))
    .mockResolvedValueOnce(response({jobId})).mockResolvedValueOnce(response({jobId,status:"completed"}))
    .mockResolvedValueOnce(response({scene,enabled:true,modelArtifactRef:reference}));
  render(<Harness/>);
  fireEvent.click(screen.getByLabelText("Object stays fixed in this shot"));
  fireEvent.click(screen.getByRole("button",{name:"Add component point"}));
  fireEvent.click(screen.getByRole("button",{name:"Add foreground component"}));
  fireEvent.click(screen.getByRole("button",{name:"Create subject mask"}));
  await screen.findByRole("button",{name:"Subject mask attached"});
  const input=JSON.parse(fetch.mock.calls[1][1].body);
  expect(input.parameters.components).toEqual([{id:"request-a",box:[.45,.45,.85,.99],points:[{position:[.5,.5],label:1}],propagate:false}]);
  const saved=JSON.parse(screen.getByTestId("saved-mask").textContent);
  expect(saved.maskComponents).toEqual(input.parameters.components);
  fireEvent.click(screen.getByRole("button",{name:"Refine foreground selection"}));
  expect(JSON.parse(screen.getByTestId("saved-mask").textContent)).not.toHaveProperty("modelArtifactRef");
  expect(screen.getByRole("button",{name:"Create subject mask"})).toBeEnabled();
});

test('edge refinement requests a saved artifact dependency without selecting a model or discarding the original',async()=>{
 global.fetch=jest.fn().mockResolvedValueOnce(response({ok:true,projectId:document.projectId,revision:document.revision}))
  .mockResolvedValueOnce(response({jobId})).mockResolvedValueOnce(response({jobId,status:'completed'}))
  .mockResolvedValueOnce(response({scene,enabled:true,modelArtifactRef:reference}));
 render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Create subject mask'}));
 await screen.findByRole('button',{name:'Refine saved mask edges'});
 fetch.mockResolvedValueOnce(response({ok:true,projectId:document.projectId,revision:document.revision}))
  .mockRejectedValueOnce(new Error('Refinement response lost'));
 fireEvent.click(screen.getByRole('button',{name:'Refine saved mask edges'}));
 await screen.findByText('Refinement response lost');
 const input=JSON.parse(fetch.mock.calls[5][1].body);
 expect(input.capability).toBe('segment_subject');expect(input.dependencyHashes).toEqual([reference.artifactHash]);
 expect(input.parameters.refinement).toEqual({maskArtifactHash:reference.artifactHash,radius:10,holdouts:[]});
 expect(input).not.toHaveProperty('model');
 const saved=JSON.parse(screen.getByTestId('saved-mask').textContent);
 expect(saved.modelArtifactRef).toEqual(reference);expect(saved.maskJob.mode).toBe('refinement');
 expect(screen.getByRole('button',{name:'Resume subject mask'})).toBeEnabled();
 expect(screen.getByRole('button',{name:'Refine saved mask edges'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Refine foreground selection'})).toBeDisabled();
});

test('a reopened legacy refinement attaches the existing job without resubmitting inference',async()=>{
 const refined={...reference,artifactHash:'e'.repeat(64)};
 const selection={sourceId:scene.sourceId,sourceStoragePath:scene.sourceStoragePath,sourceRange:scene.sourceRange,
  prompt:scene.prompt,box:[.05,.02,.75,.99],refinement:{maskArtifactHash:reference.artifactHash,radius:10,holdouts:[]}};
 global.fetch=jest.fn().mockResolvedValueOnce(response({jobId,status:'completed'}))
  .mockResolvedValueOnce(response({scene,enabled:true,modelArtifactRef:refined}));
 render(<Harness initial={{scene,enabled:true,modelArtifactRef:reference,maskRefinementRadius:15,maskColourComponentIds:[],
  maskJob:{requestId:'request-a',projectId:document.projectId,projectRevision:5,jobId,selectionJson:stable(selection)}}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Resume subject mask'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Subject mask attached'})).toBeDisabled());
 expect(fetch.mock.calls.map(([url])=>url)).toEqual([
  `http://fixture.invalid/api/media/studio-subject-masks/jobs/${jobId}`,
  `http://fixture.invalid/api/media/studio-subject-masks/jobs/${jobId}/subject`]);
 const saved=JSON.parse(screen.getByTestId('saved-mask').textContent);
 expect(saved.maskJob.finished).toBe(true);expect(saved.modelArtifactRef).toEqual(refined);
 expect(saved.maskRefinementRadius).toBe(15);expect(saved.maskColourComponentIds).toEqual([]);
});

test('a stale saved mask requires explicit native reuse and registers the current edit without another model request',async()=>{
 const refined={...reference,artifactHash:'e'.repeat(64)};
 const selection={sourceId:scene.sourceId,sourceStoragePath:scene.sourceStoragePath,sourceRange:scene.sourceRange,
  prompt:scene.prompt,box:[.05,.02,.75,.99],refinement:{maskArtifactHash:reference.artifactHash,radius:10,holdouts:[]}};
 global.fetch=jest.fn().mockResolvedValueOnce(response({jobId,status:'stale'}))
  .mockResolvedValueOnce(response({ok:true,projectId:document.projectId,revision:document.revision}))
  .mockResolvedValueOnce(response({scene,enabled:true,modelArtifactRef:refined}));
 render(<Harness initial={{scene,enabled:true,modelArtifactRef:reference,maskRefinementRadius:15,maskColourComponentIds:[],
  maskJob:{requestId:'request-a',projectId:document.projectId,projectRevision:4,jobId,selectionJson:stable(selection)}}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Resume subject mask'}));
 await screen.findByRole('button',{name:'Use saved mask for this edit'});
 expect(fetch).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Use saved mask for this edit'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Subject mask attached'})).toBeDisabled());
 expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({id:scene.id,projectRevision:5});
 expect(fetch.mock.calls.some(([url])=>url.endsWith('/requests'))).toBe(false);
 const saved=JSON.parse(screen.getByTestId('saved-mask').textContent);
 expect(saved.maskJob.reusedAtRevision).toBe(5);
 expect(saved.maskRefinementRadius).toBe(15);expect(saved.maskColourComponentIds).toEqual([]);
});
