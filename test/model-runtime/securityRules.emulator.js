// Real local Firebase emulators; never contacts or deploys to a cloud project.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc}=require('firebase/firestore');
const {ref,uploadBytes,getBytes}=require('firebase/storage');
test('model evidence and GPU capacity are server-only for regular and admin clients',async()=>{
  const env=await initializeTestEnvironment({projectId:'demo-model-runtime-v1',
    firestore:{host:'127.0.0.1',port:8188,rules:fs.readFileSync('firestore.rules','utf8')},
    storage:{host:'127.0.0.1',port:9298,rules:fs.readFileSync('storage.rules','utf8')}});
  try {
    const paths=['studio_model_capability_jobs/job','studio_model_capability_artifacts/hash','studio_model_capability_capacity/single_gpu',
      'studio_subject_vfx_jobs/job','studio_subject_vfx_requests/request','studio_subject_vfx_capacity/model_artifact_cpu'];
    const objects=['studio/model-runtime/executions/owner/job/attempt/request.json',
      'studio/model-runtime/executions/owner/job/attempt/result.json',
      'studio/model-runtime/models/Qwen/checkpoint/receipt.json',
      'studio/sources/owner/model-'+ 'a'.repeat(64)+'.mp4',
      'temp_studio_vfx/owner/job/render.mp4','temp_studio_vfx/owner/job/artifact-'+ 'a'.repeat(64)+'.json'];
    await env.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();await setDoc(doc(db,'users/owner'),{role:'user',uploadBlocked:false});await setDoc(doc(db,'users/founder'),{role:'admin',uploadBlocked:false});
      for(const path of paths)await setDoc(doc(db,path),{ownerUid:'owner',status:'synthetic_security_fixture'});
      for(const path of objects)await uploadBytes(ref(context.storage(),path),new Uint8Array([1,2,3]));
    });
    for(const uid of ['owner','founder']) {
      const client=env.authenticatedContext(uid),db=client.firestore(),storage=client.storage();
      for(const path of paths) {
        await assertFails(getDoc(doc(db,path)));await assertFails(setDoc(doc(db,path),{status:'forged'}));
      }
      for(const path of objects) {
        await assertFails(getBytes(ref(storage,path)));await assertFails(uploadBytes(ref(storage,path),new Uint8Array([9])));
      }
      await assertFails(uploadBytes(ref(storage,'studio/model-runtime/executions/new-owner/new-request/result.json'),new Uint8Array([9])));
      await assertFails(uploadBytes(ref(storage,'studio/sources/owner/model-'+ 'b'.repeat(64)+'.mp4'),new Uint8Array([9])));
      await assertFails(uploadBytes(ref(storage,'temp_studio_vfx/owner/new-job/render.mp4'),new Uint8Array([9])));
    }
    // Existing ordinary uploads retain their behavior.
    await assertSucceeds(uploadBytes(ref(env.authenticatedContext('owner').storage(),'uploads/videos/owner/ordinary.mp4'),new Uint8Array([1,2,3])));
    assert.ok(true);
  } finally {await env.cleanup();}
});
