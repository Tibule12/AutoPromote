"""Private frame-stepping original/previous/native-final review; no generated pixels."""
from pathlib import Path
import hashlib,json,shutil,subprocess
import cv2
ROOT=Path(__file__).resolve().parents[2]
REPORT=ROOT/'reports/background-replacement-20261101'
P=REPORT/'private/piece-review-r6'
N=P/'native-final'
DEST=Path('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Original comparison and repair')
DEST.mkdir(exist_ok=True)
provenance=json.loads((P/'piece-review-provenance.json').read_text())

def copy(source,name):
 target=DEST/name;target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists():
  assert hashlib.sha256(source.read_bytes()).digest()==hashlib.sha256(target.read_bytes()).digest(),name
 else:shutil.copy2(source,target)

for source,name in [
 (N/'two-speaker-native-export.mp4','Two speakers - repaired export.mp4'),
 (N/'two-speaker-final-project.autopromote.json','Editable Studio project.autopromote.json'),
 (P/'final-native-recording/Studio - complete final playback.mp4','Studio - complete repaired playback.mp4'),
 (P/'final-native-recording/editable-timeline.png','Editable timeline.png'),
 (P/'final-native-recording/studio-playback.json','studio-playback.json'),
 (REPORT/'private/body-edge-r5/two-speaker-native-export.mp4','Previous export.mp4'),
 (REPORT/'private/source-3s.mp4','Speaker 1 - source.mp4'),
 (REPORT/'private/two-speaker-r4/Speaker 2 - source 54-57s.mp4','Speaker 2 - source.mp4'),
 (P/'piece-review-provenance.json','original-frame-mapping.json'),
 (REPORT/'licenses.md','licenses.md'),
 (N/'native-persistence.json','native-persistence.json'),
 (P/'actual-review-log.json','actual-review-log.json'),
 (P/'repair-validation.json','validation.json'),
 (REPORT/'original-comparison-repair.md','README.md')]:copy(source,name)
models=json.loads((P/'model-execution.json').read_text())
for entry,label in zip(models,['Corrected object guidance','Corrected model alpha']):
 folder=Path(entry['attemptDirectory'])/'outputs'
 for filename in ['subject_masks.tar.gz','subject_masks_manifest.json']:
  copy(folder/filename,f'Speaker 2 masks/{label} - {filename}')
 if label=='Corrected object guidance':
  for filename in ['component_masks.tar.gz','component_masks_manifest.json']:
   copy(folder/filename,f'Speaker 2 masks/{filename}')
copy(P/'model-execution.json','model-execution.json')
copy(P/'person-comparison.json','person-guidance-comparison.json')
copy(P/'effective-alpha-second/Effective alpha matte.mp4','Speaker 2 masks/Effective compositor alpha.mp4')
copy(P/'effective-alpha-second/effective-alpha.json','Speaker 2 masks/effective-alpha.json')
import tarfile
archive=DEST/'Speaker 2 masks/Effective compositor alpha - PNG frames.tar.gz'
if not archive.exists():
 with tarfile.open(archive,'w:gz') as bundle:
  bundle.add(P/'effective-alpha-second/effective-alpha',arcname='effective-alpha')
  bundle.add(P/'effective-alpha-second/effective-alpha.json',arcname='effective-alpha.json')

new=cv2.VideoCapture(str(N/'two-speaker-native-export.mp4'))
for angle,entry in enumerate(provenance['angles'],1):
 for stage in ['original','previous','repaired']:(DEST/f'frames/speaker-{angle}/{stage}').mkdir(parents=True,exist_ok=True)
 for i in range(72):
  for stage,old in [('original','original'),('previous','export')]:
   im=cv2.imread(str(P/f'angle-{angle}/{old}/{i:04d}.png'))
   cv2.imwrite(str(DEST/f'frames/speaker-{angle}/{stage}/{i:04d}.jpg'),im,[cv2.IMWRITE_JPEG_QUALITY,97])
  ok,frame=new.read();assert ok
  common=cv2.resize(frame[:,188:1732],(1430,1000),interpolation=cv2.INTER_AREA)
  frame=common if angle==1 else cv2.resize(common[3:996],(1440,1000),interpolation=cv2.INTER_AREA)
  cv2.imwrite(str(DEST/f'frames/speaker-{angle}/repaired/{i:04d}.jpg'),frame,[cv2.IMWRITE_JPEG_QUALITY,97])
