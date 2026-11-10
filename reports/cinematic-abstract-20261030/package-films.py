"""Preserve exact completed native movies and their editable source packages."""
import hashlib,json,os,shutil,sys
from pathlib import Path
ROOT=Path('/dev/shm/autopromote-abstract-20261030')
OUT=Path('/home/tibule12/Videos/AutoPromote-Cinematic-Abstract-2026-10-30')
NAMES=[('current','01-CURRENT'),('prism','02-PRISM'),('fold','03-FOLD')]
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def main():
 OUT.mkdir(mode=0o700,exist_ok=True);files=[];records=[]
 def copy(source,relative):
  target=OUT/relative;target.parent.mkdir(mode=0o700,parents=True,exist_ok=True);digest=sha(source)
  if target.exists():assert sha(target)==digest,f'Preserve different existing file {target}'
  else:shutil.copy2(source,target)
  os.chmod(target,0o600);assert sha(target)==digest
  files.append(dict(file=str(relative),bytes=target.stat().st_size,sha256=digest))
 for identity,name in NAMES:
  source=ROOT/identity
  if '--partial' in sys.argv and not (source/'episode/independent-restore.json').exists():continue
  validations={}
  for kind,destination in [('cinema',name+'.mp4'),('episode',Path('Walkthroughs')/(name+'-Studio-walkthrough.mp4'))]:
   folder=source/kind;validation=json.loads((folder/'final/independent-validation.json').read_text());restored=json.loads((folder/'independent-restore.json').read_text());playback=json.loads((folder/'final/studio-playback.json').read_text())
   assert validation['sha256']==restored['outputSha256'] and restored['noResubmission'] and playback['playback']['ended']
   copy(folder/'final/final.mp4',destination)
   copy(folder/'EPISODE.autopromote.json',Path('Editable-projects')/name/(kind+'.autopromote.json'))
   copy(folder/'final/render-receipt.json',Path('Editable-projects')/name/(kind+'-render-receipt.json'))
   copy(folder/'final/edited-in-studio.mp4',Path('Studio-recordings')/(name+'-'+kind+'-complete-playback.mp4'))
   copy(folder/'final/independent-validation.json',Path('Verification')/(name+'-'+kind+'.json'))
   copy(folder/'final/contact-sheet.png',Path('Verification')/(name+'-'+kind+'-contact-sheet.png'))
   validations[kind]=validation
  copy(source/'cinema/thumbnail.png',Path('Thumbnails')/(name+'.png'))
  copy(source/'native-core-final.mp4',Path('Source-animations')/(name+'-native-motion.mp4'))
  copy(source/'editing-in-studio.mp4',Path('Studio-recordings')/(name+'-authoring.mp4'))
  copy(source/'teaching/editing-in-studio.mp4',Path('Studio-recordings')/(name+'-controls.mp4'))
  job=json.loads((source/'accepted-blender.json').read_text())['jobId']
  spool=Path('/dev/shm/autopromote-abstract-blender-20261030')/job
  copy(spool/'spec.json',Path('Editable-projects')/name/'canonical-Blender-scene.json')
  copy(spool/'output/receipt.json',Path('Verification')/(name+'-actual-CUDA-artifacts.json'))
  for original,label in [('CORE.autopromote.json','editable-3D-scene.autopromote.json'),('teaching/TEACHING.autopromote.json','teaching.autopromote.json'),('source.mp4','blank-scene-source.mp4'),('episode/narration.mp3','synthetic-narration.mp3'),('episode/original-score.mp3','walkthrough-original-score.mp3'),('cinema/original-score.mp3','film-original-score.mp3')]:copy(source/original,Path('Editable-projects')/name/label)
  records.append(dict(identity=identity,file=name+'.mp4',durationSeconds=24,sha256=validations['cinema']['sha256'],walkthroughDuration=validations['episode']['durationSeconds'],walkthroughSha256=validations['episode']['sha256'],thumbnailSha256=validations['cinema']['thumbnail']['sha256'],nativeProjectHash=validations['cinema']['nativeProjectHash'],completeMatchingPlayback=True,independentExactRestore=True,ownerApproved=False,scheduled=False))
 assert '--partial' in sys.argv or len(records)==3
 manifest=dict(date='2026-10-30',films=records,files=files,ownerApproved=False,scheduled=False,cloudExecution=False,source='Normal signed-in Studio scene authoring, native canonical local CUDA Blender dispatch, verified private alpha storage, normal Studio CPU export and native final sequence export.',limits='Generated 3D sculptures. Detail shots are declared crops/retimings of the native core, not extra camera renders. Local synthetic bm_george narration and original synthesized score. Sparse headless screen captures do not qualify playback smoothness or human listening approval. Original failed attempts remain failed and retained.')
 (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 (OUT/'README.txt').write_text('CURRENT / PRISM / FOLD\n\nThree separate 24-second cinematic abstract motion films. Walkthroughs contains the approximately two-minute narrated whole-Studio lessons.\nSource-animations contains the separate native animated cores. Studio-recordings contains actual authoring, controls and complete finished playback.\nEditable-projects contains native project/scene backups, export receipts, blank source, narration and original scores. Use Restore project backup in Studio, then Restore export receipt for its matching finished export.\nSource 3D projects reference the former private fresh emulator. Its services ended before a complete Firestore snapshot. Saved decisions/source bytes remain; further 3D export requires source relinking in a fresh local environment. CURRENT/PRISM final scene restores passed before shutdown; FOLD authoring cold reopen passed, but its additional post-export source restore remains unqualified. Final film/walkthrough backups have separate independent restore evidence.\n\nThese are generated 3D sculptures, with local synthetic preset narration and an original synthesized soundtrack. Cropped detail shots and retiming are recorded in the shot plans. Owner picture/listening approval remains open.\nNo movie or thumbnail was scheduled or published. All five prior Queue holds remain.\n')
 for p in [OUT/'manifest.json',OUT/'README.txt']:os.chmod(p,0o600)
 print(json.dumps(dict(folder=str(OUT),films=records,exactCopies=len(files)),indent=2))
if __name__=='__main__':main()
