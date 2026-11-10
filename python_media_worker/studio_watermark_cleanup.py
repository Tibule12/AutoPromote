"""Shared Studio watermark settings for the final native picture filter chain."""
import asyncio
import math
MODES={'adaptive','tracked','moving','tiktok','manual','corners','standard','top_left','top_right','bottom_left','bottom_right','all'}

def programme_cleanup_regions(regions,segments,start_time=0,time_map=None):
    if not isinstance(regions,list) or len(regions)>12:raise ValueError('Use at most12 watermark cleanup regions')
    clean=[]
    for region in regions:
        if not isinstance(region,dict) or set(region)-{'left','top','width','height','track','seed_time'}:raise ValueError('Invalid watermark cleanup region fields')
        item=dict(region)
        for field in ['left','top','width','height','seed_time']:
            value=item.get(field,0)
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<0 or value>(36000 if field=='seed_time' else 100):raise ValueError('Invalid watermark cleanup region '+field)
        if not item.get('width') or not item.get('height') or item['left']+item['width']>100 or item['top']+item['height']>100:raise ValueError('Keep the complete watermark cleanup box inside the picture')
        if 'track'in item and not isinstance(item['track'],bool):raise ValueError('Watermark tracking needs a boolean')
        if item.get('track',True) or len(segments)<=1:
            if len(segments)>1:raise ValueError('Tracked manual cleanup needs one source occurrence; use static boxes or adaptive cleanup for a sequence')
            source_start=float(segments[0].get('start_time',0))if segments else float(start_time)
            programme=max(0,float(item.get('seed_time',source_start))-source_start)
            item['seed_time']=time_map(programme)if time_map else programme
        clean.append(item)
    return clean

async def studio_watermark_cleanup_filters(*,enabled,mode,regions,segments,start_time,duration,width,height,video_path,build_filters,time_map=None):
    if not enabled:return [],{'enabled':False,'status':'not_requested'}
    mode=str(mode or'adaptive').strip().lower()
    if mode not in MODES:raise ValueError('Unsupported Studio watermark cleanup mode')
    manual=programme_cleanup_regions(regions or[],segments,start_time,time_map)
    if mode=='manual'and not manual:raise ValueError('Manual watermark cleanup needs an explicit box')
    if mode=='manual' and all(not region.get('track',True) for region in manual):
        if len(segments)>1:raise ValueError('Precise static badge cleanup needs one source occurrence')
        return [],{'enabled':True,'status':'pending','mode':mode,'timebase':'output_picture_after_native_layers','manual_regions':manual,'method':'local_lama_masked','dimensions':[width,height],'pixelReconstructionPerfect':False,'audioUnaffected':True}
    filters=await asyncio.to_thread(build_filters,width,height,mode,duration=duration,video_path=video_path,manual_regions=manual)
    return filters,{'enabled':True,'status':'applied'if filters else'no_regions_detected','mode':mode,'timebase':'output_picture_after_native_layers','manual_regions':manual,'method':'ffmpeg_delogo','filters':filters,'dimensions':[width,height],'pixelReconstructionPerfect':False,'audioUnaffected':True}

def badge_ink_mask(image):
    """Keep the narrow bright/coloured strokes, not the complete placement box."""
    import cv2
    import numpy as np
    value=image.max(axis=2)
    high=cv2.morphologyEx(value,cv2.MORPH_TOPHAT,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(21,21)))
    core=((value>165)&(high>28)).astype('uint8')*255
    # Floor seams and frame edges may cross the box. Their long straight
    # strokes are picture structure, rather than lettering to remove.
    horizontal=cv2.morphologyEx(core,cv2.MORPH_OPEN,np.ones((1,31),np.uint8))
    vertical=cv2.morphologyEx(core,cv2.MORPH_OPEN,np.ones((31,1),np.uint8))
    core=cv2.subtract(core,cv2.bitwise_or(horizontal,vertical))
    total,labels,stats,_=cv2.connectedComponentsWithStats(core)
    for label in range(1,total):
        if stats[label,0]==0:core[labels==label]=0
    if np.count_nonzero(core)<8:raise ValueError('No clear platform badge at the selected seed frame; choose a frame showing the badge')
    mask=cv2.dilate(core,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)))
    if np.count_nonzero(mask)>mask.size*.55:raise ValueError('Cleanup box contains too much bright picture detail; tighten the box around the badge')
    return core,mask,high

