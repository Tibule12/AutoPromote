// Snapshot existing obligations without changing their source status or balances.
const fs=require('fs');
const credentials=require('dotenv').parse(fs.readFileSync('/home/tibule12/Projects/AutoPromte/AutoPromote/.env'));
for(const[k,v]of Object.entries(credentials))if(/^(FIREBASE_|GOOGLE_|DOC_SIGNING_SECRET)/.test(k))process.env[k]=v;
const{db}=require('../src/firebaseAdmin');
const{digest}=require('../src/services/unifiedCredits/workerVerification');
async function main(){
 const cutoverAt=process.argv[2];if(!Number.isFinite(Date.parse(cutoverAt||'')))throw Error('Exact release cutover required');
 const apply=process.argv.includes('--apply');const candidates=[];
 for(const[kind,collection]of [['task','promotion_tasks'],['schedule','promotion_schedules']]){
  let query=db.collection(collection);
  if(kind==='task')query=query.where('status','in',['queued','processing','paused','held']);
  else query=query.where('isActive','==',true);
  let last;
  do{
   let page=query.orderBy('__name__').limit(200);if(last)page=page.startAfter(last);
   const results=await page.get();
   for(const doc of results.docs){const value=doc.data();
    if(value.qualificationOnly||value.qualificationHold)continue;
    const userId=value.uid||value.user_id||value.userId,contentId=value.contentId;
    if(!userId||!contentId)continue;
    if(kind==='task'&&!require('../src/utils/docSigner').verifySignature(value))continue;
    const record={kind,sourceId:doc.id,userId,contentId,platform:value.platform||'youtube',cutoverAt,
     originalStatus:value.status||null,preserved:true};
    candidates.push(record);
    if(apply){const ref=db.collection('processing_legacy_publications').doc(digest([kind,doc.id]));
     await db.runTransaction(async tx=>{const old=(await tx.get(ref)).data();
      if(old&&JSON.stringify(old)!==JSON.stringify(record))throw Error('Existing obligation snapshot differs');
      if(!old)tx.create(ref,record);});}
   }
   last=results.size===200?results.docs.at(-1):null;
  }while(last);
 }
 console.log(JSON.stringify({cutoverAt,applied:apply,tasks:candidates.filter(x=>x.kind==='task').length,
  schedules:candidates.filter(x=>x.kind==='schedule').length,originalsModified:0,balancesModified:0}));
 await db.terminate();
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
