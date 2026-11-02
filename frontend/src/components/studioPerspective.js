// Ordinary media rectangle -> convex quad, before the existing layer transform.
export const PERSPECTIVE_IDENTITY = [[0, 0], [100, 0], [100, 100], [0, 100]];
export const PERSPECTIVE_LEFT = [[0, 12], [88, 0], [88, 100], [0, 88]];
export const PERSPECTIVE_RIGHT = [[12, 0], [100, 12], [100, 88], [12, 100]];

export function encodeStudioPerspective(value) {
  validateStudioPerspective(value);
  // Firestore workflow records cannot represent directly nested arrays.
  return { version: 1, corners: value.corners.flat(), ...(value.sourceRect ? {sourceRect: [...value.sourceRect]} : {}) };
}

export function validateStudioPerspective(value) {
  if (!value || value.version !== 1 || Object.keys(value).some(k => !['version', 'corners', 'sourceRect'].includes(k)) ||
      !Array.isArray(value.corners) || value.corners.length !== 4)
    throw Error('Perspective needs four ordered corners: top left, top right, bottom right, bottom left.');
  const p = value.corners;
  if (value.sourceRect) {
    const r=value.sourceRect;
    if (!Array.isArray(r)||r.length!==4||r.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>100)||
        r[2]-r[0]<1||r[3]-r[1]<1) throw Error('Source region needs left/top/right/bottom percentages with at least 1% width and height.');
  }
  if (p.some(row => !Array.isArray(row) || row.length !== 2 || row.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100)))
    throw Error('Perspective corners must be finite percentages between 0 and 100.');
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    if ((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]) < (value.sourceRect?25:500)||
        (value.sourceRect&&Math.hypot(b[0]-a[0],b[1]-a[1])<2))
      throw Error('Perspective corners must form a clockwise convex plane with room between its edges.');
  }
  return value;
}

export function validateStudioPerspectiveLayer(layer, keys = [], grouped = false) {
  if (!layer?.perspective) {
    if (keys.some(k => k.property === 'perspectiveProgress'||/^planeCorner/.test(k.property))) throw Error('Perspective keys need a media plane.');
    return;
  }
  validateStudioPerspective(layer.perspective);
  if (!['image', 'video'].includes(layer.type) || layer.id === 'main-video' || layer.vectorShape || grouped ||
      layer.bRollMode === 'fullscreen' || layer.mask?.enabled || layer.cropX || layer.cropY || layer.motionBlur?.enabled ||
      keys.some(k => ['cropX','cropY'].includes(k.property) && k.value !== 0))
    throw Error('Perspective supports ungrouped ordinary image/video planes without masks, crop or motion blur.');
  const values = [layer.perspectiveProgress ?? 100, ...keys.filter(k => k.property === 'perspectiveProgress').map(k => k.value)];
  if (values.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100))
    throw Error('Perspective progress must be between 0 and 100.');
  validateStudioCornerKeys(layer.perspective,keys,layer.perspectiveProgress ?? 100);
}

export const PLANE_CORNER_CHANNELS = ['Top left','Top right','Bottom right','Bottom left'].flatMap((label,i)=>
  ['X','Y'].map(axis=>({id:`planeCorner${i}${axis}`,label:`Plane ${label.toLowerCase()} ${axis}`,min:0,max:100,step:.1,planeCorner:true})));

