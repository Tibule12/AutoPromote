"""Explicit observed-background evidence; it never substitutes photographed RGB.

The small revealed screen patch is a confirmed background selection. A current
source pixel must match an observed background pixel before its alpha is cleared.
"""
from pathlib import Path
import importlib.util,json,argparse
import numpy as np,cv2,onnxruntime as ort
from PIL import Image
s=importlib.util.spec_from_file_location('mic_roi',Path(__file__).with_name('repair-microphone-windscreen.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class BackgroundHoldout:
 def __init__(self):
  r=Path('reports/background-replacement-20261101/private/four-minute-r9');reference=np.array(Image.open('/dev/shm/autopromote-background-four-minute-r9/interval-180/samples/source-04800.jpg'));self.reference=cv2.resize(reference,(1430,1000),interpolation=cv2.INTER_LANCZOS4);self.box=(380,810,590,945);x0,y0,x1,y1=self.box;roi=self.reference[y0:y1,x0:x1];evidence=np.zeros(roi.shape[:2],np.uint8);points=np.array([[380,810],[551,810],[542,825],[537,837],[543,850],[551,860],[550,864],[534,870],[522,883],[518,891],[485,900],[461,910],[437,920],[415,930],[395,940],[380,945]],np.float32);points[:,0]*=1430/1440;points-=np.array([x0,y0]);cv2.fillPoly(evidence,[np.rint(points).astype(np.int32)],1);evidence=evidence>0;self.evidence=evidence;cache=m.MicrophoneRepair(self.box);cache.alpha=np.zeros(evidence.shape,np.uint8);self.background=np.array(cache.renderer.render(Image.fromarray(roi),0));Image.fromarray(evidence.astype(np.uint8)*255).save(r/'observed-background-selection.png')
 def repair(self,source,frame,alpha):
  if source.shape[1]!=1430:source=cv2.resize(source,(1430,1000),interpolation=cv2.INTER_LANCZOS4)
  x0,y0,x1,y1=self.box;delta=np.max(np.abs(source[y0:y1,x0:x1].astype(np.int16)-self.reference[y0:y1,x0:x1].astype(np.int16)),axis=2);selected=self.evidence&(delta<=18);frame[y0:y1,x0:x1][selected]=self.background[selected];alpha[y0:y1,x0:x1][selected]=0;return frame,alpha,int(selected.sum())
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('output');a=p.parse_args();out=Path(a.output);out.mkdir(exist_ok=False);holdout=BackgroundHoldout()
 for frame in [4800,4824,4848,5112]:
  folder=Path('/dev/shm/autopromote-background-four-minute-r9/finished-180/samples');raw=Path('/dev/shm/autopromote-background-four-minute-r9/interval-180/samples');source=np.array(Image.open(raw/f'source-{frame:05d}.jpg'));current=np.array(Image.open(folder/f'after-{frame:05d}.jpg'));alpha=np.array(Image.open(folder/f'alpha-{frame:05d}.png'));current,alpha,count=holdout.repair(source,current,alpha);Image.fromarray(current).save(out/f'frame-{frame:05d}.png');print('ACTUAL_OBSERVED_BACKGROUND_REPAIR',frame,count,flush=True)
