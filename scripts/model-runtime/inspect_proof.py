"""Inspect actual decoded artifact pixels; QA annotations are never model output."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import cv2
import numpy as np
from PIL import Image,ImageDraw

REPO=Path(__file__).resolve().parents[2]
ROOT=REPO/'reports/model-capability-runtime-v1-20261009/proof'
sys.path.insert(0,str(REPO))
from model_workers.common import frame,sha

def latest(cap):
    matches=[json.loads(p.read_text()) for p in (ROOT/'artifacts').glob('*.json')]
    return sorted([a for a in matches if a['capability']==cap],key=lambda a:a['createdAt'])[-1]

def contact(images,labels,target,columns=3,width=384):
    height=round(width*images[0].height/images[0].width)
    sheet=Image.new('RGB',(width*columns,(height+24)*((len(images)+columns-1)//columns)),(15,15,20))
    draw=ImageDraw.Draw(sheet)
    for i,(im,label) in enumerate(zip(images,labels)):
        x=i%columns*width;y=i//columns*(height+24)
        sheet.paste(im.resize((width,height)),(x,y));draw.text((x+8,y+height+5),label,fill='white')
    sheet.save(target)

def detection(out):
    a=latest('detect_object');image=Image.open(ROOT/'outputs/detect_object/detection_frame.png').convert('RGB')
    draw=ImageDraw.Draw(image);w,h=image.size
    for d in a['output']['detections']:
        box=[d['box'][0]*w,d['box'][1]*h,d['box'][2]*w,d['box'][3]*h]
        draw.rectangle(box,outline='#dd65ff',width=3)
        draw.text((box[0]+4,box[1]+4),f"{d['id']} {d['label']} / DINO score {d['score']:.3f}",fill='#ffffff')
    image.save(out/'real-detections.png')
    print(json.dumps({'detections':len(a['output']['detections']),'artifactHash':a['artifactHash']}))

def masks(out):
    from python_media_worker.studio_subject_matte import CachedSubjectMatte
    a=latest('segment_subject');directory=ROOT/'derived/subject_masks';directory.mkdir(parents=True,exist_ok=True)
    bundle=ROOT/'outputs/segment_subject/subject_masks.tar.gz'
    if sha(bundle)!=a['output']['maskBundle']['sha256']:raise ValueError('Mask bundle changed')
    with tarfile.open(bundle) as archive:
        rows=archive.getmembers()
        if len(rows)>721 or any(not m.isfile() or Path(m.name).name!=m.name or m.size>8*1024**2 for m in rows):
            raise ValueError('Unbounded/non-flat masks')
        archive.extractall(directory,members=rows,filter='data')
    source=ROOT/'outputs/segment_subject/normalized_source.mp4'
    cache=CachedSubjectMatte(directory,source);data=cache.manifest
    indices=sorted(set(list(range(0,data['frame_count'],9))+[data['frame_count']-1]))
    images=[];alphas=[]
    for i in indices:
        image=frame(source,i);alpha=cache.frame(i)
        tint=np.array(image).copy();tint[alpha>128]=(tint[alpha>128]*.65+np.array([191,66,255])*.35).astype(np.uint8)
        contours,_=cv2.findContours((alpha>128).astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(tint,contours,-1,(218,99,255),2)
        images.append(Image.fromarray(tint));alphas.append(Image.fromarray(alpha).convert('RGB'))
    labels=[f'Actual SAM2 mask / frame {i} / {i/24:.3f}s' for i in indices]
    contact(images,labels,out/'real-masks-over-time.png',columns=3)
    contact(alphas,labels,out/'real-alpha-over-time.png',columns=3)
    ranges=[r['coverage'] for r in data['frames']]
    (out/'mask-checks.json').write_text(json.dumps({'artifactHash':a['artifactHash'],'framesVerified':data['frame_count'],
      'sourceSha256':data['original_source_sha256'],'normalizedSourceSha256':sha(source),'manifestSha256':sha(directory/'manifest.json'),
      'coverageMin':min(ranges),'coverageMax':max(ranges),'shotCuts':data['shot_cuts'],'manualVisualReviewRequired':True},indent=2)+'\n')
    print(json.dumps({'actualMasksVerified':len(data['frames']),'coverageRange':[min(ranges),max(ranges)]}))

def video(out,kind):
    source=ROOT/{'generation':'outputs/generate_video/generated_shot.mp4',
                 'composite':'derived/subject-composite.mp4','final':'final/final.mp4'}[kind]
    if kind=='generation' and sha(source)!=latest('generate_video')['output']['video']['sha256']:raise ValueError('Generated video changed')
    subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(source),'-f','null','-'],check=True,capture_output=True)
    decoder=cv2.VideoCapture(str(source));frames=[];differences=[];previous=None;indices=[]
    try:
        i=0
        while True:
            success,bgr=decoder.read()
            if not success:break
            rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)
            small=cv2.resize(rgb,(640,360));gray=cv2.cvtColor(small,cv2.COLOR_RGB2GRAY)
            if previous is not None:differences.append(float(np.mean(cv2.absdiff(previous,gray))))
            previous=gray
            if i%12==0:frames.append(Image.fromarray(rgb));indices.append(i)
            i+=1
    finally:decoder.release()
    if not frames:raise ValueError('No actual picture decoded')
    contact(frames,[f'{kind} frame {i} / {i/24:.3f}s' for i in indices],out/(kind+'-decoded-frames.png'),columns=4)
    frames[0].save(out/(kind+'-first-frame.png'))
    (out/(kind+'-pixel-checks.json')).write_text(json.dumps({'sha256':sha(source),'decodedFrames':i,
      'meanAdjacentFrameDifference':float(np.mean(differences)),'maxAdjacentFrameDifference':max(differences),
      'manualVisualReviewRequired':True,'scope':'Independent full decode and moving pixels; object motion/quality need visual inspection.'},indent=2)+'\n')
    print(json.dumps({'video':kind,'frames':i,'meanFrameDifference':float(np.mean(differences))}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['detection','masks','generation','composite','final']);a=p.parse_args()
    out=ROOT/'qa';out.mkdir(exist_ok=True)
    if a.action=='detection':detection(out)
    elif a.action=='masks':masks(out)
    else:video(out,a.action)
