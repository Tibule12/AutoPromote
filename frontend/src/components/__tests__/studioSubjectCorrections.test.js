import {correctSubjectItem,savedSubjectBox} from '../studioSubjectCorrections';
const original=()=>({scene:{sourceRange:{start:0,end:3},prompt:{points:[[.4,.3]],labels:[1],shotPrompts:[]}},
 maskComponents:[{id:'mic',box:[.2,.2,.8,.9],points:[{position:[.5,.6],label:1}],propagate:false}],
 modelArtifactRef:{artifactHash:'saved'},preview:{url:'old'},maskJob:{finished:true}});
test('correcting an object at a later frame persists its own prompt, enables tracking and detaches old results',()=>{
 const before=original(),after=correctSubjectItem(before,'mic',12,[.6,.6],0);
 expect(after.maskComponents[0].shotPrompts).toEqual([{frameIndex:12,points:[{position:[.6,.6],label:0}]}]);
 expect(after.maskComponents[0].propagate).toBe(true);expect(after.scene.prompt).toEqual(before.scene.prompt);
 expect(after.modelArtifactRef).toBeUndefined();expect(after.preview).toBeUndefined();expect(before.preview.url).toBe('old');
 expect(JSON.parse(JSON.stringify(after))).toEqual(after);
});
test('clearing one correction does not erase another frame or a different object',()=>{
 let item=correctSubjectItem(original(),'person',24,[.5,.3],1);
 item=correctSubjectItem(item,'person',36,[.6,.3],1);item=correctSubjectItem(item,'person',24,null,1,true);
 expect(item.scene.prompt.shotPrompts.map(p=>p.time)).toEqual([1.5]);expect(item.maskComponents).toEqual(original().maskComponents);
});
test('pending jobs and out-of-range frames cannot acquire silently different prompts',()=>{
 const item=original();item.maskJob.finished=false;
 expect(()=>correctSubjectItem(item,'person',0,[.5,.3],1)).toThrow(/cancel/);
 expect(()=>correctSubjectItem(original(),'person',72,[.5,.3],1)).toThrow(/inside/);
});

test('object correction requests survive canonical projection without a transport snapshot',()=>{
 const {adaptStudioSnapshotToDocument,projectStudioEditableStateToSnapshot}=require('../studioProjectDocument');
 const item=correctSubjectItem(original(),'mic',36,[.6,.6],0);
 item.scene={version:1,id:'subject',sourceId:'source',sourceStoragePath:'studio/sources/owner/source.mp4',sourceRange:{start:0,end:3},prompt:item.scene.prompt,effects:[]};
 item.maskJob={requestId:'mask-request',projectId:'project',projectRevision:1,selectionJson:JSON.stringify({components:item.maskComponents}),jobId:'a'.repeat(64),finished:true};
 const snapshot={timeline:[{id:'clip',sourceClipId:'source',startRequest:0,endRequest:3,contentHash:'b'.repeat(64),storagePath:'studio/sources/owner/source.mp4'}],subjectVfxScenes:[item]};
 const document=adaptStudioSnapshotToDocument({snapshot,projectId:'project'});
 const recovered=projectStudioEditableStateToSnapshot(document,{timeline:snapshot.timeline}).subjectVfxScenes[0];
 expect(recovered.maskComponents).toEqual(item.maskComponents);expect(recovered.maskJob).toEqual(item.maskJob);
});

test('correcting a completed selection preserves its authored person box through a cold canonical reopen',()=>{
 const {adaptStudioSnapshotToDocument,projectStudioEditableStateToSnapshot}=require('../studioProjectDocument');
 const before=original();before.maskJob.selectionJson=JSON.stringify({box:[.26,.06,.98,1]});
 const item=correctSubjectItem(before,'mic',0,[.2,.8],0);
 expect(item.maskJob).toBeUndefined();expect(savedSubjectBox(item)).toEqual([.26,.06,.98,1]);
 item.scene={version:1,id:'subject',sourceId:'source',sourceStoragePath:'studio/sources/owner/source.mp4',sourceRange:{start:0,end:3},prompt:item.scene.prompt,effects:[]};
 const snapshot={timeline:[{id:'clip',sourceClipId:'source',startRequest:0,endRequest:3,contentHash:'b'.repeat(64),storagePath:item.scene.sourceStoragePath}],subjectVfxScenes:[item]};
 const document=adaptStudioSnapshotToDocument({snapshot,projectId:'project'});
 const restored=projectStudioEditableStateToSnapshot(document,{timeline:snapshot.timeline}).subjectVfxScenes[0];
 expect(savedSubjectBox(restored)).toEqual([.26,.06,.98,1]);expect(before).not.toHaveProperty('maskBox');
});
