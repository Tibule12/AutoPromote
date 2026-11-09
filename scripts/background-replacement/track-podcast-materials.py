"""Private current-source SAM2 garment guidance; no model admission.

Track reviewed cuff/material selections forward and backward from a visible
source pose. These remain semantic selections, never claimed true alpha.
"""
import argparse
import json
from pathlib import Path
import socket
import time

import cv2
import numpy as np
from PIL import Image,ImageDraw
import torch

from model_workers.adapters.component_segmentation import ComponentVideoTracker
from model_workers.common import sha,write_json


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out',type=Path)
    parser.add_argument('--only-anchor',action='store_true')
    args=parser.parse_args()
    args.out.mkdir(exist_ok=False)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    cv2.setNumThreads(2);torch.set_num_threads(3)
    socket.socket.connect=lambda *a,**k:(_ for _ in ()).throw(RuntimeError('Offline source-material tracking'))
    work=Path('/dev/shm/autopromote-current-pipeline-r83-20261105')
    source=Path(json.loads((work/'receipt.json').read_text())['source'])
    if sha(source)!='90517144ffecf72e4c6a33f33186db25032c3abb395e291cea4cd6d5f723d7f5':
        raise ValueError('Actual failed source changed')
    rgbdir=work/'alpha-work/outputs/rgb'
    models=json.loads(Path('config/model-runtime/registry.v1.json').read_text())['models']
    model=next(m for m in models if m['id']=='sam21-multiobject-cpu-v2')
    def points(fg,bg):
        return [{'position':[x/1430,y/1000],'label':label}
            for label,rows in [(1,fg),(0,bg)] for x,y in rows]
    selections=[
        {'id':'reviewed-left-cuff','box':[330/1430,.59,490/1430,.72],
         'points':points([(400,655),(385,630),(430,645)],[(400,580),(360,560),(340,620),(510,680)]),
         'shotPrompts':[],'propagate':True},
        {'id':'reviewed-right-cuff','box':[1200/1430,.575,1,.75],
         'points':points([(1310,665),(1360,650),(1310,625)],[(1300,560),(1410,600),(1200,680)]),
         'shotPrompts':[],'propagate':True}]
    params={'subjectId':selections[0]['id'],'initialBox':selections[0]['box'],
        'points':selections[0]['points'],'shotPrompts':[],'components':selections[1:]}
    write_json(args.out/'source-selections.json',{'anchorFrame':36,'sourceSha256':sha(source),'selections':selections,
        'notAlpha':True,'nativeAdmission':False})
    started=time.monotonic();shared=None;rows=[]
    directions=[('anchor',[36])] if args.only_anchor else [('backward',range(36,-1,-1)),('forward',range(36,48))]
    for direction,indices in directions:
        tracker=ComponentVideoTracker({'model':model,'request':{'parameters':params}},
            {'width':1430,'height':1000},Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned'),
            device='cuda',model=shared,offload_state=True)
        shared=tracker.model
        for step,index in enumerate(indices):
            picture=Image.open(rgbdir/f'rgb_{index:04d}.png').convert('RGB');rgb=np.array(picture)
            _,planes=tracker.frame(rgb,step)
            if direction=='forward' and step==0:continue
            record={'sourceFrame':index,'direction':direction,'sourceRgbSha256':sha(rgbdir/f'rgb_{index:04d}.png'),'components':[]}
            for component,(selection,plane) in enumerate(zip(selections,planes)):
                file=args.out/f'cuff-{component}-{index:04d}.png';Image.fromarray(plane).save(file)
                record['components'].append({'id':selection['id'],'file':file.name,'sha256':sha(file),'selectedPixels':int((plane>=128).sum())})
            rows.append(record)
            if index in [0,7,10,17,23,30,35,36,47]:
                boxes=[(250,400,650,800),(1120,400,1430,850)]
                sheet=Image.new('RGB',(1200,900));draw=ImageDraw.Draw(sheet)
                for component,(selection,plane,box) in enumerate(zip(selections,planes,boxes)):
                    color=np.array([0,230,160]) if component==0 else np.array([240,0,180])
                    mixed=np.rint(rgb*.65+color*.35).astype(np.uint8)
                    overlay=rgb.copy();overlay[plane>=128]=mixed[plane>=128]
                    original=picture.crop(box);annotated=Image.fromarray(overlay).crop(box)
                    y=component*450
                    sheet.paste(original,(0,y+24));sheet.paste(annotated,(500,y+24))
                    draw.text((3,y+3),f'Actual frame {index}: original / SAM2 {selection["id"]}',fill='white')
                sheet.save(args.out/f'actual-material-selection-{index:04d}.jpg',quality=98)
            write_json(args.out/'progress.json',{'actualFrames':len(rows),'targetFrames':1 if args.only_anchor else 48,
                'lastSourceFrame':index,'elapsedSeconds':time.monotonic()-started,'visualPass':False})
            print(json.dumps({'actualSourceFrame':index,'direction':direction,'elapsedSeconds':time.monotonic()-started}),flush=True)
        del tracker
    write_json(args.out/'receipt.json',{'sourceSha256':sha(source),'anchorFrame':36,'rows':sorted(rows,key=lambda r:r['sourceFrame']),
        'samCheckpointSha256':model['weights'][0]['sha256'],'privateReviewOnly':True,'semanticSelectionsNotAlpha':True,
        'elapsedSeconds':time.monotonic()-started,'nativeAdmission':False,'visualPass':False,'fourMinuteProof':False})


if __name__=='__main__':main()
