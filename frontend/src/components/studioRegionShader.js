import {selectiveMaskAt} from './studioSelectiveMask';

export function packRegionGeometry(mask,width,height,time=0) {
  const m=selectiveMaskAt(mask,time),unit=Math.min(width,height),cs=Math.cos(m.rotation*Math.PI/180),sn=Math.sin(m.rotation*Math.PI/180);
  const shapes=[m,...(m.subtract||[]).map(child=>{
    const x=(child.x-.5)*m.width*width,y=(child.y-.5)*m.height*height;
    return {...child,x:m.x+(x*cs-y*sn)/width,y:m.y+(x*sn+y*cs)/height,
      width:child.width*m.width,height:child.height*m.height,rotation:child.rotation+m.rotation,
      feather:child.feather*Math.min(m.width*width,m.height*height)/unit};
  })];
  const data=new Float32Array(66*9*4);
  shapes.forEach((shape,row)=>{
    const offset=row*66*4;
    data.set([shape.x,shape.y,shape.width,shape.height],offset);
    data.set([shape.rotation*Math.PI/180,shape.feather,shape.shape==='ellipse'?0:shape.shape==='rectangle'?1:2,shape.points?.length||0],offset+4);
    (shape.points||[]).forEach((p,i)=>data.set(p,offset+(i+2)*4));
  });
  return {data,count:shapes.length,inverted:!!m.inverted,opacity:m.opacity??1};
}

// Geometry lives in a tiny nearest-sampled float texture, avoiding a large
// per-fragment uniform array and a full CPU matte/readback on every video frame.
export const REGION_SHADER = `
uniform int u_regionEnabled;
uniform int u_regionCount;
uniform int u_regionInvert;
uniform float u_regionOpacity;
uniform sampler2D u_regionGeometry;
uniform sampler3D u_regionMaterial;
uniform sampler3D u_regionRecolor;
uniform int u_regionHasMaterial;
uniform int u_regionHasRecolor;

float regionShape(vec2 uv,int row) {
  vec4 pose=texelFetch(u_regionGeometry,ivec2(0,row),0);
  vec4 spec=texelFetch(u_regionGeometry,ivec2(1,row),0);
  float unit=min(u_resolution.x,u_resolution.y);
  vec2 radius=pose.zw*u_resolution/unit*.5;
  float c=cos(spec.x),s=sin(spec.x);
  vec2 delta=(uv-pose.xy)*u_resolution/unit;
  float padding=spec.y*(spec.z<.5?max(radius.x,radius.y)/min(radius.x,radius.y):1.0);
  if(abs(delta.x)>abs(radius.x*c)+abs(radius.y*s)+padding || abs(delta.y)>abs(radius.x*s)+abs(radius.y*c)+padding)return 0.0;
  vec2 point=vec2(delta.x*c+delta.y*s,-delta.x*s+delta.y*c);
  float distance;
  if(spec.z<.5)distance=(length(point/radius)-1.0)*min(radius.x,radius.y);
  else if(spec.z<1.5){vec2 q=abs(point)-radius;distance=length(max(q,0.0))+min(max(q.x,q.y),0.0);}
  else {
    bool inside=false;float nearest=1e6;int count=int(spec.w);
    vec2 a=(texelFetch(u_regionGeometry,ivec2(count+1,row),0).xy-.5)*radius*2.0;
    for(int i=0;i<64;i++){
      if(i>=count)break;
      vec2 b=(texelFetch(u_regionGeometry,ivec2(i+2,row),0).xy-.5)*radius*2.0;
      vec2 v=b-a;float t=clamp(dot(point-a,v)/max(1e-20,dot(v,v)),0.0,1.0);
      nearest=min(nearest,length(point-a-t*v));
      if((a.y>point.y)!=(b.y>point.y))if(point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
      a=b;
    }
    distance=nearest*(inside?-1.0:1.0);
  }
  float t=spec.y>0.0?clamp(.5-distance/spec.y,0.0,1.0):(distance<=0.0?1.0:0.0);
  return t*t*(3.0-2.0*t);
}
vec3 regionCube(sampler3D cube,vec3 rgb){
  vec3 size=vec3(textureSize(cube,0));return texture(cube,(clamp(rgb,0.0,1.0)*(size-1.0)+.5)/size).rgb;
}
float regionAlpha(vec2 uv,vec3 original){
  float coverage=regionShape(uv,0);
  if(coverage>0.0)for(int row=1;row<9;row++){if(row>=u_regionCount)break;coverage*=1.0-regionShape(uv,row);}
  if(u_regionInvert==1)coverage=1.0-coverage;
  if(coverage>0.0&&u_regionHasMaterial==1)coverage*=regionCube(u_regionMaterial,original).r;
  return coverage*u_regionOpacity;
}
`;
