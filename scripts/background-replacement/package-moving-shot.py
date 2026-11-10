"""Package real native short-shot evidence without overwriting older deliveries."""
import argparse,json,hashlib,shutil,subprocess,html as html_escape
from pathlib import Path
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('native');p.add_argument('review');p.add_argument('recording');p.add_argument('alpha');p.add_argument('delivery');p.add_argument('--preview-job');a=p.parse_args();n,review,recording,alpha,d=map(Path,[a.native,a.review,a.recording,a.alpha,a.delivery]);d.mkdir(parents=True,exist_ok=True)
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def copy(source,name):
 target=d/name;target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists():assert digest(target)==digest(source),f'Preserve existing different delivery: {target}'
 else:shutil.copy2(source,target)
for source,name in [(Path('/dev/shm/autopromote-manual-guidance-20261104/Source gesture with original audio.mp4'),'Original source - 224-226s.mp4'),(n/'preview.mp4','Actual Studio preview.mp4'),(n/'native-export.mp4','Native moving-shot revision.mp4'),(n/'final-project.autopromote.json','Editable Studio project.autopromote.json'),(n/'native-persistence.json','native-persistence.json'),(n/'preview-export-comparison.json','preview-export-comparison.json'),(n/'visual-review.json','visual-review.json'),(recording/'Studio - complete final playback.mp4','Studio - complete final playback.mp4'),(recording/'editable-timeline.png','Editable timeline.png'),(recording/'studio-playback.json','studio-playback.json'),(Path('reports/background-replacement-20261101/licenses.md'),'licenses.md'),(Path('reports/background-replacement-20261101/private/replacement.png'),'Replacement.png')]:copy(source,name)
for f in alpha.iterdir():
 if f.is_file():copy(f,'Masks/'+f.name)
jobs=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs')
selections=[]
if a.preview_job:
 spec=json.loads((Path(a.preview_job)/'spec.json').read_text())['spec'];project=json.loads((n/'final-project.autopromote.json').read_text())
 assert spec['modelInput']['artifactHash']==project['snapshot']['subjectVfxScenes'][0]['modelArtifactRef']['artifactHash']==json.loads((alpha/'effective-alpha.json').read_text())['modelArtifactHash']
 expected=spec['modelInput']['files']['maskBundle']['sha256'];matches=[]
 for f in jobs.glob('*/*/outputs/subject_masks.tar.gz'):
  if (f.parent.parent/'result.json').exists() and digest(f)==expected:matches.append(f)
 assert len(matches)==1,'The exact preview alpha must resolve to one completed model execution'
 found=matches[0];alpha_execution=found.parent.parent
 alpha_spec=json.loads((alpha_execution/'spec.json').read_text())
 dependency=alpha_spec['componentDependency'];artifact=dependency['artifact'];provenance=artifact['provenance']
 segmentation=jobs/provenance['jobId']/provenance['attemptToken']
 assert segmentation.resolve().is_relative_to(jobs.resolve()) and (segmentation/'result.json').is_file()
 component_file=next(f for f in artifact['files'] if f['name']=='component_masks.tar.gz')
 assert digest(segmentation/'outputs/component_masks.tar.gz')==component_file['sha256']==dependency['file']['sha256']
 assert artifact['sourceSha256']==spec['modelInput']['sourceSha256']==project['snapshot']['subjectVfxScenes'][0]['modelArtifactRef']['sourceContentHash']
 selections.extend([(segmentation.parent.name,segmentation.name,'SAM2'),(found.parents[2].name,found.parents[1].name,'ViTMatte')])
else:
 selections.extend([('fd3f4307c8152d220474a78e6dd04fac41862d8329d0b5bbfc7d1b5dfbb8d1ed','f6d3ffa0-b7a4-43df-a224-d9080cdfaaae','SAM2'),('95d7eae50defbb48aa4d96b1890342f2d6b56c4585874c53ece8248c44dd2fc3','c86ff0c1-50fd-4481-a01d-e659883290e8','ViTMatte')])
for job,attempt,prefix in selections:
 for name in ['subject_masks.tar.gz','subject_masks_manifest.json','component_masks.tar.gz','component_masks_manifest.json']:
  f=jobs/job/attempt/'outputs'/name
  if f.exists():copy(f,f'Masks/{prefix} - {name}')
 if prefix=='ViTMatte':
  for name in ['photographed-reference.png','observed-support.png']:
   f=jobs/job/attempt/'outputs/observed_detail'/name
   if f.exists():copy(f,'Masks/'+name)
  f=jobs/job/attempt/'outputs/temporal_diagnostics.json'
  if f.exists():copy(f,'Masks/temporal-diagnostics.json')
for stage in ['source','before','preview','export']:
 target=d/'frames'/stage;target.mkdir(parents=True,exist_ok=True)
 for i in range(48):
  source=review/stage/f'{i:04d}.png'
  if not source.exists():source=review/stage/f'{i:04d}.jpg'
  file=target/f'{i:04d}.jpg'
  if not file.exists():Image.open(source).convert('RGB').save(file,quality=97)
