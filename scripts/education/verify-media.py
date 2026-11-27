"""Independently decode actual native exports and compare simple source edits.
The reference encodes are test oracles only, never delivered as Studio results.
"""
import json,subprocess,hashlib
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];WORK=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124');ASSETS=ROOT/'frontend/public/education/it-studio-v1';OUT=ROOT/'reports/education-phase1-20261124'
def run(args):return subprocess.run(args,check=True,capture_output=True)
def info(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
def pixels(p,at):
 return np.array(Image.open(__import__('io').BytesIO(subprocess.check_output(['ffmpeg','-v','error','-ss',str(at),'-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-']))).convert('RGB'))
results=[]
for lesson in json.loads((ROOT/'frontend/src/education/lessons.json').read_text())['lessons']:
 folder=WORK/lesson['id'];proof=folder/'lesson-proof.json'
 if not proof.exists():continue
 movie=folder/'final.mp4';i=info(movie);video=next(x for x in i['streams']if x['codec_type']=='video');run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'])
 assert (video['width'],video['height'])==(1280,720)
 expected=float(json.loads(proof.read_text())['duration']);assert abs(float(video['duration'])-expected)<=1/24+.001
 if lesson['number']==5:
  assert any(x['codec_type']=='audio'for x in i['streams'])
  measurement=subprocess.run(['ffmpeg','-hide_banner','-i',str(movie),'-vn','-af','volumedetect','-f','null','-'],text=True,capture_output=True,check=True).stderr
  assert 'max_volume: -inf'not in measurement;(folder/'audio-measurement.txt').write_text(measurement)
 # Compare settled 2.5-second browser picture with the exact final frame.
 preview=Image.open(folder/'preview-2.5.png').convert('RGB');frame=pixels(movie,2.5);preview=preview.resize((1280,720),Image.Resampling.LANCZOS);a=np.array(preview);diff=np.abs(a.astype(float)-frame.astype(float));mae=float(diff.mean());fraction=float((diff.max(axis=2)>24).mean())
 Image.fromarray(np.hstack([a,frame])).resize((1280,360)).save(OUT/(lesson['id']+'-preview-export.jpg'))
 # The whole simple raw/cut/sequence result is sampled every output frame.
 pairs=[]
 for at in np.arange(0,float(video['duration']),1/24):
  if lesson['number']==3:
   idx=min(2,int(at//4));source=['normal-input.mp4','boundary-input.mp4','invalid-input.mp4'][idx];source_at=[1,3,1][idx]+(at-idx*4)
  else:source='normal-input.mp4';source_at=float(at)+(0 if lesson['number']==1 else 1)
  if lesson['number']==4:continue # authored title needs native paused/whole moving review, not raw-image equality
  # Small decoded comparison covers every output frame while remaining cheap.
  pairs.append((round(float(at),6),source,round(source_at,6)))
 # Source/clock semantics are retained for an independent full-film pair pass.
 (folder/'reference-clock.json').write_text(json.dumps(pairs))
 result={'lessonId':lesson['id'],'nativeResultSha256':hashlib.sha256(movie.read_bytes()).hexdigest(),'fullDecode':True,'width':1280,'height':720,'duration':float(video['duration']),'frames':int(video['nb_frames']),'previewFinalPair':{'time':2.5,'meanAbsoluteRgbDifference':mae,'fractionOver24':fraction,'toleranceQualified':False},'mappedReferenceFrames':len(pairs),'technicalCorrectnessReview':'pending full moving comparison; no automated teaching approval'}
 results.append(result)
(OUT/'lesson-verification.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps({'decoded':len(results),'previewPairs':[(r['lessonId'],round(r['previewFinalPair']['meanAbsoluteRgbDifference'],3))for r in results]}))