def retain_crossing_picture_lines(crop,clean,box):
    """Carry narrow measured horizontal seams across the covered pixels."""
    import cv2
    import numpy as np
    x,y,w,h=box
    if x<5 or x+w+4>=crop.shape[1]:return clean
    left=np.median(crop[:,max(0,x-12):x-2],axis=1).astype('float32')
    right=np.median(crop[:,x+w+2:min(crop.shape[1],x+w+12)],axis=1).astype('float32')
    a=left.mean(axis=1);b=right.mean(axis=1)
    abase=cv2.medianBlur(a.astype('uint8').reshape(-1,1),9).ravel();bbase=cv2.medianBlur(b.astype('uint8').reshape(-1,1),9).ravel()
    rows=(np.abs(a-abase)>16)&(np.abs(b-bbase)>16)&((a-abase)*(b-bbase)>0)&(np.max(np.abs(left-right),axis=1)<24)
    fraction=np.linspace(0,1,w,dtype='float32')[:,None]
    for row in np.flatnonzero(rows[y:y+h])+y:
        clean[row,x:x+w]=np.clip(left[row]*(1-fraction)+right[row]*fraction,0,255).astype('uint8')
    return clean

def platform_icon_envelope(core,mask,left):
    """Cover disconnected animated icon strokes together, excluding word rows."""
    import cv2
    h,w=core.shape
    result=mask.copy()
    if h>=60:
        total,_,stats,_=cv2.connectedComponentsWithStats(core[:max(1,int(h*.62))])
        icons=[s for s in stats[1:]if s[0]>2 and s[3]>=9 and s[2]<w*.65 and s[1]<h*.45
               and ((s[0]+s[2]/2>w*.45)if left>50 else(s[0]+s[2]/2<w*.55))]
        if icons:
            ix=min(s[0]for s in icons);iy=min(s[1]for s in icons)
            iw=max(s[0]+s[2]for s in icons)-ix;ih=max(s[1]+s[3]for s in icons)-iy
            result[max(0,iy-12):min(h,iy+ih+12),max(0,ix-12):min(w,ix+iw+12)]=255
    return result

def connected_colour_foreground(frame, box):
    """Protect substantial coloured picture components crossing the badge box."""
    import cv2
    import numpy as np
    x,y,w,h=box
    chroma=frame.max(axis=2).astype('int16')-frame.min(axis=2)
    count,labels,stats,_=cv2.connectedComponentsWithStats((chroma>45).astype('uint8'))
    protect=np.zeros(frame.shape[:2],np.uint8)
    for label in range(1,count):
        sx,sy,sw,sh,area=stats[label]
        if area>350 and (sx<x or sy<y or sx+sw>x+w or sy+sh>y+h):protect[labels==label]=255
    return cv2.dilate(protect,np.ones((3,3),np.uint8))

def background_sample_exclusions(frame):
    """Exclude whole coloured subjects, including their neutral shoe details."""
    import cv2
    import numpy as np
    chroma=frame.max(axis=2).astype('int16')-frame.min(axis=2)
    raw=(chroma>45).astype('uint8')
    count,_,stats,_=cv2.connectedComponentsWithStats(raw)
    result=cv2.dilate(raw,np.ones((7,7),np.uint8))
    for x,y,w,h,area in stats[1:]:
        if area>500 and h>60:
            result[max(0,y-10):min(frame.shape[0],y+h+18),max(0,x-12):min(frame.shape[1],x+w+12)]=1
    return result

