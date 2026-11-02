"""Assemble only the reviewed source intervals; waits for actual local inference.

No frame interpolation, repeated speech, or fabricated model/native receipts.
"""
from pathlib import Path
import argparse,json,time,subprocess,os,hashlib,shutil
p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('destination');a=p.parse_args();r=Path(a.root).resolve();dest=Path(a.destination).resolve();dest.mkdir(exist_ok=True,parents=True)
final=r/'final-tail/proof-84-156';deadline=time.monotonic()+4*3600
while not (final/'proof.json').exists():
 if time.monotonic()>deadline:raise TimeoutError('Bounded review assembly wait elapsed; preserve partial outputs')
 time.sleep(2)
receipt=json.load(open(final/'proof.json'));assert receipt['startSeconds']==84 and receipt['durationSeconds']==156 and len(receipt['records'])==3744
assert shutil.disk_usage(r).free>3*1024**3,'Preserve at least 3GiB for final review packaging'
# Source clock is 24fps throughout. Stream-copy trims retain B-frame padding;
# filter trims below use exact decoded frame intervals before concatenation.
first=r/'retained-first-72s.mp4';middle=r/'retained-72-84s.mp4';patch=r/'early-sleeve-repairs'
parts=[(first,0,1188,0,49.5),(patch/'proof-49.5-3/picture.mp4',0,72,49.5,52.5),
 (first,1260,1284,52.5,53.5),(patch/'proof-53.5-3.75/picture.mp4',0,90,53.5,57.25),
 (first,1374,1512,57.25,63),(patch/'proof-63-0.5/picture.mp4',0,12,63,63.5),
 (first,1524,1728,63.5,72),(middle,0,288,72,84),(final/'picture.mp4',0,3744,84,240)]
assert sum(end-start for _,start,end,*_ in parts)==5760
for file,*_ in parts:assert file.is_file()
def encode(parts,file,codec,pix):
 inputs=sum((['-i',str(v[0])] for v in parts),[])
 filters=[]
 for i,(_,start,end,*_) in enumerate(parts):filters.append(f'[{i}:v]trim=start_frame={start}:end_frame={end},setpts=PTS-STARTPTS,format={pix}[v{i}]')
 filters.append(''.join(f'[v{i}]' for i in range(len(parts)))+f'concat=n={len(parts)}:v=1:a=0[video]')
 options=['-level','3','-g','1'] if codec=='ffv1' else ['-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart']
 subprocess.run(['ffmpeg','-nostdin','-v','error','-threads','2',*inputs,'-filter_complex_threads','2','-filter_complex',';'.join(filters),'-map','[video]','-an','-frames:v','5760','-r','24','-c:v',codec,'-threads','4',*options,str(file)],check=True)
movie=r/'assembled-picture.mp4';encode(parts,movie,'libx264','yuv420p')
master=Path('/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4')
next_movie=dest/'Four-minute background replacement - review.mp4'
subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(movie),'-i',str(master),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t','240','-movflags','+faststart',str(next_movie)],check=True)
alpha_parts=[]
for file,start,end,absolute_start,absolute_end in parts:
 if file==first:file=r/'threaded-pass/proof-0-240/alpha.mkv'
 elif file==middle:file=r/'corrected-tail/proof-72-168/alpha.mkv'
 else:file=file.parent/'alpha.mkv'
 alpha_parts.append((file,start,end,absolute_start,absolute_end))
alpha=dest/'Full alpha matte - lossless.mkv';encode(alpha_parts,alpha,'ffv1','gray')
for file in [next_movie,alpha]:
 subprocess.run(['ffmpeg','-nostdin','-v','error','-threads','2','-i',str(file),'-f','null','-'],check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(next_movie)]));video=next(s for s in probe['streams'] if s['codec_type']=='video');assert int(video['nb_read_frames'])==5760 and float(video['duration'])==240
rows=[{'file':str(f),'sourceFrameStart':s,'sourceFrameEnd':e,'absoluteStartSeconds':a,'absoluteEndSeconds':b} for f,s,e,a,b in parts]
result={'fullDecodePassed':True,'frames':5760,'seconds':240,'fps':24,'width':1430,'height':1000,'sourceMaster':str(master),'pictureIntervals':rows,'audio':'Continuous original master 0–240s, AAC 192k; never looped or reordered','modelRuns':'Actual local GPU SAM/ViTMatte plus private cached CPU RVM guidance; no paid cloud','nativeStudioQualification':False,'visualGate':False}
(r/'assembly-verification.json').write_text(json.dumps(result,indent=2));(dest/'assembly-verification.json').write_text(json.dumps(result,indent=2));print(json.dumps({'event':'FOUR_MINUTE_REVIEW_ASSEMBLED','movie':str(next_movie),'alpha':str(alpha),'frames':5760,'visualReviewRequired':True}),flush=True)
