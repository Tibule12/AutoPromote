import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import StudioSubjectVfxPanel from "../StudioSubjectVfxPanel";
jest.mock("../../utils/sourceUpload", () => ({ uploadSourceFileViaBackend: jest.fn() }));

const scene = () => ({
  version: 1,
  id: "scene-1",
  sourceId: "source-a",
  sourceStoragePath: "studio/sources/owner/a.mp4",
  sourceRange: { start: 2, end: 8 },
  prompt: { points: [[0.5, 0.3]], labels: [1], shotPrompts: [] },
  effects: [
    {
      id: "title",
      type: "text_behind",
      start: 0,
      end: 6,
      text: "STORY",
      x: 50,
      y: 45,
      font_size: 100,
      color: "#f5f1ed",
    },
  ],
});
const deferred = () => {
  let resolve;
  const promise = new Promise(value => {
    resolve = value;
  });
  return { promise, resolve };
};
const response = data => ({ ok: true, json: async () => data });
let sequence = 0;
function Harness({modelArtifactRef,media=[],initialScene,onMediaAdded,initialPreview,initialPending}) {
  const [items, setItems] = useState([{ scene: initialScene || scene(), enabled: true,...(modelArtifactRef?{modelArtifactRef}:{}),
    ...(initialPreview?{preview:initialPreview}:{}),...(initialPending?{pending:initialPending}:{}) }]);
  return (
    <>
      <StudioSubjectVfxPanel
        items={items}
        onChange={setItems}
        sources={[
          {
            id: "source-a",
            name: "Podcast",
            url: "/source.mp4",
            storagePath: scene().sourceStoragePath,
            start: 2,
            end: 8,
          },
        ]}
        getToken={async () => "local-test-only"}
        apiBase="http://fixture.invalid"
        createId={() => `test-request-${++sequence}`}
        media={media}
        onMediaAdded={onMediaAdded}
      />
      <div data-testid="saved">{JSON.stringify(items)}</div>
    </>
  );
}
const result = {
  jobId: "render-job-123",
  status: "completed",
  url: "https://preview.invalid/render.mp4",
  receipt: { pixel_sha256: "a".repeat(64) },
};
beforeEach(() => {
  sequence = 0;
  global.fetch = jest.fn();
});

test("background edge cleanup is an editable canonical effect and never starts a job", () => {
  const current=scene();
  current.effects.push({id:"room",type:"background_replace",start:0,end:6,asset_id:"set-1",
    asset_sha256:"c".repeat(64),blur:0,exposure:0,saturation:1});
  render(<Harness initialScene={current} media={[{id:"set-1",name:"Room",type:"image",
    storagePath:"uploads/images/owner/set.png",contentHash:"c".repeat(64)}]} />);
  fireEvent.click(screen.getByRole("button",{name:"Clean background edges"}));
  let saved=JSON.parse(screen.getByTestId("saved").textContent)[0];
  expect(saved.scene.effects[2]).toMatchObject({id:"background-edge-cleanup",edge_radius:3,decontaminate:1,choke:0,feather:0});
  expect(saved.scene.effects.slice(0,2)).toEqual(current.effects);
  fireEvent.change(screen.getByLabelText("Background edge detail width"),{target:{value:"2"}});
  fireEvent.change(screen.getByLabelText("Remove old background colour"),{target:{value:"0.6"}});
  saved=JSON.parse(screen.getByTestId("saved").textContent)[0];
  expect(saved.scene.effects[2]).toMatchObject({edge_radius:2,decontaminate:.6});
  expect(global.fetch).not.toHaveBeenCalled();
});
afterEach(() => {
  delete global.fetch;
});

