import React, {useLayoutEffect,useRef,useState} from 'react';
import {studioNodeTitleSurface} from './studioNodeTitleMask';

// Inspect ordinary titles at the same supersampled density as their native
// assets. Moving playback keeps the existing lightweight editable text nodes.
export default function StudioTitleInspectionSurface({layer,programmeWidth,enabled,children}) {
  const ref=useRef(null),[painted,setPainted]=useState(false);
  useLayoutEffect(()=>{
    if(!enabled){setPainted(false);return undefined;}
    const paint=()=>{
      const canvas=ref.current,ctx=canvas?.getContext('2d');if(!ctx)return;
      const source=studioNodeTitleSurface({...layer,bg:'transparent',chromaKey:{enabled:false},
        opticalFx:{},displacementWarp:{enabled:false},dofBlur:0},{scale:4},0,programmeWidth,720);
      canvas.width=source.canvas.width;canvas.height=source.canvas.height;
      ctx.drawImage(source.canvas,0,0);
      canvas.dataset.pixelRevision=String(Number(canvas.dataset.pixelRevision||0)+1);
      Object.assign(canvas.style,{width:`${canvas.width/4}px`,height:`${canvas.height/4}px`});
      setPainted(true);
    };
    paint();document.fonts?.addEventListener?.('loadingdone',paint);
    return()=>document.fonts?.removeEventListener?.('loadingdone',paint);
  },[enabled,layer,programmeWidth]);
  return <><span style={{visibility:painted&&enabled?'hidden':undefined}}>{children}</span>
    <canvas ref={ref} data-studio-title-inspection="true" aria-hidden="true" style={{display:painted&&enabled?'block':'none',position:'absolute',left:'-24px',top:'-24px',maxWidth:'none',maxHeight:'none',pointerEvents:'none'}}/></>;
}
