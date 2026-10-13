"""Bind rough selections to actual retained bytes after decoded source review."""
import hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parent
read=lambda p:json.loads((root/p).read_text())
hashfile=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
reasons={'vessel':'Select for rough assembly: connected hull/sail transformation and safe framing. Physical CG finish remains below the premium flagship bar.','ident':'Select for rough assembly: original vector proportions, layered titanium/glass geometry, moving macro camera and clean readable hold. No founder brand approval.','origin':'Select moving retained conversation with visibly converging sound signals for the opening problem.','cascade':'Select readable sync/sound/render consequences and FAILED interruption for escalation.','problems':'Select regenerated portrait crops with foreground labels; rejected occluded-label source remains excluded.','failure':'Select readable AGAIN and archived error reconstruction for the emotional setback.','quota':'Select extruded zero and NO CAPACITY for the low point. No live quota grant or archive email is represented.','breakthrough':'Select capacity-wall release into retained generated yacht footage; historical 3000 milliGPU is capacity, not a hardware count.','director':'Select story/shot/cut/sound concept visualization; this is not a live UI recording or proof of arbitrary autonomous planning.','reveal':'Select the readable created-by sentence; production attribution is qualified by actual Factory/Director/renderer receipts and assistant-directed source creation.'}
catalog=[];review={'reviewer':'Codex visual rough-assembly selection','creativeApproval':False,'status':'ROUGH_SELECTION_ONLY','assets':[],'scope':'Byte-bound selections for evaluation of a complete rough. Final marketing quality and human listening are not accepted.'}
for item in read('native-selection.json'):
 directory=item['directory'];file=directory+'/video.mp4';receipt=read(directory+'/render-receipt.json');sha=hashfile(file)
 if receipt['artifact']['sha256']!=sha or not receipt['artifact']['fullDecode']:raise ValueError('Retained source identity or decode failed')
 catalog.append({'assetId':item['assetId'],'path':file,'type':'video','receipt':directory+'/render-receipt.json'})
 review['assets'].append({'assetId':item['assetId'],'accepted':True,'artifactSha256':sha,'reason':reasons[item['assetId']],'reviewer':review['reviewer'],'evidence':'decoded-source-review.jpg'})
for s in read('storyboard.json')['scenes']:
 if s.get('vo'):
  file='assets/narration/'+s['id']+'.wav';receipt=read('assets/narration/'+s['id']+'-receipt.json')
  if hashfile(file)!=receipt['artifact']['sha256']:raise ValueError('Retained narration changed')
  review['assets'].append({'assetId':'vo-'+s['id'],'accepted':True,'artifactSha256':hashfile(file),'reason':'Select retained standard-preset narration of the exact scripted line, with verified duration and headroom. No founder identity or listening acceptance.','reviewer':review['reviewer']})
for variant in ['','-cutdown','-teaser']:
 for name in ['score','cues']:
  file='assets/sound/'+name+(variant or '-hero-v4')+'.wav'
  review['assets'].append({'assetId':name+variant,'accepted':True,'artifactSha256':hashfile(file),'reason':'Select authored stereo score/effect stem with verified peaks, duration and synchronized story/lockup cues. Listening acceptance remains open.','reviewer':review['reviewer']})
(root/'asset-catalog.json').write_text(json.dumps(catalog,indent=2));(root/'asset-review.json').write_text(json.dumps(review,indent=2))
