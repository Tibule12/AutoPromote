"""Finish actual local delivery verification. Visual/professional approval stays false."""
from pathlib import Path
import subprocess,time,json,os,hashlib
r=Path('reports/background-replacement-20261101/private/four-minute-r9');d=Path('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Four-minute repair - 2026-11-03');python='/home/tibule12/Projects/AutoPromte/AutoPromote/.venv/bin/python';env={**os.environ,'NODE_PATH':'/home/tibule12/Projects/AutoPromte/AutoPromote/node_modules','PYTHONPATH':'/home/tibule12/.cache/autopromote-model-runtime/source-edge-deps-1.1.16:.','OPENBLAS_NUM_THREADS':'1'}
def run(command,log):
 with (r/log).open('ab') as f:subprocess.run(command,env=env,stdout=f,stderr=f,check=True)
try:
 deadline=time.monotonic()+1200
 while True:
  state=json.load(open(r/'completion-state.json'))
  if state['stage']=='media-ready-awaiting-visual-assessment' and (d/'Review.html').exists():break
  if state['stage']=='stopped-on-verification-failure':raise RuntimeError(state.get('error','Local verification stopped'))
  if time.monotonic()>deadline:raise RuntimeError('Final playback/package did not complete in bounded wait')
  time.sleep(2)
 expected='c04fe1d917de8b89e6692386573710273e83232e1700725b7d4e2a68c6027ffd';assert hashlib.file_digest((d/'Studio native export - four-minute repair.mp4').open('rb'),'sha256').hexdigest()==expected
 run([python,'scripts/background-replacement/package-neural-evidence.py',str(r),str(d)],'package-neural-evidence.log')
 run(['node','scripts/background-replacement/check-repaired-long-viewer.cjs',str(d),str(r)],'final-delivery-viewer.log')
 run([python,'scripts/background-replacement/write-four-minute-repair-report.py',str(r),str(d)],'final-report-write.log')
 run(['node','test/e2e/validate-studio-contract.js'],'current-contract-validation.log')
 run(['git','diff','--check'],'current-diff-check.log')
 for f in [d/'validation.json',Path('reports/background-replacement-20261101/four-minute-repair-validation.json')]:
  data=json.load(open(f));data['studioContractValidationPassed']=True;data['gitDiffCheckPassed']=True;f.write_text(json.dumps(data,indent=2))
 manifest=[]
 for f in sorted(d.rglob('*')):
  if f.is_file() and f.name!='files.sha256.json':manifest.append({'file':str(f.relative_to(d)),'bytes':f.stat().st_size,'sha256':hashlib.file_digest(f.open('rb'),'sha256').hexdigest()})
 (d/'files.sha256.json').write_text(json.dumps(manifest,indent=2));(r/'delivery-finalization.json').write_text(json.dumps({'stage':'actual-four-minute-evidence-ready','directory':str(d),'files':len(manifest),'nativeExportSha256':expected,'viewerPassed':True,'contractPassed':True,'diffCheckPassed':True,'visualApproval':False,'professionalQualityClaimed':False,'paidCloud':False,'productionDataTouched':False},indent=2));print('ACTUAL_FULL_LENGTH_DELIVERY_READY',flush=True)
except Exception as e:
 (r/'delivery-finalization-failure.json').write_text(json.dumps({'error':str(e),'visualApproval':False,'paidCloud':False},indent=2));raise
