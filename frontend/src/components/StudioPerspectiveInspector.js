import React, { useEffect, useState } from 'react';
import { PERSPECTIVE_IDENTITY, PERSPECTIVE_LEFT, PERSPECTIVE_RIGHT, validateStudioPerspective } from './studioPerspective';

export default function StudioPerspectiveInspector({ layer, onChange }) {
  const [draft,setDraft]=useState(null),[error,setError]=useState('');
  useEffect(()=>{setDraft(null);setError('');},[layer.id,layer.perspective]);
  const apply=corners=>{
    try {const next=validateStudioPerspective({version:1,corners});onChange(next);setDraft(null);setError('');}
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
      <button type="button" onClick={()=>onChange(null)}>Remove perspective</button>
    </>}
    {error&&<p role="alert">{error}</p>}
  </details>;
}
