import React,{useEffect,useRef,useState} from 'react';
import {API_BASE_URL} from '../config';
const api=path=>`${API_BASE_URL}/api/processing-topups${path}`;
export default function ProcessingTopups({user,onUpdated}){
 const [catalog,setCatalog]=useState({packs:[],available:false}),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef(null),updated=useRef(onUpdated);updated.current=onUpdated;
 useEffect(()=>{let live=true;fetch(api('/catalog')).then(r=>{if(!r.ok)throw Error('unavailable');return r.json();}).then(d=>{if(live)setCatalog(d);}).catch(()=>{});return()=>{live=false;};},[]);
 const approve=async pack=>{
  if(!user||busy||!catalog.available)return;setBusy(true);setNotice('');
  try{
   const response=await fetch(api('/create'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({packageId:pack.id})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Checkout unavailable');
   const url=new URL(data.approvalUrl);if(url.protocol!=='https:'||!['www.paypal.com','www.sandbox.paypal.com'].includes(url.hostname)||url.username||url.password||url.port)throw Error('Invalid payment destination');
   window.location.assign(url.href);
  }catch(error){setNotice(error.message);}finally{setBusy(false);}
 };
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  const root=new URL(window.location.href),hash=root.hash.indexOf('?'),params=new URLSearchParams(hash>=0?root.hash.slice(hash+1):root.search);
  if(!user||!params.has('processing_topup'))return undefined;
  if(params.get('processing_topup')==='cancel'){setNotice('Payment cancelled. No tokens were added.');return undefined;}
  const orderId=params.get('token');if(!/^[A-Z0-9]{8,40}$/.test(orderId||''))return undefined;
  let live=true;setBusy(true);
  const key=user.uid+':'+orderId+':'+revision;
  if(pending.current?.key!==key)pending.current={key,promise:(async()=>{
   const response=await fetch(api('/capture'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken()}`},body:JSON.stringify({orderId})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Payment needs verification');return result;
  })()};
  pending.current.promise.then(data=>{if(!live)return;setNotice(`Payment verified. ${data.tokensAdded?data.tokensAdded+' processing tokens added.':'This purchase is already in your balance.'}`);updated.current?.();
   const clean=new URL(window.location.href);const index=clean.hash.indexOf('?');
   if(index>=0){const q=new URLSearchParams(clean.hash.slice(index+1));for(const name of ['processing_topup','token','PayerID'])q.delete(name);clean.hash=clean.hash.slice(0,index)+(q.size?'?'+q.toString():'');}
   for(const name of ['processing_topup','token','PayerID'])clean.searchParams.delete(name);
   window.history.replaceState(window.history.state,'',clean.href);
  }).catch(error=>{if(live)setNotice(`Payment verification pending: ${error.message}. Do not pay again.`);}).finally(()=>{if(live)setBusy(false);});
  return()=>{live=false;};
 },[user,revision]);
 if(!catalog.packs.length)return null;
 return <section className="topup-section" aria-label="Extra processing tokens"><h3>Need extra processing? Top up.</h3>
  <p>One-time payment. Purchased tokens do not expire and are used after your renewable allowance. They stay separate from your Free/Plus reset and rolling allowance. All jobs remain subject to available processing capacity.</p>
  <div className="topup-grid">{catalog.packs.map(pack=><article className="topup-card" key={pack.id}><h4>{pack.tokens} processing tokens</h4><p>${Number(pack.price).toFixed(2)} USD · one-time</p>
   <button className="subscribe-btn secondary" disabled={!user||busy||!catalog.available} onClick={()=>approve(pack)}>Buy {pack.tokens} tokens</button></article>)}</div>
  {!user&&<p>Sign in to buy a top-up.</p>}{!catalog.available&&<p>Top-up checkout is paused until funded processing capacity is available.</p>}
  {notice&&<p role="status">{notice}</p>}{notice.startsWith('Payment verification pending:')&&<button disabled={busy} onClick={()=>setRevision(v=>v+1)}>Check top-up payment</button>}
 </section>;
}
