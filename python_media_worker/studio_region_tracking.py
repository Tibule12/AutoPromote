"""Source-picture tracking for editable Studio colour selections.

Frames are the actual programme raster captured before this region's effects,
not unrelated analysis footage. Texture flow and explicit facial-landmark
tracking produce ordinary outline keys and stop at cuts or uncertain matches.
The bounded binary packet avoids API JSON/base64 amplification.
"""
import json
import math
import struct
import hashlib
from pathlib import Path

import cv2
import numpy as np

try:
    from .studio_selective_mask import mask_coverage, validate_selective_mask
except ImportError:
    from studio_selective_mask import mask_coverage, validate_selective_mask

MAX_PACKET_BYTES = 40 * 1024 * 1024
MAGIC = b'APGRD001'
FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,
             152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]


def _outline_pixels(mask,width,height):
    if mask['shape']=='polygon':points=np.asarray(mask['points'],np.float64)
    elif mask['shape']=='ellipse':
        angles=np.arange(32)*2*np.pi/32
        points=np.column_stack((.5+.5*np.cos(angles),.5+.5*np.sin(angles)))
    else:points=np.array([[0,0],[1,0],[1,1],[0,1]],np.float64)
    points=(points-.5)*[mask['width']*width,mask['height']*height]
    angle=math.radians(mask['rotation']);rotation=np.array([[math.cos(angle),-math.sin(angle)],[math.sin(angle),math.cos(angle)]])
    return points@rotation.T+[mask['x']*width,mask['y']*height]


def _bind_face_outline(reference,outline,width,height):
    """Bind each authored vertex to an observed face triangle, once."""
    subdiv=cv2.Subdiv2D((0,0,width,height));inserted=[]
    for i,point in enumerate(reference):
        if not 0<=point[0]<width or not 0<=point[1]<height:continue
        if inserted and np.min(np.linalg.norm(reference[inserted]-point,axis=1))<.01:continue
        subdiv.insert(tuple(map(float,point)));inserted.append(i)
    triangles=subdiv.getTriangleList().reshape(-1,3,2)
    ids=np.argmin(np.linalg.norm(triangles[:,:,None,:]-reference[None,None,:,:],axis=3),axis=2)
    tri=reference[ids]
    matrix=np.concatenate((tri.transpose(0,2,1),np.ones((len(tri),1,3))),axis=1)
    usable=np.abs(np.linalg.det(matrix))>.1
    ids=ids[usable];inverse=np.linalg.inv(matrix[usable]);bindings=[]
    for point in outline:
        weights=inverse@np.array([point[0],point[1],1.])
        inside=np.min(weights,axis=1)>=-.0001
        if np.any(inside):
            index=int(np.flatnonzero(inside)[0]);bindings.append((ids[index],weights[index]))
        else:bindings.append(None) # Outside the facial mesh: retain head-plane motion.
    return bindings


def _outline_key(outline,angle,time,width,height):
    radians=math.radians(angle);rotation=np.array([[math.cos(radians),-math.sin(radians)],[math.sin(radians),math.cos(radians)]])
    local=outline@rotation;low=local.min(axis=0);high=local.max(axis=0);size=high-low
    if np.any(size<.5):raise ValueError('The selected facial detail is no longer visible.')
    centre=((low+high)/2)@rotation.T
    return {'time':time,'x':float(centre[0]/width),'y':float(centre[1]/height),
            'width':float(size[0]/width),'height':float(size[1]/height),'rotation':angle,
            'points':np.clip((local-low)/size,0,1).tolist(),'opacity':1}


