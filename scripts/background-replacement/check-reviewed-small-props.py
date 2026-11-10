"""Internal SAM check of actual source-coordinate prop corrections.

The blue butterfly is a physical foreground decoration, not screen spill.
It is prompted independently from brown foliage and TV background. This uses
the existing per-component tracker; no native admission or visual pass follows.
"""
import argparse
import copy
import json
from pathlib import Path
import socket
import time

import numpy as np
from PIL import Image, ImageDraw

from model_workers.adapters.component_segmentation import ComponentVideoTracker
from model_workers.common import sha, write_json


def points(positive, negative):
    return [{'position': [x/1430, y/1000], 'label': label}
        for group, label in [(positive, 1), (negative, 0)] for x, y in group]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('out', type=Path)
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cpu')
    args = parser.parse_args()
    args.out.mkdir(exist_ok=False)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    private = Path('reports/background-replacement-20261101/private')
    source = private/'corrective-click-agreement-r66/striped-person-first-frame/actual-source.png'
    rgb = np.asarray(Image.open(source))
    definition = next(m for m in json.loads(Path('config/model-runtime/registry.v1.json').read_text())['models']
        if m['id'] == 'sam21-multiobject-cpu-v2')
    old = json.loads((private/'fine-props-r8/native-scoped-final/final-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]
    selection = json.loads(old['maskJob']['selectionJson'])
    butterfly = {'id':'reviewed-physical-blue-butterfly','box':[1175/1430,.549,1243/1430,.61],
        'propagate':False,'shotPrompts':[],
        'points':points([(1200,581),(1224,570),(1220,585)],[(1180,566),(1239,566),(1240,594),(1192,606)])}
    plant = copy.deepcopy(selection['components'][3])
    plant['propagate'], plant['shotPrompts'] = False, []
    plant['points'] = points([(1194,480),(1220,531),(1184,549),(1138,583),(1155,597),
        (1108,582),(1242,612),(1262,605),(1144,667),(1237,690),(1350,704)],
        [(1165,512),(1143,530),(1245,567),(1244,620),(1355,629)])
    params = {'subjectId':'PRIVATE_ACTUAL_PERSON','initialBox':selection['box'],
        'points':[{'position':p,'label':v} for p,v in zip(selection['prompt']['points'],selection['prompt']['labels'])],
        'shotPrompts':[], 'components':[butterfly,plant]}
    write_json(args.out/'actual-reviewed-selection.json',params)
    socket.socket.connect=lambda *a,**k:(_ for _ in ()).throw(RuntimeError('Local inference only'))
    started=time.monotonic()
    tracker=ComponentVideoTracker({'model':definition,'request':{'parameters':params}},
        {'width':1430,'height':1000},Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned'),
        device=args.device,refresh_fixed=True,offload_state=True)
    _,planes=tracker.frame(rgb,0)
    canvas=Image.new('RGB',(1800,700))
    for n,(name,mask) in enumerate([('Actual original source',np.full((1000,1430),255,np.uint8)),
        ('Independent physical butterfly',planes[1]),('Corrected brown foliage',planes[2])]):
        Image.fromarray(mask).save(args.out/f'component-{n:02d}.png')
        image=Image.composite(Image.fromarray(rgb),Image.new('RGB',(1430,1000),(85,90,95)),
            Image.fromarray((mask>=128).astype(np.uint8)*255)).crop((1050,450,1430,780))
        image.thumbnail((600,660));canvas.paste(image,(600*n,24));ImageDraw.Draw(canvas).text((600*n+4,4),name,fill='white')
    canvas.save(args.out/'actual-source-prop-mask-review.jpg',quality=98)
    write_json(args.out/'receipt.json',{'sourceSha256':sha(source),'device':args.device,
        'sourceFrames':1,'currentRgbInference':True,'elapsedSeconds':time.monotonic()-started,
        'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False})
    print('ACTUAL_SOURCE_SEPARATE_PROP_MASKS_READY_FOR_REVIEW',flush=True)


if __name__=='__main__':
    main()
