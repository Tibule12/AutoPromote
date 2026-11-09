#!/usr/bin/env python3
import argparse
from pathlib import Path
import subprocess
import json
from PIL import Image,ImageDraw,ImageFont
import io,hashlib
def make(source,output,frames_dir=None,count=12):
    info=json.loads(subprocess.run(["ffprobe","-v","error","-show_format","-of","json",str(source)],capture_output=True,text=True,check=True).stdout)
    duration=float(info["format"]["duration"])
    cols=3;w,h=480,270
    sheet=Image.new("RGB",(cols*w,((count+cols-1)//cols)*(h+28)),"#101010");draw=ImageDraw.Draw(sheet)
    if frames_dir:frames_dir.mkdir(parents=True,exist_ok=True)
    frames=[]
    font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",16)
    for i in range(count):
        at=min(max(0,duration-.08),duration*i/(count-1))
        frame=subprocess.run(["ffmpeg","-v","error","-ss",str(at),"-i",str(source),"-frames:v","1","-vf",f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2", "-f","image2pipe","-vcodec","png","-"],capture_output=True,check=True)
        x=(i%cols)*w;y=(i//cols)*(h+28)
        decoded=Image.open(io.BytesIO(frame.stdout)).convert("RGB")
        sheet.paste(decoded,(x,y))
        if frames_dir:
            destination=frames_dir/f"frame-{i+1:02d}.png";decoded.save(destination)
            frames.append({"path":str(destination),"timestamp":at,"sha256":hashlib.sha256(destination.read_bytes()).hexdigest()})
        draw.text((x+8,y+h+5),f"{i+1:02d}  {at:.2f}s",fill="#e7e7e7",font=font)
    output.parent.mkdir(parents=True,exist_ok=True);sheet.save(output,quality=92)
    if frames_dir:(frames_dir/'frames.json').write_text(json.dumps({"sourceSha256":hashlib.sha256(source.read_bytes()).hexdigest(),"frames":frames},indent=2))
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--input",type=Path,required=True);p.add_argument("--output",type=Path,required=True)
    p.add_argument('--frames-dir',type=Path);p.add_argument('--frame-count',type=int,default=12,choices=range(2,17))
    a=p.parse_args();make(a.input,a.output,a.frames_dir,a.frame_count)
