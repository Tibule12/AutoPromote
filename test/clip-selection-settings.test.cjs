const test=require('node:test'),assert=require('node:assert/strict');
const{normalizeClipSelectionSettings:normalize}=require('../src/services/clipSelectionSettings');
test('normalizes the same bounded preferences sent to the worker',()=>{
  assert.equal(normalize().maxDuration,60);
  assert.deepEqual(normalize({minDuration:15,maxDuration:30,destinations:['tiktok','tiktok'],focus:'  lessons  '}),{version:'moments-v2',minDuration:15,maxDuration:30,destinations:['tiktok'],focus:'lessons'});
});
test('invalid settings cannot reach paid admission',()=>{
  for(const v of [{minDuration:0,maxDuration:30,destinations:['tiktok'],focus:''},{minDuration:30,maxDuration:15,destinations:['tiktok'],focus:''},{minDuration:15,maxDuration:30,destinations:[],focus:''},{minDuration:15,maxDuration:30,destinations:['unknown'],focus:''},{minDuration:15,maxDuration:30,destinations:['tiktok'],focus:'x'.repeat(201)},'invalid'])assert.throws(()=>normalize(v),e=>e.statusCode===400);
});
