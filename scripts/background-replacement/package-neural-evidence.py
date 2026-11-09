"""Add actual current neural-mask evidence; never annotate quality as approved."""
from pathlib import Path
import argparse,json,zipfile,os,hashlib,shutil
p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('destination');a=p.parse_args();r=Path(a.root);d=Path(a.destination);assert (d/'Studio native export - four-minute repair.mp4').is_file();raw=Path('/dev/shm/autopromote-background-four-minute-r9/current-neural-full');receipt=json.load(open(raw/'assembly-verification.json'));assert receipt['frames']==5760 and receipt['currentNeuralBodyCorrection']['photographedForegroundStencilsRemoved'];archive=d/'Actual subject masks and corrective alpha.zip';keys=sorted((raw/'neural-key-masks').glob('*.png'));assert keys
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=3) as z:
 for f in keys:z.write(f,'Current body SAM2 keys/'+f.name)
 z.writestr('Current body SAM2 keys/selection-and-clock.json',json.dumps({'sourceSha256':receipt['sourceSha256'],'neuralKeyFrames':[int(f.stem) for f in keys],'parameters':receipt['currentNeuralBodyCorrection']['parameters'],'keyInferenceHz':1,'sourceFlowIntermediateHz':24,'weights':'Existing pinned Apache-2.0 SAM2.1; no weights distributed','notDensePerObjectLongFormNativeArtifacts':True,'visualApproval':False},indent=2))
 for name in ['component-probability','corrected-alpha','source-hand']:
  for f in sorted((r/'hand-correction-224-226'/name).glob('*.png')):z.write(f,'Hand 224-226s/'+name+'/'+f.name)
 for name in ['receipt.json','sleeve-source-clock-check.json']:z.write(r/'hand-correction-224-226'/name,'Hand 224-226s/'+name)
 for name in ['component-probability','corrected-alpha','source-hand']:
  for f in sorted((r/'shoulder-join-224-226-additive'/name).glob('*.png')):z.write(f,'Shoulder join 224-226s/'+name+'/'+f.name)
 z.write(r/'shoulder-join-224-226-additive/receipt.json','Shoulder join 224-226s/receipt.json')
 z.writestr('README.txt','Actual masks, not generated examples: sparse current-frame SAM2 body keys at 1 Hz, 24 Hz source-flow mask transport, and 48 dense hand component/alpha/source-crop frames at 224-226s. Full effective combined foreground alpha is separately retained as the 5760-frame lossless MKV. The Studio review project imports the corrected movie; this does not qualify editable long-form native per-object artifacts. The rejected photographed foreground reference stencils are not used by this body correction. Original photographed RGB is decoded every frame. No commercial integration or professional quality approval is asserted.\n')
def link(source,target):
 target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists():assert os.path.samefile(source,target);return
 try:target.hardlink_to(source)
 except OSError:shutil.copy2(source,target)
link(r.parent.parent/'licenses.md',d/'licenses.md')
for f in sorted((r/'native-comparison').glob('*.jpg')):link(f,d/'Native preview and export comparisons'/f.name)
for f in sorted((r/'actual-neural-short-review').glob('all-48-*.jpg')):link(f,d/'Moving sleeve - source and corrected frames'/f.name)
for f in sorted((r/'actual-source-head-review').glob('heads-*.jpg')):link(f,d/'Head comparisons'/f.name)
short=json.load(open(r/'current-neural-short-visual-review.json'));short.pop('fourMinuteNeuralPassStillRunning',None);short.pop('fourMinuteNativeExportNotYetQualified',None);short['scopeOnly']='The preflight 48-frame gesture; four-minute findings are recorded separately.';(d/'short-moving-sleeve-review.json').write_text(json.dumps(short,indent=2));link(r/'actual-neural-short-review/full-alpha-propagation.json',d/'short-to-long-matte-propagation.json')
print('ACTUAL_NEURAL_EVIDENCE_PACKAGED',len(keys),archive.stat().st_size,hashlib.file_digest(archive.open('rb'),'sha256').hexdigest())
# Actual H.264 exports, with identical native framing. These expose the rejected
# moving-sleeve stencil directly instead of comparing only render logs or code.
import cv2
from PIL import Image,ImageDraw
previous=r/'rejected-stencil-native/Four-minute native export.mp4';current=d/'Studio native export - four-minute repair.mp4'
assert hashlib.file_digest(previous.open('rb'),'sha256').hexdigest()=='0e95a6d32c44eafa9dce94fa915f56ea713baa4355b6535d74c372a6cc10f631'
oldcap,newcap=cv2.VideoCapture(str(previous)),cv2.VideoCapture(str(current))
for seconds,name in [(49.5,'Actual exports - moving sleeve before and after.jpg'),(214.5,'Actual exports - raised elbow gap before and after.jpg')]:
 pair=Image.new('RGB',(1200,410),(17,17,17));draw=ImageDraw.Draw(pair)
 for column,cap in enumerate([oldcap,newcap]):
  cap.set(cv2.CAP_PROP_POS_FRAMES,round(seconds*24));ok,bgr=cap.read();assert ok;picture=Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB));pair.paste(picture.crop((500,700,1100,1080)),(600*column,30));draw.text((600*column+5,5),f'{seconds}s | '+('Rejected native export' if column==0 else 'New native export'),fill='white')
 pair.save(d/name,quality=97)
oldcap.release();newcap.release()
