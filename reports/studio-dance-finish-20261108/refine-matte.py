from pathlib import Path
import subprocess,cv2,numpy as np,json,hashlib
r=Path(__file__).resolve().parent;(r/'prepared').mkdir(exist_ok=True)
source=r.parent/'studio-dance-realism-20261108/prepared/number two - subject matte.mp4'
frames=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(source),'-pix_fmt','gray','-f','rawvideo','-']),np.uint8).reshape(144,1024,576)
out=r/'prepared/Two - firmer detailed matte.mp4'
encoder=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','gray','-s','576x1024','-r','24','-i','pipe:0','-an','-c:v','libx264','-crf','8','-preset','fast','-threads','2','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
try:
    for frame in frames:
        # Remove the low-alpha fringe and firm the transition while retaining
        # fractional alpha; no binary edge or subject-scale distortion.
        alpha=np.clip((frame.astype('float32')/255-.07)/.86,0,1)
        alpha=cv2.erode(alpha,np.ones((2,2),np.uint8),anchor=(0,0))
        encoder.stdin.write(np.round(alpha*255).astype('uint8').tobytes())
finally:encoder.stdin.close()
assert encoder.wait()==0
(r/'matte-refinement.json').write_text(json.dumps({'sourceSha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'outputSha256':hashlib.file_digest(out.open('rb'),'sha256').hexdigest(),'frames':144,'fps':24,'size':[576,1024],'preparedInputNotAutomaticStudioIsolation':True,'refinement':'Bounded .07/.86 alpha remap and one-pixel erosion; retains fractional edges.'},indent=2)+'\n')
