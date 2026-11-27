// Keep the existing webhook identity/URL and legacy events. Add subscription
// financial lifecycle notifications needed by the verified Plus handler.
const fs=require('node:fs');
const env=require('dotenv').parse(fs.readFileSync('/home/tibule12/Projects/AutoPromte/AutoPromote/.env'));
const required=['PAYMENT.SALE.COMPLETED','PAYMENT.SALE.REFUNDED','PAYMENT.SALE.REVERSED',
 'BILLING.SUBSCRIPTION.ACTIVATED','BILLING.SUBSCRIPTION.UPDATED','BILLING.SUBSCRIPTION.CANCELLED',
 'BILLING.SUBSCRIPTION.SUSPENDED','BILLING.SUBSCRIPTION.EXPIRED','BILLING.SUBSCRIPTION.PAYMENT.FAILED'];
async function main(){
 if(env.PAYPAL_MODE!=='live'||!/^\S+$/.test(env.PAYPAL_WEBHOOK_ID||''))throw Error('Existing live merchant webhook required');
 const base='https://api-m.paypal.com';
 const tokenResponse=await fetch(base+'/v1/oauth2/token',{method:'POST',signal:AbortSignal.timeout(15000),
  headers:{Authorization:'Basic '+Buffer.from(env.PAYPAL_CLIENT_ID+':'+env.PAYPAL_CLIENT_SECRET).toString('base64'),
   'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
 if(!tokenResponse.ok)throw Error('Merchant authentication failed');
 const token=(await tokenResponse.json()).access_token;
 async function read(){const response=await fetch(base+'/v1/notifications/webhooks/'+env.PAYPAL_WEBHOOK_ID,
  {headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Merchant webhook read failed: '+response.status);return response.json();}
 let webhook=await read();
 const target=new URL(webhook.url);
 if(target.protocol!=='https:'||!['api.autopromote.org','autopromote.onrender.com'].includes(target.hostname))
  throw Error('Existing webhook destination requires review');
 const names=new Set((webhook.event_types||[]).map(e=>e.name));
 const missing=names.has('*')?[]:required.filter(name=>!names.has(name));
 let updated=false;
 if(missing.length&&process.argv.includes('--apply')){
  const values=[...names,...missing].map(name=>({name}));
  const response=await fetch(base+'/v1/notifications/webhooks/'+env.PAYPAL_WEBHOOK_ID,{method:'PATCH',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
   body:JSON.stringify([{op:'replace',path:'/event_types',value:values}])});
  if(!response.ok)throw Error('Merchant webhook configuration failed: '+response.status);
  webhook=await read();updated=true;
 }
 const current=new Set((webhook.event_types||[]).map(e=>e.name));
 const result={mode:'live',existingWebhookId:webhook.id,destination:webhook.url,updated,
  requiredEventsPresent:current.has('*')||required.every(name=>current.has(name)),
  missingEvents:current.has('*')?[]:required.filter(name=>!current.has(name)),
  legacyEventsPreserved:[...names].every(name=>current.has(name)),chargesCreated:0};
 fs.writeFileSync('reports/free-first-launch-20261127/paypal-webhook-qualified.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