def track_face_region(frames,times,mask,scene_samples=None,face_contour=False):
    """Deform ordinary editable outlines using the same observed facial mesh.

    No source pixels leave this worker and no model is downloaded at runtime.
    Each sample is detected independently. Sparse programme samples must not
    reuse a temporally predicted ROI that can drift during a fast expression.
    """
    validate_selective_mask(mask)
    try:import mediapipe as mp
    except ImportError as error:raise ValueError('Face tracking is unavailable on this worker. The selection is unchanged.')from error
    model=Path(__file__).parent/'models/face-landmarker/face_landmarker.task'
    if not model.is_file() or hashlib.sha256(model.read_bytes()).hexdigest()!='64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff':
        raise ValueError('The verified face tracking model is unavailable. The selection is unchanged.')
    height,width=frames[0].shape
    options=mp.tasks.vision.FaceLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=str(model)),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,num_faces=1,min_face_detection_confidence=.65,
        min_face_presence_confidence=.7,min_tracking_confidence=.7)
    initial_outline=_outline_pixels(mask,width,height)
    keys=[];observations=[];reference=None;previous_points=None;bindings=None;stop=None;metrics=None
    with mp.tasks.vision.FaceLandmarker.create_from_options(options)as tracker:
        for index,frame in enumerate(frames):
            if index:
                current_scene=np.asarray(scene_samples[index],np.float32)if scene_samples is not None else frame.astype(np.float32)
                previous_scene=np.asarray(scene_samples[index-1],np.float32)if scene_samples is not None else frames[index-1]
                change=float(np.mean(np.abs(current_scene-previous_scene)))
                if change>22:stop='cut';metrics={'pictureChange':change};break
            rgb=np.ascontiguousarray(cv2.cvtColor(frame,cv2.COLOR_GRAY2RGB))
            result=tracker.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb))
            if len(result.face_landmarks)!=1:
                if not keys:raise ValueError('Place the selection on one clearly visible face before tracking.')
                stop='face_not_visible';break
            points=np.array([[p.x*width,p.y*height]for p in result.face_landmarks[0]],np.float64)
            if points.shape!=(478,2) or not np.all(np.isfinite(points)):
                stop='uncertain_face';break
            if previous_points is not None:
                step,_=cv2.estimateAffinePartial2D(previous_points[:468],points[:468],method=cv2.LMEDS)
                if step is None:stop='uncertain_face';break
                warped=cv2.warpAffine(frames[index-1],step,(width,height))
                visible=np.zeros((height,width),np.uint8)
                cv2.fillConvexPoly(visible,cv2.convexHull(points[:468].astype(np.int32)),255)
                visible=cv2.erode(visible,np.ones((9,9),np.uint8))>0
                old=warped[visible];new=frame[visible]
                appearance=float(np.corrcoef(old,new)[0,1])if len(old)>20 and np.std(old)>2 and np.std(new)>2 else 0
                if not math.isfinite(appearance)or appearance<.4:
                    stop='uncertain_face';metrics={'appearance':appearance if math.isfinite(appearance)else 0};break
            if reference is None:
                low=points.min(axis=0);high=points.max(axis=0);centre=np.array([mask['x']*width,mask['y']*height])
                if np.any(centre<low-.15*(high-low))or np.any(centre>high+.15*(high-low)):
                    raise ValueError('Place the selection inside the visible face before tracking.')
                reference=points;bindings=_bind_face_outline(reference,initial_outline,width,height)
            affine,inliers=cv2.estimateAffinePartial2D(reference,points,method=cv2.LMEDS)
            if affine is None or inliers is None or np.mean(inliers)<.5:
                stop='uncertain_face';break
            scale=float(np.hypot(affine[0,0],affine[1,0]))
            if not .5<scale<2:stop='uncertain_face';break
            angle=mask['rotation']+math.degrees(math.atan2(affine[1,0],affine[0,0]))
            transformed=initial_outline@affine[:,:2].T+affine[:,2]
            for n,binding in enumerate(bindings):
                if binding is None:continue
                ids,weights=binding
                transformed[n]=weights@points[ids]
            if face_contour:transformed=points[FACE_OVAL]
            try:key=_outline_key(transformed,angle,times[index],width,height)
            except ValueError:stop='face_not_visible';break
            if keys:
                distance=math.hypot((key['x']-keys[-1]['x'])*width,(key['y']-keys[-1]['y'])*height)
                face_span=float(np.linalg.norm(points.max(axis=0)-points.min(axis=0)))
                if distance>face_span*.65:stop='uncertain_face';break
            keys.append(key);observations.append({'time':times[index],'features':478})
            previous_points=points
    if not keys:raise ValueError('This face could not be tracked safely. The selection is unchanged.')
    if stop:
        if times[1]>times[0]:keys[-1]['hold']=True
        keys.append({**keys[-1],'time':times[index],'opacity':0,'hold':True})
    check={**mask,'shape':'polygon','points':keys[0]['points'],'keyframes':sorted(keys,key=lambda key:key['time'])}
    validate_selective_mask(check)
    return {'version':1,'engine':'programme-face-mesh-v1','shape':'polygon','keyframes':check['keyframes'],
            'observations':observations,'reviewRequired':True,'stopReason':stop,'stopMetrics':metrics,
            'requestedRange':[min(times),max(times)],'trackedSamples':len(observations),'faceContour':face_contour}