test("disjoint ranges of one owned source remain independently selectable", () => {
  const onChange = jest.fn();
  render(<StudioSubjectVfxPanel items={[]} onChange={onChange}
    sources={[
      { id: "source-a", name: "Opening", url: "/source.mp4", storagePath: scene().sourceStoragePath, start: 0, end: 10 },
      { id: "source-a", name: "Second passage", url: "/source.mp4", storagePath: scene().sourceStoragePath, start: 10, end: 20 },
    ]}
    getToken={async () => "local-test-only"} apiBase="http://fixture.invalid"
    createId={() => `test-request-${++sequence}`} />);
  const second = screen.getByRole("option", { name: /Second passage/ });
  fireEvent.change(screen.getByLabelText("Subject effect source clip"), { target: { value: second.value } });
  const added = onChange.mock.calls[0][0][0].scene;
  expect(added.sourceId).toBe("source-a");
  expect(added.sourceStoragePath).toBe(scene().sourceStoragePath);
  expect(added.sourceRange).toEqual({ start: 10, end: 20 });
});

test("background selection binds exact project media and invalidates the earlier preview", () => {
  render(<Harness media={[{id:"set-1",name:"Walnut set",type:"image",storagePath:"uploads/images/owner/set.png",contentHash:"c".repeat(64)}]} />);
  fireEvent.change(screen.getByLabelText("Subject effect type"), {target:{value:"background_replace"}});
  fireEvent.click(screen.getByRole("button",{name:"Add layer"}));
  fireEvent.change(screen.getByLabelText("Background media"),{target:{value:"set-1"}});
  expect(JSON.parse(screen.getByTestId("saved").textContent)[0].scene.effects[1]).toMatchObject({
    type:"background_replace",asset_id:"set-1",asset_sha256:"c".repeat(64),blur:2});
  expect(screen.queryByLabelText("asset sha256")).not.toBeInTheDocument();
});

test('background replacement is optional and returning to original preserves other edits',()=>{
 render(<Harness media={[{id:'set-1',name:'Warm room',type:'image',storagePath:'uploads/images/owner/set.png',contentHash:'c'.repeat(64)}]}/>);
 expect(screen.getByLabelText('Background choice')).toHaveValue('');
 expect(JSON.parse(screen.getByTestId('saved').textContent)[0].scene.effects).toEqual(scene().effects);
 fireEvent.change(screen.getByLabelText('Background choice'),{target:{value:'set-1'}});
 let saved=JSON.parse(screen.getByTestId('saved').textContent)[0];
 expect(saved.scene.effects.find(effect=>effect.type==='background_replace')).toMatchObject({asset_id:'set-1',asset_sha256:'c'.repeat(64)});
 expect(saved).not.toHaveProperty('maskComponents');
 fireEvent.change(screen.getByLabelText('Background choice'),{target:{value:''}});
 saved=JSON.parse(screen.getByTestId('saved').textContent)[0];
 expect(saved.scene.effects).toEqual(scene().effects);
 expect(saved.scene.prompt).toEqual(scene().prompt);
});

test('choosing another background retains existing layer order, framing and other background layers',()=>{
 const background={id:'background',type:'background_replace',start:0,end:6,asset_id:'set-1',asset_sha256:'c'.repeat(64),blur:2,exposure:-.2,saturation:.9};
 const initial={...scene(),effects:[background,...scene().effects,{...background,id:'second-background'}]};
 render(<Harness initialScene={initial} media={[
  {id:'set-1',name:'First room',type:'image',storagePath:'uploads/images/owner/first.png',contentHash:'c'.repeat(64)},
  {id:'set-2',name:'Second room',type:'image',storagePath:'uploads/images/owner/second.png',contentHash:'d'.repeat(64)}]}/>);
 fireEvent.change(screen.getByLabelText('Background choice'),{target:{value:'set-2'}});
 const effects=JSON.parse(screen.getByTestId('saved').textContent)[0].scene.effects;
 expect(effects).toEqual([{...background,asset_id:'set-2',asset_sha256:'d'.repeat(64)},...initial.effects.slice(1)]);
});

