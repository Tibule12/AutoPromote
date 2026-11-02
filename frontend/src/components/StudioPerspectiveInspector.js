import React, { useEffect, useState } from 'react';
import { PERSPECTIVE_IDENTITY, PERSPECTIVE_LEFT, PERSPECTIVE_RIGHT, validateStudioPerspective } from './studioPerspective';

export default function StudioPerspectiveInspector({ layer, onChange }) {
  const [draft,setDraft]=useState(null),[region,setRegion]=useState(null),[error,setError]=useState('');
  useEffect(()=>{setDraft(null);setRegion(null);setError('');},[layer.id,layer.perspective]);
  const apply=corners=>{
    try {const next=validateStudioPerspective({version:1,corners,...(layer.perspective?.sourceRect?{sourceRect:layer.perspective.sourceRect}:{})});onChange(next);setDraft(null);setError('');}
    catch(e){setError(e.message);}
  };
  return <details className="advanced-tool-section" data-testid="studio-perspective-inspector">
    <summary>Perspective plane</summary>
    <p>Place this image or video on a four-corner plane. Animate Perspective progress in Motion.</p>
    <button type="button" onClick={()=>apply(PERSPECTIVE_LEFT)}>Tilt plane left</button>
    <button type="button" onClick={()=>apply(PERSPECTIVE_RIGHT)}>Tilt plane right</button>
    {layer.perspective && <>
      {['Top left','Top right','Bottom right','Bottom left'].map((label,i)=><div key={label}>
        <span>{label}</span>{['X','Y'].map((axis,j)=><input key={axis} type="number" min="0" max="100" step=".1"
          aria-label={`Perspective ${label.toLowerCase()} ${axis}`} value={(draft||layer.perspective.corners)[i][j]}
          onChange={e=>{const next=(draft||layer.perspective.corners).map(row=>[...row]);next[i][j]=e.target.value;setDraft(next);}} />)}
      </div>)}
      <button type="button" onClick={()=>apply((draft||layer.perspective.corners).map(p=>p.map(n=>n===''?NaN:Number(n))))}>Apply plane corners</button>
      <button type="button" onClick={()=>apply(PERSPECTIVE_IDENTITY)}>Straighten plane</button>
      <p>Source region selects the original picture before projection. It stretches to the declared plane.</p>
      {['left','top','right','bottom'].map((label,i)=><label key={label}>Source {label}<input type="number" min="0" max="100" step=".1"
        aria-label={`Plane source ${label}`} value={(region||layer.perspective.sourceRect||[0,0,100,100])[i]}
        onChange={e=>{const r=[...(region||layer.perspective.sourceRect||[0,0,100,100])];r[i]=e.target.value;setRegion(r);}} /></label>)}
      <button type="button" onClick={()=>{try{const next=validateStudioPerspective({...layer.perspective,sourceRect:(region||layer.perspective.sourceRect||[0,0,100,100]).map(n=>n===''?NaN:Number(n))});onChange(next);setError('');}catch(e){setError(e.message);}}}>Apply source region</button>
      <button type="button" onClick={()=>{const {sourceRect,...next}=layer.perspective;onChange(next);}}>Use whole source</button>
      <button type="button" onClick={()=>onChange(null)}>Remove perspective</button>
    </>}
    {error&&<p role="alert">{error}</p>}
  </details>;
}