def read_packet(path):
    size=Path(path).stat().st_size
    if not 12<size<=MAX_PACKET_BYTES:raise ValueError('Selection samples exceed the tracking budget')
    with open(path,'rb')as source:
        if source.read(8)!=MAGIC:raise ValueError('Invalid selection samples')
        length=struct.unpack('<I',source.read(4))[0]
        if not 2<=length<=65536:raise ValueError('Invalid selection sample header')
        header=json.loads(source.read(length))
    width=header.get('width');height=header.get('height');times=header.get('times')
    if type(width)is not int or type(height)is not int or not 32<=width<=640 or not 32<=height<=640:raise ValueError('Invalid tracking raster')
    if not isinstance(times,list)or not 2<=len(times)<=121 or any(type(t)not in(int,float)or not math.isfinite(t)or t<0 for t in times):raise ValueError('Invalid tracking sample clock')
    gaps=np.diff(times)
    if not (np.all(gaps>0)or np.all(gaps<0))or max(abs(gaps))>.3 or abs(times[-1]-times[0])>12.01:raise ValueError('Use continuous tracking samples up to twelve seconds')
    if size!=12+length+width*height*len(times):raise ValueError('Incomplete tracking samples')
    validate_selective_mask(header.get('mask'))
    if header.get('target','texture') not in ('texture','face'):
        raise ValueError('Unknown selection tracking target')
    if type(header.get('faceContour',False))is not bool or (header.get('faceContour')and header.get('target')!='face'):
        raise ValueError('Invalid facial contour request')
    scenes=header.get('sceneSamples')
    if scenes is not None and (not isinstance(scenes,list)or len(scenes)!=len(times)or
        any(not isinstance(sample,list)or len(sample)!=144 or any(type(v)is not int or not 0<=v<=255 for v in sample)for sample in scenes)):
        raise ValueError('Invalid full-picture tracking samples')
    crop=header.get('crop')
    if crop is not None and (header.get('target')!='face' or not isinstance(crop,dict) or
        any(type(crop.get(k))not in(int,float)or not math.isfinite(crop[k])for k in ('x','y','width','height'))or
        not 0<=crop['x']<1 or not 0<=crop['y']<1 or not 0<crop['width']<=1 or not 0<crop['height']<=1 or
        crop['x']+crop['width']>1.000001 or crop['y']+crop['height']>1.000001):
        raise ValueError('Invalid face tracking picture window')
    return header,np.memmap(path,dtype=np.uint8,mode='r',offset=12+length,shape=(len(times),height,width))


def track_packet(path):
    header,frames=read_packet(path)
    try:
        result=track_frames(frames,header['times'],header['mask'],header.get('target','texture'),header.get('sceneSamples'),header.get('faceContour',False))
        crop=header.get('crop')
        if crop:
            for key in result['keyframes']:
                key.update(x=crop['x']+key['x']*crop['width'],y=crop['y']+key['y']*crop['height'],
                           width=key['width']*crop['width'],height=key['height']*crop['height'])
        return result
    finally:
        frames._mmap.close()


