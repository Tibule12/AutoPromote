import React, { useState } from 'react';
import { AUTOPROMOTE_LOGO_SVG } from './studioLogoMotion';

export default function StudioLogoMotionPanel({ onBuild, locked, programmeDuration }) {
  const [svg,setSvg]=useState(AUTOPROMOTE_LOGO_SVG), [bitmap,setBitmap]=useState(null), [brandName,setBrandName]=useState('AutoPromote');
  const [accent,setAccent]=useState('#a855f7'), [duration,setDuration]=useState(10);
  const [background,setBackground]=useState(true), [busy,setBusy]=useState(false), [message,setMessage]=useState('');
  const [separateBitmap,setSeparateBitmap]=useState(false),[symbolWidth,setSymbolWidth]=useState(28);
  const [pieceConstruction,setPieceConstruction]=useState(false),[pieceColumns,setPieceColumns]=useState(11);
  const [pieceStyle,setPieceStyle]=useState('spring');
  return <details className="advanced-tool-section kinetic-type-panel" data-testid="studio-logo-motion">
    <summary>Logo motion</summary>
    <p>Build editable logo motion at the start of your programme. SVG shapes stay separate. A separated image symbol assembles through three masked components, accelerates along forward routes, then resolves into its original wordmark. Each layer and its keys remain editable.</p>
    <label>Logo image<input aria-label="Logo motion image" type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" disabled={busy || locked}
      onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;
        setBusy(true);try{
          if(file.size>250000)throw Error('Choose a logo smaller than 250 KB.');
          if(file.type==='image/svg+xml'||/\.svg$/i.test(file.name)){
            setSvg(await file.text());setBitmap(null);
          }else{
            if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose an SVG, PNG, JPEG or WebP logo.');
            const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('The logo could not be read.'));reader.readAsDataURL(file);});
            const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('The logo could not be decoded.'));img.src=dataUrl;});
            const w=image.naturalWidth,h=image.naturalHeight;if(w>4096||h>4096)throw Error('Use a logo up to 4096 pixels on each side.');
            const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
            const data=ctx.getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;
            for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>32){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
            if(x1<0)throw Error('The logo has no visible pixels.');
            // Crop the viewport only. The original encoded image and all its
            // colours remain untouched inside the authored graphic layers.
            setBitmap({dataUrl,width:w,height:h,bounds:[x0,y0,x1-x0+1,y1-y0+1],pixels:data});
          }
          setMessage(`${file.name} selected.`);
        }catch(error){setMessage(error.message);}finally{setBusy(false);}}}/></label>
    <label>Brand name<input aria-label="Logo motion brand name" value={brandName} maxLength={24} disabled={busy || locked} onChange={e=>setBrandName(e.target.value)}/></label>
    <label>Accent<input aria-label="Logo motion accent" type="color" value={accent} disabled={busy || locked} onChange={e=>setAccent(e.target.value)}/></label>
    {bitmap?<>
      <label><input type="checkbox" checked={separateBitmap} disabled={busy||locked} onChange={e=>setSeparateBitmap(e.target.checked)}/>Separate left symbol from wordmark</label>
      {separateBitmap?<>
        <label>Symbol width (%)<input aria-label="Logo symbol width" type="number" min={10} max={60} value={symbolWidth} disabled={busy||locked} onChange={e=>setSymbolWidth(Number(e.target.value))}/></label>
        <label><input type="checkbox" checked={pieceConstruction} disabled={busy||locked} onChange={e=>setPieceConstruction(e.target.checked)}/>Construct words from pieces</label>
        {pieceConstruction?<label>Wordmark slices<input aria-label="Logo wordmark slices" type="number" min={2} max={16} value={pieceColumns} disabled={busy||locked} onChange={e=>setPieceColumns(Number(e.target.value))}/></label>:null}
        {pieceConstruction?<label>Piece choreography<select aria-label="Logo piece choreography" value={pieceStyle} disabled={busy||locked} onChange={e=>setPieceStyle(e.target.value)}>
          <option value="spring">Spring assembly</option><option value="diamond">Diamond cascade</option>
        </select></label>:null}
        {pieceConstruction?<p>{pieceStyle==='diamond'?'Four triangular pieces form each large word before it moves into the lockup. The original logo follows in a centre-out diagonal cascade.':'Interlocking image slices assemble the original wordmark. Five words each assemble from three masked text pieces.'} Edit their text, masks and keys in the timeline.</p>:null}
      </>:null}
    </>:null}
    <label>Duration (s)<input aria-label="Logo motion duration" type="number" min={8} max={Math.min(14,programmeDuration)} step={.5} value={duration} disabled={busy || locked} onChange={e=>setDuration(Number(e.target.value))}/></label>
    <label><input type="checkbox" checked={background} disabled={busy || locked} onChange={e=>setBackground(e.target.checked)}/>Add background</label>
    <button type="button" disabled={busy || locked || programmeDuration<8} onClick={async()=>{
      setBusy(true);setMessage('');try{await onBuild({svg,bitmap,brandName,accent,duration,separateBitmap,symbolWidth,pieceConstruction:separateBitmap&&pieceConstruction,pieceColumns,pieceStyle,includeBackground:background});
        setMessage('Logo motion created. Edit the layers and keys in the timeline; Undo removes the composition.');
      }catch(error){setMessage(error.message);}finally{setBusy(false);}}}>
      {busy?'Building logo motion…':'Build editable logo motion'}
    </button>
    {programmeDuration<8?<p>Use a programme at least eight seconds long.</p>:null}
    {locked?<p>Unlock the Graphics track to build logo motion.</p>:null}
    {message?<p role="status">{message}</p>:null}
  </details>;
}
