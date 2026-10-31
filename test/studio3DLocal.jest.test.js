const {configuration}=require('../src/services/studio3DLocal');
const base={STUDIO_3D_LOCAL_CPU:'1',GCLOUD_PROJECT:'demo-autopromote-credits',GOOGLE_CLOUD_PROJECT:'demo-autopromote-credits',UNIFIED_CREDITS_SANDBOX:'true',FIRESTORE_EMULATOR_HOST:'127.0.0.1:1111',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:2222',STORAGE_EMULATOR_HOST:'http://127.0.0.1:3333',STUDIO_3D_BLENDER_BIN:'/installed/blender'};
test('CPU 3D transport is opt-in and refuses production or external storage',()=>{
 expect(configuration({})).toBeNull();expect(configuration(base)).toMatchObject({storageOrigin:'http://127.0.0.1:3333'});
 for(const patch of [{GCLOUD_PROJECT:'production'},{GOOGLE_CLOUD_PROJECT:'production'},{UNIFIED_CREDITS_SANDBOX:'false'},
  {STORAGE_EMULATOR_HOST:'https://storage.googleapis.com'},{FIRESTORE_EMULATOR_HOST:'external:1111'},
  {STUDIO_3D_BLENDER_BIN:'blender'},{STORAGE_EMULATOR_HOST:'http://user@127.0.0.1:3333'}])expect(()=>configuration({...base,...patch})).toThrow();
});