test('a full effect stack rejects a background upload before creating an unused owned asset',async()=>{
 const added=jest.fn();const {uploadSourceFileViaBackend}=require('../../utils/sourceUpload');uploadSourceFileViaBackend.mockClear();
 render(<Harness initialScene={{...scene(),effects:Array.from({length:12},(_,index)=>({...scene().effects[0],id:`title-${index}`}))}} onMediaAdded={added}/>);
 fireEvent.change(screen.getByLabelText('Upload background image'),{target:{files:[new File(['image'],'room.png',{type:'image/png'})]}});
 await screen.findByText('Remove an effect layer before adding background replacement.');
 expect(uploadSourceFileViaBackend).not.toHaveBeenCalled();expect(added).not.toHaveBeenCalled();
 expect(JSON.parse(screen.getByTestId('saved').textContent)[0].scene.effects).toHaveLength(12);
});

test('uploading a replacement preserves the existing background settings and other layers',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(global,'crypto');
 Object.defineProperty(global,'crypto',{configurable:true,value:require('crypto').webcrypto});
 try {
  const {uploadSourceFileViaBackend}=require('../../utils/sourceUpload');
  uploadSourceFileViaBackend.mockResolvedValueOnce({storagePath:'uploads/images/owner/new.png',url:'https://fixture.invalid/new.png'});
  const background={id:'background',type:'background_replace',start:0,end:6,asset_id:'set-1',asset_sha256:'c'.repeat(64),blur:3,exposure:-.2,saturation:.9};
  const initial={...scene(),effects:[background,...scene().effects,{...background,id:'second-background'}]},added=jest.fn();
  render(<Harness initialScene={initial} onMediaAdded={added} media={[{id:'set-1',name:'First room',type:'image',storagePath:'uploads/images/owner/first.png',contentHash:'c'.repeat(64)}]}/>);
  const file=new File(['image'],'new.png',{type:'image/png'});file.arrayBuffer=async()=>new Uint8Array([1,2,3]).buffer;
  fireEvent.change(screen.getByLabelText('Upload background image'),{target:{files:[file]}});
  await screen.findByText('Background saved. Create or reuse the subject mask, then render the replacement preview.');
  expect(added).toHaveBeenCalledTimes(1);const asset=added.mock.calls[0][0];
  expect(JSON.parse(screen.getByTestId('saved').textContent)[0].scene.effects).toEqual([
   {...background,asset_id:asset.id,asset_sha256:asset.contentHash},...initial.effects.slice(1)]);
 }finally{
  if(descriptor)Object.defineProperty(global,'crypto',descriptor);else delete global.crypto;
 }
});

test('switching scenes releases the prior observer and preserves its recoverable request',async()=>{
 const acknowledged=deferred();fetch.mockReturnValueOnce(acknowledged.promise);
 function Multiple(){
  const [items,setItems]=useState([{scene:scene(),enabled:true},{scene:{...scene(),id:'scene-2',sourceId:'source-b'},enabled:true}]);
  return <><StudioSubjectVfxPanel items={items} onChange={setItems} sources={[
   {id:'source-a',name:'First person',url:'/first.mp4',storagePath:scene().sourceStoragePath,start:2,end:8},
   {id:'source-b',name:'Second person',url:'/second.mp4',storagePath:scene().sourceStoragePath,start:2,end:8}]}
   getToken={async()=> 'local-test-only'} apiBase="http://fixture.invalid" createId={()=>`test-request-${++sequence}`}/>
   <div data-testid="multiple-saved">{JSON.stringify(items)}</div></>;
 }
 render(<Multiple/>);
 fireEvent.click(screen.getByRole('button',{name:'Render subject preview'}));
 await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));
 const signal=fetch.mock.calls[0][1].signal;
 fireEvent.change(screen.getByLabelText('Subject effect scene'),{target:{value:'scene-2'}});
 expect(signal.aborted).toBe(true);
 expect(screen.getByRole('button',{name:'Render subject preview'})).toBeEnabled();
 expect(screen.getByRole('button',{name:'Remove scene'})).toBeEnabled();
 expect(screen.queryByRole('button',{name:'Cancel render'})).not.toBeInTheDocument();
 await act(async()=>acknowledged.resolve(response({jobId:result.jobId})));
 const saved=JSON.parse(screen.getByTestId('multiple-saved').textContent);
 expect(saved[0].pending.clientRequestId).toBe('test-request-1');
 expect(saved[1]).not.toHaveProperty('pending');
 expect(fetch).toHaveBeenCalledTimes(1);
});

