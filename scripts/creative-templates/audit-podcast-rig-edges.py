"""Source comparisons for the missing spring and foliage at stand edges.

The sampled photographed hardware/background pixels complement the broader
furniture audit. These checks do not qualify other footage or whole-film style.
"""
import argparse,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageOps,ImageEnhance,ImageFilter
p=argparse.ArgumentParser();p.add_argument('folder',type=Path);p.add_argument('theme');p.add_argument('--plates',type=Path);p.add_argument('--previous',type=Path);args=p.parse_args()
old=args.previous or args.folder.parent/'background-variety-20261019';jobs=Path.home()/'.local/share/autopromote-qa/session/podcast-model-vfx-jobs'
points=[(1040,662),(1050,659),(1060,655),(1070,652),(1080,647),(1090,645),(1100,640),(1110,636),(1120,632),(1130,627),(1140,624),(1150,619)]
streams=[cv2.VideoCapture(str(f))for f in [args.folder/(args.theme+'-a.mp4'),old/(args.theme+'-a.mp4'),jobs/'71fb39c5-ac0c-4955-8d59-0f75f5b29f4d/source.mp4']]
errors=[];before=[];rows=[];frame=0
while True:
 decoded=[s.read()for s in streams]
 if not decoded[0][0]:break
 assert all(ok for ok,_ in decoded)
 cur,prior,source=[cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)for _,im in decoded]
 now=[abs(int(cur[y,x])-int(source[y,x]))for x,y in points];was=[abs(int(prior[y,x])-int(source[y,x]))for x,y in points]
 errors+=now;before+=was;rows.append({'frame':frame,'meanSourceLumaError':float(np.mean(now)),'previousMeanSourceLumaError':float(np.mean(was))});frame+=1
for s in streams:s.release()
assert frame==208
plates=args.plates or old
image_path=plates/(args.theme+'-b-v2.png')
if not image_path.exists():image_path=plates/(args.theme+'-b.png')
with Image.open(image_path)as im:
 bg=ImageOps.fit(im.convert('RGB'),(1920,1080),method=Image.Resampling.LANCZOS)
 bg=ImageEnhance.Brightness(ImageEnhance.Color(bg.filter(ImageFilter.GaussianBlur(1.2))).enhance(.92)).enhance(2**-.15)
bg=np.array(bg,dtype=float)
edge_points=[(596,916),(597,930),(598,936),(599,944),(665,955),(668,1000)]
streams=[cv2.VideoCapture(str(f))for f in [args.folder/(args.theme+'-b.mp4'),old/(args.theme+'-b.mp4')]]
edge_errors=[];old_edge_errors=[];count=0
while True:
 decoded=[s.read()for s in streams]
 if not decoded[0][0]:break
 assert decoded[1][0]
 cur,prior=[cv2.cvtColor(im,cv2.COLOR_BGR2RGB).astype(float)for _,im in decoded]
 edge_errors +=[float(np.mean(np.abs(cur[y,x]-bg[y,x])))for x,y in edge_points]
 old_edge_errors +=[float(np.mean(np.abs(prior[y,x]-bg[y,x])))for x,y in edge_points];count+=1
for s in streams:s.release()
assert count==90
result={'theme':args.theme,'springSamples':len(errors),'springMeanSourceLumaError':float(np.mean(errors)),'springP95SourceLumaError':float(np.percentile(errors,95)),'previousSpringMeanSourceLumaError':float(np.mean(before)),'standExteriorSamples':len(edge_errors),'standExteriorMeanBackgroundError':float(np.mean(edge_errors)),'standExteriorP95BackgroundError':float(np.percentile(edge_errors,95)),'previousStandExteriorMeanBackgroundError':float(np.mean(old_edge_errors)),'perFrameSpring':rows,'scope':'Photographed coil core and selected former foliage pixels outside the real stand. Separate moving whole-frame review is required.'}
(args.folder/(args.theme+'-rig-edge-audit.json')).write_text(json.dumps(result,indent=2)+'\n')
assert result['springMeanSourceLumaError']<20 and result['springP95SourceLumaError']<35,result
assert result['standExteriorMeanBackgroundError']<4 and result['standExteriorP95BackgroundError']<8,result
print(json.dumps({k:v for k,v in result.items()if k!='perFrameSpring'},indent=2))
