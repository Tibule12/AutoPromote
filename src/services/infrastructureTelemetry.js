// Opt-in, bounded in-memory attribution. No document payloads, filter values,
// customer IDs, access tokens, outbound telemetry or Firestore logging writes.
const {AsyncLocalStorage}=require('node:async_hooks');
const crypto=require('node:crypto');
const fs=require('node:fs');
const context=new AsyncLocalStorage();
const rows=new Map(),http=new Map();
const started=Date.now(),initialCpu=process.cpuUsage();
let current=0,peak=0;
const enabled=()=>process.env.COST_TELEMETRY_ENABLED==='true';
const normalized=p=>String(p||'').split('/').map((s,i)=>i%2?'*':s).join('/').slice(0,180);
function source(){return new Error().stack?.split('\n').find(s=>/(\/src\/|autopromote-functions\/index)/.test(s)&&!s.includes('infrastructureTelemetry')&&!s.includes('/node_modules/'))?.trim().replace(/^.*?(\/src\/|autopromote-functions\/index)/,'$1').slice(0,160)||'sdk/unattributed';}
function shape(request={}) {
 const q=request.structuredQuery||request.addTarget?.query?.structuredQuery;
 const fields=[];
 function visit(f){if(f?.fieldFilter)fields.push([f.fieldFilter.field?.fieldPath,f.fieldFilter.op]);for(const g of f?.compositeFilter?.filters||[])visit(g);}
 visit(q?.where);
 return {parent:normalized(String(request.parent||request.addTarget?.query?.parent||'').split('/documents/')[1]),
  collections:(q?.from||[]).map(c=>[c.collectionId,!!c.allDescendants]),filters:fields,
  order:(q?.orderBy||[]).map(o=>[o.field?.fieldPath,o.direction]),limit:q?.limit?.value??q?.limit??null};
}
function rowFor(db,method,request,callsite) {
 const c=context.getStore()||{};
 const route=c.route?.()||c.label||'background/unattributed';
 const query=shape(request);const key=JSON.stringify([db.projectId,process.env.K_SERVICE||process.env.RENDER_SERVICE_NAME||'autopromote-node',route,callsite,method,query]);
 const identity=crypto.createHash('sha256').update(key).digest('hex').slice(0,20);
 if(!rows.has(identity)){
  if(rows.size>=512)return rowForOverflow();
  rows.set(identity,{id:identity,application:process.env.K_SERVICE||process.env.RENDER_SERVICE_NAME||'autopromote-node',project:db.projectId,
   route,source:callsite,method,query,calls:0,errors:0,documentsReturned:0,minimumReadEstimate:0,writesCommitted:0,listenerChanges:0});
 }
 return rows.get(identity);
}
const overflow={id:'overflow',calls:0,errors:0,documentsReturned:0,minimumReadEstimate:0,writesCommitted:0,listenerChanges:0};
function rowForOverflow(){return overflow;}
function install(){
 if(!enabled())return false;
 const {Firestore}=require('firebase-admin/firestore');const p=Firestore.prototype;
 if(p[Symbol.for('autopromote.costTelemetry')])return true;
 if(typeof p.request!=='function'||typeof p.requestStream!=='function')return false;
 Object.defineProperty(p,Symbol.for('autopromote.costTelemetry'),{value:true});
 const unary=p.request,streaming=p.requestStream;
 p.request=function(method,request,...rest){
  if(!enabled())return unary.call(this,method,request,...rest);
  const r=rowFor(this,method,request,context.getStore()?.source||source());r.calls++;
  return Promise.resolve(unary.call(this,method,request,...rest)).then(result=>{
   if(method==='commit')r.writesCommitted+=(result.writeResults||[]).length;
   return result;
  },error=>{r.errors++;throw error;});
 };
 p.requestStream=function(method,bidirectional,request,...rest){
  if(!enabled())return streaming.call(this,method,bidirectional,request,...rest);
  const db=this,callsite=context.getStore()?.source||source();let r=rowFor(db,method,request,callsite);r.calls++;
  return Promise.resolve(streaming.call(this,method,bidirectional,request,...rest)).then(stream=>{
   const emit=stream.emit,write=stream.write;let documents=0;
   if(method==='listen')stream.write=function(body,...args){
    if(body?.addTarget){r=rowFor(db,method,body,callsite);r.calls++;}
    return write.call(this,body,...args);
   };
   // Observe emissions without adding a data listener or resuming paused SDK
   // streams. Preserve all SDK errors, return values and stream ordering.
   stream.emit=function(event,value,...args){
    if(event==='data'){
     if(value?.document||value?.found||value?.missing){documents++;r.documentsReturned++;}
     if(value?.documentChange||value?.documentDelete||value?.documentRemove)r.listenerChanges++;
    }
    if(event==='end'&&['runQuery','batchGetDocuments'].includes(method))r.minimumReadEstimate+=Math.max(1,documents);
    if(event==='error')r.errors++;
    return emit.call(this,event,value,...args);
   };
   return stream;
  },error=>{r.errors++;throw error;});
 };
 const sdk=require('firebase-admin/firestore');
 for(const [klass,methods] of [[sdk.Query,['get','onSnapshot']],[sdk.DocumentReference,['get','onSnapshot']],[sdk.Transaction,['get','getAll']],[sdk.WriteBatch,['commit']],[Firestore,['getAll']]]) {
  for(const name of methods)if(typeof klass?.prototype[name]==='function') {
   const original=klass.prototype[name];
   klass.prototype[name]=function(...args){
    if(!enabled())return original.apply(this,args);
    const current=context.getStore()||{};
    return context.run({...current,source:current.source||source()},()=>original.apply(this,args));
   };
  }
 }
 return true;
}
function middleware(req,res,next){
 if(!enabled())return next();
 const ref=new WeakRef(req);let finalRoute=null;
 const route=()=>finalRoute||((ref.deref()?.baseUrl||'')+(ref.deref()?.route?.path||'unmatched'));
 const begin=process.hrtime.bigint();current++;peak=Math.max(peak,current);
 let finished=false;
 const end=()=>{
  if(finished)return;finished=true;current--;
  finalRoute=(req.baseUrl||'')+(req.route?.path||'unmatched');
  const key=req.method+' '+finalRoute;
  if(!http.has(key)&&http.size>=128)return;
  const r=http.get(key)||{requests:0,errors:0,milliseconds:[],maxMilliseconds:0};
  const ms=Number(process.hrtime.bigint()-begin)/1e6;r.requests++;if(res.statusCode>=400)r.errors++;
  r.milliseconds.push(ms);if(r.milliseconds.length>512)r.milliseconds.shift();r.maxMilliseconds=Math.max(r.maxMilliseconds,ms);http.set(key,r);
 };
 res.once('finish',end);res.once('close',end);
 return context.run({route},next);
}
function snapshot(){
 const cpu=process.cpuUsage(initialCpu),resource=process.resourceUsage();
 const read=p=>{try{return fs.readFileSync(p,'utf8').trim();}catch{return null;}};
 return {enabled:enabled(),processId:process.pid,uptimeMs:Date.now()-started,activeRequests:current,peakConcurrentRequests:peak,
  rssBytes:process.memoryUsage().rss,heapUsedBytes:process.memoryUsage().heapUsed,peakProcessRssKiB:resource.maxRSS,cpuUserMicros:cpu.user,cpuSystemMicros:cpu.system,
  cgroup:{memoryMax:read('/sys/fs/cgroup/memory.max'),cpuMax:read('/sys/fs/cgroup/cpu.max')},
  firestore:[...rows.values(),...(overflow.calls?[overflow]:[])],
  endpoints:[...http].map(([route,r])=>{const v=[...r.milliseconds].sort((a,b)=>a-b);return {route,requests:r.requests,errors:r.errors,p50Ms:v[Math.floor(v.length*.5)],p95Ms:v[Math.min(v.length-1,Math.floor(v.length*.95))],maxMs:r.maxMilliseconds,sampleSize:v.length};}),
  limitations:['SDK response/read/write observations, not billing or index/rules/GAX-retry attribution.','Per-process bounded records; browser/Python/other applications require their own instrumentation.','Local process/cgroup data does not establish hosted Render plan capacity.']};
}
module.exports={install,middleware,snapshot,run:(label,fn)=>context.run({label},fn),shape};
