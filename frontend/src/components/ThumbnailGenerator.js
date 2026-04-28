import React, { useState, useRef, useCallback, useEffect } from "react";
import { getAuth } from "firebase/auth";
import { storage } from "../firebaseClient";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import "./ThumbnailGenerator.css";

const W=1280,H=720;
function vrn(d){let s=0,s2=0;for(let i=0;i<d.length;i+=4){const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];s+=g;s2+=g*g;}const m=s/(d.length/4);return s2/(d.length/4)-m*m;}
function skn(d){let c=0;for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];if(r>95&&g>40&&b>20&&Math.max(r,g,b)-Math.min(r,g,b)>15&&Math.abs(r-g)>15&&r>g&&r>b)c++;}return c/(d.length/4);}
function rnd(a,b){return a+Math.random()*(b-a);}
function ff(d,w,h){let mx=w,Mx=0,my=h,My=0,c=0;for(let y=0;y<h;y+=4)for(let x=0;x<w;x+=4){const i=(y*w+x)*4;if(d[i]>95&&d[i+1]>40&&d[i+2]>20&&Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2])>15&&Math.abs(d[i]-d[i+1])>15&&d[i]>d[i+1]&&d[i]>d[i+2]){mx=Math.min(mx,x);Mx=Math.max(Mx,x);my=Math.min(my,y);My=Math.max(My,y);c++;}}return c>100?{x:mx,y:my,w:Mx-mx+30,h:My-my+30}:null;}

const HEADS=["STOP SCROLLING","DONT SKIP","WAIT FOR IT","MIND BLOWN","YOU WONT BELIEVE","THE TRUTH","I WAS SHOCKED","GAME OVER","THIS IS CRAZY","MUST WATCH","TRY NOT TO LAUGH","ONLY 1% PASS"];
const SUBS=["Watch till the end...","Like & Subscribe!","Full video below","You need to see this","This went viral"];
const CTAS=["👀 WATCH NOW","▶ PLAY","🔥 CLICK HERE"];
const EMJS=["🔥","⚡","😱","💀","👀","🚀","🎯","💯","🤯","👆"];
const COLS=["#FF3B30","#FFD60A","#32D74B","#FF6B6B","#00D4FF","#FF9500","#BF5AF2","#FFFFFF"];

