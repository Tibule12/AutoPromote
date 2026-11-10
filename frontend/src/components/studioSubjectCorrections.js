// Selections stay in the ordinary saved subject item. Changing them detaches
// the old result; immutable artifacts remain available in project history.
export function savedSubjectBox(item) {
  let box = item.maskBox;
  if (!box && item.maskJob?.selectionJson) {
    try { box = JSON.parse(item.maskJob.selectionJson).box; } catch (_) { /* Invalid legacy request is not a selection. */ }
  }
  return Array.isArray(box) && box.length === 4 && box.every(v=>Number.isFinite(v)&&v>=0&&v<=1) &&
    box[0]<box[2] && box[1]<box[3] ? [...box] : undefined;
}

export function savedSubjectRefinement(item) {
  let selection;
  try { selection = JSON.parse(item.maskJob?.selectionJson || 'null'); } catch (_) { /* No valid legacy preferences. */ }
  const result = {};
  const radius = item.maskRefinementRadius ?? selection?.refinement?.radius;
  if (Number.isInteger(radius) && radius >= 2 && radius <= 24) result.maskRefinementRadius = radius;
  const ids = item.maskColourComponentIds ?? selection?.refinement?.colourComponentIds;
  if (Array.isArray(ids)) {
    const components = item.maskComponents ?? selection?.components ?? [];
    const fixed = new Set((Array.isArray(components) ? components : [])
      .filter(component => component?.propagate === false).map(component => component.id));
    result.maskColourComponentIds = [...new Set(ids.filter(id => typeof id === 'string' && fixed.has(id)))];
  }
  return result;
}

export function correctSubjectItem(item, targetId, frameIndex, point, label, clear = false) {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= Math.round((item.scene.sourceRange.end-item.scene.sourceRange.start)*24))
    throw new Error('Choose a frame inside this clip.');
  const next = JSON.parse(JSON.stringify(item));
  if (next.maskJob && !next.maskJob.finished) throw new Error('Finish or cancel the pending mask request before correcting it.');
  // Detaching a completed request must not discard its authored person box.
  // A cold reopen previously fell back to a smaller box and lost clothing.
  const box=savedSubjectBox(next);
  if(box)next.maskBox=box;
  if (targetId === 'person') {
    const prompt = next.scene.prompt;
    let target = prompt;
    if (frameIndex) {
      target = prompt.shotPrompts.find(p=>Math.round(p.time*24)===frameIndex);
      if (!target) { target={time:frameIndex/24,points:[],labels:[]};prompt.shotPrompts.push(target);prompt.shotPrompts.sort((a,b)=>a.time-b.time); }
    }
    if (clear) { target.points=[];target.labels=[];if(frameIndex)prompt.shotPrompts=prompt.shotPrompts.filter(p=>p!==target); }
    else { if(target.points.length>=16)throw new Error('This frame already has sixteen points.');target.points.push(point);target.labels.push(label); }
  } else {
    const component = next.maskComponents?.find(c=>c.id===targetId);
    if (!component) throw new Error('Choose an existing foreground object.');
    let target=component;
    if (frameIndex) {
      component.propagate=true;component.shotPrompts ||= [];
      target=component.shotPrompts.find(p=>p.frameIndex===frameIndex);
      if(!target){target={frameIndex,points:[]};component.shotPrompts.push(target);component.shotPrompts.sort((a,b)=>a.frameIndex-b.frameIndex);}
    }
    if(clear){target.points=[];if(frameIndex)component.shotPrompts=component.shotPrompts.filter(p=>p!==target);}
    else {if(target.points.length>=16)throw new Error('This frame already has sixteen points.');target.points.push({position:point,label});}
  }
  // Completed job metadata was the only copy of preferences in older projects.
  // Retain authoring choices before detaching that immutable result/request.
  Object.assign(next, savedSubjectRefinement(next));
  delete next.preview;delete next.modelArtifactRef;delete next.trackingArtifactRef;delete next.maskJob;delete next.pending;
  return next;
}
