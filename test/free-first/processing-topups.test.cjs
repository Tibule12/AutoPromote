const {test,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createSandboxDatabase}=require('../../src/services/unifiedCredits/runtime');
const {createProcessingService}=require('../../src/services/processingTokens/service');
const {createProcessingTopups,verifiedCapture,reconcileTopupRefund,liveProvider}=require('../../src/services/payments/processingTopups');
const db=createSandboxDatabase();after(()=>db.terminate());
const random=()=>crypto.randomBytes(10).toString('hex').toUpperCase();
test('PayPal transport keeps a fixed merchant origin, rejects path injection before OAuth and refuses redirects',async t=>{
 const requests=[];
 t.mock.method(global,'fetch',async(url,options)=>{
  requests.push({url,options});return{ok:true,json:async()=>url.endsWith('/v1/oauth2/token')?{access_token:'isolated-fixture-token',expires_in:300}:{id:'ORDER123456'}};
 });
 const provider=liveProvider({PAYPAL_MODE:'live',PAYPAL_CLIENT_ID:'fixture',PAYPAL_CLIENT_SECRET:'fixture'});
 for(const path of ['https://127.0.0.1/v2/checkout/orders','//evil.example/v2/checkout/orders','/v2/checkout/orders/../admin','/v2/checkout/orders/ORDER123456?redirect=https://evil.example','/v2/checkout/orders/ORDER123456#evil','/v2/checkout/orders/%2f%2fevil','/v2/checkout/orders/ORDER123456\n',null])
  await assert.rejects(provider('GET',path),{code:'INVALID_PAYMENT_RESOURCE'});
 assert.equal(requests.length,0);
 for(const path of ['/v2/checkout/orders','/v2/checkout/orders/ORDER123456','/v2/checkout/orders/ORDER123456/capture','/v2/payments/captures/CAPTURE12345','/v2/payments/refunds/REFUND123456'])await provider('GET',path);
 assert.equal(requests.length,6);
 for(const {url,options} of requests){assert.equal(new URL(url).origin,'https://api-m.paypal.com');assert.equal(options.redirect,'error');assert.equal(new URL(url).search,'');assert.equal(new URL(url).hash,'');}
 assert.equal(requests[3].url,'https://api-m.paypal.com/v2/checkout/orders/ORDER123456/capture');
 assert.equal(requests[5].url,'https://api-m.paypal.com/v2/payments/refunds/REFUND123456');
});
async function fixture(){
 let time=Date.now(),order,posts=0,captures=0,loseCapture=false;
 const uid='topup-'+random(),namespace='processing_qualification_topup_'+random().toLowerCase();
 const ledger=createProcessingService({db,namespace,now:()=>time,entitlement:()=> 'free',
  operations:{'test.small':{tokens:40,maxMicros:10000,maxSeconds:60,resource:'cpu',retries:0},'test.full':{tokens:100,maxMicros:10000,maxSeconds:60,resource:'cpu',retries:0}}});
 await ledger.configure({enabled:true});
 const provider=async(method,path,body)=>{
  if(method==='POST'&&path==='/v2/checkout/orders'){posts++;order={...body,id:random(),status:'CREATED',links:[{rel:'approve',href:'https://www.paypal.com/checkoutnow?token=test'}]};return order;}
  if(method==='POST'){captures++;if(loseCapture)throw Error('lost response');order.status='COMPLETED';order.purchase_units[0].payments={captures:[{id:random(),status:'COMPLETED',final_capture:true,amount:{currency_code:'USD',value:order.purchase_units[0].amount.value}}]};return order;}
  return structuredClone(order);
 };
 const topups=createProcessingTopups({db,ledger,provider,origin:'https://autopromote.org',now:()=>time});
 const buy=async()=>{const created=await topups.create(uid,'pack_boost');order.status='APPROVED';const result=await topups.capture(uid,created.orderId);return{created,result,captureId:order.purchase_units[0].payments.captures[0].id};};
 const run=async(operation,success=true)=>{const requestId=random(),tokens=ledger.quote(operation).tokens;
  await ledger.reserve(uid,{operation,requestId,fingerprint:random(),approvedTokens:tokens});await ledger.start(uid,requestId);
  await ledger.authorizeDispatch(uid,requestId);await ledger.settle(uid,requestId,{eventId:random(),success,actualMicros:1000,stopped:true});};
 return{uid,namespace,ledger,topups,buy,run,get order(){return order;},get posts(){return posts;},get captures(){return captures;},lose:()=>{loseCapture=true;},advance:ms=>{time+=ms;}};
}
test('one-time paid top-up preserves renewable resets, rolling ceilings and every legacy wallet; repeated callbacks grant once',async()=>{
 const f=await fixture();await db.collection('users').doc(f.uid).set({credits:91,foundingTesterCredits:27});
 const before=await f.ledger.status(f.uid),{created,result}=await f.buy();assert.equal(result.tokensAdded,50);
 assert.equal(result.processing.remaining,100);assert.equal(result.processing.purchasedRemainingTokens,50);
 assert.equal(result.processing.nextResetAt,before.nextResetAt);assert.equal(result.processing.rolling30DayLimit,500);
 assert.equal((await f.topups.capture(f.uid,created.orderId)).tokensAdded,0);assert.equal(f.captures,1);
 assert.deepEqual((await db.collection('users').doc(f.uid).get()).data(),{credits:91,foundingTesterCredits:27});
 await f.run('test.full');await f.run('test.small');let status=await f.ledger.status(f.uid);
 assert.equal(status.remaining,0);assert.equal(status.purchasedRemainingTokens,10);assert.equal(status.rollingSpentTokens,100);
 f.advance(6*86400000);status=await f.ledger.status(f.uid);assert.equal(status.remaining,100);assert.equal(status.purchasedRemainingTokens,10);
});
test('a top-up can cover an operation across renewable and purchased balances; failure restores both and cash exhaustion still refuses',async()=>{
 const f=await fixture();await f.buy();await f.run('test.small');await f.run('test.small');
 await f.run('test.small',false);let status=await f.ledger.status(f.uid);assert.equal(status.remaining,20);assert.equal(status.purchasedRemainingTokens,50);
 await f.run('test.small');status=await f.ledger.status(f.uid);assert.equal(status.remaining,0);assert.equal(status.purchasedRemainingTokens,30);assert.equal(status.rollingSpentTokens,100);
 await db.collection(f.namespace+'_control').doc('global').set({days:{[new Date().toISOString().slice(0,10)]:2000000}},{merge:true});
 await assert.rejects(f.ledger.reserve(f.uid,{operation:'test.small',requestId:random(),fingerprint:random(),approvedTokens:40}));
 assert.equal((await f.ledger.status(f.uid)).purchasedRemainingTokens,30);
 await assert.rejects(f.topups.create(f.uid,'pack_boost'),{code:'FUNDED_CAPACITY_UNAVAILABLE'});
});
test('renewable rolling ceilings remain enforced while separately purchased usage survives resets',async()=>{
 const f=await fixture();await f.buy();
 for(let i=0;i<5;i++){if(i)f.advance(6*86400000);await f.run('test.full');}
 const before=await f.ledger.status(f.uid);assert.equal(before.rollingSpentTokens,500);assert.equal(before.remaining,0);
 await f.run('test.small');const after=await f.ledger.status(f.uid);assert.equal(after.rollingSpentTokens,500);assert.equal(after.purchasedRemainingTokens,10);
});
test('checkout ownership, configured pack, exact capture amount/currency and final status cannot be replaced by client input',async()=>{
 const f=await fixture(),created=await f.topups.create(f.uid,'pack_boost');
 await assert.rejects(f.topups.capture('attacker',created.orderId),{code:'TOPUP_OWNER_MISMATCH'});assert.equal(f.captures,0);
 assert.equal((await f.topups.create(f.uid,'pack_boost')).orderId,created.orderId);assert.equal(f.posts,1);
 const stored=(await db.collection(f.namespace+'_topup_orders').doc(created.orderId).get()).data();
 const paid={...f.order,status:'COMPLETED',purchase_units:[{...f.order.purchase_units[0],payments:{captures:[{id:random(),status:'COMPLETED',final_capture:true,amount:{currency_code:'USD',value:'4.99'}}]}}]};
 verifiedCapture(paid,stored);
 for(const change of [d=>d.purchase_units[0].amount.value='0.01',d=>d.purchase_units[0].custom_id='attacker',d=>d.purchase_units[0].payments.captures[0].amount.currency_code='ZAR',d=>d.purchase_units[0].payments.captures[0].status='REFUNDED']){
  const tampered=structuredClone(paid);change(tampered);assert.throws(()=>verifiedCapture(tampered,stored));
 }
 assert.equal((await f.ledger.status(f.uid)).purchasedRemainingTokens,0);
});
test('a lost capture response never triggers a second capture or another agreement',async()=>{
 const f=await fixture(),created=await f.topups.create(f.uid,'pack_boost');f.order.status='APPROVED';f.lose();
 await assert.rejects(f.topups.capture(f.uid,created.orderId),/lost response/);
 await assert.rejects(f.topups.capture(f.uid,created.orderId),{code:'TOPUP_CAPTURE_RECONCILIATION_REQUIRED'});
 assert.equal(f.posts,1);assert.equal(f.captures,1);assert.equal((await f.ledger.status(f.uid)).purchasedRemainingTokens,0);
});
test('capacity is rechecked after buyer approval and before taking payment',async()=>{
 const f=await fixture(),created=await f.topups.create(f.uid,'pack_boost');f.order.status='APPROVED';
 await db.collection(f.namespace+'_control').doc('global').set({purchasesPaused:true},{merge:true});
 await assert.rejects(f.topups.capture(f.uid,created.orderId),{code:'FUNDED_CAPACITY_UNAVAILABLE'});
 assert.equal(f.captures,0);
});
test('refunds revoke once, including before crediting or while a paid job is held, without refilling renewable tokens',async()=>{
 const f=await fixture(),{created,captureId}=await f.buy();await f.run('test.full');
 const requestId=random();await f.ledger.reserve(f.uid,{operation:'test.small',requestId,fingerprint:random(),approvedTokens:40});await f.ledger.start(f.uid,requestId);
 const refund={orderId:created.orderId,refundId:'refund-one'};
 await f.ledger.revokeTopup(captureId,refund);await f.ledger.revokeTopup(captureId,refund);
 await f.ledger.settle(f.uid,requestId,{eventId:random(),success:true,actualMicros:1000,stopped:true});
 const status=await f.ledger.status(f.uid);assert.equal(status.purchasedRemainingTokens,0);assert.equal(status.purchasedDebtTokens,40);assert.equal(status.rollingSpentTokens,100);
 const g=await fixture(),pending=await g.topups.create(g.uid,'pack_boost'),capture=random();
 await g.ledger.revokeTopup(capture,{orderId:pending.orderId,refundId:'early-refund'});
 await db.collection(g.namespace+'_topup_orders').doc(pending.orderId).set({paymentVerified:true,captureId:capture},{merge:true});
 await assert.rejects(g.ledger.applyTopup(g.uid,{orderId:pending.orderId,captureId:capture}),{code:'PAYMENT_REVOKED'});
});
test('authoritative partial refunds are tied to the exact capture and revoke the proportional tokens',async()=>{
 const uid='refund-'+random(),orderId=random(),captureId=random(),refundId=random();
 await db.collection('processing_topup_orders').doc(orderId).set({userId:uid,orderId,packageId:'pack_boost',captureId});
 const revoked=[];
 const read=async(_method,path)=>path.includes('/captures/')?{id:captureId,status:'PARTIALLY_REFUNDED',supplementary_data:{related_ids:{order_id:orderId}}}:
  {id:refundId,status:'COMPLETED',amount:{currency_code:'USD',value:'1.00'},links:[{rel:'up',href:'https://api.paypal.com/v2/payments/captures/'+captureId}]};
 await reconcileTopupRefund({id:'WH-'+random(),event_type:'PAYMENT.CAPTURE.REFUNDED',resource:{id:refundId,supplementary_data:{related_ids:{capture_id:captureId}}}},
  {db,ledger:{revokeTopup:async(id,options)=>revoked.push({id,...options})},read});
 assert.equal(revoked[0].tokens,11);assert.equal(revoked[0].id,captureId);assert.equal(revoked[0].refundId,refundId);
});
