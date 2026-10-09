import React, {useEffect,useRef,useState} from 'react';
import {createSecureId} from '../utils/security';

const active = job => ['queued','planning','generating','waiting_for_gpu','reviewing'].includes(job?.status);
const messages = {
  BROLL_GENERATOR_UNAVAILABLE:'B-roll generation is offline. Your edit stays saved; try again when the generator is available.',
  BROLL_GPU_BUSY:'The generator is busy. No new generation was started. Retry when the current job finishes.',
  BROLL_DAILY_LIMIT:'The daily generation allowance is used. Existing generated shots remain editable.',
  BROLL_TRANSCRIPT_REVIEW_REQUIRED:'Review the marked transcript lines before generating cutaways.',
  BROLL_PLAN_NOT_GROUNDED:'The generation plan failed its transcript checks. No invented plan was accepted.',
  BROLL_RECHECK_NOT_READY:'Finish the current job before rechecking this shot.',
};

export default function StudioGeneratedBRollPanel({projectId,apiBase,getToken,getRequest,onAccept,onReject,onRemember,jobId,autoRequest}) {
  const [job,setJob]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [maxShots,setMaxShots]=useState(2);
  const [autoPlace,setAutoPlace]=useState(false);
  const triggered=useRef(null),placing=useRef(new Set());
  const identity=useRef(projectId);identity.current=projectId;
  const pendingRequest=useRef(null);
  const request=async(url,body)=>{
    let token=await getToken();if(!token)throw new Error('Sign in before generating B-roll.');
    const send=()=>fetch(`${apiBase}/api/media/studio-broll/jobs${url}`,{
      method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    let response=await send();if(response.status===401){token=await getToken(true);response=await send();}
    const data=await response.json();if(!response.ok){
      const failure=new Error(messages[data.code] || data.message || 'B-roll request failed.');
      failure.responseStatus=response.status;throw failure;
    }
    return data.job || data.jobs;
  };
  useEffect(()=>{let cancelled=false;setJob(null);setError('');pendingRequest.current=null;
    if(jobId)request(`/${jobId}`).then(j=>{if(!cancelled)setJob(j);}).catch(e=>{if(!cancelled)setError(e.message);});
    else request(`?projectId=${encodeURIComponent(projectId)}`).then(jobs=>{
      if(!cancelled && jobs[0]){setJob(jobs[0]);onRemember(jobs[0].id);}
    }).catch(e=>{if(!cancelled)setError(e.message);});
    return()=>{cancelled=true;};
    // Owner/project identity and the stored job reference govern recovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[projectId,jobId]);
  useEffect(()=>{
    if(!active(job))return undefined;
    let cancelled=false,inFlight=false;
    const timer=setInterval(()=>{
      if(inFlight)return;
      inFlight=true;
      request(`/${job.id}`).then(j=>{
      if(!cancelled){setJob(j);setError('');}
      }).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{inFlight=false;});
    },5000);
    return()=>{cancelled=true;clearInterval(timer);};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[job]);
  const generate=async()=>{
    const current=projectId;setBusy(true);setError('');
    try {
      if(!pendingRequest.current){const input=await getRequest();pendingRequest.current={...input,maxShots,
        requestId:createSecureId('broll')};}
      const result=await request('',pendingRequest.current);
      if(identity.current===current){pendingRequest.current=null;setJob(result);onRemember(result.id);}
    }catch(e){
      // A definitive validation rejection created no job. Retry with the
      // corrected edit; retain identity only for uncertain/network outcomes.
      if(e.responseStatus>=400 && e.responseStatus<500)pendingRequest.current=null;
      if(identity.current===current)setError(e.message);
    }
    finally{if(identity.current===current)setBusy(false);}
  };
  const review=async(shot,decision)=>{
    const current=projectId;setBusy(true);setError('');
    try {
      if(decision==='accept'){
        const currentInput=await getRequest();
        for(const key of ['projectId','sourceStoragePath','captions','duration'])
          if(JSON.stringify(currentInput[key])!==JSON.stringify(job.inputState[key]))
            throw new Error('The transcript or timeline changed. Generate a new plan before placing this shot.');
      }
      const result=await request(`/${job.id}/review`,{shotId:shot.id,decision,contentHash:shot.asset.contentHash});
      if(identity.current!==current)return;
      setJob(result);
      if(decision==='accept')await onAccept(result.shots.find(s=>s.id===shot.id),result);
      if(decision==='reject')await onReject?.(result.shots.find(s=>s.id===shot.id),result);
    }catch(e){if(identity.current===current)setError(e.message);}
    finally{if(identity.current===current)setBusy(false);}
  };
  const recheck=async shot=>{
    const current=projectId;setBusy(true);setError('');
    try {
      const result=await request(`/${job.id}/recheck`,{shotId:shot.id,contentHash:shot.review.artifactSha256});
      if(identity.current===current)setJob(result);
    }catch(e){if(identity.current===current)setError(e.message);}
    finally{if(identity.current===current)setBusy(false);}
  };
  useEffect(()=>{
    if(autoRequest?.projectId!==projectId || !autoRequest?.nonce || triggered.current===autoRequest.nonce)return;
    triggered.current=autoRequest.nonce;setAutoPlace(true);generate();
    // A user-invoked automatic edit starts one job; rerenders do not resubmit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[autoRequest,projectId]);
  useEffect(()=>{
    if(!autoPlace || busy || !['ready_for_review','partial'].includes(job?.status))return;
    const shot=job.shots.find(s=>s.status==='ready_for_review' && !placing.current.has(`${job.id}:${s.id}`));
    if(!shot)return;
    placing.current.add(`${job.id}:${shot.id}`);review(shot,'accept');
    // Only reviewed artifacts are placed, once, through the ordinary layer path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[job,autoPlace,busy]);
  return <section className="inspector-field generated-broll-panel" aria-label="Generated B-roll" data-testid="studio-generated-broll">
    <strong>Generate relevant B-roll</strong>
    <small>The system chooses concrete beats from the reviewed transcript. Generated illustrations become ordinary editable clips; your original speech continues.</small>
    <label>Maximum cutaways <select aria-label="Maximum generated cutaways" value={maxShots} disabled={busy || active(job)} onChange={e=>setMaxShots(Number(e.target.value))}>
      {[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}
    </select></label>
    <label><input type="checkbox" aria-label="Automatically place reviewed generated B-roll" checked={autoPlace}
      onChange={e=>setAutoPlace(e.target.checked)}/> Automatically place shots that pass visual checks</label>
    <button type="button" className="inspector-primary-action" disabled={busy || active(job)} onClick={generate}>
      {active(job)?'Generating B-roll…':job?'Generate new alternatives':'Generate B-roll for this edit'}
    </button>
    {error?<p role="alert">{error}</p>:null}
    {job?<p role="status">{job.status.replaceAll('_',' ')}{job.plan?.reason?` · ${job.plan.reason}`:''}</p>:null}
    {job?.error?<p role="alert">{messages[job.error] || job.error}</p>:null}
    {(job?.shots || []).map(shot=><article key={shot.id} aria-label={`Generated shot ${shot.id}`}>
      <strong>{shot.title}</strong><p>{shot.start.toFixed(2)}s · {shot.duration.toFixed(2)}s · “{shot.evidenceQuote}”</p>
      {shot.asset?<video src={shot.asset.url} controls muted playsInline preload="metadata" style={{width:'100%',maxHeight:180}} aria-label={`Preview generated ${shot.title}`}/>:null}
      <small>{shot.status.replaceAll('_',' ')}{shot.remainingIssue?` · ${shot.remainingIssue}`:''}</small>
      {shot.status==='rejected' && shot.review?.artifactSha256?<div>
        <button type="button" disabled={busy || active(job)} onClick={()=>recheck(shot)}>Recheck visual review</button>
        <small>Repeat the visual checks on this same take, retaining its earlier review. This does not generate a new take.</small>
      </div>:null}
      {shot.asset && ['ready_for_review','accepted','rejected_by_owner'].includes(shot.status)?<div className="inspector-inline-actions">
        <button type="button" disabled={busy || active(job) || shot.status==='accepted'} onClick={()=>review(shot,'accept')}>Use this generated shot</button>
        <button type="button" disabled={busy || active(job) || shot.status==='rejected_by_owner'} onClick={()=>review(shot,'reject')}>Reject shot</button>
      </div>:null}
      {shot.asset?<small>Generated illustration · {shot.asset.generationProvenance.model} · seed {shot.seed}</small>:null}
    </article>)}
    {job?.status==='no_cutaways_needed'?<small>This content benefits from keeping its original picture. No unnecessary footage was generated.</small>:null}
  </section>;
}
