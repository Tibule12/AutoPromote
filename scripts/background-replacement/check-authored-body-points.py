"""Internal same-source/SAM comparison of sparse clothing corrections only."""
import copy
import gc
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw
import torch

from model_workers.adapters.component_segmentation import ComponentVideoTracker
from model_workers.common import sha, write_json


def main():
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path)
    p.add_argument('--baseline',type=Path);p.add_argument('--extra-points',type=Path);p.add_argument('--box')
    a=p.parse_args();a.out.mkdir(exist_ok=False)
    (a.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    private=Path('reports/background-replacement-20261101/private')
    registration=json.loads((private/'full-rate-registration-20261104/smoothed-registration.json').read_text())
    master=Path(registration['source'])
    prior=json.loads((private/'other-speaker-current-policy-r221-20261106/source-plan.json').read_text())
    if sha(master)!=prior['masterSha256']:raise ValueError('Actual master changed')
    raw=subprocess.check_output(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(master),'-vf','fps=24','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
    if len(raw)!=1920*1080*3:raise ValueError('Original frame geometry differs')
    rgb=cv2.warpAffine(np.frombuffer(raw,np.uint8).reshape(1080,1920,3),np.array(registration['rows'][0]['smoothedMatrix']),(1430,1000),flags=cv2.INTER_LINEAR)
    source=a.out/'actual-source.png';Image.fromarray(rgb).save(source)
    baseline=copy.deepcopy(json.loads((a.baseline or private/'other-speaker-current-policy-r221-20261106/camera-00-0000-0012/frames-0000-0012/selection.json').read_text()))
    baseline.pop('refinement',None);baseline['components']=[]
    corrected=copy.deepcopy(baseline)
    positions=json.loads(a.extra_points.read_text())if a.extra_points else [(305,850),(395,865),(540,930),(605,984),(470,980)]
    if a.box:
        box=list(map(float,a.box.split(',')))
        if len(box)!=4 or not 0<=box[0]<box[2]<=1 or not 0<=box[1]<box[3]<=1:raise ValueError('Invalid authored body box')
        corrected['initialBox']=box
    corrected['points'].extend({'position':[x/1430,y/1000],'label':1}for x,y in positions)
    if len(corrected['points'])>16:raise ValueError('Existing Studio point limit exceeded')
    annotated=Image.fromarray(rgb.copy());draw=ImageDraw.Draw(annotated)
    for x,y in positions:draw.ellipse((x-5,y-5,x+5,y+5),outline='lime',width=2);draw.text((x+6,y-12),f'{x},{y}',fill='lime')
    annotated.save(a.out/'actual-source-authored-keep-points.png')
    definition=next(m for m in json.loads(Path('config/model-runtime/registry.v1.json').read_text())['models']if m['id']=='sam21-multiobject-cpu-v2')
    socket.socket.connect=lambda *args,**kwargs:(_ for _ in ()).throw(RuntimeError('Local model networking disabled'))
    torch.set_num_threads(2);cv2.setNumThreads(2)
    shared=None;results=[];start=time.monotonic()
    for name,params in [('baseline',baseline),('corrected',corrected)]:
        tracker=ComponentVideoTracker({'model':definition,'request':{'parameters':params}},{'width':1430,'height':1000},Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned'),device='cuda',model=shared,offload_state=True)
        shared=tracker.model
        _,planes=tracker.frame(rgb,0);torch.cuda.synchronize()
        Image.fromarray(planes[0]).save(a.out/f'{name}-person.png')
        write_json(a.out/f'{name}-authored-selection.json',params)
        results.append({'name':name,'actualSourceFrame':0,'sourcePngSha256':sha(source),'points':len(params['points']),'elapsedSeconds':time.monotonic()-start})
        del tracker;gc.collect();torch.cuda.empty_cache()
        print(json.dumps(results[-1]),flush=True)
    box=(150,350,850,1000);sheet=Image.new('RGB',(2100,674));draw=ImageDraw.Draw(sheet)
    for i,(title,image)in enumerate([('Actual original',Image.fromarray(rgb)),('Actual baseline SAM',Image.open(a.out/'baseline-person.png').convert('RGB')),('Actual sparse-correction SAM',Image.open(a.out/'corrected-person.png').convert('RGB'))]):
        sheet.paste(image.crop(box),(i*700,24));draw.text((i*700+4,4),title,fill='white')
    sheet.save(a.out/'actual-person-mask-comparison.jpg',quality=98)
    write_json(a.out/'receipt.json',{'sourceMasterSha256':prior['masterSha256'],'registeredSourceFrame':0,'sourcePngSha256':sha(source),'rows':results,'currentPinnedCheckpoint':True,'existingPointLimitRespected':True,'equipmentSelectionsNotChanged':True,'nativeAdmission':False,'alphaInferenceOrComposite':False,'visualPass':False,'fourMinuteProof':False,'paidCloud':False})


if __name__=='__main__':main()
