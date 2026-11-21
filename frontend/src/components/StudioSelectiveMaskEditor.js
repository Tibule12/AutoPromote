import {createPortal} from 'react-dom';
import React, {useRef,useState,useEffect} from 'react';
import {selectiveMaskAt,keySelectiveMask,selectiveMaskCoverage} from './studioSelectiveMask';
import {materialSampler} from './studioMaterialQualifier';
const clamp=v=>Math.max(0,Math.min(1,v));
export default function StudioSelectiveMaskEditor({layer,mode,time,onChange,onDone,insetX=0,insetY=0,toolbarTarget=null,onPickColour,getPicture}) {
  const svg=useRef(null),drag=useRef(null),[draft,setDraft]=useState([]),[error,setError]=useState('');
  const [aspect,setAspect]=useState(1),[zoom,setZoom]=useState(1),[matte,setMatte]=useState(false),[picture,setPicture]=useState(null);
  const pose=layer?.mask?selectiveMaskAt(layer.mask,Math.max(0,time-layer.startTime)):null;
  const viewSize=1000/zoom,viewX=pose?Math.max(0,Math.min(1000-viewSize,pose.x*1000-viewSize/2)):0,viewY=pose?Math.max(0,Math.min(1000-viewSize,pose.y*1000-viewSize/2)):0;
  useEffect(()=>{
    if(!mode||(!matte&&zoom===1)){setPicture(null);return;}
    let stopped=false,lastImage;
    const refresh=()=>{
      const sample=getPicture?.();if(!sample?.image||sample.layerId!==layer?.id||Math.abs(sample.time-time)>.1||sample.image===lastImage||stopped)return;lastImage=sample.image;
      const source=matte?sample.input:sample.image;if(!source)return;
      const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
      const ctx=canvas.getContext('2d');
      if(matte){
        const image=ctx.createImageData(source.width,source.height),coverage=selectiveMaskCoverage(layer.mask,source.width,source.height,Math.max(0,sample.time-layer.startTime)),scratch=[0,0,0],qualify=materialSampler(layer.mask.material);
        for(let p=0;p<coverage.length;p++){const i=p*4,a=coverage[p]*(coverage[p]?qualify(source.data[i],source.data[i+1],source.data[i+2],scratch):0),v=Math.round(a*255);image.data[i]=v;image.data[i+1]=v;image.data[i+2]=v;image.data[i+3]=255;}
        ctx.putImageData(image,0,0);
      }else ctx.putImageData(source,0,0);
      setPicture(canvas.toDataURL('image/jpeg',.94));
    };
    const timer=setInterval(refresh,150);refresh();return()=>{stopped=true;clearInterval(timer);};
  },[mode,zoom,matte,layer,time]);
  useEffect(()=>{const node=svg.current;if(!node)return;const update=()=>setAspect(node.clientWidth/Math.max(1,node.clientHeight));update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();},[mode]);
  useEffect(()=>{setDraft([]);setError('');drag.current=null;},[mode,layer?.id]);
  useEffect(()=>setZoom(1),[layer?.id]);
  if(!layer||!mode)return null;
  const m=selectiveMaskAt(layer.mask,Math.max(0,time-layer.startTime));
  const point=e=>{const r=svg.current.getBoundingClientRect();return[clamp((viewX+(e.clientX-r.left)/r.width*viewSize)/1000),clamp((viewY+(e.clientY-r.top)/r.height*viewSize)/1000)];};
  const baseMode=mode.replace('subtract-',''),subtract=mode.startsWith('subtract-');
  const localPoint=p=>{const dx=(p[0]-m.x),dy=(p[1]-m.y),a=m.rotation*Math.PI/180;return[clamp(.5+(dx*Math.cos(a)+dy*Math.sin(a)/aspect)/m.width),clamp(.5+(-dx*Math.sin(a)*aspect+dy*Math.cos(a))/m.height)];};
  const commit=patch=>{for(const f of ['x','y'])if(patch[f]!==undefined)patch[f]=Math.max(-1,Math.min(2,patch[f]));for(const f of ['width','height'])if(patch[f]!==undefined)patch[f]=Math.max(.002,Math.min(3,patch[f]));onChange({...layer,mask:layer.mask.keyframes.length?keySelectiveMask(layer.mask,Math.max(0,time-layer.startTime),patch):{...layer.mask,...patch}});onDone();setDraft([]);};
  const saveOutline=patch=>{
    if(subtract){
      if((layer.mask.subtract?.length||0)>=8){setError('Use up to eight protected details per area.');return;}
      onChange({...layer,mask:{...layer.mask,subtract:[...(layer.mask.subtract||[]),{...patch,feather:.015,inverted:false,keyframes:[]}]}});
    }else onChange({...layer,mask:{...layer.mask,...patch,keyframes:[],opacity:undefined},tracking:undefined});
    onDone();setDraft([]);
  };
  const polygon=pts=>{if(pts.length<3){setError('Add at least three outline points.');return;}
    const actual=subtract?pts.map(localPoint):pts,xs=actual.map(p=>p[0]),ys=actual.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(.002,Math.max(...xs)-x),h=Math.max(.002,Math.max(...ys)-y);
    saveOutline({shape:'polygon',x:x+w/2,y:y+h/2,width:w,height:h,rotation:0,points:actual.map(p=>[clamp((p[0]-x)/w),clamp((p[1]-y)/h)])});
  };
  const down=e=>{e.preventDefault();e.stopPropagation();const p=point(e);if(baseMode==='polygon'){if(draft.length>=64){setError('Use at most 64 points.');return;}setDraft(previous=>previous.length<64?[...previous,p]:previous);return;}if(mode==='sample'){onPickColour?.(p);onDone();return;}if(mode==='clone'){onChange({...layer,finishFx:{...layer.finishFx,clonePatch:{enabled:true,dx:Math.max(-1,Math.min(1,p[0]-m.x)),dy:Math.max(-1,Math.min(1,p[1]-m.y)),strength:1,mode:'heal',radius:.012}}});onDone();return;}svg.current.setPointerCapture(e.pointerId);drag.current={start:p,last:p,resize:e.target.dataset.handle==='resize',pointIndex:e.target.dataset.point!==undefined?Number(e.target.dataset.point):null,pose:m};setDraft(baseMode==='freehand'?[p]:[p,p]);};
  const move=e=>{if(!drag.current)return;const p=point(e);drag.current.last=p;if(baseMode==='freehand')setDraft(prev=>Math.hypot(p[0]-prev.at(-1)[0],p[1]-prev.at(-1)[1])>.004?[...(prev.length>=64?prev.filter((_,i)=>i%2===0):prev),p]:prev);else setDraft([drag.current.start,p]);};
  const up=e=>{if(!drag.current)return;const d=drag.current,p=point(e);drag.current=null;svg.current.releasePointerCapture(e.pointerId);if(baseMode==='freehand'){polygon(draft);return;}if(mode==='points'&&d.pointIndex!==null){const dx=(p[0]-m.x),dy=(p[1]-m.y),a=m.rotation*Math.PI/180,lx=dx*Math.cos(a)+dy*Math.sin(a)/aspect,ly=-dx*Math.sin(a)*aspect+dy*Math.cos(a),points=m.points.map((point,i)=>i===d.pointIndex?[clamp(.5+lx/m.width),clamp(.5+ly/m.height)]:point);onChange({...layer,mask:layer.mask.keyframes.length?keySelectiveMask(layer.mask,Math.max(0,time-layer.startTime),{points}):{...layer.mask,points}});setDraft([]);return;}if(mode==='points'){setDraft([]);return;}if(mode==='move'){commit(d.resize?{width:Math.max(.002,Math.abs(p[0]-m.x)*2),height:Math.max(.002,Math.abs(p[1]-m.y)*2)}:{x:m.x+p[0]-d.start[0],y:m.y+p[1]-d.start[1]});return;}const start=subtract?localPoint(d.start):d.start,end=subtract?localPoint(p):p,w=Math.abs(end[0]-start[0]),h=Math.abs(end[1]-start[1]);if(w<.002||h<.002){setError('Drag out an area on the picture.');setDraft([]);return;}saveOutline({shape:baseMode,x:(end[0]+start[0])/2,y:(end[1]+start[1])/2,width:w,height:h,rotation:0});};
  const handleX=6*viewSize/Math.max(1,svg.current?.clientWidth||700),handleY=6*viewSize/Math.max(1,svg.current?.clientHeight||400);
  const angle=m.rotation*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),cx=m.x*1000,cy=m.y*1000;
  const transform=`matrix(${cs} ${sn*aspect} ${-sn/aspect} ${cs} ${cx-cs*cx+sn/aspect*cy} ${cy-sn*aspect*cx-cs*cy})`;
  return <div className="studio-region-editor" data-testid="studio-region-editor" style={{position:'absolute',inset:0,zIndex:5000,pointerEvents:'none'}}>
    {toolbarTarget?createPortal(<div className="studio-region-editor__bar" style={{pointerEvents:'auto',padding:'4px 8px',color:'#fff',display:'flex',flexWrap:'wrap',alignItems:'center',gap:8}}><strong>{mode==='sample'?'Pick a colour in the original picture':subtract?'Draw the detail to protect':mode==='clone'?'Pick clean texture':baseMode==='polygon'?'Click outline points, then Finish':baseMode==='freehand'?'Drag a closed outline':mode==='points'?'Drag outline points; use Done to finish':mode==='move'?'Drag mask; corner handle resizes':'Drag over the area to grade'}</strong> {baseMode==='polygon'&&<button type="button" onClick={()=>polygon(draft)}>Finish outline</button>} <label>Inspect <select aria-label="Selected-area inspection zoom" value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[1,2,4,8].map(n=><option value={n} key={n}>{n}×</option>)}</select></label><label><input type="checkbox" aria-label="Show selected-area matte" checked={matte} onChange={e=>setMatte(e.target.checked)}/>Matte</label><button type="button" onClick={onDone}>Done / Cancel</button>{error&&<span role="alert">{error}</span>}</div>,toolbarTarget):null}
    <svg ref={svg} aria-label="Draw selected-area mask" viewBox={`${viewX} ${viewY} ${viewSize} ${viewSize}`} preserveAspectRatio="none" tabIndex={0} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onDone();}if(e.key==='Enter'&&baseMode==='polygon')polygon(draft);}} style={{position:'absolute',left:`${insetX}%`,top:`${insetY}%`,width:`${100-2*insetX}%`,height:`${100-2*insetY}%`,pointerEvents:'auto',touchAction:'none',cursor:mode==='move'?'move':'crosshair'}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{drag.current=null;setDraft([]);}}>
      <rect width="1000" height="1000" fill="transparent"/>{picture&&<image href={picture} x="0" y="0" width="1000" height="1000" preserveAspectRatio="none" pointerEvents="none"/>}
      {layer.finishFx.clonePatch?.enabled&&<g pointerEvents="none" stroke="#fde047" fill="none"><line x1={m.x*1000} y1={m.y*1000} x2={(m.x+layer.finishFx.clonePatch.dx)*1000} y2={(m.y+layer.finishFx.clonePatch.dy)*1000} strokeDasharray="4 5" vectorEffect="non-scaling-stroke"/><circle cx={(m.x+layer.finishFx.clonePatch.dx)*1000} cy={(m.y+layer.finishFx.clonePatch.dy)*1000} r={handleX}/><text x={(m.x+layer.finishFx.clonePatch.dx)*1000+12} y={(m.y+layer.finishFx.clonePatch.dy)*1000} fill="#fde047" stroke="none" fontSize={12*viewSize/Math.max(1,svg.current?.clientHeight||400)}>Source</text></g>}
      <g transform={transform}>
      {m.shape==='ellipse'?<ellipse cx={m.x*1000} cy={m.y*1000} rx={m.width*500} ry={m.height*500} fill="#22d3ee18" stroke="#22d3ee" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>:m.shape==='polygon'?<polygon points={m.points.map(([x,y])=>`${(m.x+(x-.5)*m.width)*1000},${(m.y+(y-.5)*m.height)*1000}`).join(' ')} fill="#22d3ee18" stroke="#22d3ee" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>:<rect x={(m.x-m.width/2)*1000} y={(m.y-m.height/2)*1000} width={m.width*1000} height={m.height*1000} fill="#22d3ee18" stroke="#22d3ee" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>}
      {(m.subtract||[]).map((child,i)=>{
        const x=(m.x+(child.x-.5)*m.width)*1000,y=(m.y+(child.y-.5)*m.height)*1000,w=child.width*m.width*1000,h=child.height*m.height*1000;
        return <g key={i} transform={`rotate(${child.rotation} ${x} ${y})`} pointerEvents="none">{child.shape==='ellipse'?<ellipse cx={x} cy={y} rx={w/2} ry={h/2} fill="#f8717120" stroke="#f87171" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>:child.shape==='polygon'?<polygon points={child.points.map(([px,py])=>`${x+(px-.5)*w},${y+(py-.5)*h}`).join(' ')} fill="#f8717120" stroke="#f87171" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>:<rect x={x-w/2} y={y-h/2} width={w} height={h} fill="none" stroke="#f87171"/>}</g>;
      })}
      {mode==='points'&&m.shape==='polygon'&&m.points.map(([x,y],i)=><ellipse key={i} data-point={i} cx={(m.x+(x-.5)*m.width)*1000} cy={(m.y+(y-.5)*m.height)*1000} rx={handleX} ry={handleY} fill="#fff" stroke="#22d3ee" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>)}
      {mode==='move'&&<rect data-handle="resize" x={(m.x+m.width/2)*1000-handleX} y={(m.y+m.height/2)*1000-handleY} width={handleX*2} height={handleY*2} fill="#fff" stroke="#22d3ee"/>}
      </g>
      {draft.length>0&&<polyline points={draft.map(p=>p.map(x=>x*1000).join(',')).join(' ')} fill="none" stroke="#fde047" strokeWidth="2" vectorEffect="non-scaling-stroke"/>}
    </svg>
  </div>;
}