test("authored matte regions remain editable source coordinates without changing the model reference", () => {
  const modelArtifactRef={kind:'model_capability',schemaVersion:1,artifactHash:'b'.repeat(64),
    sourceAssetId:'source-a',sourceContentHash:'c'.repeat(64),capability:'segment_subject',
    sourceRange:{space:'source',startTick:180000,endTick:720000}};
  render(<Harness modelArtifactRef={modelArtifactRef}/>);
  fireEvent.change(screen.getByLabelText("Subject effect type"),{target:{value:"foreground_refine"}});
  fireEvent.click(screen.getByRole("button",{name:"Add layer"}));
  fireEvent.change(screen.getByLabelText("recover box right"),{target:{value:".54"}});
  fireEvent.change(screen.getByLabelText("recover box left"),{target:{value:".08"}});
  fireEvent.change(screen.getByLabelText("feather"),{target:{value:".45"}});
  const item=JSON.parse(screen.getByTestId("saved").textContent)[0];
  expect(item.scene.effects[1]).toMatchObject({type:"foreground_refine",recover_box:[.08,0,.54,0],feather:.45});
  expect(item.modelArtifactRef).toEqual(modelArtifactRef);
  expect(fetch).not.toHaveBeenCalled();
});

test("thin-detail protection is authored through the existing holdout controls", () => {
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("Subject effect type"),{target:{value:"foreground_holdout"}});
  fireEvent.click(screen.getByRole("button",{name:"Add layer"}));
  fireEvent.click(screen.getByLabelText("Keep thin detail through cleanup"));
  expect(JSON.parse(screen.getByTestId("saved").textContent)[0].scene.effects[1].after_refine).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});

test('protected object cleanup remains an explicit ordinary matte control',()=>{
 render(<Harness/>);
 fireEvent.change(screen.getByLabelText('Subject effect type'),{target:{value:'foreground_refine'}});
 fireEvent.click(screen.getByRole('button',{name:'Add layer'}));
 fireEvent.change(screen.getByLabelText('choke'),{target:{value:'0'}});
 fireEvent.click(screen.getByLabelText('Clean protected object edges'));
 expect(JSON.parse(screen.getByTestId('saved').textContent)[0].scene.effects[1].after_holdout).toBe(true);
 fireEvent.click(screen.getByLabelText('Limit colour cleanup to background edges'));
 expect(JSON.parse(screen.getByTestId('saved').textContent)[0].scene.effects[1].reject_connected).toBe(true);
 expect(fetch).not.toHaveBeenCalled();
});

