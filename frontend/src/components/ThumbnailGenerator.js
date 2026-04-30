import React,{useState,useRef,useCallback,useEffect}from"react";
import{getAuth}from"firebase/auth";
import{storage}from"../firebaseClient";
import{ref,uploadBytes,getDownloadURL}from"firebase/storage";
import"./ThumbnailGenerator.css";

const W=1280,H=720,SW=1080,SH=1920;
function vrn(d){let s=0,s2=0;for(let i=0;i<d.length;i+=4){const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];s+=g;s2+=g*g}const m=s/(d.length/4);return s2/(d.length/4)-m*m}
function skn(d){let c=0;for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];if(r>95&&g>40&&b>20&&Math.max(r,g,b)-Math.min(r,g,b)>15&&Math.abs(r-g)>15&&r>g&&r>b)c++}return c/(d.length/4)}
function rnd(a,b){return a+Math.random()*(b-a)}
function ff(d,w,h){let mx=w,Mx=0,my=h,My=0,c=0;for(let y=0;y<h;y+=4)for(let x=0;x<w;x+=4){const i=(y*w+x)*4;if(d[i]>95&&d[i+1]>40&&d[i+2]>20&&Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2])>15&&Math.abs(d[i]-d[i+1])>15&&d[i]>d[i+1]&&d[i]>d[i+2]){mx=Math.min(mx,x);Mx=Math.max(Mx,x);my=Math.min(my,y);My=Math.max(My,y);c++}}return c>100?{x:mx,y:my,w:Mx-mx+30,h:My-my+30}:null}

const HEADS=["STOP SCROLLING","DONT SKIP","WAIT FOR IT","MIND BLOWN","YOU WONT BELIEVE","THE TRUTH","I WAS SHOCKED","GAME OVER","THIS IS CRAZY","MUST WATCH"];
const SUBS=["Watch till the end...","Like & Subscribe!","Full video below","You need to see this","Only 1% will understand"];
const COLS=["#FF3B30","#FFD60A","#32D74B","#FF6B6B","#00D4FF","#FF9500","#BF5AF2","#FFFFFF"];
const ALL_EMOJIS=["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","😟","🙁","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠","💩","🤡","👹","👺","👻","👽","👾","🤖","😺","😸","😹","😻","😼","😽","🙀","😿","😾","🔥","⚡","💥","💯","💢","💨","💦","💤","🕳","🎉","🎊","🎈","✨","🎯","🎃","🎄","🧨","🎆","🎇","🧸"];