export default function ThumbnailGenerator({videoSrc,videoRef:extRef,onSelect,onClose}){
  const ir=useRef(null),vr=extRef||ir,cr=useRef(null),ecr=useRef(null);
  const [thumbs,setThumbs]=useState([]);
  const [sel,setSel]=useState(0);
  const [st,setSt]=useState("idle");
  const [up,setUp]=useState(false);
  const [tab,setTab]=useState("grid"); // grid | edit
  const origRef=useRef([]);
  const hdr=useRef(""), subr=useRef(""), ctar=useRef(""), emjr=useRef(""), colr=useRef("");
  const [headline,setHeadline]=useState(""); const [subtext,setSubtext]=useState(""); const [cta,setCta]=useState(""); const [emoji,setEmoji]=useState("🔥"); const [color,setColor]=useState("#FF3B30"); const [faceGlow,setFaceGlow]=useState(true); const [bgBlur,setBgBlur]=useState(false);

  const buildOne=useCallback((raw,opts={})=>{
    const hd=opts.headline||"STOP SCROLLING",sb=opts.subtext||"",ct=opts.cta||"",em=opts.emoji||"🔥",cl=opts.color||"#FF3B30",fg=opts.faceGlow!==false,bg=opts.bgBlur||false;
    const c=document.createElement("canvas");c.width=W;c.height=H;const ctx=c.getContext("2d");
    const src=document.createElement("canvas");src.width=raw.id.width;src.height=raw.id.height;src.getContext("2d").putImageData(raw.id,0,0);

    // Background blur
    if(bg){ctx.filter="blur(8px)";ctx.drawImage(src,0,0,W,H);ctx.filter="none";
      const grad=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W*0.55);grad.addColorStop(0,"rgba(0,0,0,0)");grad.addColorStop(1,"rgba(0,0,0,0.6)");ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);}

    // Face zoom
    const face=ff(raw.id.data,raw.id.width,raw.id.height);
    if(face&&face.w>60&&face.h>60){
      const px=face.w*0.55,py=face.h*0.45,sx=Math.max(0,face.x-px),sy=Math.max(0,face.y-py),sw=Math.min(raw.id.width-sx,face.w+px*2),sh=Math.min(raw.id.height-sy,face.h+py*2);
      ctx.drawImage(src,sx,sy,sw,sh,bg?W*0.1:0,bg?H*0.05:0,W-(bg?W*0.2:0),H-(bg?H*0.1:0));
      // Face glow outline
      if(fg&&!bg){ctx.save();ctx.strokeStyle=cl;ctx.lineWidth=6;ctx.shadowColor=cl;ctx.shadowBlur=24;ctx.beginPath();ctx.roundRect(W*0.15,H*0.08,W*0.7,H*0.75,20);ctx.stroke();ctx.restore();}
    }else ctx.drawImage(src,0,0,W,H);

    // Contrast boost
    const id=ctx.getImageData(0,0,W,H),d=id.data;
    for(let i=0;i<d.length;i+=4){d[i]=Math.min(255,(d[i]-128)*1.1+128);d[i+1]=Math.min(255,(d[i+1]-128)*1.1+128);d[i+2]=Math.min(255,(d[i+2]-128)*1.1+128);}
    ctx.putImageData(id,0,0);

    // Bottom gradient
    const g=ctx.createLinearGradient(0,H*0.38,0,H);g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(0,0,0,0.75)");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);

    // Top-left emoji
    ctx.font="72px serif";ctx.textAlign="left";ctx.fillText(em,40,90);
    // Top-right CTA
    if(ct){ctx.font='italic bold 36px "Arial Black",sans-serif';ctx.textAlign="right";ctx.fillStyle=cl;ctx.strokeStyle="#000";ctx.lineWidth=4;ctx.strokeText(ct,W-50,85);ctx.fillText(ct,W-50,85);}

    // Text stroke helper
    const txt=(t,x,y,mw,sz,co,ang=0)=>{
      ctx.save();ctx.translate(x,y);if(ang)ctx.rotate(ang*Math.PI/180);
      ctx.font='900 '+sz+'px Impact,"Arial Black",sans-serif';ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.shadowColor=co;ctx.shadowBlur=sz*0.35;
      ctx.strokeStyle="#000";ctx.lineWidth=sz*0.15;ctx.lineJoin="round";ctx.strokeText(t,0,0,mw);
      ctx.fillStyle=co;ctx.fillText(t,0,0,mw);ctx.restore();
    };

    // Main headline - big, bold, slight angle
    txt(hd,0,H-145,W-80,66,cl,-2);
    // Subtext below
    if(sb)txt(sb,10,H-70,W-160,30,"#FFFFFF",0);

    // Bottom-right play arrow
    ctx.strokeStyle=cl;ctx.lineWidth=5;ctx.beginPath();ctx.arc(W-60,H-55,34,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle=cl;ctx.font="bold 36px sans-serif";ctx.textAlign="center";ctx.fillText("▶",W-60,H-44);

    return c.toDataURL("image/jpeg",0.92);
  },[]);

  const regenerate=useCallback((rawFrames,opts)=>{
    const t=rawFrames.map((f,i)=>buildOne(f,{
      headline:opts.headline||HEADS[Math.floor(Math.random()*HEADS.length)],
      subtext:opts.subtext||SUBS[Math.floor(Math.random()*SUBS.length)],
      cta:opts.cta||CTAS[Math.floor(Math.random()*CTAS.length)],
      emoji:opts.emoji||EMJS[Math.floor(Math.random()*EMJS.length)],
      color:opts.color||COLS[Math.floor(Math.random()*COLS.length)],
      faceGlow:opts.faceGlow!==false,bgBlur:opts.bgBlur||false,
    }));
    return t.map((dataUrl,i)=>({dataUrl,time:rawFrames[i].time,score:rawFrames[i].score,headline:opts.headline||HEADS[i%HEADS.length],subtext:opts.subtext||SUBS[i%SUBS.length]}));
  },[buildOne]);

  const generate=useCallback(async(editMode)=>{
    const v=vr.current;if(!v)return;setSt("extracting");
    if(v.readyState<2)await new Promise(r=>{v.oncanplay=r;});
    const dur=v.duration||60,pts=[];
    for(let i=0;i<10;i++)pts.push(rnd(dur*0.08,dur*0.92));pts.sort((a,b)=>a-b);
    const off=document.createElement("canvas"),ox=off.getContext("2d",{willReadFrequently:true});
    const sc=[];for(const t of pts){v.currentTime=t;await new Promise(r=>{v.onseeked=r;});await new Promise(r=>setTimeout(r,30));off.width=v.videoWidth||W;off.height=v.videoHeight||H;ox.drawImage(v,0,0,off.width,off.height);const id=ox.getImageData(0,0,off.width,off.height);sc.push({time:Math.round(t*10)/10,score:Math.round(vrn(id.data)/80+skn(id.data)*50+rnd(0,10)),id});}
    sc.sort((a,b)=>b.score-a.score);const top=sc.slice(0,6);origRef.current=top;
    const opts=editMode?{headline,subtext,cta,emoji,color,faceGlow,bgBlur}:{};
    const r=regenerate(top,opts);
    setThumbs(r);setSel(0);setSt("ready");if(editMode)setTab("grid");
  },[vr,regenerate,headline,subtext,cta,emoji,color,faceGlow,bgBlur]);

  useEffect(()=>{if(thumbs.length&&cr.current){const img=new Image();img.onload=()=>{cr.current.width=W;cr.current.height=H;cr.current.getContext("2d").drawImage(img,0,0);};img.src=thumbs[sel]?.dataUrl;}},[sel,thumbs]);
  useEffect(()=>{if(tab!=="edit"||!ecr.current||!origRef.current.length)return;const raw=origRef.current[0];if(!raw)return;const du=buildOne(raw,{headline,subtext,cta,emoji,color,faceGlow,bgBlur});const img=new Image();img.onload=()=>{ecr.current.width=W;ecr.current.height=H;ecr.current.getContext("2d").drawImage(img,0,0);};img.src=du;} ,[tab,headline,subtext,cta,emoji,color,faceGlow,bgBlur,buildOne]);

  const enterEdit=()=>{const t=thumbs[sel];if(!t)return;setHeadline(t.headline||"");setSubtext(t.subtext||"");setCta(CTAS[0]);setEmoji(t.emoji||"🔥");setColor(t.color||"#FF3B30");hdr.current=t.headline;subr.current=t.subtext;ctar.current=CTAS[0];emjr.current=t.emoji||"🔥";colr.current=t.color||"#FF3B30";setTab("edit");};

  const applyEdit=()=>{if(!origRef.current.length)return;const r=regenerate(origRef.current,{headline,subtext,cta,emoji,color,faceGlow,bgBlur});setThumbs(r);setSel(0);setTab("grid");};
  const dl=t=>{const a=document.createElement("a");a.download="thumbnail-"+Date.now()+".jpg";a.href=t.dataUrl;a.click();};
  const save=async()=>{const t=thumbs[sel];if(!t)return;setUp(true);try{const b=await(await fetch(t.dataUrl)).blob();const a=getAuth();const u=a.currentUser?.uid||"anon";const sref=ref(storage,"thumbnails/"+u+"/"+Date.now()+".jpg");await uploadBytes(sref,b,{contentType:"image/jpeg"});const url=await getDownloadURL(sref);onSelect?.({dataUrl:t.dataUrl,storageUrl:url,text:t.headline,time:t.time});}catch(e){console.warn(e);}finally{setUp(false);}};

  if(tab==="edit")return(<div className="tg-overlay" onClick={onClose}><div className="tg-panel" onClick={e=>e.stopPropagation()}>
    <div className="tg-header"><h2>✏️ Customize Thumbnail</h2><p>Make it yours. Chaos encouraged.</p></div>
    <div className="tg-edit-layout">
      <div className="tg-edit-preview"><canvas ref={ecr} className="tg-preview-canvas" style={{maxHeight:380}}/></div>
      <div className="tg-edit-controls">
        <label>HEADLINE</label><input className="tg-input" value={headline} onChange={e=>setHeadline(e.target.value.toUpperCase())} placeholder="STOP SCROLLING" maxLength={30}/>
        <label>SUBTEXT</label><input className="tg-input" value={subtext} onChange={e=>setSubtext(e.target.value)} placeholder="Watch till the end..." maxLength={40}/>
        <label>CALL TO ACTION</label><input className="tg-input" value={cta} onChange={e=>setCta(e.target.value)} placeholder="👀 WATCH NOW" maxLength={20}/>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <div><label>EMOJI</label><div className="tg-chip-row">{EMJS.map(e=><button key={e} className={"tg-chip"+(emoji===e?" tg-chip-on":"")} onClick={()=>setEmoji(e)}>{e}</button>)}</div></div>
          <div><label>COLOR</label><div className="tg-chip-row">{COLS.map(c=><button key={c} className={"tg-chip tg-chip-color"+(color===c?" tg-chip-on":"")} style={{background:c}} onClick={()=>setColor(c)}>{color===c?"✓":""}</button>)}</div></div>
        </div>
        <div style={{display:"flex",gap:16,marginTop:8}}>
          <label style={{color:"#a78bfa",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><input type="checkbox" checked={faceGlow} onChange={e=>setFaceGlow(e.target.checked)}/>Face Glow</label>
          <label style={{color:"#a78bfa",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><input type="checkbox" checked={bgBlur} onChange={e=>setBgBlur(e.target.checked)}/>BG Blur</label>
        </div>
        <div style={{display:"flex",gap:10,marginTop:14}}>
          <button className="tg-btn tg-btn-primary" onClick={applyEdit}>✨ Apply & Generate 6</button>
          <button className="tg-btn tg-btn-outline" onClick={()=>setTab("grid")}>← Back</button>
        </div>
      </div>
    </div>
    <button className="tg-close" onClick={onClose}>✕</button>
  </div></div>);

  // --- grid view ---
  return(<div className="tg-overlay" onClick={onClose}><div className="tg-panel" onClick={e=>e.stopPropagation()}>
    <div className="tg-header"><h2>🎬 Thumbnail Studio</h2><p>AI-powered. Face zoom. Glow text. Clickbait style.</p>
      <div className="tg-header-actions">
        {st==="idle"&&<button className="tg-btn tg-btn-primary" onClick={()=>generate(false)}>⚡ Generate Thumbnails</button>}
        {st==="extracting"&&<button className="tg-btn tg-btn-primary" disabled>⏳ AI analyzing your video...</button>}
        {st==="ready"&&<>
          <button className="tg-btn tg-btn-outline" onClick={()=>generate(false)}>🔄 New Frames</button>
          <button className="tg-btn tg-btn-outline" onClick={()=>{if(origRef.current.length)setThumbs(regenerate(origRef.current,{}));}}>🎲 Remix All</button>
          <button className="tg-btn tg-btn-outline" onClick={enterEdit} style={{borderColor:"#FFD60A",color:"#FFD60A"}}>✏️ Customize</button>
          <button className="tg-btn tg-btn-primary" onClick={save} disabled={up}>{up?"⏳...":"✅ Use This"}</button>
        </>}
      </div>
    </div>
    {st==="ready"&&thumbs.length>0&&<>
      <div className="tg-preview-section"><canvas ref={cr} className="tg-preview-canvas"/></div>
      <div className="tg-grid-label">Tap to select · Edit to customize · Download to save</div>
      <div className="tg-grid">
        {thumbs.map((t,i)=>(<div key={i} className={"tg-card"+(i===sel?" tg-card-selected":"")} onClick={()=>setSel(i)}>
          <img src={t.dataUrl} alt={"Frame "+t.time+"s"} className="tg-card-img"/>
          <div className="tg-card-overlay"><span className="tg-card-emoji">{t.emoji||"🔥"}</span><span className="tg-card-score">Score {t.score}</span></div>
          <button className="tg-card-dl" onClick={e=>{e.stopPropagation();dl(t);}}>⬇</button>
        </div>))}
      </div>
    </>}
    <button className="tg-close" onClick={onClose}>✕</button>
  </div>
  {videoSrc&&<video ref={ir} src={videoSrc} style={{position:"fixed",opacity:0,pointerEvents:"none",width:1,height:1}} crossOrigin="anonymous" preload="auto"/>}
  </div>);
}
