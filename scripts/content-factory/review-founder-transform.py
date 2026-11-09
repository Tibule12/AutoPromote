"""Decode the generated transformation and expose continuity evidence for review.

Metrics are diagnostics, never a proxy for judging the story or realism.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def probe(path):
    data = subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,nb_frames,avg_frame_rate,duration',
        '-of', 'json', str(path)])
    return json.loads(data)['streams'][0]


def decoded(path, count=None):
    command = ['ffmpeg', '-threads', '1', '-v', 'error', '-i', str(path)]
    if count:
        command.extend(['-frames:v', str(count)])
    command.extend(['-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
    return np.frombuffer(subprocess.check_output(command), dtype=np.uint8).reshape((-1, 480, 832, 3))


def run(video, continuation, output):
    if output.exists() and any(output.iterdir()):
        raise FileExistsError('Use a fresh review directory')
    stream = probe(video)
    if (int(stream['width']), int(stream['height']), stream['avg_frame_rate']) != (832, 480, '16/1'):
        raise ValueError('Unexpected generated-video dimensions or frame rate')
    frames = decoded(video)
    if len(frames) != 81:
        raise ValueError('Expected all 81 generated frames')
    following = decoded(continuation, 1)[0]
    if probe(continuation)['width'] != 832 or probe(continuation)['height'] != 480:
        raise ValueError('Continuation must have the same native frame size')
    output.mkdir(parents=True)
    samples = [0, 4, 8, 12, 16, 24, 32, 40, 48, 56, 64, 72, 80]
    tiles = [(f'VACE {i/16:.2f}s', frames[i]) for i in samples]
    tiles.append(('Continuing yacht first frame', following))
    thumb = (416, 240)
    sheet = Image.new('RGB', (thumb[0]*4, (thumb[1]+26)*4), '#090b12')
    draw = ImageDraw.Draw(sheet)
    for n, (label, array) in enumerate(tiles):
        x, y = (n%4)*thumb[0], (n//4)*(thumb[1]+26)
        sheet.paste(Image.fromarray(array).resize(thumb), (x,y))
        draw.text((x+7,y+243), label, fill='white')
    sheet.save(output/'decoded-review.png')
    seam = Image.new('RGB',(1664,515),'#090b12')
    seam.paste(Image.fromarray(frames[-1]),(0,0))
    seam.paste(Image.fromarray(following),(832,0))
    ImageDraw.Draw(seam).text((8,486),'Generated final frame                 |                 Continuation first frame',fill='white')
    seam.save(output/'seam-review.png')
    diffs=np.abs(np.diff(frames.astype(np.int16),axis=0)).mean(axis=(1,2,3))
    seam_diff=np.abs(frames[-1].astype(np.int16)-following.astype(np.int16))
    receipt={
        'status':'DECODED_PENDING_CREATIVE_REVIEW',
        'generatedSha256':hashlib.sha256(video.read_bytes()).hexdigest(),
        'continuationSha256':hashlib.sha256(continuation.read_bytes()).hexdigest(),
        'generatedFrames':len(frames),'fps':16,'width':832,'height':480,
        'largestMotionChanges':[
            {'betweenFrames':[int(i),int(i+1)],'meanAbsolutePixelChange':round(float(diffs[i]),3)}
            for i in np.argsort(diffs)[-5:][::-1]],
        'seamMeanAbsolutePixelChange':round(float(seam_diff.mean()),3),
        'seamMSE':round(float(np.mean(seam_diff.astype(np.float32)**2)),3),
        'requiredVisualChecks':[
            'Paper origin remains readable before ocean appears',
            'Mast grows from existing paper crease, never appears detached',
            'Hull visibly changes into timber; spray does not hide the event',
            'Water and camera obey one continuous world and scale',
            'Last generated frame joins moving yacht without an obvious jump',
            'Full sequence is compelling with its sound design'],
        'limitation':'Numerical differences do not establish visual continuity or creative acceptance.'}
    (output/'receipt.json').write_text(json.dumps(receipt,indent=2))
    print(json.dumps({'status':receipt['status'],'seamMAE':receipt['seamMeanAbsolutePixelChange']}))


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--video',type=Path,required=True)
    p.add_argument('--continuation',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args()
    run(a.video.resolve(),a.continuation.resolve(),a.output.resolve())
