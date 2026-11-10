"""Private ablation of false background seeds on exact archived source evidence.

No artifacts, receipts or native review states are admitted by this check.
"""
import argparse
import inspect
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageOps

from model_workers.adapters import source_edge_alpha as adapter
from model_workers.common import sha, write_json


def plane(file):
    decoder=cv2.VideoCapture(str(file));ok,value=decoder.read();decoder.release()
    if not ok or not np.array_equal(value[:,:,0],value[:,:,1]) or not np.array_equal(value[:,:,0],value[:,:,2]):
        raise ValueError('Actual lossless grayscale evidence missing')
    return value[:,:,0]


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path)
    p.add_argument('--component-id',default='component-9afa0763-f83b-4be8-95ee-e1c5c5766117')
    a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
    private=Path('reports/background-replacement-20261101/private')
    archive=private/'bench-current-pipeline-r229-20261106/camera-00-0000-0001/frames-0000-0001'
    receipt=json.loads((archive/'receipt.json').read_text())
    for item in receipt['maskArchives']:
        if sha(archive/item['file'])!=item['sha256']:raise ValueError('Retained mask archive changed')
    source=private/'authored-body-points-r222-20261106/actual-source.png'
    if sha(source)!='16a4fb39f996d18fc59d32a55f9162d7da207a6d522583dd50dfcda56f6852ce':
        raise ValueError('Exact registered source changed')
    rgb=np.asarray(Image.open(source).convert('RGB'));alpha=plane(archive/'alpha-lossless.mkv')
    manifest=json.loads((archive/'component-manifest.json').read_text())
    planes=[plane(archive/f'component-{i:02d}-selection-lossless.mkv')for i in range(len(manifest['components']))]
    # Same current person/other-object protection used by the registered adapter.
    primary=cv2.dilate((planes[0]>=24).astype(np.uint8),np.ones((7,7),np.uint8))
    target=next(i for i,c in enumerate(manifest['components'])if c['selection']['id']==a.component_id)
    protected=primary.copy()
    for i,value in enumerate(planes[1:],1):
        if i!=target:protected|=cv2.dilate((value>=128).astype(np.uint8),np.ones((7,7),np.uint8))
    selected=manifest['components'][target]['selection'];box=[round(v*s)for v,s in zip(selected['box'],[1430,1000,1430,1000])]
    implementation=inspect.getsource(adapter.classify_corrected_fixed_object)
    original='gc[cv2.dilate((pr>=64).astype(np.uint8),np.ones((5,5),np.uint8))==0]=cv2.GC_BGD'
    assert implementation.count(original)==1
    candidate=implementation.replace(original,'# Low SAM evidence is uncertain, not an authored background exclusion.')
    namespace=vars(adapter).copy();exec(candidate,namespace)
    function=namespace['classify_corrected_fixed_object']
    (a.out/'candidate-implementation.py').write_text(candidate)
    result=function(rgb,alpha,rgb,selected['points'],box,planes[target],protected)
    if result is None:raise ValueError('Current authored selection did not qualify for classification')
    assert np.array_equal(result[protected>0],alpha[protected>0])
    Image.fromarray(result).save(a.out/'alpha.png')
    background=ImageOps.fit(Image.open(private/'replacement.png').convert('RGB'),(1430,1000))
    outputs=[]
    for name,value in [('prior',alpha),('growth',result)]:
        picture=Image.composite(Image.fromarray(rgb),background,Image.fromarray(value))
        picture.save(a.out/f'diagnostic-{name}.png');outputs.append(picture)
    region=(810,650,1430,1000);sheet=Image.new('RGB',(1860,374));draw=ImageDraw.Draw(sheet)
    for i,(name,picture)in enumerate(zip(['Actual source','Prior matte; diagnostic RGB','Released false BG seeds; diagnostic RGB'],[Image.fromarray(rgb),*outputs])):
        sheet.paste(picture.crop(region),(i*620,24));draw.text((i*620+3,4),name,fill='white')
    sheet.save(a.out/'actual-bench-comparison.jpg',quality=98)
    write_json(a.out/'receipt.json',{'sourceSha256':sha(source),'sourceFrame':0,'sourceArchiveReceiptSha256':sha(archive/'receipt.json'),
        'registeredAdapterChanged':False,'candidateImplementationSha256':sha(a.out/'candidate-implementation.py'),
        'protectedPixelsExact':True,'foregroundRgbRecoveryOrFinalGrading':False,'diagnosticOnly':True,
        'actualVisualReviewPending':True,'nativeAdmission':False,'fourMinuteProof':False,'paidCloud':False})
    print('Actual fixed-object growth ablation complete; visual review pending',flush=True)


if __name__=='__main__':main()
