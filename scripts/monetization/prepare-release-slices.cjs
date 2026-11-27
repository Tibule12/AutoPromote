// Prepare independent local Git review refs/patches. Never switches the active
// branch, touches its index, pushes, deploys, or changes a provider resource.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const parser=require('@babel/parser');
const git=(args,options={})=>execFileSync('git',args,{encoding:'utf8',...options});
const base=git(['rev-parse','HEAD']).trim();
const original=file=>git(['show',base+':'+file]);
const current=file=>fs.readFileSync(file,'utf8');
function parts(source){
 const result=new Map();for(const node of parser.parse(source,{sourceType:'unambiguous'}).program.body){
  if(node.type==='FunctionDeclaration')result.set('function:'+node.id.name,node);
  if(node.type==='VariableDeclaration')for(const d of node.declarations)if(['ArrowFunctionExpression','FunctionExpression'].includes(d.init?.type))result.set('function:'+d.id.name,d.init);
  if(node.type==='ExpressionStatement'&&node.expression.type==='CallExpression'){
   const call=node.expression;if(call.callee.type==='MemberExpression'&&call.callee.object.name==='router'&&call.arguments[0]?.type==='StringLiteral')result.set(call.callee.property.name+':'+call.arguments[0].value,node);
  }
 }return result;
}
function transplant(file,names){const before=original(file),after=current(file),old=parts(before),fresh=parts(after);const edits=names.map(name=>{
 if(!old.has(name)||!fresh.has(name))throw Error('Missing slice boundary '+file+' '+name);
 const a=old.get(name),b=fresh.get(name);return {start:a.start,end:a.end,text:after.slice(b.start,b.end)};
 });return edits.sort((a,b)=>b.start-a.start).reduce((s,e)=>s.slice(0,e.start)+e.text+s.slice(e.end),before);
}
const infrastructure={};
for(const file of ['src/firebaseAdmin.js','src/services/infrastructureTelemetry.js','src/middlewares/telemetryReadCache.js','src/routes/adminSystemRoutes.js','src/services/metricsRecorder.js','src/services/storageCleanupService.js','src/services/publishedVideoRetention.js','frontend/src/utils/visiblePoller.js','frontend/src/utils/visibleSubscription.js','frontend/src/components/LiveLogViewer.js','frontend/src/components/PlatformHealthPanel.js','frontend/src/components/SystemHealthPanel.js','frontend/src/components/UserLiveLogViewer.js','frontend/src/utils/visiblePoller.test.js','frontend/src/utils/visibleSubscription.test.js','frontend/src/components/__tests__/infrastructurePolling.test.js','test/free-first/release-infrastructure.test.cjs','scripts/test-free-first.cjs'])infrastructure[file]=current(file);
let server=original('src/server.js');const anchor='  const app = express();';if(server.split(anchor).length!==2)throw Error('Ambiguous server boundary');
infrastructure['src/server.js']=server.replace(anchor,anchor+'\n  app.use(require("./services/infrastructureTelemetry").middleware);');
const security={};
for(const file of ['src/services/payments/subscriptionVerification.js','src/routes/paypalWebhookRoutes.js','firestore.rules','config/security/firestore.owner-scoped.rules','test/free-first/release-payments.test.cjs','scripts/test-free-first.cjs'])security[file]=current(file);
security['src/routes/usageRoutes.js']=transplant('src/routes/usageRoutes.js',['post:/upgrade']);
security['src/routes/paypalSubscriptionRoutes.js']=transplant('src/routes/paypalSubscriptionRoutes.js',['function:refreshPersistedSubscriptionFromPayPal','function:validateConfiguredPayPalPlan','function:persistActivatedSubscription','function:reconcileMissedPayPalActivation','post:/activate','post:/cancel']);
security['src/services/billingService.js']=transplant('src/services/billingService.js',['function:resolveEffectiveTierId']);
const creditSource=original('src/creditSystem.js');const refundNode=parts(creditSource).get('function:refundCredits');
if(!refundNode)throw Error('Missing legacy refund boundary');
const refundStart=refundNode.body.start+1;
security['src/creditSystem.js']=creditSource.slice(0,refundStart)+'\n  if (refund?.processingTokens === true && refund?.deferredSettlement === true)\n    return { success:false, deferredSettlement:true, processingTokens:true, requestId:refund.requestId, message:"Awaiting a trusted terminal job outcome" };\n'+creditSource.slice(refundStart);
const root='reports/free-first-release-20261127';fs.mkdirSync(root,{recursive:true});
const priorFile=root+'/release-slices.json';const prior=fs.existsSync(priorFile)?JSON.parse(fs.readFileSync(priorFile)):null;
function prepare(name,files){
 // Only matching generated source mirrors belong in the independent package.
 for(const [file,source] of Object.entries({...files}))if(file.startsWith('src/'))files['autopromote-functions/_server/'+file]=source;
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'autopromote-release-index-'));
 const env={...process.env,GIT_INDEX_FILE:path.join(temporary,'index'),GIT_AUTHOR_NAME:'Codex',GIT_AUTHOR_EMAIL:'codex@local.invalid',GIT_COMMITTER_NAME:'Codex',GIT_COMMITTER_EMAIL:'codex@local.invalid'};
 try{
  git(['read-tree',base],{env});
  for(const [file,source] of Object.entries(files)){
   const hash=git(['hash-object','-w','--stdin'],{input:source}).trim();git(['update-index','--add','--cacheinfo','100644,'+hash+','+file],{env});
  }
  const tree=git(['write-tree'],{env}).trim();
  const ref='refs/heads/release/free-first-'+name+'-20261127';let previous=null;
  try{previous=git(['rev-parse','--verify',ref],{stdio:['ignore','pipe','ignore']}).trim();}catch{}
  if(previous&&git(['rev-parse',previous+'^{tree}']).trim()===tree)return prior.slices.find(s=>s.ref===ref);
  if(previous){
   let published=null;
   try{published=git(['rev-parse','--verify','refs/remotes/origin/'+ref.replace('refs/heads/','')],{stdio:['ignore','pipe','ignore']}).trim();}catch{}
   if(published)throw Error('Published review refs are immutable. Create a new release branch instead of rewriting '+ref);
  }
  if(previous&&prior?.slices.find(s=>s.ref===ref)?.commit!==previous)throw Error('Review ref was changed outside this preparation: '+ref);
  const commit=git(['commit-tree',tree,'-p',base],{env,input:'Separate '+name+' fixes from unfinished Free/Plus migration\n'}).trim();
  git(['update-ref',ref,commit,previous||'0'.repeat(40)]);
  const patch=git(['diff','--binary',base,commit]);const patchFile=root+'/'+name+'.patch';fs.writeFileSync(patchFile,patch);
  return {name,ref,commit,base,tree,patch:patchFile,patchSha256:crypto.createHash('sha256').update(patch).digest('hex'),files:Object.keys(files).sort(),priceOrAllowanceChange:false,publicCatalogChanged:false,deployed:false};
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
const slices=[prepare('infrastructure',infrastructure),prepare('payment-security',security)];
fs.writeFileSync(priorFile,JSON.stringify({sourceBranch:git(['branch','--show-current']).trim(),base,slices,excluded:['Free/Plus public catalog and UI','Renewable token enablement/production adapters','Content trigger consolidation','GCS rewrite requiring production IAM qualification','Artifact Registry deletions'],productionChanges:0},null,2)+'\n');
console.log(JSON.stringify(slices.map(s=>({ref:s.ref,commit:s.commit,files:s.files.length}))));
