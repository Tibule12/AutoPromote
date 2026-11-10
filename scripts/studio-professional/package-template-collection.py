from pathlib import Path
import json,subprocess,shutil,hashlib
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[2];p=root/'reports/studio-template-collection-20261104';out=Path('/home/tibule12/Videos/Studio Template Collection - 2026-11-04');cases=json.loads((p/'collection.json').read_text());run=lambda a:subprocess.run(a,check=True,capture_output=True);sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
assert all((p/c['id']/'render-ui.json').exists() and (p/c['id']/'finished-ui.json').exists() for c in cases)
inputs=[];filters=[];labels=[]
for i,c in enumerate(cases):
 d=p/c['id'];f=d/'native-motion-flow/final.mp4';r=json.loads((d/'native-motion-flow/render-receipt.json').read_text());assert sha(f)==r['outputSha256'];inputs+=['-i',str(f)];filters += [f'[{i}:v]trim=duration=8,setpts=PTS-STARTPTS[v{i}]',f'[{i}:a]atrim=duration=8,asetpts=PTS-STARTPTS[a{i}]'];labels += [f'[v{i}]',f'[a{i}]']
filters.append(''.join(labels)+'concat=n=6:v=1:a=1[v][a]');reel=out/'Watch all six.mp4'
run(['ffmpeg','-v','error','-threads','2',*inputs,'-filter_complex_threads','2','-filter_complex',';'.join(filters),'-map','[v]','-map','[a]','-frames:v','1152','-t','48','-r','24','-c:v','libx264','-preset','fast','-crf','20','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-y',str(reel)])
probe=json.loads(run(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(reel)]).stdout);v=next(s for s in probe['streams'] if s['codec_type']=='video');assert (v['width'],v['height'],v['r_frame_rate'],int(v['nb_read_frames']))==(1280,720,'24/1',1152);run(['ffmpeg','-v','error','-i',str(reel),'-f','null','-'])
board=Image.new('RGB',(1280,1152),'#121217');draw=ImageDraw.Draw(board);font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',20);definitions=out/'Template definitions';definitions.mkdir(exist_ok=True)
for i,c in enumerate(cases):
 im=Image.open(p/c['id']/'Decoded frames/3.500000.jpg');im.thumbnail((630,354));x=i%2*640;y=i//2*384;board.paste(im,(x,y));draw.text((x+4,y+358),c['label'],font=font,fill='white');shutil.copy2(root/f'frontend/src/templates/{c["id"]}.json',definitions/(c['id']+'.json'))
board.save(out/'Six styles.jpg');technical=out/'Collection evidence';technical.mkdir(exist_ok=True)
for name in ['sources.json','collection.json','template-tests.log','source-gateway-regressions.log','worker-verification-tests.log','kernel-check.log','preflight.json','preflight-final-build.json','preflight-before-type-recovery.json','preflight-before-audio-renewal.json','final-runtime.json','prior-deliveries-verified.json','fashion-correction.json','audio-input-failure.json','collection-verification.json']:
 f=p/name
 if f.exists():shutil.copy2(f,technical/name)
evidence={'reelSha256':sha(reel),'reelSeconds':48,'reelFrames':1152,'fps':24,'fullDecode':True,'scope':'Comparison packaging only: sequential copies of six independently verified native Studio films. No evaluated effects authored in this utility.','nativeFilesUnchanged':True};(p/'review-reel.json').write_text(json.dumps(evidence,indent=2));shutil.copy2(p/'review-reel.json',technical/'review-reel.json');print(out)
