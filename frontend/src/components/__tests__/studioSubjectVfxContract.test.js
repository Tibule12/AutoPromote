import {
  validateSubjectVfxScene,
  subjectVfxRevision,
  validateSubjectVfxExport,
  resolveSubjectVfxProgrammePreview,
} from "../studioSubjectVfxContract";
import {
  adaptStudioSnapshotToDocument,
  projectStudioLinkedTimingToSnapshot,
} from "../studioProjectDocument";

export const scene = () => ({
  version: 1,
  id: "subject-scene",
  sourceId: "source-a",
  sourceStoragePath: "studio/sources/owner/source.mp4",
  sourceRange: { start: 2, end: 8 },
  prompt: {
    points: [[0.6, 0.3]],
    labels: [1],
    shotPrompts: [{ time: 3, points: [[0.5, 0.4]], labels: [1] }],
  },
  effects: [
    {
      id: "title",
      type: "text_behind",
      start: 0,
      end: 6,
      text: "THE STORY",
      x: 50,
      y: 45,
      font_size: 100,
      color: "#f5f1ed",
    },
  ],
});
const reviewed = (value = scene()) => ({
  scene: value,
  enabled: true,
  preview: {
    jobId: "render-job-123",
    reviewed: true,
    revision: subjectVfxRevision(value),
    url: "https://preview.invalid",
  },
});
const timeline = [
  { source_clip_id: "source-a", start_time: 2, end_time: 5 },
  { source_clip_id: "source-a", start_time: 5, end_time: 8 },
];

test('colour-only regions survive canonical save and invalidate an old reviewed preview',()=>{
  const value=scene();value.effects=[{id:'equipment',type:'foreground_holdout',start:0,end:6,
    corners:[[0,0],[.1,0],[.1,.1],[0,.1]],feather:0,saturation:0}];
  const previous=subjectVfxRevision(value);
  value.effects[0].color_paths=[[[.4,.2],[.6,.2],[.6,.8],[.4,.8]]];
  expect(validateSubjectVfxScene(value)).toEqual(value);
  expect(subjectVfxRevision(value)).not.toBe(previous);
  const snapshot={orderedClips:[{id:'source-a',start:0,end:12}],timeline:[{id:'clip',sourceClipId:'source-a',startRequest:2,endRequest:8}],subjectVfxScenes:[reviewed(value)]};
  const document=adaptStudioSnapshotToDocument({snapshot,projectId:'colour-project'});
  expect(projectStudioLinkedTimingToSnapshot(document).subjectVfxScenes[0].scene.effects[0].color_paths).toEqual(value.effects[0].color_paths);
  value.effects[0].color_paths=[[[0,0],[2,0],[1,1]]];
  expect(()=>validateSubjectVfxScene(value)).toThrow();
});

test("opaque source repairs remain editable in canonical state and invalidate the previous preview",()=>{
  const value=scene();value.effects=[{id:"rig",type:"foreground_holdout",start:0,end:6,
    corners:[[.1,.1],[.2,.1],[.2,.8],[.1,.8]],feather:0}];
  const old=reviewed(JSON.parse(JSON.stringify(value)));old.preview.receipt={pixel_sha256:"old-pixels"};
  const repair={source:[[.1,.1],[.2,.1],[.2,.2],[.1,.2]],target:[[.4,.2],[.42,.2],[.44,.8],[.42,.8]],feather:.6,end_blend:8};
  value.effects[0].source_patches=[repair];
  expect(resolveSubjectVfxProgrammePreview([{...old,scene:value}],"source-a",3)).toBeNull();
  const document=adaptStudioSnapshotToDocument({snapshot:{orderedClips:[{id:"source-a",start:0,end:12}],
    timeline:[{id:"clip",sourceClipId:"source-a",startRequest:2,endRequest:8}],subjectVfxScenes:[reviewed(value)]},projectId:"repair"});
  expect(projectStudioLinkedTimingToSnapshot(document).subjectVfxScenes[0].scene.effects[0].source_patches).toEqual([repair]);
  for(const change of [{feather:4},{end_blend:33},{source:[[0,0],[1,1],[1,0],[0,1]]},{target:[[0,0],[.1,.1],[.2,.2],[.3,.3]]},{extra:true}]){
    const bad=JSON.parse(JSON.stringify(value));Object.assign(bad.effects[0].source_patches[0],change);
    expect(()=>validateSubjectVfxScene(bad)).toThrow(/source detail repairs/);
  }
  value.effects[0].source_patches=Array.from({length:17},()=>repair);
  expect(()=>validateSubjectVfxScene(value)).toThrow(/source detail repairs/);
});

