from pathlib import Path
import importlib.util,subprocess,cv2,json
r=Path(__file__).resolve().parent;p=r/'private/stroke-tests';p.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('diagnostic',r/'private/diagnostic-wide-stroke-consumer.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
for name,word,time,box in [('one', 'one',6,(76,75,24,11)),('three-left','three',0,(1,43,21,13)),('three-right','three',6,(77,75,23,11)),('four','four',12,(72,74,28,13))]:
 f=p/(name+'.mp4');assert not f.exists();c=cv2.VideoCapture(f'/home/tibule12/Videos/number {word} dance.mp4');c.set(cv2.CAP_PROP_POS_MSEC,time*1000);ok,im=c.read();c.release();assert ok;image=p/(name+'-source.png');cv2.imwrite(str(image),im)
 subprocess.run(['ffmpeg','-v','error','-y','-loop','1','-i',str(image),'-t','0.084','-r','24','-c:v','libx264','-crf','17','-pix_fmt','yuv420p',str(f)],check=True)
 left,top,width,height=box
 receipt=mod.apply_studio_glyph_cleanup(str(f),{'method':'local_lama_masked','manual_regions':[{'left':left,'top':top,'width':width,'height':height,'track':False,'seed_time':0}]},['-c:v','libx264','-crf','18','-preset','veryfast','-pix_fmt','yuv420p'])
 c=cv2.VideoCapture(str(f));ok,im=c.read();c.release();assert ok;cv2.imwrite(str(p/(name+'-clean.png')),im);print(name,receipt,flush=True)
