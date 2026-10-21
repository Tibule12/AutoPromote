#!/usr/bin/env python3
"""Acquire nine bounded real filmed inputs for private Studio editing.

Only official item-page content URLs explicitly tagged videoFree qualify.
The report sources are private project inputs, not an application stock bundle.
"""
import concurrent.futures,datetime,hashlib,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'reports/studio-real-footage-20261018';P=OUT/'provenance';S=OUT/'sources'
SELECTION=[
 ('barber','preparation','barber-begins-to-cut-the-hair-of-his-client-43241'),
 ('barber','detail','barber-cutting-hair-with-scissors-and-comb-43232'),
 ('barber','result','barber-showing-the-haircut-to-his-client-43233'),
 ('boxing','establishing','view-from-the-top-of-a-boxing-match-on-a-40972'),
 ('boxing','action','boxers-hitting-in-a-fight-40967'),
 ('boxing','exchange','boxers-during-an-amateur-fight-40954'),
 ('kitchen','preparation','chef-preparing-salad-in-the-restaurant-kitchen-13258'),
 ('kitchen','service','professional-chefs-work-in-restaurant-kitchen-15875'),
 ('kitchen','payoff','chef-adding-final-touches-to-the-plate-13261')]
def fetch(url,destination,limit=180):
 subprocess.run(['curl','--fail','--location','--silent','--show-error','--max-time',str(limit),'--max-filesize',str(160*1024**2),'--user-agent','Mozilla/5.0',url,'-o',str(destination)],check=True)
def graph(html):
 for block in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',html,re.S):
  d=json.loads(block)
  yield from (d if isinstance(d,list) else d.get('@graph',[d]))
def acquire(item):
 pack,role,slug=item;identifier=slug.rsplit('-',1)[1];url=f'https://mixkit.co/free-stock-video/{slug}/';page=P/f'{identifier}.html'
 fetch(url,page,60);metadata=next(d for d in graph(page.read_text()) if d.get('@type')=='VideoObject' and identifier in d.get('contentUrl',''))
 assert metadata['license']=='https://mixkit.co/license/#videoFree',f'Restricted or unknown license: {url}'
 source=metadata['contentUrl'];assert re.fullmatch(r'https://assets\.mixkit\.co/videos/'+identifier+'/'+identifier+r'-(?:720|1080)\.mp4',source),source
 folder=S/pack;folder.mkdir(exist_ok=True,parents=True);dest=folder/f'{role}-{identifier}.mp4'
 if not dest.exists():fetch(source,dest)
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,duration','-of','json',str(dest)]));video=next(s for s in probe['streams'] if s['codec_type']=='video');assert video['width']>=1280 or video['height']>=1280
 subprocess.run(['ffmpeg','-v','error','-threads','2','-i',str(dest),'-map','0:v:0','-f','null','-'],check=True,capture_output=True,timeout=150)
 row=dict(pack=pack,role=role,assetId=identifier,title=metadata['name'],page=url,download=source,license=metadata['license'],publishedAt=metadata.get('uploadDate'),path=str(dest.relative_to(ROOT)),sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),bytes=dest.stat().st_size,seconds=float(probe['format']['duration']),video=video,audio=[s for s in probe['streams'] if s['codec_type']=='audio'],fullDecodePassed=True,rights='Official Mixkit Stock Video Free License; private owned project input and incorporated edits. No raw stock redistribution or fabricated endorsement.',creativeNote='Source selection only; not a finished edit or publication approval.')
 print(json.dumps({k:row[k] for k in ['pack','role','assetId','seconds','bytes','video']}) ,flush=True);return row
S.mkdir(exist_ok=True,parents=True);P.mkdir(exist_ok=True,parents=True)
fetch('https://mixkit.co/license/modal/videoFree/',P/'videoFree-license.html',60)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:rows=list(pool.map(acquire,SELECTION))
(OUT/'sources.json').write_text(json.dumps(dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),sourceType='Real filmed stock footage listed before modern text-to-video releases; visual review separately recorded.',items=rows,paidDownloads=0,modelGenerations=0,publishingWrites=0),indent=2)+'\n')
