import StudioSourceGradeViewer from './StudioSourceGradeViewer';
import React, {useLayoutEffect,useRef} from 'react';
import {watchStudioProgrammeFrames} from './studioSourcePreview';
import {paintStudioNodeSurface} from './studioNodeEffects';
import {projectStudioCanvas} from './studioPerspective';

// Mirrors the ordinary programme's painted nodes, including their masks,
// perspective, text, groups and shared canvases. No schematic or second scene.
export default function StudioNodeSignalViewer({signal,videoRef,overlays,time,mapTime,finishFx,advancedColor,adjustmentLayers,mainTransform,motionKeyframes}) {
  const primary=['MediaIn:main-video','Transform:main-video','ColorCorrector:finish'].includes(signal.nodeId)||signal.nodeId.startsWith('Adjustment:');
  const hostRef=useRef(null),latest=useRef(null);latest.current={signal,overlays,time,mapTime};
  useLayoutEffect(()=>{
    const host=hostRef.current,clock=videoRef?.current;if(!host||primary)return undefined;
    let frame=0,disposed=false,copy=null,pairs=[],rebuild=true,signature='',variableKey='',variables=[],syncAll=true,rootKey='';
    const dirty=new WeakSet(),textDirty=new WeakSet();
    const source=document.querySelector('[data-testid="hook-preview-frame"]');
    let sourceWidth=0,sourceHeight=0,hostWidth=0,hostHeight=0,isolatedWidth=0,isolatedHeight=0;
    const measure=()=>{
      sourceWidth=source?.clientWidth||0;sourceHeight=source?.clientHeight||0;hostWidth=host.clientWidth;hostHeight=host.clientHeight;
      const id=latest.current.signal.isolatedLayerId,layer=id&&[...source?.querySelectorAll('[data-studio-layer-id]')||[]].find(n=>n.dataset.studioLayerId===id);
      isolatedWidth=layer?.clientWidth||0;isolatedHeight=layer?.clientHeight||0;
    };measure();
    const paint=()=>{
      if(disposed)return;const state=latest.current,source=document.querySelector('[data-testid="hook-preview-frame"]');if(!source)return;
      const w=sourceWidth,h=sourceHeight;if(!w||!h)return;
      const allowed=state.signal.includedOverlayIds,isolated=state.signal.isolatedLayerId;
      const nextSignature=JSON.stringify([allowed,isolated,state.signal.stage]);
      if(!copy||rebuild||signature!==nextSignature){
        copy=source.cloneNode(true);copy.removeAttribute('data-testid');copy.classList.add('ap-flow-native-signal');
        const originals=[...source.querySelectorAll('*')],clones=[...copy.querySelectorAll('*')];
        pairs=originals.map((original,i)=>({original,target:clones[i]}));
        for(const el of copy.querySelectorAll('[id],[data-testid]')){if(el.dataset.testid==='studio-perspective-surface')el.dataset.nodeMirrorPlane='true';el.removeAttribute('id');el.removeAttribute('data-testid');}
        rebuild=false;signature=nextSignature;variableKey='';rootKey='';syncAll=true;
      }
      // Retain the mirror DOM while poses change. Recreating SVGs, decoders and
      // canvas backing stores on every frame competes with the programme.
      for(const pair of pairs){
        const {original,target}=pair;if(!copy.contains(target))continue;
        if(textDirty.has(original)){if(target.textContent!==original.textContent)target.textContent=original.textContent;textDirty.delete(original);}
        if(!syncAll&&!dirty.has(original))continue;
        for(const attr of original.attributes){
          if(['id','data-testid'].includes(attr.name)||(['CANVAS','VIDEO'].includes(original.tagName)&&['width','height'].includes(attr.name)))continue;
          if(target.getAttribute(attr.name)!==attr.value)target.setAttribute(attr.name,attr.value);
        }
        dirty.delete(original);
      }
      syncAll=false;
      const nextRootKey=JSON.stringify([source.style.cssText,w,h,hostWidth,hostHeight]);
      const nextVariableKey=JSON.stringify([w,h,source.style.cssText]);
      if(variableKey!==nextVariableKey){const computed=getComputedStyle(source);variables=[...computed].filter(name=>name.startsWith('--')).map(name=>[name,computed.getPropertyValue(name)]);variableKey=nextVariableKey;}
      if(rootKey!==nextRootKey){
        copy.style.cssText=source.style.cssText;copy.style.background='transparent';copy.style.boxShadow='none';
        const scale=Math.min(hostWidth/w,hostHeight/h);
        Object.assign(copy.style,{position:'absolute',inset:'0 auto auto 0',width:w+'px',height:h+'px',minWidth:w+'px',maxWidth:'none',margin:0,transformOrigin:'top left',transform:`scale(${scale})`,left:`${Math.max(0,(hostWidth-w*scale)/2)}px`,top:`${Math.max(0,(hostHeight-h*scale)/2)}px`,pointerEvents:'none'});
        for(const [name,value]of variables)copy.style.setProperty(name,value);
        rootKey=nextRootKey;
      }
      const programme=source.querySelector('[data-testid="studio-program-canvas"]');
      const programmeVisible=programme&&programme.style.display!=='none'&&programme.style.visibility!=='hidden';
      for(const pair of pairs){const src=pair.original,target=pair.target;if(!['CANVAS','VIDEO'].includes(src.tagName)||!copy.contains(target))continue;
        const owner=target.closest('[data-studio-layer-id]');
        // Discarded branches and the programme backing have no pixels in an
        // isolated signal. Avoid copying their full decoder surfaces first.
        if((owner&&allowed!=='all'&&!allowed?.includes(owner.dataset.studioLayerId))||(isolated&&!owner)){target.remove();continue;}
        const styleKey=src.style.cssText+'|'+src.getAttribute('class');
        if(pair.styleKey!==styleKey){const computed=getComputedStyle(src);pair.visibleStyle={display:computed.display,visibility:computed.visibility};pair.styleKey=styleKey;}
        const visible=pair.visibleStyle;
        if((programmeVisible&&src.matches('video.studio-video'))||visible.display==='none'||visible.visibility==='hidden'){target.style.display='none';continue;}
        let canvas=target;
        if(target.tagName!=='CANVAS'){canvas=document.createElement('canvas');canvas.className=target.className;canvas.style.cssText=target.style.cssText;for(const a of target.attributes)if(a.name.startsWith('data-'))canvas.setAttribute(a.name,a.value);target.replaceWith(canvas);pair.target=canvas;}
        const width=src.videoWidth||src.width||w,height=src.videoHeight||src.height||h;
        if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
        const pixels=[width,height,src.dataset.pixelRevision||src.dataset.sourceTime||src.dataset.programmeTime||src.currentTime,src.dataset.sourceContentHash||src.currentSrc];
        const samePixels=pixels[2]!==undefined&&pair.pixels&&pixels.every((value,index)=>Object.is(value,pair.pixels[index]));
        try{if(!samePixels&&(src.tagName==='CANVAS'||src.readyState>=2)){canvas.getContext('2d').drawImage(src,0,0,width,height);pair.pixels=pixels;}}catch(error){host.dataset.nodeViewerError=error.message;}
      }
      for(const layer of copy.querySelectorAll('[data-studio-layer-id]')){
        const id=layer.dataset.studioLayerId;
        if(allowed!=='all'&&!allowed?.includes(id)){layer.remove();continue;}
        if(isolated===id){layer.style.visibility='visible';const model=state.overlays.find(o=>String(o.id)===id),kind=state.signal.nodeId.split(':')[0];
          if(['MediaIn','Transform','CornerPin','ChromaKeyer','PolygonMask'].includes(kind)){
            const original=[...source.querySelectorAll('[data-studio-layer-id]')].find(n=>n.dataset.studioLayerId===id);
            const media=original?.querySelector('img')||original?.querySelector('[data-studio-overlay-decoder]');
            const shared=original?.querySelector('[data-studio-shared-video]');const picture=shared?.dataset.sourceTime!==undefined?shared:media;
            if(model&&picture&&(picture.tagName!=='VIDEO'||picture.readyState>=2)){
              const c=layer.querySelector('[data-node-isolated-media]')||document.createElement('canvas');c.dataset.nodeIsolatedMedia='true';
              const width=Math.max(2,isolatedWidth),height=Math.max(2,isolatedHeight);
              if(c.width!==width)c.width=width;if(c.height!==height)c.height=height;
              const branch={...model,chromaKey:kind==='MediaIn'?{enabled:false}:model.chromaKey,opticalFx:{},displacementWarp:{enabled:false},dofBlur:0};
              const staticKey=picture.tagName==='IMG'?JSON.stringify([picture.currentSrc||picture.src,picture.naturalWidth,branch,width,height,h,kind]):null;
              try{if(!staticKey||c.__studioBranchKey!==staticKey){paintStudioNodeSurface(c,picture,branch,state.mapTime?state.mapTime(clock?.currentTime||0):state.time,h);
                  if(kind==='CornerPin'&&model.perspective)projectStudioCanvas(c,model.perspective,model.perspectiveProgress??100);
                  if(kind==='ChromaKeyer'){const ctx=c.getContext('2d'),p=ctx.getImageData(0,0,c.width,c.height);for(let i=0;i<p.data.length;i+=4)p.data[i]=p.data[i+1]=p.data[i+2]=255;ctx.putImageData(p,0,0);}c.__studioBranchKey=staticKey;}
                const raw=layer.querySelector('img')||layer.querySelector('[data-studio-overlay-decoder]'),mediaStyle=media?.style.cssText||'';if(c.__studioMediaStyle!==mediaStyle){c.style.cssText=mediaStyle;c.style.visibility='visible';c.__studioMediaStyle=mediaStyle;}if(raw)raw.replaceWith(c);layer.querySelector('[data-studio-node-effect-surface]')?.remove();layer.querySelector('[data-studio-shared-video]')?.remove();
              }catch(error){host.dataset.nodeViewerError=error.message;}
            }
            layer.style.filter='none';if(kind!=='PolygonMask'){layer.style.clipPath='none';layer.style.maskImage='none';layer.style.webkitMaskImage='none';}
            if(kind==='MediaIn'){layer.style.transform='translate(-50%,-50%)';layer.style.left='50%';layer.style.top='50%';layer.style.opacity='1';}
            if(!['CornerPin','PolygonMask'].includes(kind)||model?.perspective){const plane=layer.querySelector('[data-node-mirror-plane]');if(plane)plane.style.transform='none';}
          }
        }
      }
      // Branch monitors have a transparent checkerboard behind their own pixels.
      if(isolated||state.signal.stage==='subject_matte')for(const el of copy.querySelectorAll('.studio-video,[data-testid="studio-program-canvas"],.main-frame-background'))el.remove();
      for(const el of copy.querySelectorAll('.overlay-controls,.resize-handle,.source-controls,button,[data-testid="studio-layer-loading"]'))el.remove();
      for(const el of copy.querySelectorAll('[id]'))el.removeAttribute('id');
      if(host.firstChild!==copy)host.replaceChildren(copy);host.dataset.nodeId=state.signal.nodeId;host.dataset.sourceTime=String(clock?.currentTime||0);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;paint()})};
    const stop=clock?watchStudioProgrammeFrames(clock,schedule):()=>{};const observer=new MutationObserver(records=>{
      for(const record of records){
        if(record.type==='childList'){
          const changed=[...record.addedNodes,...record.removedNodes];
          if(changed.every(node=>node.nodeType===Node.TEXT_NODE))textDirty.add(record.target);
          else rebuild=true;
        }else if(record.type==='characterData')textDirty.add(record.target.parentElement);
        else dirty.add(record.target);
      }
      if(rebuild)measure();if(!clock||clock.paused||rebuild)schedule();
    });
    if(source)observer.observe(source,{subtree:true,attributes:true,childList:true,characterData:true});
    const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{measure();schedule()}):null;resize?.observe(host);if(source)resize?.observe(source);for(const e of ['seeked','loadeddata'])clock?.addEventListener(e,schedule);schedule();
    return()=>{disposed=true;cancelAnimationFrame(frame);stop();observer.disconnect();resize?.disconnect();for(const e of ['seeked','loadeddata'])clock?.removeEventListener(e,schedule);};
  },[signal.nodeId,videoRef?.current,primary]);
  if(primary)return <div data-testid="flow-native-node-picture" data-node-id={signal.nodeId} style={{position:'absolute',inset:0,display:'grid',placeItems:'center',overflow:'hidden'}}>
    <div style={{width:'100%',transform:signal.includeMainTransform?`translate(${Number(mainTransform?.x??50)-50}%,${Number(mainTransform?.y??50)-50}%) rotate(${Number(mainTransform?.rotation||0)}deg) scale(${Number(mainTransform?.scale??1)})`:undefined}}>
      <StudioSourceGradeViewer nodeId={signal.includeGrade?signal.nodeId:'MediaIn:main-video'} videoRef={videoRef} mapTime={mapTime} time={time} finishFx={finishFx} advancedColor={advancedColor} adjustmentLayers={adjustmentLayers} overlays={overlays} motionKeyframes={motionKeyframes} mainTransform={mainTransform}/>
    </div>
  </div>;
  return <div ref={hostRef} data-testid="flow-native-node-picture" aria-label={`${signal.label} live node picture`} style={{position:'absolute',inset:0,overflow:'hidden',background:'repeating-conic-gradient(#17202d 0% 25%, #101722 0% 50%) 0/16px 16px'}} />;
}
