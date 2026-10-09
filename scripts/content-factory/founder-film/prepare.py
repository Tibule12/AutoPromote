#!/usr/bin/env python3
"""CPU-only preparation of source-grounded textures and editable film requests."""
from pathlib import Path
import hashlib,json,subprocess
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[3];OUT=R/'reports/flagship-founder-film-20261008';T=OUT/'textures';T.mkdir(exist_ok=True)
font='/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf';bold='/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def card(name,label,title,lines,accent=(170,138,255)):
 im=Image.new('RGB',(1600,1000),(12,14,23));d=ImageDraw.Draw(im)
 d.line((100,132,1500,132),fill=accent,width=3)
 d.text((100,65),label,font=ImageFont.truetype(bold,30),fill=accent)
 d.text((100,207),title,font=ImageFont.truetype(bold,72),fill=(242,239,255))
 for i,line in enumerate(lines):d.text((100,362+i*92),line,font=ImageFont.truetype(font,42),fill=(185,187,207))
 d.text((100,907),'AUTOPROMOTE / DEVELOPMENT ARCHIVE',font=ImageFont.truetype(font,22),fill=(92,97,122))
 im.save(T/(name+'.png'))
receipt=R/'reports/rtx-pro-6000-qualification-20261006/gpu-receipt.json';g=json.loads(receipt.read_text())
assert g['status']=='PASS' and 'RTX PRO 6000' in g['identityCsv']
records=[]
for name in ['autopromote-cc6d3-quota-before-raw.json','quota-after-create.json']:
 p=receipt.parent/name;v=json.loads(p.read_text());values=[q for q in v['quotaInfos'] if q.get('quotaId')=='NvidiaRtxPro6000GpuAllocNoZonalRedundancyPerProjectRegion'] if isinstance(v,dict) and 'quotaInfos' in v else []
 records.append({'path':str(p.relative_to(R)),'sha256':sha(p)})
# Summaries are dated art-directed transcriptions, never forged screenshots or emails.
card('quota-zero','16 SEPTEMBER 2026 / L4','NO CAPACITY',['Regional GPU quota: 0','Preference denied. Execution never began.','The requested machine could not run.'],(236,132,103))
card('quota-grant','06 OCTOBER 2026 / RTX PRO 6000','3000 milliGPU',['us-central1 / regional capacity granted','1000 milliGPU = capacity for one GPU','One bounded execution. Verified.'])
card('rtx-proof','VERIFIED EXECUTION / 06 OCTOBER','RTX PRO 6000',['Blackwell Server Edition','NVDEC → NVENC / 48 frames / 2 seconds','Qualification passed. No model generation claim.'])
card('error','ACTUAL DEVELOPMENT SETBACK','RENDER FAILED',['Quota denied before execution.','Different failures exposed the next blocker.','A completed process was not a finished story.'],(236,132,103))
# A small real code fragment shows the renderer contract, without credentials or log secrets.
code=(R/'src/services/contentFactoryStudioAdapter.js').read_text().splitlines();selected=[l.strip() for l in code if 'dryRunStudioCommandBatch' in l or 'validateStudioProjectDocument(document)' in l or 'buildViralRenderData({' in l]
card('director','CURRENT AUTOPROMOTE / REAL CONTRACT','Story → edit → render',selected+['Accepted takes. Source hashes. Timed sound.'])
for name in ['podcast-host','podcast-guest','workspace-studio']:
 src=R/'frontend/public/landing'/(name+('.png' if name=='workspace-studio' else '.webp'));im=Image.open(src).convert('RGB');im.save(T/(name+'.png'));records.append({'path':str(src.relative_to(R)),'sha256':sha(src),'use':'historical conversation/UI texture'})
source=R/'reports/content-factory-20261007/generated/real-voyage-v6.mp4';records.append({'path':str(source.relative_to(R)),'sha256':sha(source),'use':'retained actual Wan 14B generated moving yacht take'})
subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-vf','fps=24,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720','-frames:v','120','-q:v','2',str(T/'ocean-%04d.jpg')],check=True)
records += [{'path':str(receipt.relative_to(R)),'sha256':sha(receipt),'use':'historical RTX qualification'}, {'path':'docs/viral-studio-gpu-audit.md','sha256':sha(R/'docs/viral-studio-gpu-audit.md'),'use':'historical L4 denial; summarized not forged evidence'}]
(OUT/'evidence/source-index.json').write_text(json.dumps(records,indent=2))
(T/'logo-geometry.json').write_bytes((R/'assets/brand/autopromote-original-v1/logo-geometry.json').read_bytes())
(T/'font.ttf').write_bytes(Path(bold).read_bytes())
print(json.dumps({'textures':len(list(T.glob('*.png'))),'sourceRecords':len(records),'gpuUsed':False}))
