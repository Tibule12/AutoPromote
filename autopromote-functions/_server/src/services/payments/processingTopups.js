const crypto=require('node:crypto');
const {fail}=require('../unifiedCredits/policy');
const {PACKS}=require('./processingTopupCatalog');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function validateOrder(order,intent) {
  const pack=PACKS[intent.packageId],unit=order?.purchase_units?.[0];
  if(!pack||order.id!==intent.orderId||order.intent!=='CAPTURE'||order.purchase_units?.length!==1||
     unit.custom_id!==intent.userId||unit.reference_id!==pack.id||unit.invoice_id!==intent.invoiceId||
     unit.amount?.currency_code!=='USD'||Number(unit.amount.value)!==Number(pack.price))fail('TOPUP_ORDER_MISMATCH',409);
  return pack;
}
function verifiedCapture(order,intent) {
  const pack=validateOrder(order,intent),captures=order.purchase_units[0].payments?.captures||[];
  if(order.status!=='COMPLETED'||captures.length!==1)fail('TOPUP_PAYMENT_NOT_COMPLETED',409);
  const capture=captures[0];
  const partiallyRefunded=capture.status==='PARTIALLY_REFUNDED'&&Number.isSafeInteger(intent.revokedTokens)&&intent.revokedTokens>0&&intent.revokedTokens<pack.tokens;
  if((capture.status!=='COMPLETED'&&!partiallyRefunded)||capture.amount?.currency_code!=='USD'||Number(capture.amount.value)!==Number(pack.price)||
     !/^[A-Z0-9]{8,40}$/.test(capture.id||'')||capture.final_capture!==true)fail('TOPUP_PAYMENT_NOT_COMPLETED',409);
  return capture;
}
function createProcessingTopups({db,ledger,provider,origin,now=Date.now}) {
  const namespace=(ledger.jobCollectionName||'processing_jobs').replace(/_jobs$/,'');
  const orders=db.collection(namespace+'_topup_orders'),sessions=db.collection(namespace+'_topup_sessions');
  const checkoutUrl=kind=>new URL('/pricing?processing_topup='+kind,origin).href;
  return {
    async create(userId,packageId) {
      const pack=PACKS[packageId];if(!pack)fail('INVALID_TOPUP_PACKAGE',400);
      if(!(await ledger.purchaseCapacity(1100000)).available)fail('FUNDED_CAPACITY_UNAVAILABLE',503);
      const ref=sessions.doc(hash(userId));
      const session=await db.runTransaction(async tx=>{
        const old=(await tx.get(ref)).data();
        if(old&&old.state!=='closed'){
          if(old.packageId!==packageId)fail('TOPUP_CHECKOUT_ALREADY_PENDING',409);
          if(old.state!=='ready')fail('TOPUP_CHECKOUT_RECONCILIATION_REQUIRED',503);
          return{...old,duplicate:true};
        }
        const value={userId,packageId,state:'creating',requestId:crypto.randomUUID(),invoiceId:'topup-'+crypto.randomUUID(),createdAt:now()};
        tx.set(ref,value);return value;
      });
      if(session.duplicate){
        const remote=await provider('GET','/v2/checkout/orders/'+session.orderId);
        validateOrder(remote,{...session,orderId:session.orderId});
        if(['VOIDED','CANCELLED','EXPIRED'].includes(remote.status)){
          await ref.update({state:'closed'});fail('TOPUP_CHECKOUT_ENDED',409);
        }
        return{orderId:session.orderId,approvalUrl:session.approvalUrl,duplicate:true};
      }
      let remote;
      try{
        remote=await provider('POST','/v2/checkout/orders',{intent:'CAPTURE',purchase_units:[{
          reference_id:pack.id,invoice_id:session.invoiceId,custom_id:userId,
          description:`AutoPromote ${pack.tokens} extra processing tokens — one-time purchase`,
          amount:{currency_code:'USD',value:pack.price}}],application_context:{brand_name:'AutoPromote',
          shipping_preference:'NO_SHIPPING',user_action:'PAY_NOW',return_url:checkoutUrl('return'),cancel_url:checkoutUrl('cancel')}},session.requestId);
        if(!/^[A-Z0-9]{8,40}$/.test(remote?.id||''))fail('INVALID_TOPUP_ORDER',503);
        const approvalUrl=remote.links?.find(l=>l.rel==='approve'||l.rel==='payer-action')?.href;
        let url;try{url=new URL(approvalUrl);}catch{fail('INVALID_APPROVAL_URL',503);}
        if(url.protocol!=='https:'||!['www.paypal.com','www.sandbox.paypal.com'].includes(url.hostname)||url.username||url.password||url.port||url.hash)fail('INVALID_APPROVAL_URL',503);
        await db.runTransaction(async tx=>{
          const current=(await tx.get(ref)).data();
          if(current.requestId!==session.requestId||current.state!=='creating')fail('TOPUP_CHECKOUT_CONFLICT',409);
          tx.create(orders.doc(remote.id),{...session,orderId:remote.id,amount:pack.price,currency:'USD',state:'ready'});
          tx.update(ref,{state:'ready',orderId:remote.id,approvalUrl});
        });
        return{orderId:remote.id,approvalUrl,duplicate:false};
      }catch(error){await ref.set({state:'uncertain',...(remote?.id?{orderId:remote.id}:{})},{merge:true});throw error;}
    },
    async capture(userId,orderId) {
      if(!/^[A-Z0-9]{8,40}$/.test(orderId||''))fail('INVALID_TOPUP_ORDER',400);
      const ref=orders.doc(orderId),intent=(await ref.get()).data();
      if(!intent||intent.userId!==userId)fail('TOPUP_OWNER_MISMATCH',403);
      if(intent.revoked)fail('PAYMENT_REVOKED',409);
      let remote=await provider('GET','/v2/checkout/orders/'+orderId);validateOrder(remote,intent);
      if(remote.status==='APPROVED'){
        if(!(await ledger.purchaseCapacity(1100000)).available)fail('FUNDED_CAPACITY_UNAVAILABLE',503);
        const requestId=await db.runTransaction(async tx=>{
          const current=(await tx.get(ref)).data();
          if(current.userId!==userId||current.state!=='ready')fail('TOPUP_CAPTURE_RECONCILIATION_REQUIRED',503);
          const key=crypto.randomUUID();tx.update(ref,{state:'capturing',captureRequestId:key});return key;
        });
        try{await provider('POST','/v2/checkout/orders/'+orderId+'/capture',{},requestId);}
        catch(error){await ref.update({state:'uncertain'});throw error;}
        // Re-read authoritative status; the POST acknowledgement alone never grants tokens.
        remote=await provider('GET','/v2/checkout/orders/'+orderId);
      }
      const capture=verifiedCapture(remote,intent);
      await ref.set({paymentVerified:true,captureId:capture.id,verifiedAt:now()},{merge:true});
      const result=await ledger.applyTopup(userId,{orderId,captureId:capture.id});
      await db.runTransaction(async tx=>{const session=sessions.doc(hash(userId)),current=(await tx.get(session)).data();
        if(current?.orderId===orderId)tx.update(session,{state:'closed',closedAt:now()});});
      return{...result,processing:await ledger.status(userId)};
    },
  };
}
function paymentResourceUrl(base,path) {
  // Pick server-owned endpoint prefixes. Only a validated, encoded resource ID
  // can come from a checkout or webhook; input never supplies an origin/path.
  if(path==='/v2/checkout/orders')return base+'/v2/checkout/orders';
  if(typeof path!=='string')fail('INVALID_PAYMENT_RESOURCE',503);
  const order=/^\/v2\/checkout\/orders\/([A-Z0-9]{8,40})(\/capture)?$/.exec(path);
  if(order&&order[0]===path)return base+'/v2/checkout/orders/'+encodeURIComponent(order[1])+(order[2]?'/capture':'');
  const payment=/^\/v2\/payments\/(captures|refunds)\/([A-Z0-9]{8,40})$/.exec(path);
  if(payment&&payment[0]===path)return base+(payment[1]==='captures'?'/v2/payments/captures/':'/v2/payments/refunds/')+encodeURIComponent(payment[2]);
  fail('INVALID_PAYMENT_RESOURCE',503);
}
function liveProvider(env=process.env) {
  const base=env.PAYPAL_MODE==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
  let cached;
  return async(method,path,body,requestId)=>{
    const destination=paymentResourceUrl(base,path);
    if(!cached||cached.expires<Date.now()){
      const response=await fetch(base+'/v1/oauth2/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{
        Authorization:'Basic '+Buffer.from(env.PAYPAL_CLIENT_ID+':'+env.PAYPAL_CLIENT_SECRET).toString('base64'),
        'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
      if(!response.ok)fail('PAYPAL_UNAVAILABLE',503);
      const token=await response.json();cached={value:token.access_token,expires:Date.now()+Math.min(300,token.expires_in||300)*1000};
    }
    const response=await fetch(destination,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+cached.value,
      'Content-Type':'application/json',...(requestId?{'PayPal-Request-Id':requestId}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json().catch(()=>null);
    if(!response.ok)fail('PAYPAL_TOPUP_RECONCILIATION_REQUIRED',503);
    return result;
  };
}
let productionInstance;
function production(){return productionInstance||=createProcessingTopups({db:require('../../firebaseAdmin').db,
  ledger:require('../processingTokens/runtime').service(),provider:liveProvider(),
  origin:require('./checkoutPolicy').checkoutOrigins({},process.env).returnUrl});}
async function reconcileTopupRefund(event,{db,ledger,read=liveProvider()}={}){
  const resource=event.resource||{};
  let captureId=resource.supplementary_data?.related_ids?.capture_id;
  if(event.event_type==='PAYMENT.CAPTURE.REVERSED')captureId=resource.id;
  if(!captureId){for(const link of resource.links||[]){
    let url;try{url=new URL(link.href);}catch{continue;}
    if(['api.paypal.com','api-m.paypal.com','api.sandbox.paypal.com','api-m.sandbox.paypal.com'].includes(url.hostname)&&
       /^\/v2\/payments\/captures\/[A-Z0-9]{8,40}$/.test(url.pathname))captureId=url.pathname.split('/').pop();
  }}
  if(!/^[A-Z0-9]{8,40}$/.test(captureId||''))return{unrelated:true};
  const capture=await read('GET','/v2/payments/captures/'+captureId);
  if(capture.id!==captureId)fail('REFUND_CAPTURE_MISMATCH',409);
  const orderId=capture.supplementary_data?.related_ids?.order_id;
  if(!/^[A-Z0-9]{8,40}$/.test(orderId||''))return{unrelated:true};
  const intent=(await db.collection('processing_topup_orders').doc(orderId).get()).data();
  if(!intent)return{unrelated:true};
  const pack=PACKS[intent.packageId];if(!pack)fail('INVALID_TOPUP_PACKAGE',409);
  let tokens;
  if(event.event_type==='PAYMENT.CAPTURE.REFUNDED'){
    if(!/^[A-Z0-9]{8,40}$/.test(resource.id||''))fail('INVALID_REFUND',409);
    const refund=await read('GET','/v2/payments/refunds/'+resource.id);
    if(refund.id!==resource.id||refund.status!=='COMPLETED'||refund.amount?.currency_code!=='USD'||
       !(Number(refund.amount.value)>0)||Number(refund.amount.value)>Number(pack.price))fail('UNVERIFIED_REFUND',409);
    const parent=refund.links?.find(l=>l.rel==='up');
    if(!parent||new URL(parent.href).pathname!=='/v2/payments/captures/'+captureId)fail('REFUND_CAPTURE_MISMATCH',409);
    tokens=Math.ceil(pack.tokens*Number(refund.amount.value)/Number(pack.price));
  }else if(!['REFUNDED','REVERSED','DECLINED'].includes(capture.status))fail('UNVERIFIED_REVERSAL',409);
  // Different delivery events for the same provider refund must revoke once.
  const refundId=event.event_type==='PAYMENT.CAPTURE.REFUNDED'?resource.id:'reversal-'+captureId;
  return ledger.revokeTopup(captureId,{orderId,refundId,tokens});
}
module.exports={createProcessingTopups,liveProvider,validateOrder,verifiedCapture,production,reconcileTopupRefund};
