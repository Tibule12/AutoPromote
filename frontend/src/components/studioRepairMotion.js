// The source patch is attached to the selected material's local axes. It
// rotates/scales with the observed mask pose instead of sliding over skin.
export function validateRepairMotion(patch) {
  if(!patch?.follow)return;
  const p=patch.follow;
  for(const field of ['width','height'])if(typeof p[field]!=='number'||!Number.isFinite(p[field])||p[field]<.002||p[field]>3)throw Error('Invalid repair reference size.');
  if(typeof p.rotation!=='number'||!Number.isFinite(p.rotation)||Math.abs(p.rotation)>360)throw Error('Invalid repair reference rotation.');
}

export function repairOffsetAt(patch,pose,width,height) {
  validateRepairMotion(patch);
  if(!patch.follow)return {dx:patch.dx,dy:patch.dy};
  const ref=patch.follow,a=ref.rotation*Math.PI/180,angle=pose.rotation*Math.PI/180;
  const localX=(patch.dx*width*Math.cos(a)+patch.dy*height*Math.sin(a))/(ref.width*width);
  const localY=(-patch.dx*width*Math.sin(a)+patch.dy*height*Math.cos(a))/(ref.height*height);
  return {dx:localX*pose.width*Math.cos(angle)-localY*pose.height*height/width*Math.sin(angle),
    dy:localX*pose.width*width/height*Math.sin(angle)+localY*pose.height*Math.cos(angle)};
}
