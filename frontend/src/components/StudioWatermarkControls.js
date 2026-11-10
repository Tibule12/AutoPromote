import React from 'react';

export default function StudioWatermarkControls({ enabled, onEnabledChange, mode, onModeChange,
  regions, activeId, onSelect, onAdd, onRemove, onRegionChange }) {
  const active=regions.find(region=>region.id===activeId);
  return <details className="advanced-tool-section" data-testid="studio-watermark-cleanup">
    <summary>Watermark cleanup</summary>
    <label className="inspector-toggle-row"><span><b>Clean a platform badge</b><small>Inspect the exported picture for softening around the cleanup box.</small></span>
      <input type="checkbox" aria-label="Remove Platform Watermarks" checked={enabled} onChange={e=>onEnabledChange(e.target.checked)} /></label>
    {enabled && <>
      <label className="inspector-select-field"><span>Cleanup mode</span><select aria-label="Watermark cleanup mode" value={mode} onChange={e=>onModeChange(e.target.value)}>
        <option value="manual">Manual cleanup boxes</option><option value="adaptive">Adaptive tracking</option><option value="corners">Static opposite corners</option>
        <option value="top_right">Top right</option><option value="bottom_left">Bottom left</option><option value="all">All corners</option>
      </select></label>
      {mode==='manual' && <>
        <button type="button" className="inspector-secondary-action" disabled={regions.length>=12} onClick={()=>onAdd({track:false})}>Add cleanup box</button>
        <div className="watermark-region-list">{regions.map((region,index)=><button type="button" className={`mini-toggle-btn ${activeId===region.id?'active':''}`} key={region.id} onClick={()=>onSelect(region.id)}>Box {index+1}</button>)}</div>
        {active && <>
          {[['left','Box left',0,100-active.width],['top','Box top',0,100-active.height],['width','Box width',8,Math.min(58,100-active.left)],['height','Box height',4,Math.min(24,100-active.top)]].map(([key,label,min,max])=><label className="inspector-range" key={key}><span><b>{label}</b><strong>{Number(active[key]).toFixed(0)}%</strong></span><input type="range" aria-label={label} min={min} max={max} step={1} value={active[key]} onChange={e=>onRegionChange(active.id,{[key]:Number(e.target.value)})} /></label>)}
          <label className="inspector-toggle-row"><span>Track this cleanup box across the clip</span><input type="checkbox" checked={active.track!==false} onChange={e=>onRegionChange(active.id,{track:e.target.checked})} /></label>
          <button type="button" className="inspector-secondary-action" onClick={()=>onRemove(active.id)}>Delete selected box</button>
        </>}
      </>}
    </>}
  </details>;
}
