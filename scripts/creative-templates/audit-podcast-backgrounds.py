"""Compare every native frame with the retained source and accepted foreground.

This measures selected furniture, skin and hardware interiors. Visual review of
the whole frame is separate; a dark background can conceal a lost dark edge.
"""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np

parser=argparse.ArgumentParser()
parser.add_argument('folder',type=Path)
parser.add_argument('theme')
parser.add_argument('camera',choices=['a','b'])
args=parser.parse_args()
proof=Path(__file__).resolve().parents[2]/'reports/model-capability-runtime-v1-20261009/proof/launch-template/podcast-native1080-20261016'
old_root=Path.home()/'.local/share/autopromote-qa/session/podcast-model-vfx-jobs'
job='71fb39c5-ac0c-4955-8d59-0f75f5b29f4d' if args.camera=='a' else '6dfef00d-68a6-4bc0-92b4-940c7a5b41c6'
audit='plant-free-v3-microphone-integrity-a.json' if args.camera=='a' else 'plant-free-microphone-integrity-b.json'
points=[item['point'] for item in json.loads((proof/audit).read_text())['perFrame'][0]['hardware']]
streams=[cv2.VideoCapture(str(p)) for p in [args.folder/(args.theme+'-'+args.camera+'.mp4'),old_root/job/'source.mp4',old_root/job/'render.mp4']]
expected=208 if args.camera=='a' else 90
count=0;lost=[];rig_deltas=[];regions={};difference=[]
while True:
    decoded=[stream.read() for stream in streams]
    if not decoded[0][0]:
        assert not any(ok for ok,_ in decoded),'Native render has fewer frames than retained source'
        break
    assert all(ok for ok,_ in decoded),'Native render has extra/misaligned frames'
    current,source,old=[frame for _,frame in decoded]
    assert current.shape==source.shape==old.shape==(1080,1920,3)
    gray=[cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY) for frame in [current,source,old]]
    for x,y in points:
        levels=[float(np.median(frame[y-1:y+2,x-1:x+2])) for frame in gray]
        if levels[1]<80 and levels[0]>max(95,levels[1]+45):lost.append({'frame':count,'point':[x,y],'luma':levels})
        rig_deltas.append(abs(levels[0]-levels[2]))
    if args.camera=='a':
        for name,box,kind in [('moving_couch',(200,710,1020,1080),'blue'),('seated_lower_body',(500,900,840,1080),'all'),('foreground_glass',(1256,996,1380,1080),'all'),('shirt_beside_microphone',(742,760,784,875),'blue'),('shirt_above_mic_flag',(752,590,774,614),'blue'),('microphone_mount',(781,646,800,669),'all'),('moving_hands',(450,500,910,850),'skin'),('secondary_trousers',(1660,750,1920,1080),'blue')]:
            x0,y0,x1,y1=box;src=source[y0:y1,x0:x1].astype(float);dst=current[y0:y1,x0:x1].astype(float)
            b,g,r=cv2.split(src)
            if kind=='all':select=np.ones(src.shape[:2],dtype=bool)
            elif kind=='blue':select=(b>r*1.15)&(b>g*1.04)&(b>30)
            else:
                # Source-only skin selection excludes beige printed stripes
                # and the tinted microphone flag selected by a loose RGB test.
                hue,saturation,value=cv2.split(cv2.cvtColor(src.astype(np.uint8),cv2.COLOR_BGR2HSV))
                select=(hue<=20)&(saturation>=115)&(value>55)&(value<220)
            if not select.any():continue
            delta=np.abs(dst-src).mean(axis=2)[select]
            region=regions.setdefault(name,{'selectedPixels':0,'worstMeanError':0.,'worstFractionOver40':0.})
            region['selectedPixels']+=int(select.sum())
            region['worstMeanError']=max(region['worstMeanError'],float(delta.mean()))
            region['worstFractionOver40']=max(region['worstFractionOver40'],float(np.mean(delta>40)))
    difference.append(float(np.abs(current[:500].astype(float)-old[:500]).mean()))
    count+=1
for stream in streams:stream.release()
assert count==expected,(count,expected)
result={'theme':args.theme,'camera':args.camera,'frames':count,'hardwareSamples':count*len(points),'lostDarkHardwareSamples':len(lost),'badSamples':lost[:20],
        'hardwareDifferenceFromPrevious':{'meanLumaDelta':float(np.mean(rig_deltas)),'maximumLumaDelta':float(np.max(rig_deltas))},
        'foregroundRegions':regions,'meanUpperFrameDifferenceFromPreviousBackground':float(np.mean(difference)),
        'scope':'Every-frame selected foreground interiors and hardware; full-frame visual review remains separate.'}
output=args.folder/(args.theme+'-'+args.camera+'-foreground-audit.json');output.write_text(json.dumps(result,indent=2)+'\n')
assert not lost,result
assert all(region['worstMeanError']<12 and region['worstFractionOver40']<.04 for region in regions.values()),result
assert np.mean(difference)>10,'New background is not materially different'
print(json.dumps(result,indent=2))