def source_background_plate(source_path, frame, region):
    """Bounded same-size source sampling; reject badge-bearing/misaligned plates."""
    import cv2
    import numpy as np
    if not source_path:return None
    height,width=frame.shape[:2];x,y,w,h=region['box']
    ring=np.zeros((height,width),np.uint8)
    x0=max(0,x-44);y0=max(0,y-110);x1=min(width,x+w+44);y1=min(height,y+h+55)
    ring[y0:y1,x0:x1]=255;ring[max(0,y-14):min(height,y+h+20),max(0,x-5):x+w+5]=0
    gray=lambda image:cv2.cvtColor(image,cv2.COLOR_BGR2GRAY).astype('float32')/255
    samples=[];capture=cv2.VideoCapture(source_path)
    try:
        for time in [0,.5,1,1.5,2,2.5,3,3.5,4,4.5]:
            capture.set(cv2.CAP_PROP_POS_MSEC,time*1000);ok,image=capture.read()
            if not ok or image.shape!=frame.shape:continue
            roi=image[y:y+h,x:x+w];value=roi.max(axis=2)
            high=cv2.morphologyEx(value,cv2.MORPH_TOPHAT,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(21,21)))
            presence=np.count_nonzero((high>20)&(value>115)&(region['core']>0))/max(1,np.count_nonzero(region['core']))
            if presence>.2:continue
            samples.append(image)
    finally:capture.release()
    if len(samples)<3:return None
    def reference_score(image):
        valid=(ring>0)&((image.max(axis=2).astype('int16')-image.min(axis=2))<=45)&((frame.max(axis=2).astype('int16')-frame.min(axis=2))<=45)
        return float(np.mean(np.abs(image.astype('float32')-frame)[valid])) if np.count_nonzero(valid)>=500 else float('inf')
    base=min(samples,key=reference_score)
    # Keep one measured camera/background state. Combining independently
    # registered frames here can leave neutral shoe/shadow ghosts in a median.
    # Fill only its excluded subject pixels from clean pixels on the same row.
    plate=base.copy();excluded=background_sample_exclusions(base)>0
    columns=np.arange(width)
    for row in range(y0,y1):
        valid=(columns>=x0)&~excluded[row]
        missing=(columns>=x0)&excluded[row]
        if np.count_nonzero(valid)<8:return None
        for channel in range(3):
            plate[row,missing,channel]=np.interp(columns[missing],columns[valid],base[row,valid,channel]).astype('uint8')
    return {'image':plate,'ring':ring,'samples':len(samples),'crop':(x0,y0,x1,y1),'backgroundMethod':'one qualified source frame with bounded row fill under its excluded subject'}

def fit_source_background(frame, plate, box):
    import cv2
    import numpy as np
    x,y,w,h=box;mask=plate['ring'].copy()
    mask[connected_colour_foreground(frame,box)>0]=0
    if np.count_nonzero(mask)<500:return None
    gray=lambda a:cv2.cvtColor(a,cv2.COLOR_BGR2GRAY).astype('float32')/255
    try:cc,warp=cv2.findTransformECC(gray(frame),gray(plate['image']),np.eye(2,3,dtype=np.float32),cv2.MOTION_TRANSLATION,(cv2.TERM_CRITERIA_COUNT|cv2.TERM_CRITERIA_EPS,80,.0001),mask,5)
    except cv2.error:return None
    if cc<.65 or np.max(np.abs(warp[:,2]))>max(30,min(w,h)*.85):return None
    aligned=cv2.warpAffine(plate['image'],warp,(frame.shape[1],frame.shape[0]),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP,borderMode=cv2.BORDER_REFLECT)
    if np.mean(np.abs(aligned.astype('float32')-frame)[mask>0])>25:return None
    y0=max(0,y-110);y1=min(frame.shape[0],y+h+55)
    band=slice(x+w+1,frame.shape[1]) if frame.shape[1]-x-w-1>=4 else slice(max(0,x-25),max(1,x-4))
    baseline=np.median(frame[y0:y1,band].astype('float32'),axis=1)
    baseline=cv2.GaussianBlur(baseline,(1,5),0)
    # Transfer source texture, not an earlier dancer's broad moving shadow.
    texture=aligned.astype('float32')-cv2.GaussianBlur(aligned,(31,31),0).astype('float32')
    corrected=aligned.astype('float32')
    corrected[y0:y1]=baseline[:,None,:]+np.clip(texture[y0:y1],-7,7)
    return np.clip(corrected,0,255).astype('uint8')

