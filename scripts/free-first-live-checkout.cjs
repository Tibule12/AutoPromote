// Prepare exactly the authorized checkout through the existing authenticated
// production route. This does not approve a buyer agreement or charge a card.
const fs=require('fs'),path=require('path');
const PRIVATE='/home/tibule12/.local/share/autopromote-qa/free-first-launch-20261127';
const env=require('dotenv').parse(fs.readFileSync('/home/tibule12/Projects/AutoPromte/AutoPromote/.env'));
for(const[k,v]of Object.entries(env))if(/^(FIREBASE_|GOOGLE_|PAYPAL_|DOC_SIGNING_SECRET)/.test(k))process.env[k]=v;
process.env.FRONTEND_URL='https://autopromote.org';process.env.FREE_FIRST_USAGE_ENABLED='true';
process.env.PLUS_PURCHASES_ENABLED='true';process.env.PAYPAL_PLUS_PLAN_ID=require('../config/free-first-release/activation.json').paypalPlanId;
process.env.ENABLE_BACKGROUND_JOBS='false';process.env.NODE_ENV='production';
process.env.PROCESSING_LEDGER_NAMESPACE='processing_qualification_launch_20261127';
process.env.PROCESSING_BUDGET_LIMITS_JSON=JSON.stringify({dailyMicros:5000000,monthlyMicros:5000000,freeDailyMicros:5000000,apiDailyMicros:50000,maxActive:1,maxActiveUser:1});
function decode(v){if(v&&typeof v==='object'){if(Array.isArray(v.o))return Object.fromEntries(v.o.map(x=>[x.k,decode(x.v)]));if(Array.isArray(v.a))return v.a.map(decode);if('s'in v)return v.s;for(const k of ['n','b','bi'])if(k in v)return v[k];}return v;}
function find(v){if(!v||typeof v!=='object')return;if(v.uid&&v.stsTokenManager)return v;if(v.valueEncoded){const f=find(decode(v.valueEncoded));if(f)return f;}for(const c of Object.values(v)){if(typeof c==='string'&&c.startsWith('{')&&c.includes('stsTokenManager')){try{const f=find(JSON.parse(c));if(f)return f;}catch{}}const f=find(c);if(f)return f;}}
async function main(){
 const approval=require('../reports/free-first-launch-20261127/approval-and-status.json');
 if(approval.liveCheckoutCount!==1||approval.liveCheckoutAmountUsd!==4.99)throw Error('Exact one-checkout authority required');
 const output=path.join(PRIVATE,'live-checkout.private.json');
 if(fs.existsSync(output)){console.log(JSON.stringify({prepared:true,charged:false,alreadyPrepared:true}));return;}
 if(!process.argv.includes('--prepare')){console.log(JSON.stringify({prepared:false,charged:false,amountUsd:4.99}));return;}
 const account=JSON.parse(fs.readFileSync(path.join(PRIVATE,'ordinary-account.private.json')));
 const user=find(JSON.parse(fs.readFileSync(path.join(PRIVATE,'ordinary-session-current.private.json'))));
 if(!user||user.uid!==account.uid||!account.emailVerified)throw Error('Existing ordinary verified browser account required');
 const express=require('express'),http=require('supertest');const app=express();app.use(express.json());
 app.use('/api/paypal-subscriptions',require('../src/routes/paypalSubscriptionRoutes'));
 const response=await http(app).post('/api/paypal-subscriptions/create-subscription')
  .set('Authorization','Bearer '+user.stsTokenManager.accessToken)
  .send({planId:'plus',returnUrl:'https://autopromote.org/pricing',cancelUrl:'https://autopromote.org/pricing'});
 if(response.status!==200||!response.body.subscriptionId||!response.body.approvalUrl)
  throw Error('Checkout preparation failed: '+response.status+' '+response.body.error);
 fs.writeFileSync(output,JSON.stringify({userId:account.uid,...response.body,preparedAt:new Date().toISOString(),
  buyerApproved:false,buyerCharged:false,amountUsd:4.99},null,2),{mode:0o600});
 console.log(JSON.stringify({prepared:true,charged:false,amountUsd:4.99,subscriptionId:response.body.subscriptionId,
  authenticatedOrdinaryAccount:true,readyForBuyerApprovalAfterBackendRelease:true}));
 await require('../src/firebaseAdmin').db.terminate();
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