// Coordinate keys deliberately use linear/hold segments. For every shared key
// interval, the signed corner cross product is quadratic: check its endpoints
// and exact interior minimum, rather than sampling a few arbitrary frames.
export function validateStudioCornerKeys(value,keys=[],baseProgress=100) {
  const rows=keys.filter(k=>/^planeCorner/.test(k.property));
  if(!rows.length)return;
  // Independently changing the target quad and its identity-blend progress
  // creates a higher-order path which this linear geometry proof does not
  // qualify. Keep that combination gated instead of risking a preview crash.
  if(baseProgress!==100||keys.some(k=>k.property==='perspectiveProgress'&&k.value!==100))
    throw Error('Keep Perspective progress at 100 when animating plane corners.');
  if(rows.some(k=>!/^planeCorner[0-3][XY]$/.test(k.property)||!Number.isFinite(k.time)||
    !Number.isFinite(k.value)||k.value<0||k.value>100||!['linear','hold'].includes(k.easing)))
    throw Error('Plane corner keys need finite 0–100 coordinates and Linear or Hold interpolation.');
  // One validation owns this index. Do not filter and sort all eight channels
  // again for every sampled corner/interval, or cache across authored edits.
  const channels=new Map();
  for(const key of rows){
    if(!channels.has(key.property))channels.set(key.property,[]);
    channels.get(key.property).push(key);
  }
  for(const channel of channels.values())channel.sort((a,b)=>a.time-b.time);
  const read=(property,t,fallback)=>{
    const ch=channels.get(property);
    if(!ch?.length)return fallback;
    if(t<=ch[0].time)return ch[0].value;
    // Lower bound preserves the first exact duplicate's existing semantics.
    let low=0,high=ch.length;
    while(low<high){const mid=(low+high)>>>1;if(ch[mid].time<t)low=mid+1;else high=mid;}
    const b=ch[low];if(!b)return ch.at(-1).value;
    if(t===b.time)return b.value;
    const a=ch[low-1];return b.easing==='hold'?a.value:a.value+(b.value-a.value)*(t-a.time)/(b.time-a.time);
  };
  const times=[...new Set(rows.map(k=>k.time))].sort((a,b)=>a-b);
  const at=t=>value.corners.map((p,i)=>p.map((v,j)=>read(`planeCorner${i}${j?'Y':'X'}`,t,v)));
  const poses=times.map(at);
  poses.forEach(corners=>validateStudioPerspective({...value,corners}));
  for(let n=1;n<times.length;n++) {
    const a=poses[n-1],b=at(times[n]-Math.min(1e-8,(times[n]-times[n-1])/1e6));
    for(let i=0;i<4;i++) {
      const cross=u=>{const p=a.map((r,k)=>r.map((v,j)=>v+(b[k][j]-v)*u)),x=p[i],y=p[(i+1)%4],z=p[(i+2)%4];return(y[0]-x[0])*(z[1]-y[1])-(y[1]-x[1])*(z[0]-y[0]);};
      const c=cross(0),end=cross(1),mid=cross(.5),aa=2*(end+c-2*mid),bb=end-c-aa;
      const u=aa>0?-bb/(2*aa):-1;
      if(Math.min(c,end,u>0&&u<1?cross(u):Infinity)<(value.sourceRect?25:500)-1e-7)throw Error('Plane corner animation folds or collapses between its keys.');
      if(value.sourceRect){
        const edge0=a[(i+1)%4].map((v,j)=>v-a[i][j]),edge1=b[(i+1)%4].map((v,j)=>v-b[i][j]),delta=edge1.map((v,j)=>v-edge0[j]);
        const dot=(v,w)=>v.reduce((s,x,j)=>s+x*w[j],0),den=dot(delta,delta),at=den?Math.max(0,Math.min(1,-dot(edge0,delta)/den)):0;
        if(Math.hypot(...edge0.map((v,j)=>v+delta[j]*at))<2-1e-7)throw Error('Plane edge collapses between its keys.');
      }
    }
  }
}

export function perspectiveCorners(value, progress = 100) {
  validateStudioPerspective(value);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw Error('Invalid perspective progress.');
  const corners = value.corners.map((p, i) => p.map((n, j) => (PERSPECTIVE_IDENTITY[i][j] + (n-PERSPECTIVE_IDENTITY[i][j])*progress/100)/100));
  // Validate every evaluated quad as well as the authored endpoint.
  validateStudioPerspective({...value,corners: corners.map(p => p.map(n => n*100))});
  return corners;
}

export function perspectiveHomography(corners) {
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] = corners;
  const dx1=x1-x2, dx2=x3-x2, dy1=y1-y2, dy2=y3-y2;
  const dx3=x0-x1+x2-x3, dy3=y0-y1+y2-y3;
  const det=dx1*dy2-dx2*dy1;
  const g=(dx3*dy2-dx2*dy3)/det, h=(dx1*dy3-dx3*dy1)/det;
  return [x1-x0+g*x1, x3-x0+h*x3, x0, y1-y0+g*y1, y3-y0+h*y3, y0, g, h, 1];
}

export function perspectiveCssMatrix(value, progress, width, height) {
  const [a,b,c,d,e,f,g,h] = perspectiveHomography(perspectiveCorners(value, progress));
  return `matrix3d(${[a,d*height/width,0,g/width,b*width/height,e,0,h/height,0,0,1,0,c*width,f*height,0,1].join(',')})`;
}
