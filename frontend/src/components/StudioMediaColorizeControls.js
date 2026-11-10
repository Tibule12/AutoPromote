import React from 'react';
export default function StudioMediaColorizeControls({ layer, onChange }) {
  const value={enabled:false,color:'#28cfff',strength:1,gamma:.72,lift:.04,contrast:1,...layer.colorize};
  const set=(key,next)=>onChange({...value,[key]:next});
  return <details className="advanced-tool-section" data-testid="studio-media-colorize"><summary>Photographic tint</summary>
    <label className="inspector-toggle-row"><span><b>Tint this media layer</b><small>Retain faces, clothing and shading inside the colour.</small></span><input type="checkbox" aria-label="Enable photographic tint" checked={value.enabled} onChange={e=>set('enabled',e.target.checked)} /></label>
    {value.enabled && <><label className="inspector-select-field"><span>Tint colour</span><input type="color" aria-label="Photographic tint colour" value={value.color} onChange={e=>set('color',e.target.value)} /></label>
      {[['strength','Tint strength',0,1,.01],['gamma','Tint midtone gamma',.35,2,.01],['lift','Tint shadow lift',0,.25,.01],['contrast','Tint detail contrast',.5,3,.05]].map(([field,label,min,max,step])=><label className="inspector-range" key={field}><span><b>{label}</b><strong>{value[field].toFixed(2)}</strong></span><input type="range" aria-label={label} min={min} max={max} step={step} value={value[field]} onChange={e=>set(field,Number(e.target.value))} /></label>)}
    </>}
  </details>;
}