def track_frames(frames,times,mask,target='texture',scene_samples=None,face_contour=False):
    if target=='face':
        return track_face_region(frames,times,mask,scene_samples,face_contour)
    if target!='texture':raise ValueError('Unknown selection tracking target')
    height,width=frames[0].shape
    pose={**mask,'keyframes':[],'inverted':False}
    validate_selective_mask(pose)
    initial={k:pose[k]for k in ('x','y','width','height','rotation')}
    if pose.get('points'):initial['points']=pose['points']
    keys=[{'time':times[0],**initial,'opacity':1}]
    observations=[]
    previous=frames[0]
    coverage=mask_coverage(pose,width,height)
    feature_mask=np.where(coverage>.65,255,0).astype(np.uint8)
    points=cv2.goodFeaturesToTrack(previous,maxCorners=160,qualityLevel=.008,minDistance=3,mask=feature_mask,blockSize=3)
    if points is None or len(points)<5:raise ValueError('This area has too little visible detail to track safely. Enlarge the outline or use manual position keys.')
    stop=None;stop_metrics=None
    for index in range(1,len(frames)):
        current=frames[index]
        next_points,status,_=cv2.calcOpticalFlowPyrLK(previous,current,points,None,winSize=(21,21),maxLevel=3,
            criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,30,.01))
        if next_points is None:stop='lost';break
        back,back_status,_=cv2.calcOpticalFlowPyrLK(current,previous,next_points,None,winSize=(21,21),maxLevel=3)
        if back is None:stop='lost';break
        error=np.linalg.norm(points.reshape(-1,2)-back.reshape(-1,2),axis=1)
        good=(status.ravel()==1)&(back_status.ravel()==1)&(error<1.4)
        before=points.reshape(-1,2)[good];after=next_points.reshape(-1,2)[good]
        fraction=float(np.mean(good))
        global_change=float(np.mean(np.abs(current.astype(np.float32)-previous)))
        if len(before)<5 or fraction<.45:
            stop='cut'if global_change>22 else'lost';break
        affine,inliers=cv2.estimateAffinePartial2D(before,after,method=cv2.RANSAC,ransacReprojThreshold=1.8,maxIters=1000,confidence=.995)
        if affine is None or inliers is None:stop='lost';break
        inlier_ratio=float(np.mean(inliers))
        scale=float(np.hypot(affine[0,0],affine[1,0]));angle=math.degrees(math.atan2(affine[1,0],affine[0,0]))
        warped=cv2.warpAffine(previous,affine,(width,height))
        warped_mask=cv2.warpAffine(feature_mask,affine,(width,height))>200
        old=warped[warped_mask].astype(np.float32);new=current[warped_mask].astype(np.float32)
        correlation=float(np.corrcoef(old,new)[0,1])if len(old)>12 and np.std(old)>2 and np.std(new)>2 else 0
        if not math.isfinite(correlation):correlation=0
        local_correlations=[]
        for a,b in zip(before[inliers.ravel()==1],after[inliers.ravel()==1]):
            pa=cv2.getRectSubPix(previous,(9,9),tuple(map(float,a))).astype(np.float32).ravel()
            pb=cv2.getRectSubPix(current,(9,9),tuple(map(float,b))).astype(np.float32).ravel()
            if np.std(pa)>3 and np.std(pb)>3:
                value=float(np.corrcoef(pa,pb)[0,1])
                if math.isfinite(value):local_correlations.append(value)
        local_correlation=float(np.median(local_correlations))if local_correlations else 0
        # Talking, blinking and facial expression change the whole-region
        # correlation even when stable features still follow the same person.
        # Check the actual tracked detail; do not label a speaking mouth as an
        # occlusion merely because a broad affine warp cannot deform it.
        appearance=max(correlation,local_correlation if len(local_correlations)>=5 else 0)
        confidence=min(fraction,inlier_ratio,max(0,appearance))
        coherent=inlier_ratio>=.6
        if not coherent and fraction>=.6 and len(local_correlations)>=12 and local_correlation>=.8 and global_change<15:
            # A talking/blinking face is not a rigid plane. When its stable
            # details agree on translation but disagree on a scale fit, keep
            # the previous size rather than making the mask pulse/shrink.
            flow=after-before;translation=np.median(flow,axis=0)
            agreement=float(np.mean(np.linalg.norm(flow-translation,axis=1)<3))
            if agreement>=.6:
                affine=np.array([[1,0,translation[0]],[0,1,translation[1]]],dtype=np.float64)
                scale=1.;angle=0.;inlier_ratio=agreement;coherent=True
                confidence=min(fraction,agreement,local_correlation)

        if not .85<scale<1.18 or abs(angle)>15 or not coherent or appearance<.55:
            stop_metrics=dict(scale=scale,angle=angle,inliers=inlier_ratio,globalCorrelation=correlation,localCorrelation=local_correlation,features=len(local_correlations),fraction=fraction)
            stop='cut'if global_change>22 else'uncertain_motion';break
        centre=affine@np.array([pose['x']*width,pose['y']*height,1])
        pose={**pose,'x':float(centre[0]/width),'y':float(centre[1]/height),
            'width':pose['width']*scale,'height':pose['height']*scale,
            'rotation':pose['rotation']+angle}
        if not -360<=pose['rotation']<=360 or not -.1<pose['x']<1.1 or not -.1<pose['y']<1.1 or not .002<=pose['width']<=3 or not .002<=pose['height']<=3:
            stop='outside';break
        coverage=mask_coverage(pose,width,height)
        if float(np.sum(coverage))<8:stop='outside';break
        keys.append({'time':times[index],**{k:pose[k]for k in initial},'opacity':1})
        observations.append({'time':times[index],'confidence':round(confidence,3),'features':int(np.sum(inliers))})
        feature_mask=np.where(coverage>.65,255,0).astype(np.uint8)
        # Re-seed inside the current selection. Do not let background corners
        # take over after the original points leave the material.
        points=cv2.goodFeaturesToTrack(current,maxCorners=160,qualityLevel=.008,minDistance=3,mask=feature_mask,blockSize=3)
        if points is None or len(points)<5:stop='lost';break
        previous=current
    if stop:
        loss_time=times[index]
        if keys[-1]['time']==loss_time:
            # This sample had no safe feature set for the next interval.
            loss_time=times[min(index+1,len(times)-1)]
        if loss_time!=keys[-1]['time']:
            if times[1]>times[0]:keys[-1]['hold']=True
            keys.append({**keys[-1],'time':loss_time,'opacity':0,'hold':True})
    return {'version':1,'engine':'programme-lk-ransac-v1','keyframes':sorted(keys,key=lambda k:k['time']),
        'observations':observations,'reviewRequired':True,'stopReason':stop,
        'requestedRange':[min(times),max(times)],'trackedSamples':len(observations)+1,'stopMetrics':stop_metrics}
