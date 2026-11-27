// Read-only admin diagnostics. Authorisation MUST run before this middleware.
// No balances, entitlements, publishing state or job admission are cached.
function createTelemetryReadCache({ttlMs=10000,maxEntries=64,now=Date.now}={}) {
 const entries=new Map();
 const middleware=(req,res,next)=>{
  const uid=req.user?.uid||req.userId;
  if(req.method!=='GET'||!uid)return next();
  const key=JSON.stringify([uid,req.path,req.query]);
  const cached=entries.get(key);
  if(cached&&(cached.pending||cached.until>now())){
   res.set('Cache-Control','private, no-store');
   return cached.promise.then(value=>value?res.status(value.status).json(value.body):res.status(503).json({success:false,error:'Telemetry refresh unavailable'}));
  }
  if(cached)entries.delete(key);
  for(const [k,v] of entries)if(!v.pending&&v.until<=now())entries.delete(k);
  if(entries.size>=maxEntries)return next();
  let resolve;const promise=new Promise(r=>{resolve=r;});
  const entry={promise,pending:true,until:0};entries.set(key,entry);
  const send=res.json.bind(res);let done=false;
  const finish=value=>{
   if(done)return;done=true;entry.pending=false;
   if(value?.status===200&&value.body?.success===true)entry.until=now()+ttlMs;
   else entries.delete(key);
   resolve(value);
  };
  res.json=body=>{const value={body,status:res.statusCode};finish(value);res.set('Cache-Control','private, no-store');return send(body);};
  res.once('close',()=>finish(null));
  return next();
 };
 return {middleware,clear:()=>entries.clear()};
}
module.exports={createTelemetryReadCache};
