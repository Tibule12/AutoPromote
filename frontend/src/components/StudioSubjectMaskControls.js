import { useEffect, useRef, useState } from "react";
import { createModelArtifactReference } from "./studioModelArtifactReference";
import { stable, validateSubjectVfxScene } from "./studioSubjectVfxContract";

// Capability requests contain source/selection contracts only. Model choice,
// checkpoint, device and worker routing belong to the server runtime.
export default function StudioSubjectMaskControls({ item, onChange, getDocument, getToken, apiBase, createId }) {
  const [box, setBox] = useState(() => item.maskJob ? JSON.parse(item.maskJob.selectionJson).box : [.05, .02, .75, .99]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [staleJob,setStaleJob]=useState(false);
  const [componentBox,setComponentBox]=useState([.45,.45,.85,.99]);
  const [componentPoints,setComponentPoints]=useState([]);
  const [point,setPoint]=useState([.5,.5]);
  const [keepPoint,setKeepPoint]=useState(true);
  const [fixedComponent,setFixedComponent]=useState(false);
  const [refinementRadius,setRefinementRadius]=useState(10);
  const savedSelection = item.maskJob ? JSON.parse(item.maskJob.selectionJson) : null;
  // Older saved documents omitted mode/finished. The dependency identity still
  // identifies an unfinished refinement without losing or replacing that job.
  const pendingRefinement = !!savedSelection?.refinement && !item.maskJob.finished &&
    item.modelArtifactRef?.artifactHash === savedSelection.refinement.maskArtifactHash;
  const componentSelection=value=>{
    const components=value.maskComponents || (value.maskJob ? JSON.parse(value.maskJob.selectionJson).components : null);
    return components?.length?{components}:{};
  };
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = useRef(item); current.current = item;
  const request = async (path, method = "GET", body) => {
    const token = await getToken();
    if (!token) throw new Error("Sign in before creating a subject mask.");
    const response = await fetch(`${apiBase}${path}`, { method, headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json",
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.code || data.error || data.message || "Subject selection is unavailable.");
    return data;
  };
  const mask = async (requestedRefinement) => {
    if (running.current) return;
    running.current = true; setBusy(true); setMessage("Saving the foreground selection…");
    try {
      const scene = validateSubjectVfxScene(item.scene), document = getDocument();
      const asset = document?.assets.find(asset => asset.sourceId === scene.sourceId);
      if (!asset?.contentHash || asset.storagePath !== scene.sourceStoragePath || !scene.sourceStoragePath.startsWith("studio/sources/"))
        throw new Error("Save this source with the Studio uploader before creating a mask.");
      if (box.some(value => !Number.isFinite(value) || value < 0 || value > 1) || box[0] >= box[2] || box[1] >= box[3])
        throw new Error("Choose a subject box inside the source frame.");
      let saved = requestedRefinement ? undefined : item.maskJob;
      const refinement=requestedRefinement || (saved ? JSON.parse(saved.selectionJson).refinement : undefined);
      const selection = { sourceId: scene.sourceId, sourceStoragePath: scene.sourceStoragePath,
        sourceRange: scene.sourceRange, prompt: scene.prompt, box, ...componentSelection(item),...(refinement?{refinement}:{}) };
      const selectionJson = stable(selection);
      if (saved && saved.selectionJson !== selectionJson)
        throw new Error("Check or cancel the saved mask request before changing its selection.");
      if (!saved) {
        const registration = await request("/api/studio/director/projects/revisions", "POST", { document });
        if (!mounted.current) return;
        if (registration.ok !== true || registration.projectId !== document.projectId || registration.revision !== document.revision)
          throw new Error("The saved project version does not match this edit.");
        saved = { requestId: createId("subject-mask"), selectionJson, projectRevision: document.revision, projectId: document.projectId,
          ...(refinement?{mode:'refinement'}:{}) };
        onChange({ ...current.current, maskJob: saved });
      }
      const input = { schemaVersion: 1, requestId: saved.requestId, projectId: saved.projectId, projectRevision: saved.projectRevision,
        sourceAssetId: scene.sourceId, sourceSha256: asset.contentHash, sourceStoragePath: asset.storagePath,
        sourceRange: { space: "source", startTick: Math.round(scene.sourceRange.start * 90000), endTick: Math.round(scene.sourceRange.end * 90000) },
        capability: "segment_subject", dependencyHashes: refinement?[refinement.maskArtifactHash]:[], parameters: {
          subjectId: scene.id, initialBox: box,
          points: scene.prompt.points.map((position, index) => ({ position, label: scene.prompt.labels[index] })),
          shotPrompts: scene.prompt.shotPrompts.map(shot => ({ frameIndex: Math.round(shot.time * 24), box,
            points: shot.points.map((position, index) => ({ position, label: shot.labels[index] })),
          })),
          ...componentSelection(item),
          ...(refinement?{refinement}:{}),
        } };
      const created = saved.jobId ? { jobId: saved.jobId } : await request("/api/media/studio-subject-masks/requests", "POST", input);
      if (!/^[a-f0-9]{64}$/.test(created.jobId || "")) throw new Error("The runtime did not confirm this mask request.");
      if (!mounted.current) return;
      saved = { ...saved, jobId: created.jobId };
      onChange({ ...current.current, maskJob: saved });
      setMessage("Creating the saved subject mask…");
      // Allow the bounded worker window plus artifact transfer/import. Ending
      // the browser's poll early leaves a successful long refinement detached.
      // The server remains authoritative for execution timeout and cancellation.
      const deadline = Date.now() + 45 * 60000;
      let status;
      do {
        if (!mounted.current) return;
        status = await request(`/api/media/studio-subject-masks/jobs/${saved.jobId}`);
        if (["completed", "stale", "failed", "cancelled"].includes(status.status)) break;
        if (Date.now() > deadline) throw new Error("Mask processing is still being checked. Resume this saved request; do not submit another.");
        await new Promise(resolve => setTimeout(resolve, 3000));
      } while (true);
      if (!mounted.current) return;
      if(status.status==='stale'){
        setStaleJob(true);setMessage('The saved mask is from an earlier edit. Use it for this edit only if its source and selection still match.');return;
      }
      if (status.status !== "completed") throw new Error(`Subject mask ${status.status}. Check the saved request.`);
      if (current.current.scene.id !== scene.id || stable({ sourceId: current.current.scene.sourceId,
        sourceStoragePath: current.current.scene.sourceStoragePath, sourceRange: current.current.scene.sourceRange,
        prompt: current.current.scene.prompt, box, ...componentSelection(current.current),...(refinement?{refinement}:{}) }) !== selectionJson)
        throw new Error("The source selection changed. The mask remains saved but has not been applied.");
      const result = await request(`/api/media/studio-subject-masks/jobs/${saved.jobId}/subject`, "POST", {
        id: scene.id, sourceStoragePath: scene.sourceStoragePath, effects: current.current.scene.effects,
      });
      if (!mounted.current) return;
      validateSubjectVfxScene(result.scene);
      createModelArtifactReference(result.modelArtifactRef);
      if (result.scene.id !== scene.id || result.scene.sourceId !== scene.sourceId ||
          result.modelArtifactRef.sourceContentHash !== asset.contentHash) throw new Error("The returned mask targets another source.");
      onChange({ ...result, maskJob: {...saved,finished:true}, ...(item.maskComponents?.length?{maskComponents:item.maskComponents}:{}) });
      setMessage("Subject mask saved. Adjust the background and render a preview; changing effects reuses this mask.");
    } catch (error) { if (mounted.current) setMessage(error.message); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  };
  const cancel = async () => {
    if (!item.maskJob?.jobId) return;
    try {
      let result = await request(`/api/media/studio-subject-masks/jobs/${item.maskJob.jobId}/cancel`, "POST", {});
      if(result.status==="cancelling") result=await request(`/api/media/studio-subject-masks/jobs/${item.maskJob.jobId}`);
      setMessage(`Mask request ${result.status}.`);
      if (["cancelled", "failed"].includes(result.status)) onChange({ ...current.current, maskJob: undefined });
    } catch (error) { setMessage(error.message); }
  };
  const reuse = async () => {
    if(running.current || !item.maskJob?.jobId)return;
    running.current=true;setBusy(true);setMessage('Checking the saved mask against this edit…');
    try{
      const document=getDocument(),saved=item.maskJob,scene=item.scene;
      const registration=await request('/api/studio/director/projects/revisions','POST',{document});
      if(registration.ok!==true||registration.projectId!==document.projectId||registration.revision!==document.revision)
        throw new Error('The saved project version does not match this edit.');
      const result=await request(`/api/media/studio-subject-masks/jobs/${saved.jobId}/subject/reuse`,'POST',
        {id:scene.id,projectRevision:document.revision});
      validateSubjectVfxScene(result.scene);createModelArtifactReference(result.modelArtifactRef);
      if(current.current.scene.id!==scene.id||stable(current.current.scene)!==stable(scene)||
        current.current.modelArtifactRef?.artifactHash!==item.modelArtifactRef?.artifactHash||
        result.scene.sourceId!==scene.sourceId||result.modelArtifactRef.sourceContentHash!==document.assets.find(asset=>asset.sourceId===scene.sourceId)?.contentHash)
        throw new Error('The source selection changed. The mask remains saved but has not been applied.');
      if(!mounted.current)return;
      onChange({...result,maskJob:{...saved,finished:true,reusedAtRevision:document.revision},
        ...(item.maskComponents?.length?{maskComponents:item.maskComponents}:{})});
      setStaleJob(false);setMessage('Subject mask saved. Adjust the background and render a preview; changing effects reuses this mask.');
    }catch(error){if(mounted.current)setMessage(error.message);}
    finally{running.current=false;if(mounted.current)setBusy(false);}
  };
  return <fieldset>
    <legend>Subject mask</legend>
    <p>Select the person to keep. Add furniture, microphones or other objects only when you want to keep them too. The box uses source-frame coordinates from 0 to 1.</p>
    {["Left", "Top", "Right", "Bottom"].map((label, index) => <label key={label}>Subject box {label.toLowerCase()}
      <input type="number" min="0" max="1" step=".01" value={box[index]} disabled={busy || !!item.maskJob}
        onChange={event => setBox(current => current.map((value, i) => i === index ? Number(event.target.value) : value))} />
    </label>)}
    {!item.modelArtifactRef && !item.maskJob && <details>
      <summary>Keep additional foreground objects</summary>
      <p>Select equipment, furniture or plants separately so the person selection does not cut them away.</p>
      {["left","top","right","bottom"].map((label,index)=><label key={label}>Component box {label}
        <input type="number" min="0" max="1" step=".001" value={componentBox[index]}
          onChange={event=>setComponentBox(values=>values.map((value,i)=>i===index?Number(event.target.value):value))}/>
      </label>)}
      {["X","Y"].map((label,index)=><label key={label}>Component point {label}
        <input type="number" min="0" max="1" step=".001" value={point[index]}
          onChange={event=>setPoint(values=>values.map((value,i)=>i===index?Number(event.target.value):value))}/>
      </label>)}
      <label><input type="checkbox" checked={keepPoint} onChange={event=>setKeepPoint(event.target.checked)}/>Keep component point</label>
      <label><input type="checkbox" checked={fixedComponent} onChange={event=>setFixedComponent(event.target.checked)}/>Object stays fixed in this shot</label>
      {fixedComponent && <p>The camera and object must stay still. This selection keeps its first-frame outline; check the complete moving result.</p>}
      <button type="button" disabled={componentPoints.length>=16} onClick={()=>setComponentPoints(points=>[...points,{position:[...point],label:keepPoint?1:0}])}>Add component point</button>
      <button type="button" onClick={()=>setComponentPoints([])}>Clear component points</button>
      <span>{componentPoints.length} component points</span>
      <button type="button" disabled={(item.maskComponents||[]).length>=7 || busy} onClick={()=>{
        if(componentBox.some(value=>!Number.isFinite(value)||value<0||value>1)||componentBox[0]>=componentBox[2]||componentBox[1]>=componentBox[3]){
          setMessage("Choose an ordered component box inside the picture.");return;
        }
        onChange({...current.current,maskComponents:[...(current.current.maskComponents||[]),
          {id:createId("component"),box:[...componentBox],points:componentPoints.map(point=>({...point,position:[...point.position]})),propagate:!fixedComponent}]});setComponentPoints([]);
      }}>Add foreground component</button>
      {(item.maskComponents||[]).map((component,index)=><p key={component.id}>Foreground component {index+1}
        <button type="button" onClick={()=>onChange({...current.current,maskComponents:current.current.maskComponents.filter(value=>value.id!==component.id)})}>Remove component {index+1}</button>
      </p>)}
    </details>}
    <p>Effect changes reuse the saved mask. Each camera shot needs its own source-bound selection.</p>
    <button type="button" disabled={busy || (!!item.modelArtifactRef && !pendingRefinement)}
      onClick={()=>mask()}>{item.modelArtifactRef&&!pendingRefinement ? "Subject mask attached" : item.maskJob ? "Resume subject mask" : "Create subject mask"}</button>
    {staleJob&&<button type="button" disabled={busy} onClick={reuse}>Use saved mask for this edit</button>}
    {item.modelArtifactRef && <>
      <label>Edge refinement radius<input type="number" min="2" max="24" step="1" disabled={busy}
        value={refinementRadius} onChange={event=>setRefinementRadius(Number(event.target.value))}/></label>
      <button type="button" disabled={busy||pendingRefinement} onClick={()=>{
        mask({maskArtifactHash:item.modelArtifactRef.artifactHash,radius:refinementRadius,
          holdouts:item.scene.effects.filter(effect=>effect.type==='foreground_holdout').map(effect=>effect.corners)});
      }}>Refine saved mask edges</button>
    </>}
    {item.modelArtifactRef && <button type="button" disabled={busy||pendingRefinement} onClick={()=>{
      onChange({...current.current,modelArtifactRef:undefined,maskJob:undefined,preview:undefined});
      setMessage("Choose a new foreground selection. The previous mask remains in saved project history.");
    }}>Refine foreground selection</button>}
    {item.maskJob?.jobId && <button type="button" onClick={cancel}>Cancel mask request</button>}
    {message && <p role="status">{message}</p>}
  </fieldset>;
}
