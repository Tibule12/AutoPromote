import {compileStudioNodeEffects} from './studioNodeEffects';
import {compileStudioNodeMask} from './studioNodeMask';
import { validateStudioParentGraph, validateStudioTrackMattes, validateStudioParameterLinks } from './studioCompRigging';
import { validateStudioPerspectiveLayer } from './studioPerspective';
import { validateStudioMaskAnimation } from './studioMaskGeometry';

const equal = (a,b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const layerTrack = layer => layer?.bRollMode || ['image','video'].includes(layer?.type) ? 'broll' : 'graphics';

// Check the complete graph transaction before any React setter runs. Removing
// a locked layer matters just as much as updating or adding one.
export function validateStudioNodeFlowEdit(state, patch, tracks = {}) {
  const next={...state,...patch};
  const requireUnlocked=track=>{if(tracks[track]?.locked)throw Error(`Unlock the ${track} track before changing its nodes.`)};
  if(patch.overlays&&!equal(state.overlays,patch.overlays)) {
    const before=new Map((state.overlays||[]).map(l=>[String(l.id),l]));
    const after=new Map(patch.overlays.map(l=>[String(l.id),l]));
    for(const id of new Set([...before.keys(),...after.keys()]))
      if(!equal(before.get(id),after.get(id))) {
        if(before.get(id)?.locked)throw Error('Unlock this layer before changing its nodes.');
        requireUnlocked(layerTrack(after.get(id)||before.get(id)));
      }
  }
  for(const [field,track]of [['mainTransform','video'],['finishFx','video'],['advancedColor','video'],
    ['finishKeyframes','video'],['adjustmentLayers','adjustment']])
    if(field in patch&&!equal(state[field],patch[field]))requireUnlocked(track);
  if('compositionOrder'in patch&&!equal(state.compositionOrder,patch.compositionOrder)) {
    for(const id of new Set([...(state.compositionOrder||[]),...(patch.compositionOrder||[])])) {
      const old=(state.compositionOrder||[]).indexOf(id),now=(patch.compositionOrder||[]).indexOf(id);
      if(old!==now)requireUnlocked(layerTrack((next.overlays||[]).find(l=>String(l.id)===String(id))));
    }
  }
  if(patch.motionKeyframes&&!equal(state.motionKeyframes,patch.motionKeyframes)) {
    const before=new Map((state.motionKeyframes||[]).map(k=>[k.id,k]));
    const after=new Map(patch.motionKeyframes.map(k=>[k.id,k]));
    for(const id of new Set([...before.keys(),...after.keys()]))if(!equal(before.get(id),after.get(id))) {
      const key=after.get(id)||before.get(id);
      if((next.overlays||[]).find(l=>String(l.id)===String(key.targetId))?.locked)
        throw Error('Unlock this layer before changing its animation.');
      requireUnlocked(key.targetId==='main-video'?'video':layerTrack((next.overlays||[]).find(l=>String(l.id)===String(key.targetId))));
    }
  }
  validateStudioParentGraph(next.overlays||[],next.mainTransform);
  validateStudioParameterLinks(next.overlays||[],next.mainTransform);
  validateStudioTrackMattes(next.overlays||[]);
  compileStudioNodeMask(next.advancedColor?.maskSourceNodeId||next.finishFx?.advancedColor?.maskSourceNodeId||next.finishFx?.maskSourceNodeId,next.overlays);
  for(const adjustment of next.adjustmentLayers||[])compileStudioNodeMask(adjustment.maskSourceNodeId,next.overlays);
  for(const layer of next.overlays||[]) {
    compileStudioNodeEffects(layer);
    const keys=(next.motionKeyframes||[]).filter(k=>String(k.targetId)===String(layer.id));
    validateStudioPerspectiveLayer(layer,keys);
    validateStudioMaskAnimation(layer,keys);
  }
  return next;
}
