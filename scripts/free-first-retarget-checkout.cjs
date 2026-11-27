// Explicit owner account correction before any buyer approval. Existing customer
// agreements, balances and roles are never changed.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const PRIVATE='/home/tibule12/.local/share/autopromote-qa/free-first-launch-20261127';
const env=require('dotenv').parse(fs.readFileSync('/home/tibule12/Projects/AutoPromte/AutoPromote/.env'));
for(const[k,v]of Object.entries(env))if(/^(FIREBASE_|GOOGLE_|PAYPAL_|DOC_SIGNING_SECRET)/.test(k))process.env[k]=v;
process.env.NODE_ENV='production';require('../src/services/processingTokens/releaseConfig').applyReleaseConfig();
const{db,admin}=require('../src/firebaseAdmin');
async function main(){
 if(!process.argv.includes('--prepare')){console.log(JSON.stringify({mutations:false,requires:'--prepare; explicit owner-selected account receipt'}));await db.terminate();return;}
 const target=JSON.parse(fs.readFileSync(path.join(PRIVATE,'owner-checkout-target.private.json')));
 const account=await admin.auth().getUser(target.uid);
 if(account.email!==target.email||!account.emailVerified||account.disabled||!target.emailVerified||target.disabled||target.subscription?.hasPayPalAgreement)
  throw Error('Owner-selected unsubscribed verified identity required');
 const live=path.join(PRIVATE,'live-checkout.private.json'),old=JSON.parse(fs.readFileSync(live));
 const provider=require('../src/routes/paypalSubscriptionRoutes').qualificationProvider;
 if(old.userId===target.uid){const current=await provider.read(old.subscriptionId);
  if(current.custom_id!==target.uid||current.plan_id!==process.env.PAYPAL_PLUS_PLAN_ID||current.status!=='APPROVAL_PENDING'||current.billing_info?.last_payment)
   throw Error('Existing checkout requires read-only payment reconciliation');
  console.log(JSON.stringify({prepared:true,existing:true,ownerVerified:true,amountUsd:4.99,subscriptionId:old.subscriptionId}));await db.terminate();return;}
 const original=await provider.read(old.subscriptionId);
 if(original.custom_id!==old.userId||original.plan_id!==process.env.PAYPAL_PLUS_PLAN_ID||original.billing_info?.last_payment)
  throw Error('Original unpaid QA agreement identity changed; do not create another checkout');
 const auditPath=path.join(PRIVATE,'checkout-retarget.private.json');
 let audit=fs.existsSync(auditPath)?JSON.parse(fs.readFileSync(auditPath)):{oldSubscriptionId:old.subscriptionId,
  oldUserId:old.userId,newUserId:target.uid,ownerDirection:'Explicit account email supplied in this session',buyerCharges:0};
 const save=()=>fs.writeFileSync(auditPath,JSON.stringify(audit,null,2),{mode:0o600});
 if(!['APPROVAL_PENDING','CANCELLED'].includes(original.status))throw Error('Original agreement must remain unpaid and unapproved');
 // PayPal returned definitive RESOURCE_NOT_FOUND to both cancellation and edit
 // of this unapproved agreement. Never retry those mutations or claim it was
 // cancelled. Retire its local intent and give the owner a replacement link;
 // neither preparation authorizes or performs a buyer payment.
 if(original.status==='APPROVAL_PENDING'&&(audit.cancelStatus!==404||audit.patchStatus!==404))
  throw Error('Reconcile the original pending agreement before replacement');
 audit.originalCancelled=original.status==='CANCELLED';audit.originalRemainsUnpaid=true;save();
 const originalSession=db.collection('processing_checkout_sessions').doc(crypto.createHash('sha256').update(old.userId).digest('hex'));
 await db.runTransaction(async tx=>{const intentRef=db.collection('subscription_intents').doc(old.subscriptionId);
  const [session,intent]=await tx.getAll(originalSession,intentRef);const s=session.data(),i=intent.data();
  if(s?.subscriptionId!==old.subscriptionId||i?.userId!==old.userId||!['pending','superseded'].includes(i.status))throw Error('Original checkout session changed');
  tx.update(originalSession,{state:'closed',closedAt:Date.now(),closeReason:'owner_changed_target_before_approval'});
  tx.update(intentRef,{status:'superseded',supersededAt:new Date().toISOString(),replacementUserId:target.uid});});
 const valid=await provider.validatePlan('plus',process.env.PAYPAL_PLUS_PLAN_ID);if(!valid.ok)throw Error(valid.code);
 await require('../src/services/payments/checkoutPolicy').assertPurchaseCapacity(require('../src/services/processingTokens/runtime').service());
 const checkout=await require('../src/services/payments/checkoutSession').createOwnedCheckout({db,userId:target.uid,planId:'plus',
  paypalPlanId:process.env.PAYPAL_PLUS_PLAN_ID,returnUrl:'https://autopromote.org/pricing',cancelUrl:'https://autopromote.org/pricing',
  read:provider.read,create:requestId=>provider.create({planId:process.env.PAYPAL_PLUS_PLAN_ID,
   userData:{email:account.email,name:account.displayName},returnUrl:'https://autopromote.org/pricing',
   cancelUrl:'https://autopromote.org/pricing',customId:target.uid,requestId})});
 if(!fs.existsSync(path.join(PRIVATE,'live-checkout-original-qa.private.json')))
  fs.copyFileSync(live,path.join(PRIVATE,'live-checkout-original-qa.private.json'));
 fs.writeFileSync(live,JSON.stringify({userId:target.uid,email:account.email,...checkout,buyerApproved:false,
  buyerCharged:false,amountUsd:4.99,preparedAt:new Date().toISOString()},null,2),{mode:0o600});
 audit.newSubscriptionId=checkout.subscriptionId;audit.completedAt=new Date().toISOString();save();
 console.log(JSON.stringify({prepared:true,oldApprovalCancelled:audit.originalCancelled,oldLinkMustRemainUnpaid:true,email:account.email,amountUsd:4.99,
  subscriptionId:checkout.subscriptionId,approvalUrl:checkout.approvalUrl,charges:0}));await db.terminate();
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