test("rapid submissions dispatch one job, and approval requires actual preview playback", async () => {
  const acknowledged = deferred();
  fetch.mockReturnValueOnce(acknowledged.promise).mockResolvedValueOnce(response(result));
  render(<Harness />);
  const button = screen.getByRole("button", { name: "Render subject preview" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await act(async () => acknowledged.resolve(response({ jobId: result.jobId })));
  const approval = await screen.findByLabelText(/I reviewed the sound/);
  expect(approval).toBeDisabled();
  fireEvent.playing(screen.getByLabelText("Rendered subject effects with original audio"));
  expect(approval).toBeEnabled();
  fireEvent.click(approval);
  expect(screen.getByTestId("saved")).toHaveTextContent('"reviewed":true');
  fireEvent.change(screen.getByDisplayValue("STORY"), { target: { value: "NEW STORY" } });
  expect(screen.queryByLabelText(/I reviewed the sound/)).not.toBeInTheDocument();
  expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
});

test('a saved runtime mask is forwarded without model choices through the existing preview controls',async()=>{
  const modelArtifactRef={kind:'model_capability',schemaVersion:1,artifactHash:'b'.repeat(64),
    sourceAssetId:'source-a',sourceContentHash:'c'.repeat(64),capability:'segment_subject',
    sourceRange:{space:'source',startTick:180000,endTick:720000}};
  fetch.mockResolvedValueOnce(response({jobId:result.jobId})).mockResolvedValueOnce(response(result));
  render(<Harness modelArtifactRef={modelArtifactRef}/>);
  fireEvent.click(screen.getByRole('button',{name:'Render subject preview'}));
  await screen.findByLabelText(/I reviewed the sound/);
  const body=JSON.parse(fetch.mock.calls.find(([,options])=>options.method==='POST')[1].body);
  expect(body).toEqual({scene:scene(),clientRequestId:expect.any(String),modelArtifactRef});
  expect(screen.getByTestId('saved')).toHaveTextContent(modelArtifactRef.artifactHash);
});
test("a render cannot overwrite edits made while it was running", async () => {
  const completed = deferred();
  fetch
    .mockResolvedValueOnce(response({ jobId: result.jobId }))
    .mockReturnValueOnce(completed.promise);
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Render subject preview" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  fireEvent.change(screen.getByDisplayValue("STORY"), { target: { value: "CHANGED" } });
  await act(async () => completed.resolve(response(result)));
  expect(screen.getByRole("status")).toHaveTextContent("scene changed");
  expect(screen.queryByLabelText(/Rendered subject/)).not.toBeInTheDocument();
  expect(screen.getByTestId("saved")).toHaveTextContent("CHANGED");
});

test("expired completed preview refreshes the same owned job and preserves matching pixel review", async () => {
  fetch.mockResolvedValueOnce(response({ jobId: result.jobId })).mockResolvedValueOnce(response(result));
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Render subject preview" }));
  const player = await screen.findByLabelText("Rendered subject effects with original audio");
  fireEvent.playing(player);
  fireEvent.click(screen.getByLabelText(/I reviewed the sound/));
  fetch.mockResolvedValueOnce(response({ ...result, url: "https://preview.invalid/refreshed.mp4" }));
  fireEvent.error(player);
  await waitFor(() => expect(player).toHaveAttribute("src", "https://preview.invalid/refreshed.mp4"));
  expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  expect(fetch.mock.calls.at(-1)[0]).toMatch(/render-job-123$/);
  expect(screen.getByTestId("saved")).toHaveTextContent('"reviewed":true');
});

test.each(['automatic recovery','manual refresh'])('%s checks the completed job despite an unfinished acknowledgement',async trigger=>{
 const revision=require('../studioSubjectVfxContract').subjectVfxRevision(scene());
 fetch.mockResolvedValueOnce(response({...result,url:'https://preview.invalid/refreshed.mp4'}));
 render(<Harness initialPreview={{...result,revision,reviewed:true}} initialPending={{clientRequestId:'lost-acknowledgement',revision}}/>);
 if(trigger==='automatic recovery')fireEvent.error(screen.getByLabelText('Rendered subject effects with original audio'));
 else fireEvent.click(screen.getByRole('button',{name:'Refresh rendered preview'}));
 await waitFor(()=>expect(screen.getByLabelText('Rendered subject effects with original audio')).toHaveAttribute('src','https://preview.invalid/refreshed.mp4'));
 expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][1].method).toBe('GET');
 expect(fetch.mock.calls[0][0]).toMatch(/render-job-123$/);
});

