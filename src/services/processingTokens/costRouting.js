// Opt-in operational routing, shared by every plan. No output settings change.
// Evidence: reports/free-first-optimization-20261126. Large/unknown workloads
// retain their existing renderer; this does not authorize an unpriced adapter.
function costRoutingEnabled(env) {
  return env.MEDIA_WORKER_ROUTING_POLICY === "cost-aware-v1";
}
function neutralFinish(plan) {
  if(!plan||plan.enabled===false)return true;
  if(plan.face_restoration||plan.color_cube||plan.power_window||plan.hsl_qualifier||plan.node_mask||
    plan.adjustment_layers?.length||plan.keyframes?.length||plan.main_frame?.enabled||plan.visualizer?.enabled)return false;
  const colorDefaults={exposureStops:0,lift:0,gamma:1,gain:1,tint:0,brightness:1,contrast:1,saturation:1,temperature:0,sharpness:0,vignette:0,precisionGrade:false,preset:null};
  if(Object.entries(plan.color||{}).some(([key,value])=>value!==(colorDefaults[key]??null)))return false;
  if(Object.entries(plan.texture||{}).some(([key,value])=>key!=='pixel_version'&&value!==0))return false;
  const motion=plan.motion||{};
  if(motion.keyframes?.length||motion.scale_keyframes?.length||Number(motion.zoom??1)!==1||Number(motion.base_scale??1)!==1)return false;
  const transform={x:50,y:50,scale:1,rotation:0,opacity:1,crop_x:0,crop_y:0};
  return !Object.entries(motion.base_transform||{}).some(([key,value])=>value!==transform[key]);
}
function boundedBasicRender(endpoint, payload = {}, seconds) {
  if (!["/render-viral-clip", "/render-clip"].includes(endpoint) || !(seconds > 0 && seconds <= 60)) return false;
  const settings = payload.output_settings || payload.outputSettings || payload.export_settings || payload.exportSettings || {};
  if (String(settings.resolution || "1080p") !== "1080p" || Number(settings.fps || 30) !== 30) return false;
  // Qualification expands with measured profiles. Unsupported combinations
  // keep the same GPU/CPU runtime and creative access they already had.
  const overlays=payload.overlays||[],composition=payload.composition_plan||payload.compositionPlan;
  if(overlays.length>2||overlays.some(layer=>layer.type!=='text'||layer.motion_keyframes?.length||
    (layer.animation&&(!['none','fade'].includes(layer.animation.enter)||!['none','fade'].includes(layer.animation.exit)||
      Number(layer.animation.enterDuration)>1||Number(layer.animation.exitDuration)>1))))return false;
  if(composition){const layers=composition.layers;
    if(!Array.isArray(layers)||layers.length>3||layers.filter(l=>l.type==='video').length!==1||
      layers.some(l=>!['video','text'].includes(l.type)||l.motion_keyframes?.length))return false;}
  const activeGraphics=graphics=>graphics&&Object.entries(graphics).some(([key,value])=>
    key!=='version'&&(Array.isArray(value)?value.length:value));
  return !(activeGraphics(payload.motion_graphics) || activeGraphics(payload.motionGraphics) || payload.threeDGraphics?.length ||
    payload.subjectVfx?.length || payload.creative_plan?.enabled || payload.creative_effects?.length ||
    payload.auto_captions || (payload.smart_crop&&!composition) || payload.professional_cleanup ||
    payload.visual_enhance || payload.remove_watermark || !neutralFinish(payload.finish_plan) || payload.add_music);
}
function boundedManualMulticam(request) {
  if (!request || !Array.isArray(request.sources) || request.sources.length !== 2) return false;
  const duration = Number(request.overlapDuration || request.overlap_duration || 0);
  return duration > 0 && duration <= 60 &&
    !(request.autoSwitch || request.auto_switch || request.burnCaptions || request.burn_captions) &&
    Array.isArray(request.segments) && request.segments.length > 0;
}
module.exports = { costRoutingEnabled, boundedBasicRender, boundedManualMulticam };