test("local edge regions survive canonical recovery and invalidate the previous preview",()=>{
  const value=scene();value.effects=[{id:'fine',type:'foreground_refine',start:0,end:6,
    edge_radius:4,decontaminate:1,choke:0,feather:0,recover_box:[0,0,0,0],recover_hue:0,
    hue_tolerance:0,saturation_min:1,detail_box:[0,0,0,0],dark_max:0,clear_box:[0,0,0,0],
    reject_hue:0,reject_tolerance:0,reject_saturation:1,reject_value:1}];
  const previous=reviewed(JSON.parse(JSON.stringify(value)));
  previous.preview.receipt={pixel_sha256:'old-pixels'};
  const region=[[.7,.6],[.9,.6],[.9,.95],[.7,.95]];
  value.effects[0].edge_polygon=region;
  expect(resolveSubjectVfxProgrammePreview([{...previous,scene:value}],"source-a",3)).toBeNull();
  const document=adaptStudioSnapshotToDocument({snapshot:{orderedClips:[{id:"source-a",start:0,end:12}],
    timeline:[{id:"clip",sourceClipId:"source-a",startRequest:2,endRequest:8}],subjectVfxScenes:[reviewed(value)]},projectId:"local-edge"});
  expect(projectStudioLinkedTimingToSnapshot(document).subjectVfxScenes[0].scene.effects[0].edge_polygon).toEqual(region);
  for(const change of [{edge_radius:0},{edge_polygon:[]},{edge_polygon:[[0,0],[.1,.1],[.2,.2]]}]){
    const bad=JSON.parse(JSON.stringify(value));Object.assign(bad.effects[0],change);
    expect(()=>validateSubjectVfxScene(bad)).toThrow();
  }
});

test("thin-detail preservation is explicit, boolean and changes the preview revision", () => {
  const value=scene();value.effects=[{id:"stem",type:"foreground_holdout",start:0,end:6,
    corners:[[.3,.3],[.31,.3],[.31,.6],[.3,.6]],feather:0}];
  const before=subjectVfxRevision(value);
  expect(validateSubjectVfxScene(value).effects[0]).not.toHaveProperty("after_refine");
  value.effects[0].after_refine=true;
  expect(validateSubjectVfxScene(value).effects[0].after_refine).toBe(true);
  expect(subjectVfxRevision(value)).not.toBe(before);
  value.effects[0].after_refine=1;
  expect(()=>validateSubjectVfxScene(value)).toThrow(/thin detail/);
});

test("fine alpha is bounded, persists in canonical effects and invalidates the previous preview", () => {
  const value=scene();
  const refine={id:"edge",type:"foreground_refine",start:0,end:6,choke:0,feather:0,
    recover_box:[0,0,0,0],recover_hue:0,hue_tolerance:0,saturation_min:1,
    detail_box:[0,0,0,0],dark_max:0,clear_box:[0,0,0,0],
    reject_hue:0,reject_tolerance:0,reject_saturation:1,reject_value:1,edge_radius:3,decontaminate:1};
  const original=reviewed(value);original.preview.receipt={pixel_sha256:"old-pixels"};
  value.effects.push(refine);
  expect(validateSubjectVfxScene(value).effects[1]).toEqual(refine);
  expect(resolveSubjectVfxProgrammePreview([original],"source-a",3)).toBeNull();
  for(const change of [{edge_radius:2.5},{edge_radius:9},{decontaminate:NaN}]) {
    const altered=JSON.parse(JSON.stringify(value));Object.assign(altered.effects[1],change);
    expect(()=>validateSubjectVfxScene(altered)).toThrow();
  }
  value.effects.push({...refine,id:"second-edge"});
  expect(()=>validateSubjectVfxScene(value)).toThrow(/one fine alpha/);
});