def apply_studio_glyph_cleanup(video_path,receipt,encode_args,source_path=None):
    """Local masked reconstruction inside the canonical native export worker."""
    import cv2
    import numpy as np
    import subprocess
    import json
    import os
    import tempfile
    import hashlib
    if receipt.get('method')!='local_lama_masked':return receipt
    model=os.environ.get('STUDIO_BADGE_INPAINT_MODEL','')
    expected_sha='1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6'
    if not model or not os.path.isfile(model):raise ValueError('The local precise badge cleanup runtime is not installed')
    with open(model,'rb')as source:
        if hashlib.file_digest(source,'sha256').hexdigest()!=expected_sha:raise ValueError('Badge cleanup model hash mismatch')
    try:
        import onnxruntime as ort
    except ImportError as error:
        raise ValueError('The local precise badge cleanup runtime is not installed') from error
    options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
    session=ort.InferenceSession(model,sess_options=options,providers=['CPUExecutionProvider'])
    metadata=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',video_path]))
    picture=next(s for s in metadata['streams']if s['codec_type']=='video')
    if picture.get('pix_fmt')not in {'yuv420p','yuvj420p'}:raise ValueError('Precise badge cleanup currently supports SDR 8-bit video')
    width,height=picture['width'],picture['height'];rate=picture['avg_frame_rate'];a,b=rate.split('/');fps=float(a)/float(b)
    capture=cv2.VideoCapture(video_path);regions=[]
    try:
        for region in receipt['manual_regions']:
            x=int(region['left']*width/100);y=int(region['top']*height/100);w=min(width-x,int(region['width']*width/100));h=min(height-y,int(region['height']*height/100))
            capture.set(cv2.CAP_PROP_POS_MSEC,max(0,float(region.get('seed_time',0)))*1000);ok,frame=capture.read()
            if not ok:raise ValueError('Badge seed lies outside the rendered picture')
            core,ink_mask,template=badge_ink_mask(frame[y:y+h,x:x+w])
            for offset in [.16,.32,.48]:
                capture.set(cv2.CAP_PROP_POS_MSEC,(max(0,float(region.get('seed_time',0)))+offset)*1000)
                ok,sample=capture.read()
                if ok:
                    try:
                        _,sample_mask,_=badge_ink_mask(sample[y:y+h,x:x+w])
                        ink_mask=cv2.bitwise_or(ink_mask,sample_mask)
                    except ValueError:pass
            ink_mask=platform_icon_envelope(core,ink_mask,region['left'])
            side=min(max(w,h)*2+48,width,height);x0=max(0,min(width-side,x+w//2-side//2));y0=max(0,min(height-side,y+h//2-side//2));x1=x0+side;y1=y0+side
            mask=np.zeros((side,side),np.uint8);mask[y-y0:y-y0+h,x-x0:x-x0+w]=ink_mask
            alpha=cv2.GaussianBlur(mask,(5,5),0).astype('float32')/255
            region_state={'box':(x,y,w,h),'crop':(x0,y0,x1,y1),'core':core,'template':template,'mask':mask,'alpha':alpha,'clean':None,'previous':None,'lastKey':-10000,'applied':0,'keys':0,'sourceFrames':0}
            region_state['plate']=source_background_plate(source_path,frame,region_state)
            regions.append(region_state)
    finally:capture.release()
    def reconstruct(crop,mask):
        image=cv2.resize(cv2.cvtColor(crop,cv2.COLOR_BGR2RGB),(512,512)).transpose(2,0,1)[None].astype('float32')/255
        erase=cv2.resize(cv2.dilate(mask,np.ones((5,5),np.uint8)),(512,512),interpolation=cv2.INTER_NEAREST)[None,None].astype('float32')/255
        output=session.run(None,{'image':image,'mask':erase})[0][0].transpose(1,2,0)
        return cv2.cvtColor(cv2.resize(np.clip(output,0,255).astype('uint8'),(crop.shape[1],crop.shape[0])),cv2.COLOR_RGB2BGR)
    with tempfile.TemporaryDirectory(prefix='studio-badge-',dir=os.path.dirname(video_path))as directory:
        output=os.path.join(directory,'clean.mp4');log_path=os.path.join(directory,'encoder.log')
        colour=[]
        source_picture={}
        if source_path:
            source_streams=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',source_path]))['streams']
            source_picture=next((stream for stream in source_streams if stream['codec_type']=='video' and stream.get('width')==width and stream.get('height')==height),{})
        for field,flag in [('color_space','-colorspace'),('color_primaries','-color_primaries'),('color_transfer','-color_trc'),('color_range','-color_range')]:
            value=picture.get(field) or source_picture.get(field)
            if value and value not in {'unknown','unspecified'}:colour.extend([flag,value])
        command=['ffmpeg','-nostdin','-v','error','-y','-filter_complex_threads','2','-f','rawvideo','-pix_fmt','bgra','-s',f'{width}x{height}','-r',rate,'-i','pipe:0','-i',video_path,'-filter_complex','[1:v][0:v]overlay=0:0:format=yuv420:shortest=1[clean]','-map','[clean]','-map','1:a?','-c:a','copy',*encode_args,*colour,'-threads','2','-movflags','+faststart',output]
        capture=cv2.VideoCapture(video_path);count=0
        try:
            with open(log_path,'wb')as log:
                process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=log)
                try:
                    while True:
                        ok,frame=capture.read()
                        if not ok:break
                        repair_alpha=np.zeros((height,width),np.uint8)
                        for region in regions:
                            x,y,w,h=region['box'];roi=frame[y:y+h,x:x+w];value=roi.max(axis=2);high=cv2.morphologyEx(value,cv2.MORPH_TOPHAT,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(21,21)))
                            presence=np.count_nonzero((high>20)&(value>115)&(region['core']>0))/max(1,np.count_nonzero(region['core']))
                            similarity=float(cv2.matchTemplate(high,region['template'],cv2.TM_CCOEFF_NORMED)[0,0])
                            if presence<.35 or similarity<.18:region['clean']=None;continue
                            x0,y0,x1,y1=region['crop'];crop=frame[y0:y1,x0:x1].copy()
                            source_clean=fit_source_background(frame,region['plate'],region['box']) if region['plate'] is not None else None
                            if source_clean is not None:
                                source_alpha=np.zeros(region['alpha'].shape,np.float32)
                                # A region ending within its feather radius of
                                # the frame edge must not retain a half-visible
                                # final badge stroke at that edge.
                                right=x1 if width-(x+w)<=8 else x+w
                                source_alpha[y-y0:y-y0+h,x-x0:right-x0]=1
                                alpha=np.round(cv2.GaussianBlur(source_alpha,(15,15),0,borderType=cv2.BORDER_REPLICATE)*255).astype('uint8')
                                alpha[connected_colour_foreground(frame,region['box'])[y0:y1,x0:x1]>0]=0
                                frame[y0:y1,x0:x1]=source_clean[y0:y1,x0:x1]
                                repair_alpha[y0:y1,x0:x1]=np.maximum(repair_alpha[y0:y1,x0:x1],alpha)
                                region['sourceFrames']+=1;region['applied']+=1
                                continue
                            changed=region['previous']is not None and np.mean(np.abs(crop[y-y0:y-y0+h,x-x0:x-x0+w].astype('float32')-region['previous'][y-y0:y-y0+h,x-x0:x-x0+w].astype('float32')))>8 and count-region['lastKey']>=4
                            if region['clean']is None or changed or count-region['lastKey']>=max(1,round(fps*.5)):
                                region['clean']=reconstruct(crop,region['mask']);region['lastKey']=count;region['keys']+=1
                            else:
                                current=cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY);previous=cv2.cvtColor(region['previous'],cv2.COLOR_BGR2GRAY)
                                flow=cv2.calcOpticalFlowFarneback(current,previous,None,.5,2,21,2,5,1.2,0)
                                for channel in range(2):flow[:,:,channel]=cv2.inpaint(flow[:,:,channel],region['mask'],5,cv2.INPAINT_NS)
                                grid_y,grid_x=np.mgrid[:crop.shape[0],:crop.shape[1]].astype('float32')
                                region['clean']=cv2.remap(region['clean'],grid_x+flow[:,:,0],grid_y+flow[:,:,1],cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT)
                            region['clean']=retain_crossing_picture_lines(crop,region['clean'],(x-x0,y-y0,w,h))
                            region['previous']=crop
                            frame[y0:y1,x0:x1]=region['clean']
                            alpha=np.round(region['alpha']*255).astype('uint8')
                            alpha[connected_colour_foreground(crop,(x-x0,y-y0,w,h))>0]=0
                            repair_alpha[y0:y1,x0:x1]=np.maximum(repair_alpha[y0:y1,x0:x1],alpha)
                            region['applied']+=1
                        process.stdin.write(np.dstack([frame,repair_alpha]).tobytes());count+=1
                    process.stdin.close();code=process.wait(timeout=120)
                    if code:raise RuntimeError('Precise badge encoder failed: '+open(log_path).read()[-1000:])
                except BaseException:
                    process.kill();process.wait();raise
        finally:capture.release()
        if not count or not all(r['applied']for r in regions):raise ValueError('A cleanup box did not match a visible badge; select a better seed frame')
        if count!=int(picture.get('nb_frames')or count):raise RuntimeError('Precise badge cleanup changed the native picture frame count')
        os.replace(output,video_path)
    return {**receipt,'status':'applied','frames':count,'fps':fps,'regionAppliedFrames':[r['applied']for r in regions],'reconstructedKeyframes':[r['keys']for r in regions],'sourceBackgroundFrames':[r['sourceFrames']for r in regions],'connectedColourForegroundProtected':True,'colourMetadataPreserved':True,'modelSha256':expected_sha,'device':'CPUExecutionProvider','audioPacketsCopied':True,'placementBoxBlurred':False,'presenceGated':True,'temporalInterpolation':'registered same-source background when qualified; otherwise backward optical flow between reconstructed keys; not temporal-model quality qualification'}
