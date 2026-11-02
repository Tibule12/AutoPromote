'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {optionalPlatformStatusAuth,statusRequestCacheKey}=require('../src/middlewares/platformStatusPolicy');
test('unsigned public status remains available, authenticated headers invoke the actual auth boundary',()=>{
  let calls=0,nexts=0;
  const handler=optionalPlatformStatusAuth((req,res,next)=>{calls++;req.userId='verified';next();});
  handler({headers:{}},{},()=>nexts++);assert.equal(calls,0);assert.equal(nexts,1);
  const request={headers:{authorization:'Bearer fixture'}};handler(request,{},()=>nexts++);assert.equal(calls,1);assert.equal(request.userId,'verified');assert.equal(nexts,2);
});
test('invalid supplied authentication cannot fall through as an unsigned status request',()=>{
  let nexts=0;
  const response={code:200};optionalPlatformStatusAuth((_req,res)=>{res.code=401;})({headers:{authorization:'invalid'}},response,()=>nexts++);
  assert.equal(response.code,401);assert.equal(nexts,0);
});
test('pre-auth status cache separates credentials, cookies, workspace and query parameters without retaining secrets',()=>{
  const base={path:'/api/platform/status',headers:{authorization:'Bearer account-A',cookie:'private-cookie-A','x-workspace-id':'personal'}};
  const original=statusRequestCacheKey(base);assert.match(original,/^[a-f0-9]{64}$/);assert.equal(original,statusRequestCacheKey(structuredClone(base)));
  for(const mutate of [r=>r.headers.authorization='Bearer account-B',r=>r.headers.cookie='private-cookie-B',r=>r.headers['x-workspace-id']='team',r=>r.originalUrl='/api/platform/status?fresh=1']){
    const changed=structuredClone(base);mutate(changed);assert.notEqual(statusRequestCacheKey(changed),original);
  }
  assert.notEqual(statusRequestCacheKey({path:base.path,headers:{}}),original);assert.ok(!original.includes('account-A'));
});