test('a saved preview without a job identity cannot start a render from a playback error',async()=>{
 const revision=require('../studioSubjectVfxContract').subjectVfxRevision(scene());
 render(<Harness initialPreview={{url:result.url,revision,reviewed:false}}/>);
 fireEvent.error(screen.getByLabelText('Rendered subject effects with original audio'));
 await screen.findByText('This saved preview has no recoverable job. Use Render subject preview when you want a new render.');
 expect(fetch).not.toHaveBeenCalled();
});
test("an uncertain request is retried with the persisted identity", async () => {
  fetch.mockRejectedValueOnce(new Error("Connection lost"));
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Render subject preview" }));
  await screen.findByText("Connection lost");
  const first = JSON.parse(fetch.mock.calls[0][1].body).clientRequestId;
  fetch
    .mockResolvedValueOnce(response({ jobId: result.jobId }))
    .mockResolvedValueOnce(response(result));
  fireEvent.click(screen.getByRole("button", { name: "Render subject preview" }));
  await screen.findByLabelText(/I reviewed the sound/);
  expect(JSON.parse(fetch.mock.calls[1][1].body).clientRequestId).toBe(first);
});
test("late poll completion cannot undo a confirmed cancellation", async () => {
  const completed = deferred();
  fetch
    .mockResolvedValueOnce(response({ jobId: result.jobId }))
    .mockReturnValueOnce(completed.promise)
    .mockResolvedValueOnce(response({ jobId: result.jobId, status: "cancelled" }));
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Render subject preview" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Cancel render" }));
  await screen.findByText(/Subject render cancelled/);
  await act(async () => completed.resolve(response(result)));
  expect(screen.queryByLabelText(/Rendered subject/)).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("cancelled");
});
test("a completed response to DELETE is not reported as cancellation", async () => {
  const completed = deferred();
  fetch
    .mockResolvedValueOnce(response({ jobId: result.jobId }))
    .mockReturnValueOnce(completed.promise)
    .mockResolvedValueOnce(response({ jobId: result.jobId, status: "completed" }));
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Render subject preview" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Cancel render" }));
  await screen.findByText(/Cancellation was not confirmed/);
  await act(async () => completed.resolve(response(result)));
  expect(screen.getByRole("status")).not.toHaveTextContent("Subject render cancelled");
});

test('shaped detail and grouped paths save through native controls without starting inference',()=>{
 render(<Harness />);
 fireEvent.change(screen.getByLabelText('Subject effect type'),{target:{value:'foreground_refine'}});
 fireEvent.click(screen.getByRole('button',{name:'Add layer'}));
 const polygon=[[.2,.5],[.4,.5],[.35,.9],[.2,.8]];
 fireEvent.blur(screen.getByLabelText('Detail region points'),{target:{value:JSON.stringify(polygon)}});
 fireEvent.change(screen.getByLabelText('blue spill'),{target:{value:'1'}});
 const removal=[[[.6,.5],[.8,.5],[.75,.7]]];
 fireEvent.blur(screen.getByLabelText('Remove background fragments'),{target:{value:JSON.stringify(removal)}});
 fireEvent.click(screen.getByLabelText('Apply colour cleanup after matting'));
 expect(JSON.parse(screen.getByTestId('saved').textContent)[0].scene.effects[1]).toMatchObject({detail_polygon:polygon,blue_spill:1,clear_paths:removal,after_refine:true});
 fireEvent.change(screen.getByLabelText('Subject effect type'),{target:{value:'foreground_holdout'}});
 fireEvent.click(screen.getByRole('button',{name:'Add layer'}));
 const paths=[[[.1,.2],[.4,.2],[.4,.21],[.1,.21]],[[.2,.3],[.21,.3],[.21,.7],[.2,.7]]];
 fireEvent.blur(screen.getByLabelText('Additional holdout paths'),{target:{value:JSON.stringify(paths)}});
 fireEvent.click(screen.getByLabelText('Keep thin detail through cleanup'));
 expect(JSON.parse(screen.getByTestId('saved').textContent)[0].scene.effects[2]).toMatchObject({paths,after_refine:true});
 expect(fetch).not.toHaveBeenCalled();
});

