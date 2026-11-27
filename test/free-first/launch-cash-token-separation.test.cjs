const {test,after}=require('node:test');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createSandboxDatabase}=require('../../src/services/unifiedCredits/runtime');
const {createProcessingService}=require('../../src/services/processingTokens/service');
const db=createSandboxDatabase();after(()=>db.terminate());
const policy={qualified:{tokens:40,maxMicros:1560000,maxSeconds:900,resource:'gpu',retries:0}};
const service=createProcessingService({db,operations:policy,entitlement:async()=> 'free'});
const uid=()=> 'separated-'+crypto.randomUUID();
const req=(id=crypto.randomUUID())=>({operation:'qualified',requestId:id,fingerprint:'owned-source-and-settings',approvedTokens:40});
test('a Free account holds forty tokens independently of a $1.56 infrastructure envelope',async()=>{
 await service.configure({enabled:true});const user=uid(),r=req();const q=service.quote('qualified');assert.equal(q.tokens,40);assert.equal(q.maxMicros,1560000);
 await service.reserve(user,r);let s=await service.status(user);assert.equal(s.remaining,60);assert.equal(s.reservedTokens,40);assert.equal(s.rollingSpentTokens,0);
 await service.start(user,r.requestId);await service.authorizeDispatch(user,r.requestId);
 await service.settle(user,r.requestId,{eventId:'complete',success:true,actualMicros:150000,stopped:true});
 s=await service.status(user);assert.equal(s.remaining,60);assert.equal(s.reservedTokens,0);assert.equal(s.rollingSpentTokens,40);
});
test('failed started work refunds user tokens and rolling tokens while keeping cash expenditure',async()=>{
 const before=(await db.collection('processing_control').doc('global').get()).data();
 const spentBefore=Object.values(before.days).reduce((a,b)=>a+b,0);
 const user=uid(),r=req();await service.reserve(user,r);await service.start(user,r.requestId);
 await service.settle(user,r.requestId,{eventId:'failed',success:false,actualMicros:150000,stopped:true});
 const s=await service.status(user);assert.equal(s.remaining,100);assert.equal(s.rollingSpentTokens,0);
 const g=(await db.collection('processing_control').doc('global').get()).data();assert.equal(Object.values(g.days).reduce((a,b)=>a+b,0)-spentBefore,150000);
});
test('cash exhaustion rejects admission without consuming an otherwise sufficient Free allowance',async()=>{
 const user=uid(),r=req();const restricted=createProcessingService({db,operations:policy,entitlement:async()=> 'free',limits:{dailyMicros:1600000}});
 await assert.rejects(restricted.reserve(user,r),{code:'GLOBAL_PROCESSING_BUDGET'});
 const s=await service.status(user);assert.equal(s.remaining,100);assert.equal(s.reservedTokens,0);
});
test('a reset retains independent outstanding token and cash liabilities until authoritative settlement',async()=>{
 let now=Date.parse('2027-01-01T00:00:00Z');const scoped=createProcessingService({db,operations:policy,entitlement:async()=> 'free',now:()=>now});const user=uid(),r=req();await scoped.reserve(user,r);await scoped.start(user,r.requestId);
 now+=6*86400000;const s=await scoped.status(user);assert.equal(s.remaining,60);assert.equal(s.reservedTokens,40);
 await scoped.settle(user,r.requestId,{eventId:'prior-cycle',success:true,actualMicros:100000,stopped:true});
 const after=await scoped.status(user);assert.equal(after.remaining,100);assert.equal(after.rollingSpentTokens,40);
});
