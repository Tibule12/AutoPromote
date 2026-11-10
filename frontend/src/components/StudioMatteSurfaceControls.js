import React from 'react';
export default function StudioMatteSurfaceControls({layer,onChange}){
 const s={enabled:false,glowColor:'#36dfff',glowRadius:5,glowIntensity:.5,reflectionEnabled:true,floorY:80,reflectionOpacity:.4,fadeHeight:25,...layer.matteSurface};
 const set=(key,value)=>onChange({...s,[key]:value});
 return <details className="advanced-tool-section" data-testid="studio-matte-surface"><summary>Rim light & floor reflection</summary>
  <label className="inspector-toggle-row"><span>Light the isolated subject</span><input type="checkbox" aria-label="Enable isolated surface effects" checked={s.enabled} onChange={e=>set('enabled',e.target.checked)}/></label>
  {s.enabled&&<><label className="inspector-select-field"><span>Rim colour</span><input type="color" aria-label="Surface rim colour" value={s.glowColor} onChange={e=>set('glowColor',e.target.value)}/></label>
  {[['glowRadius','Surface rim softness',0,24,1],['glowIntensity','Surface rim strength',0,1,.01],['floorY','Reflection floor Y (%)',20,95,.1],['reflectionOpacity','Reflection opacity',0,.8,.01],['fadeHeight','Reflection fade height (%)',3,45,.1]].map(([k,label,min,max,step])=><label className="inspector-range" key={k}><span><b>{label}</b><strong>{s[k].toFixed(2)}</strong></span><input type="range" aria-label={label} min={min} max={max} step={step} value={s[k]} onChange={e=>set(k,Number(e.target.value))}/></label>)}
  <label className="inspector-toggle-row"><span>Floor reflection</span><input type="checkbox" aria-label="Enable isolated floor reflection" checked={s.reflectionEnabled} onChange={e=>set('reflectionEnabled',e.target.checked)}/></label><p className="tool-help">A fading vertical mirror across the selected floor line. Review subject contact and layer order.</p></>}
 </details>;
}
