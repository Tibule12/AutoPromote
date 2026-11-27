const {test,after}=require('node:test');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const express=require('express'),http=require('supertest');
const {createSandboxDatabase}=require('../../src/services/unifiedCredits/runtime');
const db=createSandboxDatabase(),id=require.resolve('../../src/firebaseAdmin'),original=require(id);
require.cache[id].exports={...original,db};
const previousFetch=global.fetch,keys=['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID','PAYPAL_MODE'];
const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
Object.assign(process.env,{PAYPAL_CLIENT_ID:'local-test',PAYPAL_CLIENT_SECRET:'local-test',PAYPAL_WEBHOOK_ID:'WH-LOCAL',PAYPAL_MODE:'sandbox'});
const uid='late-event-'+crypto.randomUUID(),subscriptionId='I-'+crypto.randomBytes(8).toString('hex').toUpperCase();
let paymentHistoryReads=0;
global.fetch=async url=>{
 const path=new URL(url).pathname;
 if(path==='/v1/oauth2/token')return {ok:true,json:async()=>({access_token:'local-mock',expires_in:300})};
 if(path==='/v1/notifications/verify-webhook-signature')return {ok:true,json:async()=>({verification_status:'SUCCESS'})};
 if(path.endsWith('/transactions')){paymentHistoryReads++;throw Error('A cancelled agreement cannot be reactivated');}
 if(path==='/v1/billing/subscriptions/'+subscriptionId)return {ok:true,json:async()=>({id:subscriptionId,status:'CANCELLED',custom_id:uid})};
 throw Error('Unexpected provider request');
};
const router=require('../../src/routes/paypalWebhookRoutes');
after(async()=>{global.fetch=previousFetch;require.cache[id].exports=original;for(const k of keys)if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];await db.terminate();});
test('a verified delayed activation after cancellation is acknowledged without another payment read or loss of the paid period',async()=>{
 const paidThrough=new Date(Date.now()+29*86400000).toISOString();
 await db.collection('subscription_intents').doc(subscriptionId).set({userId:uid,planId:'plus',status:'activated'});
 await db.collection('user_subscriptions').doc(uid).set({userId:uid,paypalSubscriptionId:subscriptionId,planId:'plus',status:'active',paymentVerified:true,expiresAt:paidThrough,nextBillingDate:paidThrough});
 await db.collection('user_billing').doc(uid).set({tier:'plus',status:'active',paymentVerified:true,expiresAt:paidThrough,nextBillingDate:paidThrough});
 const app=express();app.use('/api/paypal',router);
 const event={id:'WH-LATE-'+crypto.randomBytes(8).toString('hex'),event_type:'BILLING.SUBSCRIPTION.ACTIVATED',resource:{id:subscriptionId}};
 for(let i=0;i<2;i++){
  const response=await http(app).post('/api/paypal/webhook').set('paypal-transmission-id','local-id').set('paypal-transmission-time',new Date().toISOString())
   .set('paypal-cert-url','https://api.paypal.com/certs/local').set('paypal-auth-algo','SHA256withRSA').set('paypal-transmission-sig','local-mock').send(event);
  assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.verified,true);
 }
 const sub=(await db.collection('user_subscriptions').doc(uid).get()).data();
 assert.equal(sub.status,'cancelled');assert.equal(sub.expiresAt,paidThrough);assert.equal(paymentHistoryReads,0);
});