for i,label in [(6,'Fast hand movement'),(8,'Corrected finger gap'),(23,'Moving finger gap'),(24,'Open fingers'),(47,'Hands lowered')]:copy(review/f'actual-export-comparison-{i:04d}.jpg',f'Comparisons/{label}.jpg')
regions={'Whole frame':[0,0,1430,1000],'Head and face':[660,45,1040,480],'Left hand':[280,240,680,720],'Right hand':[1040,170,1430,760],'Microphone and stands':[0,700,950,1000],'Clothes and body':[320,430,1430,1000]}
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Moving-shot repair — 4 November</title><style>body{font:17px/1.5 system-ui;background:#11151e;color:#f1f3f7;margin:24px}main{max-width:1600px;margin:auto}a{color:#bbcaff}video{width:100%;max-height:80vh;background:black}nav{position:sticky;top:0;background:#11151e;padding:10px;z-index:1}select,button,input{font:inherit;margin:5px;padding:5px}.panels{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}canvas{width:100%;background:black}h2{font-size:1.2rem}@media(max-width:850px){.panels{grid-template-columns:1fr}}</style><main><h1>Same failed hand movement: native Studio revision</h1><p>Original podcast 224–226 seconds, 48 frames. Real SAM2 tracking, ViTMatte alpha and native Studio export. Four bolt cores and a solid clothing/cable interior patch use explicit secondary corrections in the saved Studio scene. This is a short-shot engineering revision, not a clean four-minute delivery or professional-quality approval. Visible old-background colour remains around moving fingers and fine plant/stand edges. See <a href="Comparisons/Remaining moving-finger defect.jpg">a remaining defect</a> and <a href="README.md">the findings</a>.</p><h2>Actual native export</h2><video id="final" controls playsinline preload="metadata" src="Native moving-shot revision.mp4"></video><nav><label>Compare <select id="stage"><option value="export">Native final export</option><option value="preview">Actual Studio preview</option></select></label><label>Part <select id="region"></select></label><button id="previous">Previous frame</button><input id="frame" type="range" min="0" max="47" step="1" value="23"><button id="next">Next frame</button><output id="clock"></output></nav><div class="panels"><section><h2>Original source</h2><canvas></canvas></section><section><h2>Rejected four-minute result</h2><canvas></canvas></section><section><h2>Current native result</h2><canvas></canvas></section></div><p>These are decoded actual frames, with JPEG viewing copies. The native export preserves the source aspect and is scaled back to source geometry for comparison. No pixel-identity claim.</p><details><summary>Original source, alpha and Studio preview</summary><h2>Original source and speech</h2><video id="source" controls playsinline preload="metadata" src="Original source - 224-226s.mp4"></video><h2>Effective alpha</h2><video id="alpha" controls muted playsinline preload="metadata" src="Masks/Effective alpha - viewing copy.mp4"></video><h2>Actual Studio preview</h2><video id="preview" controls playsinline preload="metadata" src="Actual Studio preview.mp4"></video></details><h2>Complete actual Studio playback and editable timeline</h2><video id="studio" controls playsinline preload="metadata" src="Studio - complete final playback.mp4"></video><p><a href="Editable Studio project.autopromote.json">Editable project backup</a> · <a href="Masks/Effective alpha - PNG frames.tar.gz">Effective alpha PNGs</a> · <a href="Masks/SAM2 - component_masks.tar.gz">Separate person, hands and equipment masks</a> · <a href="native-persistence.json">Save/reopen/export checks</a> · <a href="preview-export-comparison.json">Actual decoded comparison</a></p><script>const regions=REGIONS;const region=document.querySelector('#region'),frame=document.querySelector('#frame'),stage=document.querySelector('#stage');region.innerHTML=Object.keys(regions).map(x=>`<option>${x}</option>`).join('');let sequence=0;async function show(){const request=++sequence,i=+frame.value,box=regions[region.value];document.querySelector('#clock').textContent=`Frame ${i}/47 | original ${(224+i/24).toFixed(6)}s`;await Promise.all(['source','before',stage.value].map(async(s,n)=>{const img=new Image();img.src=`frames/${s}/${String(i).padStart(4,'0')}.jpg`;await img.decode();if(request!==sequence)return;const c=document.querySelectorAll('canvas')[n];c.width=box[2]-box[0];c.height=box[3]-box[1];c.getContext('2d').drawImage(img,box[0],box[1],c.width,c.height,0,0,c.width,c.height);}));if(request===sequence)document.documentElement.dataset.frameReady=`${i}:${region.value}:${stage.value}`;}region.onchange=show;frame.oninput=show;stage.onchange=show;document.querySelector('#previous').onclick=()=>{frame.value=Math.max(0,+frame.value-1);show();};document.querySelector('#next').onclick=()=>{frame.value=Math.min(47,+frame.value+1);show();};show();</script></main></html>'''
review_decision=json.loads((n/'visual-review.json').read_text())
old_status='Visible old-background colour remains around moving fingers and fine plant/stand edges. See <a href="Comparisons/Remaining moving-finger defect.jpg">a remaining defect</a>'
new_status=html_escape.escape(review_decision.get('summary',review_decision.get('reason','Actual visual review remains required.')))+' See <a href="Comparisons/Moving finger gap.jpg">the moving-finger comparison</a>'
(d/'Review.html').write_text(html.replace('REGIONS',json.dumps(regions)).replace(old_status,new_status))
manifest={str(f.relative_to(d)):{'bytes':f.stat().st_size,'sha256':digest(f)} for f in sorted(d.rglob('*')) if f.is_file() and f.name!='files.sha256.json'};(d/'files.sha256.json').write_text(json.dumps(manifest,indent=2));print(json.dumps({'delivery':str(d),'files':len(manifest),'bytes':sum(v['bytes'] for v in manifest.values())}))
