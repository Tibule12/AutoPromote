"""Private actual-source check of existing Studio cleanup on a paired estimate.

Uses the existing foreground_refine command and source-bound opaque protection.
No new product effect, model, artifact admission, or claimed visual acceptance.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw

from model_workers.common import sha, write_json
from recovered_motion_inputs import PRIVATE, RECOVERED, PAIR, original, renderer, load_components

_spec = importlib.util.spec_from_file_location('private_soft_foreground_recovery',
    Path(__file__).with_name('check-soft-foreground-recovery.py'))
_recovery = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_recovery)
recover = _recovery.recover


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    parser.add_argument('--parent', type=Path, default=PRIVATE/'photographic-material-motion-r201-20261106')
    parser.add_argument('--indices', default='7,15,23,39,10,17,35')
    parser.add_argument('--value', type=float, default=.74)
    parser.add_argument('--all-frames', action='store_true')
    args = parser.parse_args()
    args.out.mkdir(exist_ok=False)
    cv2.setNumThreads(2)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    (args.out/'foreground-recovery.py').write_bytes(Path(__file__).with_name('check-soft-foreground-recovery.py').read_bytes())
    subject_renderer = renderer()
    prepare = subject_renderer._prepare_foreground
    project = json.loads((PRIVATE/'fine-props-r8/native-scoped-final/final-project.autopromote.json').read_text())
    template = next(e for e in project['snapshot']['subjectVfxScenes'][0]['scene']['effects'] if e['type']=='foreground_refine')
    effect = {**template, 'id':'private-source-tv-cleanup', 'decontaminate':0,
        'detail_box':[0,0,410/1430,.725], 'dark_max':0, 'feather':.15,
        'reject_hue':23, 'reject_tolerance':10, 'reject_saturation':.7,
        'reject_value':args.value, 'reject_connected':True, 'after_holdout':True}
    B = np.array(Image.open(PAIR/'actual-photographed-reference.png'))
    observed = np.array(Image.open(PAIR/'actual-photographed-support.png'))>0
    write_json(args.out/'existing-native-command.json', effect)
    started = time.monotonic()
    rows = []
    for index in (range(48) if args.all_frames else map(int,args.indices.split(','))):
        image = original(index)
        rgb = np.array(image)
        fg = np.array(Image.open(args.parent/f'foreground-{index:04d}.png')).astype(float)/255
        alpha = np.array(Image.open(args.parent/f'alpha-{index:04d}.png'))
        components = load_components(index)
        _, cleaned = prepare(image, Image.fromarray(alpha), [effect], 1430, 1000)
        candidate = np.array(cleaned)
        # High-confidence current hand plus independently opaque source alpha
        # protects genuine bright skin/rings from the authored screen cleanup.
        native = np.array(Image.open(RECOVERED/f'native-alpha/matte_{index:04d}.png'))
        protected = (components[1]>=224)&(native>=254)
        candidate[protected] = alpha[protected]
        changed = candidate!=alpha
        ys,xs = np.where(changed)
        if len(xs):
            x0,y0 = max(0,int(xs.min())-30),max(0,int(ys.min())-30)
            x1,y1 = min(1430,int(xs.max())+31),min(1000,int(ys.max())+31)
            sl = np.s_[y0:y1,x0:x1]
            new_f,diagnostics = recover(rgb[sl],B[sl],candidate[sl].astype(float)/255,fg[sl],observed[sl])
            affected = cv2.dilate(changed[sl].astype(np.uint8),np.ones((9,9),np.uint8))>0
            affected &= observed[sl]
            fg[sl][affected] = new_f[affected]
        else:
            diagnostics = {'noAlphaChange':True}
        combined = np.maximum(components[1],components[2])
        outside = cv2.dilate((combined>=64).astype(np.uint8),np.ones((31,31),np.uint8))==0
        unrelated = (components[0]>=128)&(combined<32)
        keep = outside|unrelated
        baseline_f = np.array(Image.open(args.parent/f'foreground-{index:04d}.png')).astype(float)/255
        fg[keep] = baseline_f[keep]
        candidate[keep] = alpha[keep]
        foreground = Image.fromarray(np.rint(fg.clip(0,1)*255).astype(np.uint8))
        mask = Image.fromarray(candidate)
        subject_renderer._prepare_foreground = lambda *unused,f=foreground,m=mask:(f,m)
        output = subject_renderer.render(image,index)
        subject_renderer._prepare_foreground = prepare
        foreground.save(args.out/f'foreground-{index:04d}.png')
        mask.save(args.out/f'alpha-{index:04d}.png')
        output.save(args.out/f'actual-composite-{index:04d}.png')
        for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
            w,h = box[2]-box[0],box[3]-box[1]
            sheet = Image.new('RGB',(w*3,h+24))
            for column,(label,picture) in enumerate([
                ('Actual source',image),
                ('Earlier paired candidate',Image.open(args.parent/f'actual-composite-{index:04d}.png')),
                ('Existing Studio cleanup + source-colour recovery',output)]):
                sheet.paste(picture.crop(box),(column*w,24))
                ImageDraw.Draw(sheet).text((column*w+3,4),label,fill='white')
            sheet.save(args.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'alphaPixelsChanged':int(np.count_nonzero(candidate!=alpha)),
            'protectedOpaqueHandPixelsChanged':int(np.count_nonzero(candidate[protected]!=alpha[protected])),
            'foregroundRecovery':diagnostics,'visualPass':False})
        print(json.dumps({'frame':index,'seconds':time.monotonic()-started}),flush=True)
    write_json(args.out/'receipt.json',{'rows':rows,'allFrames':args.all_frames,
        'parent':str(args.parent),'parentReceiptSha256':sha(args.parent/'receipt.json'),
        'sourceSha256':json.loads((RECOVERED/'receipt.json').read_text())['sourceSha256'],
        'sourceRecoveryReceiptSha256':sha(RECOVERED/'receipt.json'),
        'existingStudioCommand':effect,'elapsedSeconds':time.monotonic()-started,
        'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False,
        'paidCloudInference':False,'providerUpload':False})


if __name__=='__main__':
    main()
