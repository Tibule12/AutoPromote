"""Private signed-premultiplication diagnostic; canonical scene stays pinned.

This checks whether clipping recovered foreground BEFORE layer composition is
destroying source detail. It is not native admission or an alternate delivery.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw,ImageEnhance
from model_workers.common import sha,write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path)
    p.add_argument('--indices',default='7,23,10,17,35');a=p.parse_args();a.out.mkdir(exist_ok=False)
    (a.out/'implementation.py').write_bytes(Path(__file__).read_bytes());cv2.setNumThreads(2)
    root=Path('reports/background-replacement-20261101/private');work=Path('/dev/shm/autopromote-current-pipeline-r83-20261105')
    paired=root/'coupled-photo-motion-r143-20261105';reference=np.array(Image.open(paired/'actual-photographed-reference.png')).astype(float)/255
    observed=np.array(Image.open(paired/'actual-photographed-support.png'))>0
    source=Path(json.loads((work/'receipt.json').read_text())['source']);guide=work/'alpha-work/component_dependency';components=json.loads((guide/'manifest.json').read_text())['components']
    cache=CachedSubjectMatte(work/'alpha-work/outputs/subject_masks',source)
    plan=json.loads((work/'actual-plan.json').read_text());renderer=VfxFrameRenderer(plan,cache,lambda _:root/'replacement.png');renderer.foreground_cache.root=None;prepare=renderer._prepare_foreground
    rows=[];started=time.monotonic()
    for index in map(int,a.indices.split(',')):
        image=Image.open(work/f'alpha-work/outputs/rgb/rgb_{index:04d}.png').convert('RGB');C=np.array(image).astype(float)/255
        renderer._prepare_foreground=lambda *unused:(image,Image.new('L',image.size,0))
        N=np.array(renderer.render(image,index)).astype(float)/255;renderer._prepare_foreground=prepare
        baseline=np.array(Image.open(paired/f'actual-composite-{index:04d}.png')).astype(float)/255
        alpha=np.array(Image.open(paired/f'alpha-{index:04d}.png')).astype(float)/255
        domain=np.zeros(alpha.shape,np.uint8)
        for ci in [1,2]:
            mask=np.array(Image.open(guide/components[ci]['frames'][index]['file']))
            domain|=cv2.dilate((mask>=64).astype(np.uint8),np.ones((31,31),np.uint8))
        domain&=observed.astype(np.uint8);weight=np.minimum(cv2.distanceTransform(domain,cv2.DIST_L2,5)/8,1)
        # C-B+aB is retained as SIGNED premultiplied colour until final mixing.
        # Foreground colour values below zero may be a display-space artifact;
        # clipping them prematurely changes the actual composited edge.
        difference=C-reference
        difference=cv2.GaussianBlur(difference,(0,0),.65)
        P=difference+alpha[:,:,None]*reference
        result=P+(1-alpha[:,:,None])*N
        mixed=baseline*(1-weight[:,:,None])+result*weight[:,:,None]
        out=Image.fromarray(np.rint(mixed.clip(0,1)*255).astype(np.uint8));out.save(a.out/f'actual-composite-{index:04d}.png')
        for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
            w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
            for j,(title,picture) in enumerate([('Actual source',image),('Clipped foreground pair',Image.fromarray(np.rint(baseline*255).astype(np.uint8))),('Signed foreground until composition',out)]):
                sheet.paste(picture.crop(box),(j*w,24));ImageDraw.Draw(sheet).text((j*w+3,4),title,fill='white')
            sheet.save(a.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'negativePremultipliedPixelsInObservedDomain':int(np.count_nonzero(domain&(P.min(2)<0))),
            'finalOutOfGamutInDomain':int(np.count_nonzero(domain&((result.min(2)<0)|(result.max(2)>1))))})
        print(json.dumps(rows[-1]),flush=True)
    write_json(a.out/'receipt.json',{'sourceSha256':sha(source),'rows':rows,'registeredCompositorChanged':False,
        'elapsedSeconds':time.monotonic()-started,'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False})


if __name__=='__main__':main()
