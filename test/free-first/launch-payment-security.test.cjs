const {test,after}=require('node:test');const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createSandboxDatabase}=require('../../src/services/unifiedCredits/runtime');
const {persistVerifiedSubscription}=require('../../src/services/payments/subscriptionVerification');
const {persistPaymentRevocation,persistFailedCollection}=require('../../src/services/payments/subscriptionLifecycle');
const {readCurrentPaymentProof}=require('../../src/services/payments/paymentProof');
const {checkoutOrigins,assertPurchaseCapacity}=require('../../src/services/payments/checkoutPolicy');
const db=createSandboxDatabase();after(()=>db.terminate());
function fixture(){const userId='launch-pay-'+crypto.randomUUID(),subscriptionId='I-'+crypto.randomBytes(8).toString('hex').toUpperCase(),now=Date.now(),time=new Date(now-60000).toISOString();return {db,userId,subscriptionId,now,env:{PAYPAL_PLUS_PLAN_ID:'P-APPROVED',PAYPAL_MODE:'live'},intent:{userId,planId:'plus'},paypalSub:{id:subscriptionId,status:'ACTIVE',plan_id:'P-APPROVED',custom_id:userId,create_time:time,billing_info:{next_billing_time:new Date(now+29*86400000).toISOString(),last_payment:{time,amount:{currency_code:'USD',value:'4.99'}}}},paymentProof:{transactionId:'PAYMENT'+crypto.randomBytes(8).toString('hex'),paymentTime:time,status:'COMPLETED',amount:'4.99',currency:'USD'}};}
test('only current completed $4.99 transactions prove payment; refunded or additional charges do not',async()=>{
 const f=fixture();const row={id:f.paymentProof.transactionId,time:f.paymentProof.paymentTime,status:'COMPLETED',amount_with_breakdown:{gross_amount:{currency_code:'USD',value:'4.99'}}};
 const proof=await readCurrentPaymentProof({subscriptionId:f.subscriptionId,remote:f.paypalSub,read:async()=>({transactions:[row]})});assert.equal(proof.transactionId,row.id);
 for(const changed of [{...row,status:'REFUNDED'},{...row,amount_with_breakdown:{gross_amount:{currency_code:'USD',value:'5.99'}}}])await assert.rejects(readCurrentPaymentProof({subscriptionId:f.subscriptionId,remote:f.paypalSub,read:async()=>({transactions:[changed]})}));
 await assert.rejects(persistVerifiedSubscription({...f,paymentProof:undefined}),{code:'PAYMENT_TRANSACTION_PROOF_REQUIRED'});
});
test('current payment reversal revokes paid processing and cannot be undone by activation replay; wallets and tester credits remain exact',async()=>{
 const f=fixture();await db.collection('users').doc(f.userId).set({credits:123,foundingTesterCredits:71});await persistVerifiedSubscription(f);
 await persistPaymentRevocation({db,userId:f.userId,subscriptionId:f.subscriptionId,paymentTime:f.paymentProof.paymentTime,saleId:f.paymentProof.transactionId,eventId:'chargeback',status:'reversed',now:f.now});
 await assert.rejects(persistVerifiedSubscription(f),{code:'PAYMENT_REVOKED'});
 const user=(await db.collection('users').doc(f.userId).get()).data();assert.equal(user.credits,123);assert.equal(user.foundingTesterCredits,71);assert.equal(user.subscriptionStatus,'reversed');
});
test('an old-period refund does not revoke a newer paid renewal',async()=>{
 const f=fixture();await persistVerifiedSubscription(f);
 await persistPaymentRevocation({db,userId:f.userId,subscriptionId:f.subscriptionId,paymentTime:new Date(f.now-31*86400000).toISOString(),saleId:'OLD-SALE',eventId:'old-refund',status:'refunded'});
 assert.equal((await db.collection('user_subscriptions').doc(f.userId).get()).data().status,'active');
 await persistVerifiedSubscription(f);
});
test('refund delivered before activation blocks the sale despite a different provider sale timestamp',async()=>{
 const f=fixture();
 await persistPaymentRevocation({db,userId:f.userId,subscriptionId:f.subscriptionId,
   paymentTime:new Date(Date.parse(f.paymentProof.paymentTime)+10000).toISOString(),
   providerCurrentPaymentTime:f.paymentProof.paymentTime,saleId:f.paymentProof.transactionId,
   eventId:'early-refund',status:'refunded',now:f.now});
 await assert.rejects(persistVerifiedSubscription(f),{code:'PAYMENT_REVOKED'});
 assert.equal((await db.collection('user_subscriptions').doc(f.userId).get()).exists,false);
});
test('failed collection records failure without extending or erasing the verified paid-through period',async()=>{
 const f=fixture();await persistVerifiedSubscription(f);const before=(await db.collection('user_subscriptions').doc(f.userId).get()).data();
 const result=await persistFailedCollection({...f,eventId:'failure',remote:{id:f.subscriptionId,billing_info:{failed_payments_count:1,next_billing_time:'2030-01-01T00:00:00Z'}}});
 assert.equal(result.paidThrough,before.expiresAt);const after=(await db.collection('user_subscriptions').doc(f.userId).get()).data();assert.equal(after.expiresAt,before.expiresAt);assert.equal(after.status,'active');assert.equal(after.renewalStatus,'payment_failed');
});
test('checkout callbacks are bound to the configured pricing origin and purchases stop when cash capacity is unavailable',async()=>{
 const env={FRONTEND_URL:'https://autopromote.org',NODE_ENV:'production'};
 assert.equal(checkoutOrigins({},env).returnUrl,'https://autopromote.org/pricing');
 for(const returnUrl of ['https://evil.example/pricing','https://autopromote.org@evil.example/pricing','//evil.example/pricing','https://autopromote.org/pricing?redirect=https://evil.example','https://autopromote.org/pricing#access'])assert.throws(()=>checkoutOrigins({returnUrl},env));
 await assert.rejects(assertPurchaseCapacity({purchaseCapacity:async()=>({available:false})}),{code:'FUNDED_CAPACITY_UNAVAILABLE'});
 await assertPurchaseCapacity({purchaseCapacity:async value=>({available:value===1070000})});
});
