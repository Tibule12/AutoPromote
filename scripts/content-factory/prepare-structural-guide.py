"""CPU-only Canny control preparation from the native editable motion guide."""
import argparse,hashlib,json,subprocess
from pathlib import Path
import cv2,numpy as np

p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
root=a.root.resolve();out=a.output.resolve()
if not out.is_relative_to(root):raise ValueError('Private artifact root required')
source=root/'assets/founder-native-transform-v12/video.mp4';native=root/'assets/founder-native-transform-v12/paper-yacht.blend'
projection=root/'assets/founder-guided-transform-v16/boat-projection.json';geometry=json.loads(projection.read_text())
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
if geometry['sourceNativeSha256']!=sha(native) or len(geometry['frames'])!=81:raise ValueError('Native projection identity/count mismatch')
if sha(source)!='1732614db0b563b4756c33b793e016c59515774884076134f6b4e9c415945ead':raise ValueError('Reviewed motion guide required')
out.mkdir(parents=True,exist_ok=True)
decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(source),'-vf','scale=854:480,crop=832:480','-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
frames=np.frombuffer(decoded,dtype=np.uint8).reshape((-1,480,832,3));guides=[];samples=[]
for index,record in enumerate(geometry['frames']):
 frame=frames[record['sceneFrame']-1];mask=np.zeros((480,832),np.uint8)
 cv2.fillPoly(mask,[np.asarray(record['polygon'],np.int32)],255);mask=cv2.dilate(mask,np.ones((7,7),np.uint8))
 edges=cv2.Canny(cv2.cvtColor(frame,cv2.COLOR_RGB2GRAY),50,120);edges[mask==0]=0
 guide=cv2.cvtColor(edges,cv2.COLOR_GRAY2RGB);guides.append(guide)
 if index in (0,16,32,48,64,80):samples.append(guide)
 if not np.count_nonzero(edges):raise ValueError('Empty boat structural condition')
video=out/'control.mp4'
process=subprocess.run(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','832x480','-r','16','-i','pipe:0','-c:v','libx264rgb','-crf','0','-preset','fast','-pix_fmt','rgb24',str(video)],input=np.stack(guides).tobytes(),check=True)
sheet=np.concatenate([np.concatenate(samples[:3],axis=1),np.concatenate(samples[3:],axis=1)],axis=0)
cv2.imwrite(str(out/'control-review.png'),cv2.cvtColor(sheet,cv2.COLOR_RGB2BGR))
parent=json.loads((root/'assets/founder-guided-transform-v16/request.json').read_text())
request={k:parent[k] for k in ['firstImage','firstImageSha256','lastImage','lastImageSha256','sourceBrief','deadlineEpoch']}
request.update({'controlVideo':'/work/'+str(video.relative_to(root)),'controlVideoSha256':sha(video),'seed':20261007207,
 'prompt':'A single continuous cinematic photographic shot. A small ivory folded paper boat transforms into a full-size twelve-metre mahogany sailing yacht. The bow and connected hull smoothly unfold and curve into wet timber, while the triangular paper fold grows into tall cream canvas sails with emerging mast and taut ropes. The same single boat remains connected and central throughout. The camera smoothly pulls back as deep blue ocean waves expand around it, revealing the vessel\'s magnificent full size. Sunlight catches the wet varnished wood and canvas. A forceful moving bow wake, fine sea spray, glinting water reflections, dawn atmosphere. The final yacht sails forward across open sea. Real camera, detailed photographic materials, natural fluid motion, coherent progressive growth, no change of shot.',
 'negativePrompt':'hard cut, jump cut, fade, dissolve, duplicate boats, disconnected pieces, miniature, toy, model on display, flat water disc, flat studio background, CGI render, plastic, cartoon, blurry, watermark, writing',
 'reference':{'motionGuide':parent['reference'],'structuralControl':{'sourceVideoSha256':sha(source),'sourceNativeSha256':sha(native),'projectionSha256':sha(projection),
 'tool':'CPU OpenCV Canny 50/120 masked to CPU evaluated boat geometry; outside background edges removed','sourceFrames':[record['sceneFrame'] for record in geometry['frames']],
 'decodedControlFrameHashes':[hashlib.sha256(frame.tobytes()).hexdigest() for frame in guides],'limitation':'Prepared control signals, not new generated footage or creative acceptance.'}}})
(out/'request.json').write_text(json.dumps(request,indent=2));print(json.dumps({'event':'structural_guide_prepared','frames':len(guides),'sha256':sha(video)}))