test("background removal paths persist canonically and invalidate previously reviewed pixels",()=>{
  const value=scene();value.effects=[{id:"garbage",type:"foreground_refine",start:0,end:6,choke:0,feather:0,
    recover_box:[0,0,0,0],recover_hue:0,hue_tolerance:0,saturation_min:1,detail_box:[0,0,0,0],dark_max:0,
    clear_box:[0,0,0,0],reject_hue:0,reject_tolerance:0,reject_saturation:1,reject_value:1}];
  const before=reviewed(JSON.parse(JSON.stringify(value)));
  value.effects[0].clear_paths=[[[.1,.2],[.3,.2],[.2,.4]]];
  expect(validateSubjectVfxScene(value).effects[0].clear_paths).toEqual(value.effects[0].clear_paths);
  expect(subjectVfxRevision(value)).not.toBe(before.preview.revision);
  value.effects[0].after_refine=true;
  expect(validateSubjectVfxScene(value).effects[0].after_refine).toBe(true);
  value.effects[0].edge_radius=1;
  expect(()=>validateSubjectVfxScene(value)).toThrow(/post-matting/);
  delete value.effects[0].edge_radius;
  value.effects[0].after_holdout=true;
  value.effects[0].reject_connected=true;
  expect(validateSubjectVfxScene(value).effects[0].reject_connected).toBe(true);
  value.effects[0].reject_connected=1;
  expect(()=>validateSubjectVfxScene(value)).toThrow(/background-connected/);
  value.effects[0].reject_connected=true;
  expect(validateSubjectVfxScene(value).effects[0].after_holdout).toBe(true);
  const document=adaptStudioSnapshotToDocument({snapshot:{orderedClips:[{id:"source-a",start:0,end:12}],
    timeline:[{id:"clip",sourceClipId:"source-a",startRequest:2,endRequest:8}],subjectVfxScenes:[reviewed(value)]},projectId:"paths"});
  expect(projectStudioLinkedTimingToSnapshot(document).subjectVfxScenes[0].scene.effects[0].clear_paths).toEqual(value.effects[0].clear_paths);
  expect(projectStudioLinkedTimingToSnapshot(document).subjectVfxScenes[0].scene.effects[0].after_holdout).toBe(true);
  value.effects[0].choke=1;
  expect(()=>validateSubjectVfxScene(value)).toThrow(/protected-object/);
  value.effects[0].choke=0;
  const triangle=value.effects[0].clear_paths[0];
  value.effects[0].clear_paths=Array.from({length:32},()=>triangle);
  expect(validateSubjectVfxScene(value).effects[0].clear_paths).toHaveLength(32);
  value.effects[0].clear_paths.push(triangle);
  expect(()=>validateSubjectVfxScene(value)).toThrow(/matte paths/);
  for(const paths of [[],[[[.1,.2],[.2,.3]]],[[[.1,.2],[.2,.3],[.3,.4]]],[[[.1,.2],[1.1,.2],[.2,.4]]]]){
    value.effects[0].clear_paths=paths;expect(()=>validateSubjectVfxScene(value)).toThrow(/matte paths/);
  }
});

test("programme subject frames stay source-bound and half-open across repeated and trimmed occurrences", () => {
  const item = reviewed();
  item.preview.receipt = { pixel_sha256: "verified-pixels" };
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", 2)).toBe(item);
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", 5)).toBe(item);
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", 2)).toBe(item);
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", 8)).toBeNull();
  expect(resolveSubjectVfxProgrammePreview([item], "source-b", 5)).toBeNull();
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", NaN)).toBeNull();
});
test("programme cannot show stale, disabled or unverified subject frames; review is possible before export approval", () => {
  const item = reviewed();
  item.preview.receipt = { pixel_sha256: "verified-pixels" };
  item.preview.reviewed = false;
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", 3)).toBe(item);
  expect(resolveSubjectVfxProgrammePreview([{ ...item, enabled: false }], "source-a", 3)).toBeNull();
  expect(resolveSubjectVfxProgrammePreview([{ ...item, preview: { ...item.preview, receipt: undefined } }], "source-a", 3)).toBeNull();
  item.scene.effects[0].text = "Changed";
  expect(resolveSubjectVfxProgrammePreview([item], "source-a", 3)).toBeNull();
});

