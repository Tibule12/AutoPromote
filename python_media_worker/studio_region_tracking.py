"""Source-picture optical-flow tracking for arbitrary Studio colour selections.

Frames are the actual programme raster captured before this region's effects,
not an inferred face label. Analysis never invents motion across a cut/loss.
The bounded binary packet avoids API JSON/base64 amplification.
"""
import json
import math
import struct
from pathlib import Path

import cv2
import numpy as np

from studio_selective_mask import mask_coverage, validate_selective_mask

MAX_PACKET_BYTES = 40 * 1024 * 1024
MAGIC = b'APGRD001'


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
    return header,np.memmap(path,dtype=np.uint8,mode='r',offset=12+length,shape=(len(times),height,width))


def track_packet(path):
    header,frames=read_packet(path)
    try:return track_frames(frames,header['times'],header['mask'])
    finally:
        frames._mmap.close()


def track_frames(frames,times,mask):
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
    stop=None
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
        confidence=min(fraction,inlier_ratio,max(0,correlation))
        if not .85<scale<1.18 or abs(angle)>15 or inlier_ratio<.6 or correlation<.45:
            stop='cut'if global_change>22 else'occlusion';break
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
        'requestedRange':[min(times),max(times)],'trackedSamples':len(observations)+1}
