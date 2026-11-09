#!/usr/bin/env python3
"""Materialize a reusable raw motion shot with Studio's existing motion engine."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"python_media_worker"))
from viral_motion_graphics import validate_design,draw_motion_frame
p=argparse.ArgumentParser();p.add_argument("--output",type=Path,required=True);p.add_argument("--text",required=True)
p.add_argument("--secondary",default="");p.add_argument("--duration",type=float,default=3);a=p.parse_args()
if not .5<=a.duration<=10 or len(a.text)>96:raise ValueError("Motion shot requires short literal on-screen wording")
a.output.mkdir(parents=True,exist_ok=True);target=a.output/"video.mp4"
scene={"id":"factory-title","preset":"title","design":"editorial","canvasMode":"standalone","canvasColor":"#080b10",
    "text":a.text,"secondary":a.secondary,"color":"#d6b782","startTime":0,"duration":a.duration,"x":50,"y":50,"scale":1,"easing":"smooth"}
scenes,_=validate_design({"version":1,"scenes":[scene]})
fps=24;w,h=1280,704;frames=round(a.duration*fps)
command=["ffmpeg","-y","-v","error","-f","rawvideo","-pixel_format","rgb24","-video_size",f"{w}x{h}","-framerate",str(fps),"-i","-","-an","-c:v","libx264","-preset","fast","-crf","18","-pix_fmt","yuv420p","-movflags","+faststart",str(target)]
process=subprocess.Popen(command,stdin=subprocess.PIPE)
try:
    for i in range(frames):
        overlay=draw_motion_frame(scenes,i/fps,w,h)
        base=Image.new("RGBA",(w,h),(8,11,16,255));base.alpha_composite(overlay)
        process.stdin.write(base.convert("RGB").tobytes())
    process.stdin.close()
    if process.wait()!=0:raise RuntimeError("Studio motion asset encode failed")
finally:
    if process.poll() is None:process.kill();process.wait()
receipt={"artifact":{"path":str(target),"sha256":hashlib.sha256(target.read_bytes()).hexdigest(),"duration":frames/fps},
    "model":"AutoPromote Studio motion renderer","modelRevision":"viral_motion_graphics/v1","tool":"Studio motion raw-asset adapter",
    "settings":{"scene":scene,"fps":fps,"width":w,"height":h,"frames":frames},"status":"GENERATED_PENDING_REVIEW"}
(a.output/"receipt.json").write_text(json.dumps(receipt,indent=2));print(json.dumps({"path":str(target),"frames":frames}))