function drawTxt(ctx,t,x,y,mw,sz,clr,ang=0,al="center"){
  ctx.save();ctx.translate(x,y);if(ang)ctx.rotate(ang*Math.PI/180);
  ctx.font='900 '+sz+'px Impact,"Arial Black",sans-serif';ctx.textAlign=al;ctx.textBaseline="middle";
  ctx.shadowColor=clr;ctx.shadowBlur=sz*0.35;
  ctx.strokeStyle="#000";ctx.lineWidth=Math.max(3,sz*0.15);ctx.lineJoin="round";ctx.strokeText(t,0,0,mw);
  ctx.fillStyle=clr;ctx.fillText(t,0,0,mw);ctx.restore();
}
function boostContrast(ctx,ww,hh){
  const id=ctx.getImageData(0,0,ww,hh),d=id.data;
  for(let i=0;i<d.length;i+=4){d[i]=Math.min(255,(d[i]-128)*1.12+128);d[i+1]=Math.min(255,(d[i+1]-128)*1.12+128);d[i+2]=Math.min(255,(d[i+2]-128)*1.12+128)}
  ctx.putImageData(id,0,0);
}
function darkGrad(ctx,topPct,hgt){const g=ctx.createLinearGradient(0,hgt*topPct,0,hgt);g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(0,0,0,0.75)");ctx.fillStyle=g;ctx.fillRect(0,0,W,hgt);}
function drawContain(ctx,src,dw,dh,bg="#000"){const sw=src.width||dw,sh=src.height||dh;ctx.fillStyle=bg;ctx.fillRect(0,0,dw,dh);const s=Math.min(dw/sw,dh/sh);const tw=sw*s,th=sh*s;const dx=(dw-tw)/2,dy=(dh-th)/2;ctx.drawImage(src,0,0,sw,sh,dx,dy,tw,th);return{dx,dy,tw,th,s};}
function drawFaceSafeContain(ctx,src,raw,w,h,bg="#000"){const face=ff(raw.id.data,raw.id.width,raw.id.height);if(!face)return drawContain(ctx,src,w,h,bg);const cx=face.x+face.w/2,cy=face.y+face.h/2;const padX=Math.max(face.w*0.35,raw.id.width*0.08),padY=Math.max(face.h*0.35,raw.id.height*0.08);const sx=Math.max(0,cx-face.w/2-padX),sy=Math.max(0,cy-face.h/2-padY),sw=Math.min(raw.id.width-sx,face.w+padX*2),sh=Math.min(raw.id.height-sy,face.h+padY*2);const crop=document.createElement("canvas");crop.width=Math.max(8,Math.round(sw));crop.height=Math.max(8,Math.round(sh));crop.getContext("2d").drawImage(src,sx,sy,sw,sh,0,0,crop.width,crop.height);return drawContain(ctx,crop,w,h,bg);}

const TEMPLATES={
  classic:{
    name:"Classic",icon:"🎬",
    render(raw,opts){
      const{headline,subtext,color,emoji,tx,ty}=opts;const c=document.createElement("canvas");c.width=W;c.height=H;const ctx=c.getContext("2d");
      const src=document.createElement("canvas");src.width=raw.id.width;src.height=raw.id.height;src.getContext("2d").putImageData(raw.id,0,0);
      drawFaceSafeContain(ctx,src,raw,W,H,"#000");
      boostContrast(ctx,W,H);darkGrad(ctx,0.35,H);
      ctx.font="68px serif";ctx.textAlign="left";ctx.fillText(emoji,44,80);
      const hx=tx||W/2,hy=ty||H-140;drawTxt(ctx,headline,hx,hy,W-80,62,color,-1);
      drawTxt(ctx,subtext,hx+5,hy+68,W-200,28,"#FFFFFF");
      ctx.strokeStyle=color;ctx.lineWidth=5;ctx.beginPath();ctx.arc(W-56,H-58,30,0,Math.PI*2);ctx.stroke();ctx.fillStyle=color;ctx.font="bold 30px sans-serif";ctx.textAlign="center";ctx.fillText("▶",W-56,H-48);
      return c.toDataURL("image/jpeg",0.92);
    }
  },
  podcast:{
    name:"Podcast",icon:"🎙️",
    render(raw,opts){
      const{headline,subtext,color,tx,ty}=opts;const c=document.createElement("canvas");c.width=W;c.height=H;const ctx=c.getContext("2d");
      ctx.fillStyle="#0a0a0f";ctx.fillRect(0,0,W,H);
      ctx.strokeStyle=color;ctx.lineWidth=2;
      for(let i=0;i<12;i++){const h=30+rnd(20,80);ctx.beginPath();ctx.moveTo(80+i*95,100);ctx.lineTo(80+i*95,100+h);ctx.stroke();}
      const src=document.createElement("canvas");src.width=raw.id.width;src.height=raw.id.height;src.getContext("2d").putImageData(raw.id,0,0);
      const face=ff(raw.id.data,raw.id.width,raw.id.height);
      const bx=60,by=180,bw=340,bh=340;
      ctx.save();ctx.beginPath();ctx.roundRect(bx,by,bw,bh,20);ctx.clip();
      if(face){const cx=face.x+face.w/2,cy=face.y+face.h/2;const side=Math.max(face.w,face.h)*1.9;const sx=Math.max(0,cx-side/2),sy=Math.max(0,cy-side/2);const sw=Math.min(raw.id.width-sx,side),sh=Math.min(raw.id.height-sy,side);const crop=document.createElement("canvas");crop.width=Math.max(8,Math.round(sw));crop.height=Math.max(8,Math.round(sh));crop.getContext("2d").drawImage(src,sx,sy,sw,sh,0,0,crop.width,crop.height);drawContain(ctx,crop,bw,bh,"#101018");}
      else{drawContain(ctx,src,bw,bh,"#101018");}
      ctx.restore();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(bx,by,bw,bh,20);ctx.stroke();
      ctx.strokeStyle="rgba(255,255,255,0.12)";ctx.lineWidth=2;ctx.setLineDash([8,4]);ctx.beginPath();ctx.roundRect(440,220,300,300,20);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="rgba(255,255,255,0.04)";ctx.fill();ctx.font="48px serif";ctx.textAlign="center";ctx.fillText("🎙️",590,380);
      drawTxt(ctx,"NEW",870,250,200,44,color,0,"center");drawTxt(ctx,"EPISODE",870,305,200,36,color,0,"center");
      ctx.fillStyle="rgba(0,0,0,0.6)";ctx.fillRect(0,H-200,W,200);
      drawTxt(ctx,headline,tx||W/2,ty||H-120,W-60,52,color,-1);
      drawTxt(ctx,subtext,(tx||W/2)+5,(ty||H-120)+70,W-300,26,"#FFFFFF");
      return c.toDataURL("image/jpeg",0.92);
    }
  },
  reaction:{
    name:"Reaction",icon:"😱",
    render(raw,opts){
      const{headline,color,emoji,tx,ty}=opts;const c=document.createElement("canvas");c.width=W;c.height=H;const ctx=c.getContext("2d");
      const src=document.createElement("canvas");src.width=raw.id.width;src.height=raw.id.height;src.getContext("2d").putImageData(raw.id,0,0);
      ctx.fillStyle="#0a0a10";ctx.fillRect(0,0,W,H);
      drawFaceSafeContain(ctx,src,raw,W,H,"#0a0a10");
      boostContrast(ctx,W,H);darkGrad(ctx,0.5,H);
      ctx.save();ctx.globalAlpha=0.35;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(W-320,20,280,180,10);ctx.stroke();ctx.restore();
      ctx.globalAlpha=0.9;ctx.drawImage(src,0,0,raw.id.width,raw.id.height,W-315,25,270,170);ctx.globalAlpha=1;
      drawTxt(ctx,headline,tx||80,ty||H-160,W-500,58,color,-2,"left");
      ctx.font="64px serif";ctx.textAlign="left";ctx.fillText(emoji,40,70);
      return c.toDataURL("image/jpeg",0.92);
    }
  },
  shorts:{
    name:"Shorts",icon:"📱",
    render(raw,opts){
      const{headline,subtext,color,emoji,tx,ty}=opts;const c=document.createElement("canvas");c.width=SW;c.height=SH;const ctx=c.getContext("2d");
      const src=document.createElement("canvas");src.width=raw.id.width;src.height=raw.id.height;src.getContext("2d").putImageData(raw.id,0,0);
      drawFaceSafeContain(ctx,src,raw,SW,SH,"#000");
      boostContrast(ctx,SW,SH);
      const g=ctx.createLinearGradient(0,0,0,SH);g.addColorStop(0,"rgba(0,0,0,0.35)");g.addColorStop(0.3,"rgba(0,0,0,0)");g.addColorStop(0.7,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(0,0,0,0.45)");ctx.fillStyle=g;ctx.fillRect(0,0,SW,SH);
      drawTxt(ctx,headline,tx||SW/2,ty||220,SW-80,64,color,-2);
      drawTxt(ctx,subtext,SW/2,SH-240,SW-120,32,"#FFFFFF");
      drawTxt(ctx,"👇 WATCH NOW",SW/2,SH-100,SW-200,36,color);
      ctx.font="72px serif";ctx.textAlign="center";ctx.fillText(emoji,SW/2,330);
      return c.toDataURL("image/jpeg",0.92);
    }
  },
  bold:{
    name:"Bold Text",icon:"💥",
    render(raw,opts){
      const{headline,color,tx,ty}=opts;const c=document.createElement("canvas");c.width=W;c.height=H;const ctx=c.getContext("2d");
      const src=document.createElement("canvas");src.width=raw.id.width;src.height=raw.id.height;src.getContext("2d").putImageData(raw.id,0,0);
      ctx.filter="blur(12px) brightness(0.4)";ctx.drawImage(src,0,0,W,H);ctx.filter="none";
      drawTxt(ctx,headline,tx||W/2,ty||H/2-20,W-100,96,color);
      return c.toDataURL("image/jpeg",0.92);
    }
  },
  collage:{
    name:"Collage",icon:"🖼️",
    render(rawArr,opts){
      const{headline,color,tx,ty}=opts;const c=document.createElement("canvas");c.width=W;c.height=H;const ctx=c.getContext("2d");
      const frames=Array.isArray(rawArr)?rawArr.slice(0,6):[rawArr];
      const srcs=frames.map(f=>{const sc=document.createElement("canvas");sc.width=f.id.width;sc.height=f.id.height;sc.getContext("2d").putImageData(f.id,0,0);return sc});
      const pw=W/3;for(let i=0;i<3;i++){if(srcs[i])ctx.drawImage(srcs[i],i*pw,0,pw,H)}
      boostContrast(ctx,W,H);
      ctx.fillStyle="rgba(0,0,0,0.55)";ctx.fillRect(0,0,W,H);
      ctx.fillStyle="rgba(0,0,0,0.8)";ctx.fillRect(0,H-200,W,200);
      drawTxt(ctx,headline,tx||W/2,ty||H-120,W-80,56,color,-2);
      ctx.font="bold 24px sans-serif";ctx.textAlign="center";ctx.fillStyle="#FFF";ctx.fillText("SWIPE →",W/2,H-45);
      return c.toDataURL("image/jpeg",0.92);
    }
  }
};
const TMPL_IDS=["classic","podcast","reaction","shorts","bold","collage"];

export default function ThumbnailGenerator({videoSrc,videoRef:extRef,onSelect,onClose}){
  const ir=useRef(null),vr=extRef||ir,cr=useRef(null),ecr=useRef(null);
  const [thumbs,setThumbs]=useState([]);const [sel,setSel]=useState(0);const [st,setSt]=useState("idle");const [up,setUp]=useState(false);const [tab,setTab]=useState("grid");
  const origRef=useRef([]);
  const [headline,setHeadline]=useState("STOP SCROLLING");const [subtext,setSubtext]=useState("");const [color,setColor]=useState("#FF3B30");const [emoji,setEmoji]=useState("🔥");const [template,setTemplate]=useState("classic");
  const [textX,setTextX]=useState(W/2);const [textY,setTextY]=useState(H-140);
  const [scrubTime,setScrubTime]=useState(0);const dragging=useRef(false);

  const buildThumbs=useCallback((rawFrames,opts)=>{
    const tmpl=TEMPLATES[opts.template||"classic"];
    return rawFrames.map((f,i)=>({dataUrl:opts.template==="collage"?tmpl.render(rawFrames,opts):tmpl.render(f,opts),time:f.time,score:f.score,template:opts.template||"classic"}));
  },[]);

  const generate=useCallback(async()=>{
    const v=vr.current;if(!v)return;setSt("extracting");
    if(v.readyState<2)await new Promise(r=>{v.oncanplay=r});
    const dur=v.duration||60,pts=[];
    for(let i=0;i<10;i++)pts.push(rnd(dur*0.08,dur*0.92));pts.sort((a,b)=>a-b);
    const off=document.createElement("canvas"),ox=off.getContext("2d",{willReadFrequently:true});
    const sc=[];for(const t of pts){v.currentTime=t;await new Promise(r=>{v.onseeked=r});await new Promise(r=>setTimeout(r,30));off.width=v.videoWidth||W;off.height=v.videoHeight||H;ox.drawImage(v,0,0,off.width,off.height);const id=ox.getImageData(0,0,off.width,off.height);sc.push({time:Math.round(t*10)/10,score:Math.round(vrn(id.data)/80+skn(id.data)*50+rnd(0,10)),id});}
    sc.sort((a,b)=>b.score-a.score);const top=sc.slice(0,6);origRef.current=top;
    setThumbs(buildThumbs(top,{headline,subtext,color,emoji,template,tx:textX,ty:textY}));
    setSel(0);setScrubTime(top[0].time);setSt("ready");
  },[vr,buildThumbs,headline,subtext,color,emoji,template,textX,textY]);

  const remix=useCallback(()=>{if(!origRef.current.length)return;setThumbs(buildThumbs(origRef.current,{headline:HEADS[Math.floor(Math.random()*HEADS.length)],subtext:SUBS[Math.floor(Math.random()*SUBS.length)],color:COLS[Math.floor(Math.random()*COLS.length)],emoji:ALL_EMOJIS[Math.floor(Math.random()*ALL_EMOJIS.length)],template,tx:textX,ty:textY}));setSel(0)},[buildThumbs,template,textX,textY]);

  useEffect(()=>{if(thumbs.length&&cr.current){const img=new Image();img.onload=()=>{cr.current.width=W;cr.current.height=H;cr.current.getContext("2d").drawImage(img,0,0)};img.src=thumbs[sel]?.dataUrl}},[sel,thumbs]);

  // Live edit preview
  const editPreview=useCallback(()=>{
    if(!ecr.current||!origRef.current.length)return;
    const v=vr.current;if(!v||v.readyState<2)return;
    v.currentTime=scrubTime;
    const check=()=>{
      const off=document.createElement("canvas");off.width=v.videoWidth||W;off.height=v.videoHeight||H;const ox=off.getContext("2d");ox.drawImage(v,0,0,off.width,off.height);
      const raw={id:ox.getImageData(0,0,off.width,off.height),time:scrubTime,score:50};
      const tmpl=TEMPLATES[template];const du=tmpl.render(raw,{headline,subtext,color,emoji,tx:textX,ty:textY});
      const img=new Image();img.onload=()=>{ecr.current.width=W;ecr.current.height=H;ecr.current.getContext("2d").drawImage(img,0,0)};img.src=du;
    };
    v.onseeked=check;if(Math.abs(v.currentTime-scrubTime)<0.1)check();
  },[scrubTime,headline,subtext,color,emoji,template,textX,textY,vr]);

  useEffect(()=>{if(tab==="edit")editPreview()},[tab,scrubTime,headline,subtext,color,emoji,template,textX,textY,editPreview]);

  // Canvas drag for text positioning
  const handleCanvasDown=e=>{dragging.current=true};
  const handleCanvasMove=e=>{if(!dragging.current||!ecr.current)return;const rect=ecr.current.getBoundingClientRect();const scaleX=W/rect.width,scaleY=H/rect.height;setTextX(Math.round((e.clientX-rect.left)*scaleX));setTextY(Math.round((e.clientY-rect.top)*scaleY))};
  const handleCanvasUp=()=>{dragging.current=false};

  const enterEdit=()=>{setHeadline(thumbs[sel]?.headline||HEADS[0]);setSubtext(thumbs[sel]?.subtext||SUBS[0]);setColor(COLS[0]);setEmoji(thumbs[sel]?.emoji||"🔥");setTemplate(thumbs[sel]?.template||"classic");setScrubTime(thumbs[sel]?.time||0);setTextX(W/2);setTextY(H-140);setTab("edit")};
  const applyEdit=()=>{if(!origRef.current.length)return;setThumbs(buildThumbs(origRef.current,{headline,subtext,color,emoji,template,tx:textX,ty:textY}));setSel(0);setTab("grid")};
  const dl=t=>{const a=document.createElement("a");a.download="thumbnail-"+Date.now()+".jpg";a.href=t.dataUrl;a.click()};
  const save=async()=>{const t=thumbs[sel];if(!t)return;setUp(true);try{const b=await(await fetch(t.dataUrl)).blob();const a=getAuth();const u=a.currentUser?.uid||"anon";const sref=ref(storage,"thumbnails/"+u+"/"+Date.now()+".jpg");await uploadBytes(sref,b,{contentType:"image/jpeg"});const url=await getDownloadURL(sref);onSelect?.({dataUrl:t.dataUrl,storageUrl:url,text:headline,time:t.time})}catch(e){console.warn(e)}finally{setUp(false)}}

  if(tab==="edit")return(<div className="tg-overlay" onClick={onClose}><div className="tg-panel" onClick={e=>e.stopPropagation()}>
    <div className="tg-header"><h2>✏️ Customize Thumbnail</h2><p>Scrub to pick a frame. Drag text to reposition. Make it yours.</p></div>
    <div className="tg-edit-layout">
      <div className="tg-edit-preview">
        <canvas ref={ecr} className="tg-preview-canvas" style={{maxHeight:360,cursor:"crosshair"}} onMouseDown={handleCanvasDown} onMouseMove={handleCanvasMove} onMouseUp={handleCanvasUp} onMouseLeave={handleCanvasUp}/>
        <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:"#7868a0",fontSize:11,whiteSpace:"nowrap"}}>Frame: {scrubTime.toFixed(1)}s</span>
          <input type="range" min={0} max={((vr.current?.duration)||60)} step={0.1} value={scrubTime} onChange={e=>setScrubTime(parseFloat(e.target.value))} style={{flex:1,accentColor:"#a78bfa"}}/>
        </div>
        <p style={{color:"#7868a0",fontSize:10,textAlign:"center",margin:"8px 0 0"}}>🖱️ Drag text on the preview to reposition it</p>
      </div>
      <div className="tg-edit-controls">
        <label>TEMPLATE</label>
        <div className="tg-chip-row">{TMPL_IDS.map(id=>(<button key={id} className={"tg-chip"+(template===id?" tg-chip-on":"")} onClick={()=>setTemplate(id)} title={TEMPLATES[id].desc}>{TEMPLATES[id].icon} {TEMPLATES[id].name}</button>))}</div>
        <label>HEADLINE</label><input className="tg-input" value={headline} onChange={e=>setHeadline(e.target.value.toUpperCase())} placeholder="STOP SCROLLING" maxLength={25}/>
        <label>SUBTEXT</label><input className="tg-input" value={subtext} onChange={e=>setSubtext(e.target.value)} placeholder="Watch till the end..." maxLength={35}/>
        <label>COLOR</label><div className="tg-chip-row">{COLS.map(c=><button key={c} className={"tg-chip tg-chip-color"+(color===c?" tg-chip-on":"")} style={{background:c}} onClick={()=>setColor(c)}>{color===c?"✓":""}</button>)}</div>
        <label>EMOJI — pick one ({ALL_EMOJIS.length} options)</label>
        <div className="tg-emoji-grid">{ALL_EMOJIS.map((e,i)=><button key={i} className={"tg-chip"+(emoji===e?" tg-chip-on":"")} onClick={()=>setEmoji(e)} style={{fontSize:20,minWidth:36,height:36,padding:2}}>{e}</button>)}</div>
        <div style={{display:"flex",gap:10,marginTop:14}}><button className="tg-btn tg-btn-primary" onClick={applyEdit}>✨ Generate 6</button><button className="tg-btn tg-btn-outline" onClick={()=>setTab("grid")}>← Back</button></div>
      </div>
    </div>
    <button className="tg-close" onClick={onClose}>✕</button>
  </div></div>);

  return(<div className="tg-overlay" onClick={onClose}><div className="tg-panel" onClick={e=>e.stopPropagation()}>
    <div className="tg-header"><h2>🎬 Thumbnail Studio</h2><p>6 templates · Drag text · Pick frames · Full emoji library</p>
      <div className="tg-header-actions">
        {st==="idle"&&<button className="tg-btn tg-btn-primary" onClick={generate}>⚡ Generate Thumbnails</button>}
        {st==="extracting"&&<button className="tg-btn tg-btn-primary" disabled>⏳ AI analyzing your video...</button>}
        {st==="ready"&&<><button className="tg-btn tg-btn-outline" onClick={generate}>🔄 New Frames</button><button className="tg-btn tg-btn-outline" onClick={remix}>🎲 Remix Text</button><button className="tg-btn tg-btn-outline" onClick={enterEdit} style={{borderColor:"#FFD60A",color:"#FFD60A"}}>✏️ Customize</button><button className="tg-btn tg-btn-primary" onClick={save} disabled={up}>{up?"⏳...":"✅ Use This"}</button></>}
      </div>
    </div>
    {st==="ready"&&thumbs.length>0&&<>
      <div className="tg-preview-section"><canvas ref={cr} className="tg-preview-canvas"/></div>
      <div className="tg-grid-label">{TEMPLATES[thumbs[sel]?.template]?.icon} {TEMPLATES[thumbs[sel]?.template]?.name} · {thumbs[sel]?.time}s · Score {thumbs[sel]?.score}</div>
      <div className="tg-grid">
        {thumbs.map((t,i)=>(<div key={i} className={"tg-card"+(i===sel?" tg-card-selected":"")} onClick={()=>setSel(i)}>
          <img src={t.dataUrl} alt={"Frame "+t.time+"s"} className="tg-card-img"/>
          <div className="tg-card-overlay"><span>{TEMPLATES[t.template]?.icon}</span><span className="tg-card-score">{t.score}</span></div>
          <button className="tg-card-dl" onClick={e=>{e.stopPropagation();dl(t)}}>⬇</button>
        </div>))}
      </div>
    </>}
    <button className="tg-close" onClick={onClose}>✕</button>
  </div>
  {videoSrc&&<video ref={ir} src={videoSrc} style={{position:"fixed",opacity:0,pointerEvents:"none",width:1,height:1}} crossOrigin="anonymous" preload="auto"/>}
  </div>);
}
