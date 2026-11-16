import React,{useId,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {studioTitleTrackMatteUri,paintStudioTitleMattePose} from './studioNodeTitleMask';

// Keep title mask paths in the document. A decoded frame updates their pose,
// avoiding a new SVG-image decode and GPU mask allocation for every picture.
export default function StudioTitleTrackMatte({layer,pose,time,aspect,quality,fillId,mode,style,children}) {
  const id='studio-title-matte-'+useId().replace(/[^a-zA-Z0-9_-]/g,''),ref=useRef(null);
  const [fontRevision,setFontRevision]=useState(0);
  useLayoutEffect(()=>{const loaded=()=>setFontRevision(n=>n+1);document.fonts?.addEventListener?.('loadingdone',loaded);return()=>document.fonts?.removeEventListener?.('loadingdone',loaded);},[]);
  const markup=useMemo(()=>{
    const uri=studioTitleTrackMatteUri(layer,{scale:1,x:50,y:50,opacity:1,rotation:0},0,720*aspect,720,mode,quality);
    if(!uri)return '';
    return decodeURIComponent(uri.slice('url("data:image/svg+xml,'.length,-2))
      .replace('<svg ','<svg width="1" height="1" preserveAspectRatio="none" ')
      .replace(/id="([^"]+)"/g,(_match,name)=>`id="${id}-${name}"`)
      .replace(/url\(#([^)]+)\)/g,(_match,name)=>`url(#${id}-${name})`)
      .replace('<g transform="translate(','<g data-studio-title-matte-pose="true" transform="translate(');
  },[id,layer,aspect,mode,quality,fontRevision]);
  // React compares this prop object before committing innerHTML. A fresh
  // wrapper on every transport render replaces the paths and their filters,
  // even when the serialized mask is unchanged.
  const content=useMemo(()=>({__html:markup}),[markup]);
  useLayoutEffect(()=>paintStudioTitleMattePose(ref.current?.querySelector('[data-studio-title-matte-pose]'),layer,pose,time,aspect),[layer,pose,time,aspect,markup]);
  return <div ref={ref} data-studio-matte-wrap={fillId} data-track-matte-mode={mode} className="studio-track-matte-stage"
    style={{...style,maskImage:`url("#${id}")`,WebkitMaskImage:`url("#${id}")`}}>
    <svg data-studio-inline-title-matte="true" aria-hidden="true" style={{position:'absolute',width:0,height:0,overflow:'hidden'}}>
      <defs><mask id={id} x="0" y="0" width="1" height="1" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" style={{maskType:'alpha'}}>
        <g dangerouslySetInnerHTML={content}/>
      </mask></defs>
    </svg>{children}
  </div>;
}