test("rejects unknown effect instructions, non-finite values, and prompts outside the source picture", () => {
  for (const alter of [
    value => {
      value.effects[0].script = "alert(1)";
    },
    value => {
      value.effects[0].font_size = NaN;
    },
    value => {
      value.prompt.points[0][0] = 1;
    },
    value => {
      value.prompt.labels = [0];
    },
    value => {
      value.prompt.shotPrompts[0].time = 6;
    },
  ]) {
    const value = scene();
    alter(value);
    expect(() => validateSubjectVfxScene(value)).toThrow();
  }
});
test("export preserves source range through timeline splits and strips browser preview URLs", () => {
  expect(validateSubjectVfxExport([reviewed()], timeline)).toEqual([
    { jobId: "render-job-123", scene: validateSubjectVfxScene(scene()) },
  ]);
  expect(
    validateSubjectVfxExport([{ ...reviewed(), enabled: false, preview: undefined }], [])
  ).toEqual([]);
});
test("blocks unreviewed, stale, missing, overlapping, and partially covered footage", () => {
  const stale = reviewed();
  stale.scene.effects[0].text = "Changed";
  expect(() => validateSubjectVfxExport([stale], timeline)).toThrow(/review/);
  expect(() =>
    validateSubjectVfxExport(
      [{ ...reviewed(), preview: { ...reviewed().preview, reviewed: false } }],
      timeline
    )
  ).toThrow(/review/);
  expect(() => validateSubjectVfxExport([reviewed()], [])).toThrow(/timeline/);
  expect(() =>
    validateSubjectVfxExport(
      [reviewed()],
      [{ source_clip_id: "source-a", start_time: 1, end_time: 8 }]
    )
  ).toThrow(/Split/);
  expect(() => validateSubjectVfxExport([reviewed(), reviewed()], timeline)).toThrow(/Overlapping/);
});
test("canonical project stores source effects and durable recovery identities without transient URLs", () => {
  const snapshot = {
    orderedClips: [{ id: "source-a", start: 0, end: 12 }],
    timeline: [{ id: "clip", sourceClipId: "source-a", startRequest: 2, endRequest: 8 }],
    subjectVfxScenes: [{ ...reviewed(), pending: { clientRequestId: "pending-id" } }],
  };
  const document = adaptStudioSnapshotToDocument({ snapshot, projectId: "project-vfx" });
  const layer = document.layers.find(value => value.type === "subject_vfx");
  expect(layer.compositionStage).toBe("source_subject_vfx");
  expect(layer.programmeRange).toBeUndefined();
  expect(JSON.stringify(layer)).not.toMatch(/https:/);
  expect(layer.parameters.preview).toMatchObject({ jobId: "render-job-123", reviewed: true });
  expect(layer.parameters.preview.url).toBeUndefined();
  expect(layer.parameters.pending).toEqual({ clientRequestId: "pending-id" });
  expect(projectStudioLinkedTimingToSnapshot(document).subjectVfxScenes[0]).toMatchObject({
    scene: scene(),
    enabled: true,
  });
});

test("edge opacity remains editable after canonical recovery and invalidates old pixels",()=>{
  const value=scene();value.effects=[{id:'opacity',type:'foreground_refine',start:0,end:6,
    edge_radius:0,decontaminate:1,choke:0,feather:0,recover_box:[0,0,0,0],recover_hue:0,
    hue_tolerance:0,saturation_min:1,detail_box:[0,0,0,0],dark_max:0,clear_box:[0,0,0,0],
    reject_hue:0,reject_tolerance:0,reject_saturation:1,reject_value:1}];
  const previous=reviewed(JSON.parse(JSON.stringify(value)));previous.preview.receipt={pixel_sha256:'old'};
  value.effects[0].alpha_levels=[.02,.68];
  value.effects[0].alpha_polygon=[[.4,.3],[.8,.3],[.8,.9],[.4,.9]];
  expect(()=>validateSubjectVfxScene(value)).not.toThrow();
  expect(resolveSubjectVfxProgrammePreview([{...previous,scene:value}],"source-a",3)).toBeNull();
  const document=adaptStudioSnapshotToDocument({snapshot:{orderedClips:[{id:"source-a",start:0,end:12}],
    timeline:[{id:"clip",sourceClipId:"source-a",startRequest:2,endRequest:8}],subjectVfxScenes:[reviewed(value)]},projectId:"opacity"});
  expect(projectStudioLinkedTimingToSnapshot(document).subjectVfxScenes[0].scene.effects[0].alpha_levels).toEqual([.02,.68]);
  expect(projectStudioLinkedTimingToSnapshot(document).subjectVfxScenes[0].scene.effects[0].alpha_polygon).toEqual(value.effects[0].alpha_polygon);
  for(const polygon of [[[0,0],[.5,.5],[1,1]],[[0,0],[1.1,0],[1,1]],[[0,0],[1,0]]]) {
    const bad=JSON.parse(JSON.stringify(value));bad.effects[0].alpha_polygon=polygon;
    expect(()=>validateSubjectVfxScene(bad)).toThrow(/region/);
  }
  for(const levels of [[.4,.42],[.7,.3],[0],[0,1,1],[false,1],[0,NaN],[-.1,1],[0,1.1]]){
    const bad=JSON.parse(JSON.stringify(value));bad.effects[0].alpha_levels=levels;
    expect(()=>validateSubjectVfxScene(bad)).toThrow(/opacity/);
  }
  for(const flag of ['after_holdout','after_refine']){
    const bad=JSON.parse(JSON.stringify(value));bad.effects[0].decontaminate=0;bad.effects[0][flag]=true;
    expect(()=>validateSubjectVfxScene(bad)).toThrow(/opacity/);
  }
});
