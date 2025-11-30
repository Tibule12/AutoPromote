import React, { useEffect, useRef, useState } from 'react';

function AudioWaveformTrimmer({ file, trimStart, trimEnd, onChange }) {
  const canvasRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState(null);
  useEffect(()=>{ if (!file) return; const url = URL.createObjectURL(file); const ctx = new (window.AudioContext || window.webkitAudioContext)(); const fetchAndDecode = async () => { const res = await fetch(url); const arrayBuffer = await res.arrayBuffer(); const decoded = await ctx.decodeAudioData(arrayBuffer); setAudioBuffer(decoded); setDuration(decoded.duration); }; fetchAndDecode().catch(e=>console.warn(e)); }, [file]);
  useEffect(()=>{ if (!audioBuffer) return; draw(); }, [audioBuffer, trimStart, trimEnd]);
  function draw(){
    const canvas = canvasRef.current; if(!canvas||!audioBuffer) return; const ctx = canvas.getContext('2d'); canvas.width = 800; canvas.height = 120; ctx.fillStyle = '#fafafa'; ctx.fillRect(0,0,canvas.width,canvas.height);
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / canvas.width);
    ctx.fillStyle = '#888';
    for(let i=0;i<canvas.width;i++){ let sum=0; for(let j=0;j<step;j++){ const idx = (i*step)+j; if (idx < data.length) sum += Math.abs(data[idx]); } const v = sum/step; const h = v * canvas.height; ctx.fillRect(i, (canvas.height - h)/2, 1, h); }
    // overlay trim region
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; const sx = (trimStart/duration)*canvas.width || 0; const ex = (trimEnd/duration)*canvas.width || canvas.width; ctx.fillRect(0,0,sx,canvas.height); ctx.fillRect(ex,0,canvas.width-ex,canvas.height);
  }
  function setStart(e){ const x = e.target.value; const t = (x/100)*duration; onChange && onChange({ trimStart: t, trimEnd }); }
  function setEnd(e){ const x = e.target.value; const t = (x/100)*duration; onChange && onChange({ trimStart, trimEnd: t }); }
  return (
    <div style={{display:'grid',gap:8}}>
      <canvas ref={canvasRef} style={{width:'100%',maxWidth:800}} />
      <div style={{display:'flex',gap:8, alignItems:'center'}}>
        <label>Trim start</label>
        <input type="range" min="0" max="100" value={(trimStart/duration||0)*100} onChange={(e)=>setStart(e)} />
        <label>{trimStart.toFixed(2)}s</label>
      </div>
      <div style={{display:'flex',gap:8, alignItems:'center'}}>
        <label>Trim end</label>
        <input type="range" min="0" max="100" value={(trimEnd/duration||100)} onChange={(e)=>setEnd(e)} />
        <label>{trimEnd.toFixed(2)}s</label>
      </div>
    </div>
  );
}

export default AudioWaveformTrimmer;
