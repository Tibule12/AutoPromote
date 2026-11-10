"""Decode actual native pixels, retaining every source/replacement frame for review."""
import argparse,json,subprocess
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw

p=argparse.ArgumentParser();p.add_argument('native');p.add_argument('out');p.add_argument('--preview-job',type=Path);p.add_argument('--require-source-identity',action='store_true');a=p.parse_args()
n=Path(a.native);out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
source=Path('/dev/shm/autopromote-background-reassessment-20261103/background-motion-224-226/source')
before=Path('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Four-minute repair - 2026-11-03/Studio native export - four-minute repair.mp4')
regions={'head':(660,45,1040,480),'left-hand':(280,240,680,720),'right-hand':(1040,170,1430,760),'props':(0,720,910,1000),'body':(320,430,1430,1000)}
def decode(file,w,h,start=None):
    cmd=['ffmpeg','-nostdin','-v','error','-threads','1']
    if start is not None:cmd+=['-ss',str(start)]
    cmd+=['-i',str(file),'-map','0:v:0','-frames:v','48','-threads','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']
    data=subprocess.check_output(cmd);assert len(data)==w*h*3*48,(file,len(data))
    return [Image.frombytes('RGB',(w,h),data[i*w*h*3:(i+1)*w*h*3]) for i in range(48)]
identity={}
if a.preview_job:
    # Compare the actual uploaded clip, including its decoded fine edges.
    # The earlier master PNG cache predates the uploaded source derivative.
    original=decode(a.preview_job/'original.mp4',1430,1000)
    model_source=decode(a.preview_job/'source.mp4',1430,1000)
    errors=[float(np.abs(np.asarray(x).astype(np.int16)-np.asarray(y).astype(np.int16)).mean()) for x,y in zip(original,model_source)]
    identity={'actualUploadedSourceComparison':True,'modelSourceExactFrames':sum(v==0 for v in errors),'modelSourceMeanAbsRgb':float(np.mean(errors))}
    if a.require_source_identity:assert identity['modelSourceExactFrames']==48,'Subject normalization changed decoded source pixels'
else:
    assert not a.require_source_identity,'Actual native source must be supplied for identity verification'
    original=[Image.open(source/f'{i:04d}.png').convert('RGB') for i in range(48)]
old=[im.crop((188,0,1732,1080)).resize((1430,1000),Image.Resampling.LANCZOS) for im in decode(before,1920,1080,224)]
preview=decode(n/'preview.mp4',1430,1000)
for name,images in [('source',original),('before',old),('preview',preview)]:
    (out/name).mkdir(exist_ok=True)
    for i,im in enumerate(images):im.save(out/name/f'{i:04d}.png')
for region,box in regions.items():
    for page in range(4):
        w,h=box[2]-box[0],box[3]-box[1];scale=min(1,360/w,380/h);sw,sh=round(w*scale),round(h*scale)
        sheet=Image.new('RGB',(sw*2*3,(sh+24)*4),(15,15,15));draw=ImageDraw.Draw(sheet)
        for cell,i in enumerate(range(page*12,page*12+12)):
            x=cell%3*sw*2;y=cell//3*(sh+24)
            draw.text((x+3,y+4),f'{224+i/24:.4f}s | SOURCE / NATIVE PREVIEW',fill='white')
            for j,im in enumerate([original[i],preview[i]]):sheet.paste(im.crop(box).resize((sw,sh),Image.Resampling.LANCZOS),(x+j*sw,y+24))
        sheet.save(out/f'{region}-{page}.jpg',quality=97)
for i in [0,6,12,24,36,47]:
    sheet=Image.new('RGB',(1430*3,1030),(15,15,15));draw=ImageDraw.Draw(sheet)
    for j,(label,im) in enumerate(zip(['Original source','OWNER-REJECTED four-minute export','New native preview'],[original[i],old[i],preview[i]])):
        sheet.paste(im,(1430*j,30));draw.text((1430*j+5,8),f'{label} | master {224+i/24:.4f}s',fill='white')
    sheet.save(out/f'comparison-{i:04d}.jpg',quality=97)
    for name,box in regions.items():
        w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+30),(15,15,15));draw=ImageDraw.Draw(sheet)
        for j,(label,im) in enumerate(zip(['Original source','Rejected export','New preview'],[original[i],old[i],preview[i]])):
            sheet.paste(im.crop(box),(w*j,30));draw.text((w*j+3,8),f'{label} | frame {i}',fill='white')
        sheet.save(out/f'{name}-comparison-{i:04d}.jpg',quality=97)
(out/'decoded.json').write_text(json.dumps({'actualSourceFrames':48,'actualPreviewFrames':48,'actualRejectedExportFrames':48,'masterStart':224,'fps':24,'visualApproval':False,**identity},indent=2))
print('DECODED_ACTUAL_SOURCE_REJECTED_EXPORT_AND_NATIVE_PREVIEW_48_FRAMES')