test('surface replacement exposes editable source corners and owned-image crop',()=>{
 render(<Harness media={[{id:'set',name:'Cloth',type:'image',storagePath:'uploads/images/owner/cloth.png',contentHash:'c'.repeat(64)}]}/>);
 fireEvent.change(screen.getByLabelText('Subject effect type'),{target:{value:'background_replace'}});
 fireEvent.click(screen.getByRole('button',{name:'Add layer'}));
 fireEvent.change(screen.getByLabelText('Background media'),{target:{value:'set'}});
 fireEvent.click(screen.getByLabelText('Fit replacement to a surface'));
 fireEvent.change(screen.getByLabelText('Surface corner 1 Y'),{target:{value:'.2'}});
 fireEvent.change(screen.getByLabelText('asset crop left'),{target:{value:'.5'}});
 const effect=JSON.parse(screen.getByTestId('saved').textContent)[0].scene.effects[1];
 expect(effect).toMatchObject({asset_id:'set',asset_sha256:'c'.repeat(64),surface_corners:[[0,.2],[1,0],[1,1],[0,1]],asset_crop:[.5,0,1,1]});
 fireEvent.click(screen.getByLabelText('Fit replacement to a surface'));
 expect(JSON.parse(screen.getByTestId('saved').textContent)[0].scene.effects[1].surface_corners).toBeUndefined();
 expect(fetch).not.toHaveBeenCalled();
});

test("edge opacity can be changed and reset without launching work or replacing the owned mask",()=>{
  const current=scene();current.effects=[{id:'opacity',type:'foreground_refine',start:0,end:6,
    edge_radius:0,decontaminate:1,choke:0,feather:0,recover_box:[0,0,0,0],recover_hue:0,
    hue_tolerance:0,saturation_min:1,detail_box:[0,0,0,0],dark_max:0,clear_box:[0,0,0,0],
    reject_hue:0,reject_tolerance:0,reject_saturation:1,reject_value:1}];
  const artifact={artifactHash:'b'.repeat(64)};render(<Harness initialScene={current} modelArtifactRef={artifact}/>);
  const polygon=[[.4,.3],[.8,.3],[.8,.9],[.4,.9]];
  fireEvent.blur(screen.getByLabelText('Edge opacity region points'),{target:{value:JSON.stringify(polygon)}});
  expect(JSON.parse(screen.getByTestId('saved').textContent)[0].scene.effects[0].alpha_polygon).toEqual(polygon);
  fireEvent.blur(screen.getByLabelText('Edge opacity region points'),{target:{value:'[[0,0],[1,0]]'}});
  expect(JSON.parse(screen.getByTestId('saved').textContent)[0].scene.effects[0].alpha_polygon).toEqual(polygon);
  fireEvent.change(screen.getByLabelText('Opaque edge level'),{target:{value:'0.68'}});
  fireEvent.change(screen.getByLabelText('Transparent edge level'),{target:{value:'0.02'}});
  let saved=JSON.parse(screen.getByTestId('saved').textContent)[0];expect(saved.scene.effects[0].alpha_levels).toEqual([.02,.68]);expect(saved.modelArtifactRef).toEqual(artifact);
  fireEvent.change(screen.getByLabelText('Transparent edge level'),{target:{value:'0.67'}});
  expect(JSON.parse(screen.getByTestId('saved').textContent)[0].scene.effects[0].alpha_levels).toEqual([.02,.68]);
  fireEvent.change(screen.getByLabelText('Transparent edge level'),{target:{value:'0'}});
  fireEvent.change(screen.getByLabelText('Opaque edge level'),{target:{value:'1'}});
  saved=JSON.parse(screen.getByTestId('saved').textContent)[0];expect(saved.scene.effects[0]).not.toHaveProperty('alpha_levels');expect(saved.modelArtifactRef).toEqual(artifact);expect(global.fetch).not.toHaveBeenCalled();
});
