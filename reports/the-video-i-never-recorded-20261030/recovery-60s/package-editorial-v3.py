"""Copy verified native delivery once; hard-link duplicate review entrypoints."""
import hashlib,json,os,shutil,sys
from pathlib import Path
proof=Path(sys.argv[1]);review=Path('/home/tibule12/Videos/The Video I Never Recorded - Editorial V3');review.mkdir(exist_ok=True)
verification=json.loads((proof/'verification.json').read_text());assert verification['fullDecodePassed']
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def retain(src,name):
 dst=review/name
 if dst.exists():assert h(dst)==h(src),f'Preserve earlier review file: {dst}'
 else:shutil.copy2(src,dst)
 return dst
final=retain(proof/'final.mp4','01 - Native Motion Edit.mp4')
retain(Path('/dev/shm/autopromote-premium-edit/presenter-source-proxy.mp4'),'02 - Raw Source Assembly.mp4')
retain(proof/'raw-vs-native.mp4','03 - Raw vs Native Edit.mp4')
retain(proof/'editing-in-studio.mp4','04 - Authoring in Studio.mp4')
retain(proof/'opening/edited-in-studio.mp4','05 - Full Matching Studio Playback.mp4')
retain(proof/'NATIVE-OPENING-FINAL.autopromote.json','Editable Project.autopromote.json')
retain(proof/'RAW-EDITABLE.autopromote.json','Raw Project.autopromote.json')
retain(proof/'Frames.png','Frames.png')
retain(proof/'live-6.4.png','Studio Still - Never Said.png')
retain(proof/'live-13.8.png','Studio Still - Identity.png')
retain(proof/'verification.json','Technical Findings.json')
retain(proof/'native-render.json','Native Render Receipt.json')
for n in [1,2]:
 src=Path(__file__).parent.parent/f'proof/recovery-continuity/take-{n}.mp4';dst=review/f'Original Take {n}.mp4'
 if dst.exists():assert h(dst)==h(src)
 else:os.link(src,dst)
entry=Path('/home/tibule12/Videos/The Video I Never Recorded - Editorial V3.mp4')
if entry.exists():assert h(entry)==h(final)
else:os.link(final,entry)
manifest={'nativeOutputSha256':h(final),'comparison':'Synchronized utility packaging of raw source and the canonical native movie; effects originate in AutoPromote.', 'sourceOriginalsPreserved':True,'newGenerationRequests':0,'paidGpuJobs':0,'productionDeployments':0,'files':{f.name:{'bytes':f.stat().st_size,'sha256':h(f)} for f in review.iterdir()if f.is_file()and f.name!='Manifest.json'}}
(review/'Manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'review':str(review),'movie':str(entry),'outputSha256':h(final),'uniqueReviewFilesBytes':sum(f.stat().st_size for f in review.iterdir()if f.is_file())},indent=2))
