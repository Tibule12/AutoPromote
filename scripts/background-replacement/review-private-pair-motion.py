"""Encode and inspect the actual private48-frame source-bound pair candidate.

The images are real compositor outputs, not illustrations or a native Studio
admission. Contact pages compare every decoded movie frame with the source.
No human visual acceptance is inferred from encoding/metrics.
"""
import argparse
import json
from pathlib import Path
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw

from model_workers.common import sha,write_json


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('candidate',type=Path)
    p.add_argument('--recovered-source',action='store_true')
    a=p.parse_args()
    receipt=json.loads((a.candidate/'receipt.json').read_text())
    if a.recovered_source:
        from recovered_motion_inputs import RECOVERED,PrivatePairedCache
        PrivatePairedCache() # verifies all48 actual old-source pixel hashes
        recovery=json.loads((RECOVERED/'receipt.json').read_text())
        source=Path(recovery['source']);rgbdir=RECOVERED/'rgb'
        if receipt.get('sourceRecoveryReceiptSha256')!=sha(RECOVERED/'receipt.json'):
            raise ValueError('Candidate does not bind the verified recovered source')
    else:
        work=Path('/dev/shm/autopromote-current-pipeline-r83-20261105')
        source=Path(json.loads((work/'receipt.json').read_text())['source'])
        rgbdir=work/'alpha-work/outputs/rgb'
    if receipt['sourceSha256']!=sha(source) or [r['frame'] for r in receipt['rows']]!=list(range(48)):
        raise ValueError('Expected the completed actual48-frame source-bound candidate')
    review=a.candidate/'actual-encoded-review';review.mkdir(exist_ok=False)
    movie=a.candidate/'internal-actual-motion.mp4'
    master=Path('/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4')
    subprocess.run(['ffmpeg','-nostdin','-v','error','-framerate','24','-i',str(a.candidate/'actual-composite-%04d.png'),
        '-ss','224','-i',str(master),'-t','2','-map','0:v:0','-map','1:a:0',
        '-c:v','libx264','-threads','2','-preset','fast','-crf','14','-pix_fmt','yuv420p',
        '-c:a','aac','-b:a','192k','-movflags','+faststart',str(movie)],check=True)
    movie_info=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(movie)]))
    video=next(s for s in movie_info['streams'] if s['codec_type']=='video')
    if int(video['nb_read_frames'])!=48 or video['avg_frame_rate']!='24/1' or (video['width'],video['height'])!=(1430,1000):
        raise ValueError('Encoded candidate clock/geometry differs')
    capture=cv2.VideoCapture(str(movie));rows=[]
    pages={side:None for side in ['left','right']}
    # Tight crops keep the actual moving contour large enough to inspect.
    boxes={'right':(1110,320,1430,680),'left':(280,280,700,720)}
    for index in range(48):
        ok,bgr=capture.read()
        if not ok:raise ValueError('Actual encoded picture ended early')
        decoded=Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB))
        original=Image.open(rgbdir/f'rgb_{index:04d}.png').convert('RGB')
        for side,box in boxes.items():
            w,h=box[2]-box[0],box[3]-box[1]
            if index%6==0:pages[side]=Image.new('RGB',(w*2,(h+24)*6))
            y=(index%6)*(h+24)
            for column,(title,picture) in enumerate([('Actual original',original),('Actual encoded candidate',decoded)]):
                pages[side].paste(picture.crop(box),(column*w,y+24))
                ImageDraw.Draw(pages[side]).text((column*w+3,y+4),f'{title} | frame {index}',fill='white')
            if index%6==5:pages[side].save(review/f'{side}-page-{index//6}.jpg',quality=98)
        if index in [0,5,10,17,23,36,47]:
            sheet=Image.new('RGB',(2860,1024))
            sheet.paste(original,(0,24));sheet.paste(decoded,(1430,24))
            ImageDraw.Draw(sheet).text((4,4),f'Actual original / actual encoded candidate | frame {index}',fill='white')
            sheet.save(review/f'whole-{index:04d}.jpg',quality=98)
        alpha=np.array(Image.open(a.candidate/f'alpha-{index:04d}.png'))
        rows.append({'frame':index,'opaquePrintedLetterPixels':[int(alpha[616,1068]),int(alpha[627,1039])],
            'decodedRgbSha256':__import__('hashlib').sha256(decoded.tobytes()).hexdigest()})
    if capture.read()[0]:raise ValueError('Encoded candidate has extra frames')
    capture.release()
    write_json(review/'decode-receipt.json',{'sourceSha256':sha(source),'movieSha256':sha(movie),
        'decodedFrames':48,'fps':24,'size':[1430,1000],'allFramesOnSourceEncodedContactPages':True,
        'actualHumanReviewCompleted':False,'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False,'rows':rows})
    print(json.dumps({'movieSha256':sha(movie),'actualDecodedFrames':48,'humanReviewPending':True}),flush=True)


if __name__=='__main__':main()
