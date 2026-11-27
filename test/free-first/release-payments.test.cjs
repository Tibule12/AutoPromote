const {test,after}=require('node:test');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createSandboxDatabase}=require('../../src/services/unifiedCredits/runtime');
const {persistVerifiedSubscription,persistSubscriptionEnd,verifiedSubscription}=require('../../src/services/payments/subscriptionVerification');
const db=createSandboxDatabase();after(()=>db.terminate());
function fixture(){const uid='release-'+crypto.randomUUID(),id='I-'+crypto.randomBytes(8).toString('hex').toUpperCase(),now=Date.now();return {db,userId:uid,subscriptionId:id,now,env:{PAYPAL_PRO_PLAN_ID:'P-EXISTING-STUDIO'},intent:{userId:uid,planId:'pro'},paypalSub:{id,status:'ACTIVE',plan_id:'P-EXISTING-STUDIO',custom_id:uid,create_time:new Date(now-100000).toISOString(),billing_info:{next_billing_time:new Date(now+86400000).toISOString(),last_payment:{time:new Date(now-10000).toISOString(),amount:{currency_code:'USD',value:'34.99'}}}}};}
test('independent payment verification supports the existing catalog, preserves balances and deduplicates payment events',async()=>{
 const f=fixture();await db.collection('users').doc(f.userId).set({credits:23,promotionalBalance:41});
 await persistVerifiedSubscription(f);await persistVerifiedSubscription(f);
 const user=(await db.collection('users').doc(f.userId).get()).data();assert.equal(user.credits,23);assert.equal(user.promotionalBalance,41);assert.equal(user.subscriptionTier,'pro');
 const events=await db.collection('subscription_events').where('subscriptionId','==',f.subscriptionId).get();assert.equal(events.size,1);
 await persistSubscriptionEnd({db,userId:f.userId,subscriptionId:f.subscriptionId,status:'CANCELLED',eventId:'cancel',now:f.now+1000});
 const sub=(await db.collection('user_subscriptions').doc(f.userId).get()).data();assert.equal(sub.expiresAt,f.paypalSub.billing_info.next_billing_time);
});
test('legacy payment verification refuses approval-only, wrong currency, wrong owner, missing payment and unconfigured agreement',()=>{
 for(const mutate of [f=>f.paypalSub.status='APPROVED',f=>f.paypalSub.billing_info.last_payment.amount.currency_code='ZAR',f=>f.paypalSub.custom_id='someone-else',f=>delete f.paypalSub.billing_info.last_payment,f=>f.paypalSub.plan_id='P-UNCONFIGURED']){
  const f=fixture();mutate(f);assert.throws(()=>verifiedSubscription({...f,remote:f.paypalSub}));
 }
});
test('an asynchronous renewable receipt cannot become a legacy wallet refund after request context ends',async()=>{
 const uid='release-async-refund';await db.collection('users').doc(uid).set({credits:23});
 const result=await require('../../src/creditSystem').refundCredits(uid,{processingTokens:true,deferredSettlement:true,requestId:'renewable-receipt',amount:30},'late-failure');
 assert.equal(result.deferredSettlement,true);assert.equal(result.success,false);assert.equal(result.requestId,'renewable-receipt');
 assert.equal((await db.collection('users').doc(uid).get()).data().credits,23);
});
test('client SDK including admin cannot forge subscription evidence, balances or financial ledgers; normal profile preferences and admin reads survive',async()=>{
 const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');const {doc,setDoc,getDoc,deleteDoc}=require('firebase/firestore');
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');const env=await initializeTestEnvironment({projectId:'demo-autopromote-credits',firestore:{host,port:Number(port)}});
 try{
  await db.collection('users').doc('release-profile').set({credits:23,displayName:'Before'});
  await db.collection('user_billing').doc('release-profile').set({tier:'free'});
  for(const uid of ['release-profile','bf04dPKELvVMivWoUyLsAVyw2sg2']){
   const client=env.authenticatedContext(uid,{email_verified:true}).firestore();
   for(const collection of ['user_billing','user_subscriptions','subscription_intents','subscription_events','paypal_subscription_claims','credits_v2_wallets','processing_worker_bindings'])await assertFails(setDoc(doc(client,collection,'release-profile'),{balance:999999,tier:'pro',paymentVerified:true}));
   await assertFails(setDoc(doc(client,'users','release-profile'),{credits:999999},{merge:true}));await assertFails(deleteDoc(doc(client,'users','release-profile')));
  }
  const owner=env.authenticatedContext('release-profile',{email_verified:true}).firestore();await assertSucceeds(setDoc(doc(owner,'users','release-profile'),{displayName:'After'},{merge:true}));
  const admin=env.authenticatedContext('bf04dPKELvVMivWoUyLsAVyw2sg2',{email_verified:true}).firestore();await assertSucceeds(getDoc(doc(admin,'user_billing','release-profile')));
  assert.equal((await db.collection('users').doc('release-profile').get()).data().credits,23);
 }finally{await env.cleanup();}
});