assert not new.read()[0];new.release()
data=[{'regions':{'whole-frame':[0,0,*([1430,1000] if index==0 else [1440,1000])],**e['regions']},'mapping':e['frameMapping']} for index,e in enumerate(provenance['angles'])]
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Original frame comparison and repair</title><style>body{font:17px system-ui;line-height:1.5;background:#10131b;color:#eee;margin:24px}main{max-width:1600px;margin:auto}a{color:#bbcbff}video{max-width:100%;background:#000}button,select,input{font:inherit;margin:6px;padding:6px}nav{position:sticky;top:0;background:#10131b;z-index:1;padding:8px}#panels{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}canvas{width:100%;background:#000}h2{margin:16px 0 8px}@media(max-width:850px){#panels{grid-template-columns:1fr}}#findings{white-space:pre-wrap}</style><main><h1>Original comparison and repair</h1><p>The same two three-second intervals, matched to the original 30fps master frame by frame. Select a body/object region and step through all 72 delivered frames per angle. The previous export and repaired export are separate actual native movies. Still comparisons reverse the export's Fit full scaling for alignment; JPEG viewing copies and encoding differences are not pixel identity.</p><h2>Actual repaired movie</h2><video controls playsinline preload="metadata" src="Two speakers - repaired export.mp4"></video><nav><label>Speaker <select id="speaker"><option value="0">Striped shirt</option><option value="1">Cream shirt and cap</option></select></label><label>Part <select id="region"></select></label><button id="previous">Previous frame</button><input id="frame" type="range" min="0" max="71" step="1" value="36"><button id="next">Next frame</button><output id="clock"></output></nav><div id="panels"><section><h2>Original master</h2><canvas id="original"></canvas></section><section><h2>Previous export</h2><canvas id="previousCanvas"></canvas></section><section><h2>Repaired export</h2><canvas id="repaired"></canvas></section></div><h2>Actual Studio and editable timeline</h2><video controls playsinline preload="metadata" src="Studio - complete repaired playback.mp4"></video><p><a href="README.md">Findings and remaining limits</a> · <a href="validation.json">Validation</a> · <a href="Editable Studio project.autopromote.json">Editable project</a> · <a href="original-frame-mapping.json">Original frame timestamps</a> · <a href="actual-review-log.json">Actual review coverage</a> · <a href="Speaker 2 masks/Effective compositor alpha.mp4">Corrected second-speaker alpha</a> · <a href="../Speaker edge refinement/review.html">Earlier source/mask/alpha package</a></p><script>const data=DATA;const speaker=document.querySelector('#speaker'),region=document.querySelector('#region'),frame=document.querySelector('#frame');let sequence=0;function regions(){region.innerHTML=Object.keys(data[+speaker.value].regions).map(k=>`<option>${k}</option>`).join('');}async function show(){const request=++sequence,a=+speaker.value,i=+frame.value,box=data[a].regions[region.value];document.querySelector('#clock').textContent=`Frame ${i}/71 | original ${data[a].mapping[i].masterTimeSeconds.toFixed(6)}s`;await Promise.all(['original','previous','repaired'].map(async(stage,index)=>{const img=new Image();img.src=`frames/speaker-${a+1}/${stage}/${String(i).padStart(4,'0')}.jpg`;await img.decode();if(request!==sequence)return;const canvas=document.querySelectorAll('canvas')[index];canvas.width=box[2]-box[0];canvas.height=box[3]-box[1];canvas.getContext('2d').drawImage(img,...[box[0],box[1],canvas.width,canvas.height],0,0,canvas.width,canvas.height);}));document.documentElement.dataset.frameReady=`${a}:${i}:${region.value}`;}speaker.onchange=()=>{regions();show();};region.onchange=show;frame.oninput=show;document.querySelector('#previous').onclick=()=>{frame.value=Math.max(0,+frame.value-1);show();};document.querySelector('#next').onclick=()=>{frame.value=Math.min(71,+frame.value+1);show();};regions();show();</script></main></html>'''
(DEST/'review.html').write_text(html.replace('DATA',json.dumps(data,separators=(',',':'))))
manifest={str(f.relative_to(DEST)):{'bytes':f.stat().st_size,'sha256':hashlib.file_digest(f.open('rb'),'sha256').hexdigest()} for f in sorted(DEST.rglob('*')) if f.is_file() and f.name!='files.sha256.json'}
(DEST/'files.sha256.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'delivery':str(DEST),'files':len(manifest),'newExportSha256':hashlib.file_digest((N/'two-speaker-native-export.mp4').open('rb'),'sha256').hexdigest()}))
