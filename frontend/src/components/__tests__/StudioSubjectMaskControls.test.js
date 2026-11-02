import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StudioSubjectMaskControls from "../StudioSubjectMaskControls";
import { stable } from "../studioSubjectVfxContract";
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
 expect(input.parameters.refinement).toEqual({maskArtifactHash:reference.artifactHash,radius:10,holdouts:[],holdoutGroups:[]});
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
 render(<Harness initial={{scene,enabled:true,modelArtifactRef:reference,
  maskJob:{requestId:'request-a',projectId:document.projectId,projectRevision:5,jobId,selectionJson:stable(selection)}}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Resume subject mask'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Subject mask attached'})).toBeDisabled());
 expect(fetch.mock.calls.map(([url])=>url)).toEqual([
  `http://fixture.invalid/api/media/studio-subject-masks/jobs/${jobId}`,
  `http://fixture.invalid/api/media/studio-subject-masks/jobs/${jobId}/subject`]);
 const saved=JSON.parse(screen.getByTestId('saved-mask').textContent);
 expect(saved.maskJob.finished).toBe(true);expect(saved.modelArtifactRef).toEqual(refined);
});

test('a stale saved mask requires explicit native reuse and registers the current edit without another model request',async()=>{
 const refined={...reference,artifactHash:'e'.repeat(64)};
 const selection={sourceId:scene.sourceId,sourceStoragePath:scene.sourceStoragePath,sourceRange:scene.sourceRange,
  prompt:scene.prompt,box:[.05,.02,.75,.99],refinement:{maskArtifactHash:reference.artifactHash,radius:10,holdouts:[]}};
 global.fetch=jest.fn().mockResolvedValueOnce(response({jobId,status:'stale'}))
  .mockResolvedValueOnce(response({ok:true,projectId:document.projectId,revision:document.revision}))
  .mockResolvedValueOnce(response({scene,enabled:true,modelArtifactRef:refined}));
 render(<Harness initial={{scene,enabled:true,modelArtifactRef:reference,
  maskJob:{requestId:'request-a',projectId:document.projectId,projectRevision:4,jobId,selectionJson:stable(selection)}}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Resume subject mask'}));
 await screen.findByRole('button',{name:'Use saved mask for this edit'});
 expect(fetch).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Use saved mask for this edit'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Subject mask attached'})).toBeDisabled());
 expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({id:scene.id,projectRevision:5});
 expect(fetch.mock.calls.some(([url])=>url.endsWith('/requests'))).toBe(false);
 expect(JSON.parse(screen.getByTestId('saved-mask').textContent).maskJob.reusedAtRevision).toBe(5);
});


test('refinement retains every timed furniture/equipment path and its learned soft edge',async()=>{
 const protection={id:'mic-support',type:'foreground_holdout',start:1,end:5,
   corners:[[.1,.2],[.11,.2],[.11,.8],[.1,.8]],paths:[[[.2,.2],[.3,.2],[.3,.8],[.2,.8]]],feather:.4,after_refine:true,saturation:0};
 const edges={id:'background-edge-cleanup',type:'foreground_refine',start:0,end:6,choke:0,feather:0,edge_radius:5,decontaminate:1,
  recover_box:[0,0,0,0],recover_hue:0,hue_tolerance:0,saturation_min:1,detail_box:[0,0,0,0],dark_max:0,
  clear_box:[0,0,0,0],reject_hue:0,reject_tolerance:0,reject_saturation:1,reject_value:1};
 const detailed={...scene,effects:[...scene.effects,protection,edges]};
 const refined={...reference,artifactHash:'e'.repeat(64)};
 global.fetch=jest.fn().mockResolvedValueOnce(response({ok:true,projectId:document.projectId,revision:document.revision}))
  .mockResolvedValueOnce(response({jobId})).mockResolvedValueOnce(response({jobId,status:'completed'}))
  .mockResolvedValueOnce(response({scene:detailed,enabled:true,modelArtifactRef:refined}));
 render(<Harness initial={{scene:detailed,enabled:true,modelArtifactRef:reference}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Refine saved mask edges'}));
 await screen.findByText('Subject mask saved. Adjust the background and render a preview; changing effects reuses this mask.');
 const refinement=JSON.parse(fetch.mock.calls[1][1].body).parameters.refinement;
 expect(refinement.holdouts).toEqual([]);
 expect(refinement.holdoutGroups).toEqual([{id:protection.id,start:1,end:5,corners:protection.corners,paths:protection.paths,feather:.4}]);
 const saved=JSON.parse(screen.getByTestId('saved-mask').textContent);
 expect(saved.scene.effects.find(e=>e.id===edges.id)).toEqual({...edges,edge_radius:0});
 expect(saved.scene.effects.find(e=>e.id===protection.id)).toEqual(protection);
 expect(saved.modelArtifactRef.artifactHash).toBe(refined.artifactHash);
});
