// Read only the owner's already accepted jobs with the existing real login.
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({headless:true,args:['--mute-audio',`--host-resolver-rules=MAP localhost ${process.env.STUDIO_QA_LOOPBACK||'127.0.0.37'}`,'--disk-cache-size=1048576']});
 try{for(const story of (process.argv[2]?[process.argv[2]]:['logo','transition'])){
  const f=path.join(__dirname,'proof',story,'visible-controls/tutorial',process.env.STUDIO_TUTORIAL_REVISION||''),accepted=JSON.parse(fs.readFileSync(path.join(f,'accepted.json')));
  const state=JSON.parse(fs.readFileSync(path.join(f,'accepted-session.private.json')));
  state.origins=state.origins.map(o=>({...o,indexedDB:(o.indexedDB||[]).filter(d=>d.name!=='autopromote-viral-studio')}));
  const c=await b.newContext({storageState:state}),p=await c.newPage();await p.goto('http://localhost:5000/');
  await p.getByRole('button',{name:'Viral Clip Studio',exact:true}).waitFor({timeout:90000});
  const result=await p.evaluate(async ({id,port})=>{
   const find=v=>{if(typeof v==='string'&&v.startsWith('{')){try{return find(JSON.parse(v))}catch{}}
    if(!v||typeof v!=='object')return null;if(v.stsTokenManager?.accessToken)return v.stsTokenManager.accessToken;
    for(const x of Object.values(v)){const t=find(x);if(t)return t}return null};
   let bearer=null;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('firebase:'))bearer||=find(localStorage.getItem(k));}
   for(const info of await indexedDB.databases())if(info.name?.startsWith('firebase')){
    const values=await new Promise((resolve,reject)=>{const r=indexedDB.open(info.name);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,all=[],stores=[...db.objectStoreNames];let remaining=stores.length;if(!remaining){db.close();resolve([]);return}for(const name of stores){const q=db.transaction(name,'readonly').objectStore(name).getAll();q.onsuccess=()=>{all.push(...q.result);if(!--remaining){db.close();resolve(all)}};q.onerror=()=>reject(q.error)}}});bearer||=find(values);
   }
   if(!bearer)throw Error('Existing real Auth token unavailable');
   const response=await fetch('http://127.0.0.1:'+port+'/api/media/status/'+id,{headers:{Authorization:'Bearer '+bearer}});
   return{http:response.status,data:await response.json()};
  },{id:accepted.jobId,port:process.env.STUDIO_QA_API_PORT||5129});
  fs.writeFileSync(path.join(f,'actual-accepted-status.private.json'),JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify({story,http:result.http,status:result.data.status,progress:result.data.progress,message:String(result.data.message||result.data.error||'').replace(/https?:\/\/\S+/g,'[URL]').slice(0,160)}));await c.close();
 }}finally{await b.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
