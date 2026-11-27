const fs=require('node:fs'),path=require('node:path');
const PRIVATE='/home/tibule12/.local/share/autopromote-qa/free-first-launch-20261127';
const env=require('dotenv').parse(fs.readFileSync('/home/tibule12/Projects/AutoPromte/AutoPromote/.env'));
for(const[k,v]of Object.entries(env))if(/^(FIREBASE_|GOOGLE_|OPENAI_)/.test(k))process.env[k]=v;
process.env.OPENAI_API_BASE='https://api.openai.com';process.env.FREE_FIRST_USAGE_ENABLED='true';
process.env.ENABLE_BACKGROUND_JOBS='false';process.env.PROCESSING_LEDGER_NAMESPACE='processing_qualification_launch_20261127';
process.env.PROCESSING_BUDGET_LIMITS_JSON=JSON.stringify({dailyMicros:5000000,monthlyMicros:5000000,
 freeDailyMicros:5000000,apiDailyMicros:50000,maxActive:1,maxActiveUser:1});
const {db}=require('../src/firebaseAdmin');
const {digest}=require('../src/services/unifiedCredits/workerVerification');
async function main(){
 const output=path.join(PRIVATE,'Q5-qualified.private.json');
 if(fs.existsSync(output))throw Error('The single approved AI call already has a qualification receipt');
 if(!process.argv.includes('--execute')){
  console.log(JSON.stringify({stage:'Q5',maximumUsd:0.01,model:'gpt-4o-mini',requests:1,maxOutputTokens:500,executed:false}));return;
 }
 for(const stage of ['Q2-FIND','Q2-EXPORT','Q3-CAM-DELIVERY-CORRECTED','Q4-FX']){
  const r=JSON.parse(fs.readFileSync(path.join(PRIVATE,stage+'.execution.private.json')));
  const binding=(await db.collection('processing_worker_bindings').doc(digest([r.uid,r.requestId])).get()).data();
  if(binding?.state!=='settled'||binding.success!==true)throw Error('Complete '+stage+' before Q5');
 }
 const uid='free-first-launch-20261127-q5',requestId='launch-q5-one-caption';
 const ref=db.collection('users').doc(uid);
 if(!(await ref.get()).exists)await ref.create({name:'Free AI caption qualification',subscriptionTier:'free',credits:0,qualificationAccount:true});
 const runtime=require('../src/services/processingTokens/runtime');const service=runtime.service();
 const express=require('express'),http=require('supertest');const app=express();app.use(express.json());
 app.use(require('../src/middlewares/processingBudgetMiddleware').createProcessingGuard({service,adapters:runtime.adapters,
  authenticate:(req,res,next)=>{req.user={uid,claims:{email_verified:true}};req.userId=uid;next();}}));
 app.post('/api/captions/generate',async(req,res)=>{
  try{const result=await require('../src/services/captionGenerationService').generateCaption(req.body.contentData,'youtube',req.body.options);
   res.status(result.success?200:502).json(result);
  }catch(error){res.status(error.status||503).json({error:error.code||'CAPTION_FAILED'});}});
 const body={contentData:{title:'A sixty-second creative workflow in AutoPromote',
  description:'Edit an existing video, add a moving title, export it and publish privately.'},
  options:{tone:'professional',length:'short',includeHashtags:true,hashtagCount:3,includeEmojis:false,includeCallToAction:false}};
 const result=await http(app).post('/api/captions/generate').set('Idempotency-Key',requestId)
  .set('X-Processing-Tokens-Approved','1').send(body);
 const receipt=(await db.collection('processing_api_receipts').doc(digest([uid,requestId,1])).get()).data();
 if(result.status!==200||!receipt?.providerResponseId||receipt.inputTokens>2000||receipt.outputTokens>500)
  throw Error('Actual provider usage/output proof missing; no additional call authorized by this script');
 const state={stage:'Q5',model:receipt.model,providerResponseId:receipt.providerResponseId,inputTokens:receipt.inputTokens,
  outputTokens:receipt.outputTokens,estimatedMicros:receipt.estimatedMicros,invoiceMicros:null,caption:result.body,
  allowance:await service.status(uid),actualProviderCall:true};
 fs.writeFileSync(output,JSON.stringify(state,null,2),{mode:0o600});
 console.log(JSON.stringify({...state,caption:undefined}));await db.terminate();
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
