/**
 * ThumbnailGenerator — AI-style YouTube thumbnails.
 * Face zoom, glow text, emoji, contrast boost, random frames.
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { getAuth } from "firebase/auth";
import { storage } from "../firebaseClient";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import "./ThumbnailGenerator.css";

const W = 1280, H = 720;

function variance(d)      { let s=0,s2=0; for(let i=0;i<d.length;i+=4){ const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; s+=g; s2+=g*g; } const m=s/(d.length/4); return s2/(d.length/4)-m*m; }
function skinRatio(d)     { let sk=0; for(let i=0;i<d.length;i+=4){ const r=d[i],g=d[i+1],b=d[i+2]; if(r>95&&g>40&&b>20&&Math.max(r,g,b)-Math.min(r,g,b)>15&&Math.abs(r-g)>15&&r>g&&r>b)sk++; } return sk/(d.length/4); }
function rnd(a,b)         { return a+Math.random()*(b-a); }

function findFace(d,w,h) {
  let mx=w,Mx=0,my=h,My=0,c=0;
  for(let y=0;y<h;y+=4) for(let x=0;x<w;x+=4){ const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2]; if(r>95&&g>40&&b>20&&Math.max(r,g,b)-Math.min(r,g,b)>15&&Math.abs(r-g)>15&&r>g&&r>b){ mx=Math.min(mx,x);Mx=Math.max(Mx,x);my=Math.min(my,y);My=Math.max(My,y);c++; } }
  return c>100?{x:mx,y:my,w:Mx-mx+30,h:My-my+30}:null;
}

function filterCanvas(ctx,w,h){
  const d=ctx.getImageData(0,0,w,h).data;
  for(let i=0;i<d.length;i+=4){ d[i]=Math.min(255,(d[i]-128)*1.12+128);d[i+1]=Math.min(255,(d[i+1]-128)*1.12+128);d[i+2]=Math.min(255,(d[i+2]-128)*1.12+128); }
  ctx.putImageData(new ImageData(d,w,h),0,0);
}

function drawTxt(ctx,t,x,y,mw,sz,clr,glow,al){
  ctx.save();ctx.font='900 '+sz+'px Impact,"Arial Black",sans-serif';ctx.textAlign=al||'center';ctx.textBaseline='middle';
  if(glow){ctx.shadowColor=glow;ctx.shadowBlur=sz*0.3;}
  ctx.strokeStyle='#000';ctx.lineWidth=sz*0.14;ctx.lineJoin='round';
  ctx.strokeText(t,x,y,mw);ctx.fillStyle=clr;ctx.fillText(t,x,y,mw);ctx.restore();
}

const HEADS=["STOP SCROLLING","DON'T SKIP","WAIT FOR IT","MIND BLOWN","YOU WON'T BELIEVE","THE TRUTH","I WAS SHOCKED","GAME OVER","THIS IS CRAZY","MUST WATCH"];
const SUBS=["Watch till the end...","Like & Subscribe!","Full video in description","You need to see this","This went viral"];
const EMJS=["🔥","⚡","😱","💀","👀","🚀"];
const COLS=["#FF3B30","#FFD60A","#32D74B","#FF6B6B","#00D4FF","#FF9500"];

export default function ThumbnailGenerator({videoSrc,videoRef:extRef,onSelect,onClose}){
  const ir=useRef(null),vr=extRef||ir,cr=useRef(null);
  const [thumbs,setThumbs]=useState([]);
  const [sel,setSel]=useState(0);
  const [st,setSt]=useState("idle");
  const [up,setUp]=useState(false);
  const origRef=useRef([]); // raw frame dataURLs for re-render

  const buildOne=useCallback((frame,opts={})=>{
    const c=document.createElement("canvas");c.width=W;c.height=H;const ctx=c.getContext("2d");
    const src=document.createElement("canvas");src.width=frame.id.width;src.height=frame.id.height;src.getContext("2d").putImageData(frame.id,0,0);
    const face=findFace(frame.id.data,frame.id.width,frame.id.height);
    if(face&&face.w>80&&face.h>80){ const px=face.w*0.5,py=face.h*0.4,sx=Math.max(0,face.x-px),sy=Math.max(0,face.y-py),sw=Math.min(frame.id.width-sx,face.w+px*2),sh=Math.min(frame.id.height-sy,face.h+py*2); ctx.drawImage(src,sx,sy,sw,sh,0,0,W,H); }
    else ctx.drawImage(src,0,0,W,H);
    filterCanvas(ctx,W,H);
    const g=ctx.createLinearGradient(0,H*0.35,0,H);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(0.5,'rgba(0,0,0,0.3)');g.addColorStop(1,'rgba(0,0,0,0.72)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    const v=ctx.createRadialGradient(W/2,H/2,W*0.55,W/2,H/2,W*0.9);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,0.4)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
    const head=opts.headline||HEADS[Math.floor(Math.random()*HEADS.length)];
    const sub=opts.subtext||SUBS[Math.floor(Math.random()*SUBS.length)];
    const col=opts.color||COLS[Math.floor(Math.random()*COLS.length)];
    const emj=opts.emoji||EMJS[Math.floor(Math.random()*EMJS.length)];
    drawTxt(ctx,head,W/2,H-120,W-80,58,col,col);
    drawTxt(ctx,sub,W/2,H-50,W-140,26,'#FFFFFF',null);
    ctx.font='64px serif';ctx.textAlign='left';ctx.fillText(emj,36,H-108);
    ctx.strokeStyle=col;ctx.lineWidth=5;ctx.beginPath();ctx.arc(W-56,H-98,32,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle=col;ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.fillText('▶',W-56,H-88);
    return{dataUrl:c.toDataURL('image/jpeg',0.92),headline:head,subtext:sub,emoji:emj,color:col,time:frame.time,score:frame.score};
  },[]);

  const generate=useCallback(async()=>{
    const v=vr.current;if(!v)return;setSt("extracting");
    if(v.readyState<2)await new Promise(r=>{v.oncanplay=r;});
    const dur=v.duration||60,pts=[];
    for(let i=0;i<10;i++)pts.push(rnd(dur*0.08,dur*0.92));
    pts.sort((a,b)=>a-b);
    const off=document.createElement("canvas"),ox=off.getContext("2d",{willReadFrequently:true});
    const scored=[];
    for(const t of pts){v.currentTime=t;await new Promise(r=>{v.onseeked=r;});await new Promise(r=>setTimeout(r,40));off.width=v.videoWidth||W;off.height=v.videoHeight||H;ox.drawImage(v,0,0,off.width,off.height);const id=ox.getImageData(0,0,off.width,off.height);scored.push({time:Math.round(t*10)/10,score:Math.round(variance(id.data)/80+skinRatio(id.data)*50+rnd(0,10)),id});}
    scored.sort((a,b)=>b.score-a.score);
    const top=scored.slice(0,6);
    origRef.current=top.map(f=>f);
    const result=top.map((f,i)=>buildOne(f,{headline:HEADS[i],subtext:SUBS[i%SUBS.length],emoji:EMJS[i%EMJS.length],color:COLS[i%COLS.length]}));
    setThumbs(result);setSel(0);setSt("ready");
  },[vr,buildOne]);

  const regenerate=useCallback(()=>{
    if(!origRef.current.length)return generate();
    const result=origRef.current.map((f,i)=>buildOne(f,{
      headline:HEADS[Math.floor(Math.random()*HEADS.length)],
      subtext:SUBS[Math.floor(Math.random()*SUBS.length)],
      emoji:EMJS[Math.floor(Math.random()*EMJS.length)],
      color:COLS[Math.floor(Math.random()*COLS.length)],
    }));
    setThumbs(result);setSel(0);
  },[buildOne,generate]);

  useEffect(()=>{if(thumbs.length&&cr.current){const img=new Image();img.onload=()=>{cr.current.width=W;cr.current.height=H;cr.current.getContext("2d").drawImage(img,0,0);};img.src=thumbs[sel]?.dataUrl;}},[sel,thumbs]);

  const dl=t=>{const a=document.createElement("a");a.download='thumbnail-'+Date.now()+'.jpg';a.href=t.dataUrl;a.click();};
  const save=async()=>{const t=thumbs[sel];if(!t)return;setUp(true);try{const b=await(await fetch(t.dataUrl)).blob();const auth=getAuth();const uid=auth.currentUser?.uid||"anon";const sref=ref(storage,'thumbnails/'+uid+'/'+Date.now()+'.jpg');await uploadBytes(sref,b,{contentType:"image/jpeg"});const url=await getDownloadURL(sref);onSelect?.({dataUrl:t.dataUrl,storageUrl:url,text:t.headline,time:t.time});}catch(e){console.warn(e);}finally{setUp(false);}};

  return(<div className="tg-overlay" onClick={onClose}><div className="tg-panel" onClick={e=>e.stopPropagation()}>
    <div className="tg-header"><h2>🎬 Thumbnail Studio</h2><p>AI-powered. Face zoom. Glow text. Clickbait style.</p>
      <div className="tg-header-actions">
        {st==="idle"&&<button className="tg-btn tg-btn-primary" onClick={generate}>⚡ Generate Thumbnails</button>}
        {st==="extracting"&&<button className="tg-btn tg-btn-primary" disabled>⏳ AI analyzing your video...</button>}
        {st==="ready"&&<><button className="tg-btn tg-btn-outline" onClick={generate}>🔄 New Frames</button><button className="tg-btn tg-btn-outline" onClick={regenerate}>🎲 Remix All</button><button className="tg-btn tg-btn-primary" onClick={save} disabled={up}>{up?"⏳ Uploading...":"✅ Use This Thumbnail"}</button></>}
      </div>
    </div>
    {st==="ready"&&thumbs.length>0&&<>
      <div className="tg-preview-section"><canvas ref={cr} className="tg-preview-canvas"/></div>
      <div className="tg-grid-label">{thumbs[sel]?.headline} — {thumbs[sel]?.subtext}</div>
      <div className="tg-grid">
        {thumbs.map((t,i)=>(<div key={i} className={'tg-card'+(i===sel?' tg-card-selected':'')} onClick={()=>setSel(i)}>
          <img src={t.dataUrl} alt={'Frame '+t.time+'s'} className="tg-card-img"/>
          <div className="tg-card-overlay"><span className="tg-card-emoji">{t.emoji}</span><span className="tg-card-score">Score {t.score}</span></div>
          <button className="tg-card-dl" onClick={e=>{e.stopPropagation();dl(t);}}>⬇</button>
        </div>))}
      </div>
    </>}
    <button className="tg-close" onClick={onClose}>✕</button>
  </div>
  {videoSrc&&<video ref={ir} src={videoSrc} style={{position:"fixed",opacity:0,pointerEvents:"none",width:1,height:1}} crossOrigin="anonymous" preload="auto"/>}
  </div>);
}
