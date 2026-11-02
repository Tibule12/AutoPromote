"""Package actual source-bound review samples without inventing a visual pass."""
from pathlib import Path
import argparse,json,shutil,html,tarfile
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('destination');a=p.parse_args();r=Path(a.root);d=Path(a.destination);samples=d/'Frame comparisons';samples.mkdir(exist_ok=True)
def locate(t):
 for start,end,name in [(49.5,52.5,'early-sleeve-repairs/proof-49.5-3'),(53.5,57.25,'early-sleeve-repairs/proof-53.5-3.75'),(63,63.5,'early-sleeve-repairs/proof-63-0.5'),(84,240,'final-tail/proof-84-156'),(72,84,'corrected-tail/proof-72-168'),(0,72,'threaded-pass/proof-0-240')]:
  if start<=t<end:return r/name/'frames',round((t-start)*24)
 raise ValueError(t)
rows=[]
for t in [0,5,15,30,44,45,49.5,50.5,54.5,56.5,60,63,70,75,80,85,90,100,110,115,120,125,130,140,145,150,165,180,198,210,225,239]:
 folder,index=locate(t);source=folder/f'source-{index:05d}.jpg';after=folder/f'replacement-{index:05d}.jpg'
 if not source.exists():continue
 images=[Image.open(f).convert('RGB') for f in [source,after]];w,h=images[0].size
 panel=Image.new('RGB',(w*2,h+36),(18,18,18));draw=ImageDraw.Draw(panel)
 for i,(im,label) in enumerate(zip(images,['Actual source, registered camera crop','Actual replacement review — NOT approved'])):panel.paste(im,(w*i,36));draw.text((i*w+8,10),f'{label} | original {t:.4f}s',fill='white')
 name=f'{t:07.3f}-source-and-review.jpg';panel.save(samples/name,quality=97)
 alpha=folder/f'alpha-{index:05d}.png';shutil.copyfile(alpha,samples/f'{t:07.3f}-model-alpha.png')
 for f in folder.glob(f'object-{index:05d}-*.png'):shutil.copyfile(f,samples/f'{t:07.3f}-{f.name}')
 rows.append({'time':t,'comparison':f'Frame comparisons/{name}','alpha':f'Frame comparisons/{t:07.3f}-model-alpha.png'})
(d/'review-samples.json').write_text(json.dumps({'samples':rows,'all5760IndividuallyInspected':False,'modelAlphaVersusFullEffectiveAlpha':'Sample PNGs are model alpha before native effects; full lossless MKV is effective composited alpha.','creativeGate':False},indent=2))
movie='Four-minute background replacement - review.mp4';buttons=''.join(f'<button data-t="{v["time"]}">{v["time"]:g}s</button>' for v in rows)
data=json.dumps(rows)
page='''<!doctype html><meta charset="utf-8"><title>Four-minute background review</title>
<style>body{background:#15171d;color:#eee;font:16px system-ui;max-width:1280px;margin:24px auto;padding:0 20px}video,img{width:100%;background:#000}button,a{color:#9cceff}button{background:#252a36;border:1px solid #667;border-radius:5px;padding:8px;margin:3px}p{line-height:1.5}input{width:100%}.warning{background:#43321b;padding:16px}select{padding:8px}small{color:#ccd}</style>
<h1>Four-minute movement review</h1><p class="warning">This is the actual 0–4:00 podcast test with both speakers and original continuous speech. It is <strong>not a finished or approved background replacement</strong>. Inspect the first speaker’s boom/couch around 1:55–2:05, fine plant edges and head fringes. The recorded Studio import/export is a flattened review transport test; it does not qualify editable long-form model masks.</p>
<video id="movie" controls preload="metadata" src="MOVIE"></video><p><a href="Original podcast - first four minutes.mp4">Original source</a> · <a href="Full alpha matte - lossless.mkv">Full effective alpha (lossless MKV)</a> · <a href="README.md">Evidence and limitations</a></p>
<h2>Frame-matched source comparisons</h2><div>BUTTONS</div><p id="caption"></p><img id="comparison"><p><a id="alpha">Corresponding sampled model alpha</a></p><script>
const rows=DATA,movie=document.querySelector('#movie');function show(row){document.querySelector('#comparison').src=row.comparison;document.querySelector('#caption').textContent='Original source clock '+row.time+' seconds; comparison is source/current review.';document.querySelector('#alpha').href=row.alpha;}document.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{const row=rows.find(r=>r.time===Number(b.dataset.t));movie.currentTime=row.time;show(row)});show(rows[0]);</script>'''
(d/'Review.html').write_text(page.replace('MOVIE',html.escape(movie,quote=True)).replace('BUTTONS',buttons).replace('DATA',data))
with tarfile.open(d/'Sampled subject and object masks.tar.gz','w:gz') as archive:
 for f in sorted(samples.glob('*object*.png')):archive.add(f,arcname=f.name)
print('ACTUAL_REVIEW_SAMPLES',len(rows),flush=True)
