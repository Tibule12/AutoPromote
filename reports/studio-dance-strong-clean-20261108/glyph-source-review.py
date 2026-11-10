from pathlib import Path
import sys,json,subprocess,cv2
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from python_media_worker.studio_watermark_cleanup import apply_studio_glyph_cleanup
r=Path(__file__).resolve().parent;out=r/'private/neural-alpha-source-tests';out.mkdir(exist_ok=True)
for word,start in [('two',8)]:
 f=out/(word+'.mp4');assert not f.exists()
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(start),'-i',f'/home/tibule12/Videos/number {word} dance.mp4','-t','8','-r','24','-c:v','libx264','-crf','16','-pix_fmt','yuv420p','-c:a','aac',str(f)],check=True)
 regions=[{'left':77,'top':75,'width':22,'height':11,'track':False,'seed_time':6 if word=='three'else 0}]
 if word=='three':regions.insert(0,{'left':1,'top':44,'width':22,'height':10,'track':False,'seed_time':0})
 receipt=apply_studio_glyph_cleanup(str(f),{'method':'local_lama_masked','manual_regions':regions},['-c:v','libx264','-crf','18','-preset','veryfast','-pix_fmt','yuv420p'])
 (out/(word+'.json')).write_text(json.dumps(receipt,indent=2))
 cap=cv2.VideoCapture(str(f))
 for t in [0,1,3,4.5,6,7.8]:
  cap.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,frame=cap.read();assert ok;cv2.imwrite(str(out/(word+'-'+str(t)+'.jpg')),frame)
 cap.release();print(word,receipt,flush=True)
