"""Internal joint alpha/F check using photographed, reviewed source background.

Hidden reference regions never authorize changes. No model weights are fetched,
no media leaves the laptop and no native model admission is synthesized.
"""
import argparse
import json
from pathlib import Path
import socket
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance
import torch

from model_workers.common import sha, write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('out',type=Path)
    parser.add_argument('--physical-projection',action='store_true')
    parser.add_argument('--photographed-colour-prior',action='store_true')
    parser.add_argument('--observed-background-gaps',action='store_true')
    parser.add_argument('--all-frames',action='store_true')
    parser.add_argument('--write-pair',action='store_true')
    parser.add_argument('--indices',default='6,9,23,36')
    parser.add_argument('--full-photographed-hand',action='store_true')
    parser.add_argument('--pipeline-observed-background',action='store_true')
    parser.add_argument('--photographed-support',type=Path)
    parser.add_argument('--joint-harmonic',action='store_true')
    parser.add_argument('--linear-light',action='store_true')
    parser.add_argument('--material-weight',type=float,default=.025)
    parser.add_argument('--extend-repeated-curtain',action='store_true')
    parser.add_argument('--include-cloth-material',action='store_true')
    parser.add_argument('--two-material',action='store_true')
    parser.add_argument('--local-adapter',type=Path)
    parser.add_argument('--adapter-tiles',action='store_true')
    parser.add_argument('--material-plane',action='store_true')
    parser.add_argument('--material-simplex',action='store_true')
    parser.add_argument('--fixed-alpha-colour',action='store_true')
    parser.add_argument('--chroma-only',action='store_true')
    parser.add_argument('--cuff-in-hand',action='store_true')
    parser.add_argument('--linear-composite',action='store_true')
    parser.add_argument('--release-segmentation-cores',action='store_true')
    parser.add_argument('--released-vitmatte',action='store_true')
    parser.add_argument('--source-consistent-pair',action='store_true')
    parser.add_argument('--source-pair-noise-floor',action='store_true')
    parser.add_argument('--coupled-photo-denoise',action='store_true')
    parser.add_argument('--neural-unobserved-regions',action='store_true')
    parser.add_argument('--photographed-texture',action='store_true')
    parser.add_argument('--reject-background-shading',action='store_true')
    parser.add_argument('--photographed-affine-opacity',action='store_true')
    parser.add_argument('--propagate-photographed-opacity',action='store_true')
    parser.add_argument('--local-photographed-pair',action='store_true')
    parser.add_argument('--motion-material-trimap',action='store_true')
    parser.add_argument('--material-core-seeds',action='store_true')
    parser.add_argument('--resnet-background',action='store_true')
    parser.add_argument('--layered-exposure',action='store_true')
    parser.add_argument('--affine-joint-exposure',action='store_true')
    args=parser.parse_args()
    args.out.mkdir(exist_ok=False)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    helper=Path(__file__).with_name('photographed_joint_solver.py')
    if helper.exists():(args.out/'photographed_joint_solver.py').write_bytes(helper.read_bytes())
    root=Path('reports/background-replacement-20261101/private')
    work=Path('/dev/shm/autopromote-current-pipeline-r83-20261105')
    outputs=work/'alpha-work/outputs'
    guide=work/'alpha-work/component_dependency'
    manifest=json.loads((guide/'manifest.json').read_text())
    source=Path(json.loads((work/'receipt.json').read_text())['source'])
    cache=CachedSubjectMatte(outputs/'subject_masks',source)
    plan=json.loads((work/'actual-plan.json').read_text())
    renderer=VfxFrameRenderer(plan,cache,lambda _:root/'replacement.png')
    # This harness changes the preparation callback between comparisons. An
    # optional application cache must never reuse one callback's diagnostic
    # bytes as another callback's supposedly independent baseline.
    renderer.foreground_cache.root=None
    prepare=renderer._prepare_foreground
    def decode(v):
        return np.where(v<.081,v/4.5,((v+.099)/1.099)**(1/.45))
    def encode(v):
        return np.where(v<.018,v*4.5,1.099*np.maximum(v,0)**.45-.099)
    linear_background=None
    if args.linear_composite:
        allowed={'background_replace','background_grade','foreground_refine','foreground_holdout','foreground_grade'}
        if any(e['type'] not in allowed or e.get('reveal_seconds') or e.get('surface_corners') for e in plan['effects']):
            raise ValueError('Private exposure comparison only supports this existing static set')
        initial=Image.open(outputs/'rgb/rgb_0000.png').convert('RGB')
        renderer._prepare_foreground=lambda *unused:(initial,Image.new('L',initial.size,0))
        linear_background=decode(np.array(renderer.render(initial,0)).astype(float)/255)
        renderer._prepare_foreground=prepare
    reference=np.array(Image.open(outputs/'rgb/rgb_0000.png').convert('RGB'))
    support_path=root/'same-gesture-photographed-background-r106-20261105/reviewed-background-support.png'
    reference_path=outputs/'rgb/rgb_0000.png'
    if args.pipeline_observed_background:
        # Reuse the existing pipeline's repeatedly photographed empty pixels.
        # The first-pose polygon alone left real later-revealed finger gaps
        # outside the correction. The upstream artifact requires >=3 agreeing
        # independently unselected observations and never fills hidden pixels.
        reference_path=outputs/'observed_detail/photographed-reference.png'
        reference=np.array(Image.open(reference_path).convert('RGB'))
        support_path=outputs/'observed_detail/observed-support.png'
    if args.photographed_support:
        if args.pipeline_observed_background:raise ValueError('Choose one actual background reference')
        support_path=args.photographed_support
    observed=np.array(Image.open(support_path))>0
    extended_background=None
    if args.extend_repeated_curtain:
        repeated=np.array(Image.open(outputs/'observed_detail/photographed-reference.png').convert('RGB'))
        repeated_support=np.array(Image.open(outputs/'observed_detail/observed-support.png'))>0
        value=repeated.astype(np.int16)
        yy,xx=np.indices(observed.shape)
        extra=(~observed)&repeated_support&(xx>1100)&(yy<680)&(value[:,:,2]-value[:,:,0]>20)&(value[:,:,2]-value[:,:,1]>12)
        reference[extra]=repeated[extra];observed|=extra
        extended_background={'addedRepeatedlyPhotographedPixels':int(extra.sum()),
            'repeatedReferenceSha256':sha(outputs/'observed_detail/photographed-reference.png'),
            'repeatedSupportSha256':sha(outputs/'observed_detail/observed-support.png')}
        Image.fromarray(reference).save(args.out/'actual-photographed-reference.png')
        Image.fromarray(observed.astype(np.uint8)*255).save(args.out/'actual-photographed-support.png')
    model_path=Path('/home/tibule12/.cache/autopromote-model-runtime/backgroundmattingv2-mit-eval-v1/model.pth')
    expected='6d449e8a0445438491cf07c03a6e86f21df2b3aa2dc630d9430347fcb807aae4'
    if args.resnet_background:
        if args.released_vitmatte or args.photographed_colour_prior or args.local_adapter:raise ValueError('Independent pinned ResNet background-model comparison')
        model_path=Path('/home/tibule12/.cache/autopromote-model-runtime/backgroundmattingv2-resnet101-private-v1/model.pth')
        expected='40f3c46bed55eb0a1abfb17e8d058c02daecbce2c78c52bcc44367f3cba6993e'
    if sha(model_path)!=expected:
        raise ValueError('Previously pinned model changed')
    torch.set_num_threads(3);torch.set_num_interop_threads(1);cv2.setNumThreads(2)
    socket.socket.connect=lambda *a,**k:(_ for _ in ()).throw(RuntimeError('No network inference'))
    model=None
    if args.released_vitmatte:
        if args.photographed_colour_prior or args.local_adapter:raise ValueError('Independent ViTMatte evaluation mode')
        from transformers import VitMatteForImageMatting
        vit_root=Path('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned')
        if sha(vit_root/'model.safetensors')!='bda9289db1bb6762d978b42d1c62ae3f34daf7497171a347a1d09657efd788cb':
            raise ValueError('Wrong pinned ViTMatte checkpoint')
        model=VitMatteForImageMatting.from_pretrained(vit_root,local_files_only=True).to('cuda').eval()
    elif not args.photographed_colour_prior:
        model=torch.jit.load(str(model_path),map_location='cuda').eval()
        model.backbone_scale=1.;model.refine_mode='full'
        if args.local_adapter:
            receipt_path=args.local_adapter.parent/'receipt.json'
            training=json.loads(receipt_path.read_text())
            if training['parentModelSha256']!=sha(model_path) or training['adapterSha256']!=sha(args.local_adapter):
                raise ValueError('Private adapter provenance changed')
            adapter=torch.load(args.local_adapter,map_location='cuda',weights_only=True)
            current=dict(model.named_parameters())
            if set(adapter) not in [set(current),{n for n in current if not n.startswith('backbone')}]:
                raise ValueError('Unexpected private adapter parameters')
            with torch.no_grad():
                for name,value in adapter.items():current[name].copy_(value)
            model.backbone_scale=.5
    elif args.local_adapter:raise ValueError('Private adapter must actually execute the neural path')
    rows=[];started=time.monotonic()
    for index in (range(manifest['frame_count']) if args.all_frames else map(int,args.indices.split(','))):
        image=Image.open(outputs/f'rgb/rgb_{index:04d}.png').convert('RGB')
        rgb=np.array(image);h,w=rgb.shape[:2]
        motion_radius=None;garment_planes=None
        if args.motion_material_trimap:
            from model_workers.adapters.temporal_alpha import source_motion_radius
            previous=np.array(Image.open(outputs/f'rgb/rgb_{max(0,index-1):04d}.png').convert('RGB'))
            following=np.array(Image.open(outputs/f'rgb/rgb_{min(47,index+1):04d}.png').convert('RGB'))
            motion_radius=np.maximum(source_motion_radius(rgb,previous,3),source_motion_radius(rgb,following,3))
            garment_root=root/'garment-tracks-r147-20261105'
            garment_receipt=json.loads((garment_root/'receipt.json').read_text())
            if garment_receipt['sourceSha256']!=sha(source):raise ValueError('Garment source changed')
            garment_planes=[]
            for row in garment_receipt['rows'][index]['components']:
                if sha(garment_root/row['file'])!=row['sha256']:raise ValueError('Garment component bytes changed')
                garment_planes.append(np.array(Image.open(garment_root/row['file'])))
        planes=[np.array(Image.open(guide/c['frames'][index]['file'])) for c in manifest['components']]
        empty=observed&(cv2.dilate((np.maximum.reduce(planes)>=24).astype(np.uint8),np.ones((21,21),np.uint8))==0)
        # Small exposure changes use only independently unselected, actually
        # observed current RGB. No inferred empty-image pixels are inserted.
        offset=np.median(rgb[empty].astype(float)-reference[empty].astype(float),axis=0)
        if np.max(np.abs(offset))>12:raise ValueError('Source reference no longer agrees photometrically')
        background=np.clip(reference.astype(float)+offset,0,255)
        residual=np.max(np.abs(rgb.astype(float)-background),axis=2)
        estimates=[]
        for ci in [1,2]:
            hand=planes[ci];ys,xs=np.where(hand>=128)
            if not len(xs):continue
            x0,y0=max(0,int(xs.min())-55),max(0,int(ys.min())-55)
            x1,y1=min(w,int(xs.max())+56),min(h,int(ys.max())+56)
            sl=np.s_[y0:y1,x0:x1];ch,cw=y1-y0,x1-x0
            photographed=background[sl].copy();photographed[~observed[sl]]=rgb[sl][~observed[sl]]
            def tensor(values):
                t=torch.from_numpy(np.array(values,dtype=np.float32)).to('cuda').permute(2,0,1)[None]/255
                return torch.nn.functional.pad(t,(0,(-cw)%32,0,(-ch)%32),mode='replicate')
            if model is not None:
                if args.released_vitmatte:
                    from pymatting import estimate_foreground_ml
                    old=cache.frame(index)[sl]
                    tri=np.full((ch,cw),128,np.uint8)
                    moving=cv2.dilate((hand[sl]>=24).astype(np.uint8),np.ones((41,41),np.uint8))>0
                    # A semantic hand/body interior is not proof of opacity
                    # during motion blur. Release the ENTIRE moving region;
                    # only very deep hand material and the surrounding known
                    # opaque body can seed the source-conditioned network.
                    tri[(~moving)&(old>=254)]=255
                    tri[(~moving)&(old<=1)]=0
                    deep=cv2.distanceTransform((hand[sl]>=224).astype(np.uint8),cv2.DIST_L2,5)
                    tri[(deep>45)&(old>=254)]=255
                    if args.motion_material_trimap:
                        local_radius=motion_radius[sl]
                        tri[moving]=128
                        # Still fingers have a small source-sized unknown band;
                        # actual fast movement widens it. Clothing has its own
                        # independent current-frame support rather than a
                        # global skin-only assumption.
                        tri[moving&(deep>local_radius+3)]=255
                        garment_depth=cv2.distanceTransform((garment_planes[ci-1][sl]>=224).astype(np.uint8),cv2.DIST_L2,5)
                        tri[moving&(garment_depth>local_radius+5)]=255
                        outside_distance=cv2.distanceTransform((hand[sl]<64).astype(np.uint8),cv2.DIST_L2,5)
                        not_body=planes[0][sl]<128
                        not_cloth=garment_planes[ci-1][sl]<64
                        tri[moving&not_body&not_cloth&(outside_distance>local_radius+4)]=0
                        if args.material_core_seeds:
                            local=rgb[sl].astype(float)
                            hsv=cv2.cvtColor(rgb[sl],cv2.COLOR_RGB2HSV)
                            actual_warm=(local[:,:,0]-local[:,:,1]>8)&(local[:,:,1]>=local[:,:,2]-3)
                            tri[moving&(deep>8)&actual_warm]=255
                            tri[moving&(garment_depth>8)&(hsv[:,:,1]<90)]=255
                    difference=np.linalg.norm(rgb[sl].astype(float)-background[sl],axis=2)
                    tri[observed[sl]&(difference<8)]=0
                    shadow_confidence=np.zeros((ch,cw))
                    if args.reject_background_shading:
                        c=rgb[sl].astype(float);b=background[sl]
                        scale=np.sum(c*b,axis=2)/np.maximum(np.sum(b*b,axis=2),1)
                        chroma_error=np.max(np.abs(c-scale[...,None]*b),axis=2)
                        noise=float(np.clip(np.percentile(residual[empty],95),3,12))
                        # Current weak selection plus independently observed,
                        # saturated B chroma distinguishes this old-room shade
                        # from the actual warm hand and light cuff. Fixed blue
                        # decorations and other objects are outside this ROI.
                        saturated=(b.max(2)-b.min(2))>25
                        weak=np.clip((64-hand[sl].astype(float))/40,0,1)
                        shadow_confidence=np.clip((noise+4-chroma_error)/4,0,1)*weak
                        shadow_confidence*=observed[sl]&saturated&(scale>.3)&(scale<1.15)
                        tri[shadow_confidence>=.999]=0
                    inp=torch.cat((torch.from_numpy(rgb[sl].copy()).to('cuda').permute(2,0,1).float()/127.5-1,
                        torch.from_numpy(tri).to('cuda')[None].float()/255),0)[None]
                    inp=torch.nn.functional.pad(inp,(0,(-cw)%32,0,(-ch)%32),mode='replicate')
                    with torch.inference_mode():aa=model(pixel_values=inp).alphas[0,0,:ch,:cw].cpu().numpy().clip(0,1)
                    aa[tri==0]=0;aa[tri==255]=1
                    ff=estimate_foreground_ml(rgb[sl].astype(float)/255,aa.astype(float)).clip(0,1)
                    Image.fromarray(tri).save(args.out/f'released-trimap-{ci}-{index:04d}.png')
                    Image.fromarray(np.rint(aa*255).astype(np.uint8)).save(args.out/f'raw-vitmatte-{ci}-{index:04d}.png')
                elif args.adapter_tiles:
                    if args.local_adapter is None:raise ValueError('Tile scale is for the private trained adapter')
                    size=160
                    window=np.maximum(np.sin(np.pi*(np.arange(size)+.5)/size)**2,.01)
                    window=np.outer(window,window)
                    denominator=np.zeros((ch,cw));opacity=np.zeros((ch,cw));premul=np.zeros((ch,cw,3))
                    for y in range(0,ch,80):
                        for x in range(0,cw,80):
                            endy,endx=min(ch,y+size),min(cw,x+size);th,tw=endy-y,endx-x
                            cc=rgb[sl][y:endy,x:endx];bb=photographed[y:endy,x:endx]
                            def tile_tensor(v):
                                t=torch.from_numpy(np.array(v,dtype=np.float32)).to('cuda').permute(2,0,1)[None]/255
                                return torch.nn.functional.pad(t,(0,size-tw,0,size-th),mode='replicate')
                            with torch.inference_mode():ta,tf,*_=model(tile_tensor(cc),tile_tensor(bb))
                            ta=ta[0,0,:th,:tw].cpu().numpy();tf=tf[0,:,:th,:tw].permute(1,2,0).cpu().numpy()
                            weight=window[:th,:tw];denominator[y:endy,x:endx]+=weight
                            opacity[y:endy,x:endx]+=ta*weight;premul[y:endy,x:endx]+=tf*(ta*weight)[...,None]
                    aa=(opacity/denominator).clip(0,1)
                    ff=(premul/np.maximum(opacity[...,None],.001)).clip(0,1)
                else:
                    with torch.inference_mode():alpha,foreground,*_=model(tensor(rgb[sl]),tensor(photographed))
                    aa=alpha[0,0,:ch,:cw].cpu().numpy().clip(0,1)
                    ff=foreground[0,:,:ch,:cw].permute(1,2,0).cpu().numpy().clip(0,1)
                    if args.resnet_background:
                        Image.fromarray(np.rint(aa*255).astype(np.uint8)).save(args.out/f'raw-resnet-alpha-{ci}-{index:04d}.png')
                        Image.fromarray(np.rint(ff*255).astype(np.uint8)).save(args.out/f'raw-resnet-foreground-{ci}-{index:04d}.png')
            else:
                aa=cache.frame(index)[sl].astype(np.float32)/255
                ff=rgb[sl].astype(np.float32)/255
            if args.photographed_colour_prior:
                # Use spatially nearby, actually photographed opaque material
                # instead of trusting a network foreground already carrying TV
                # orange. The reference is this same gesture, not another take.
                # This remains an internal comparison, not an admitted model.
                from scipy.spatial import cKDTree
                C=rgb[sl].astype(np.float32)/255;B=background[sl].astype(np.float32)/255
                old=cache.frame(index)[sl].astype(np.float32)/255
                depth=cv2.distanceTransform((hand[sl]>=224).astype(np.uint8),cv2.DIST_L2,5)
                core=(depth>9)&(old>=.99)
                # The known background is useful to reject false foreground
                # samples on the old screen. No unknown pixel is vetoed by hue.
                hsv=cv2.cvtColor(rgb[sl],cv2.COLOR_RGB2HSV).astype(np.float32)
                deep=(depth>max(12,float(depth.max())*.6))&(old>=.99)
                if np.count_nonzero(deep)<16:raise ValueError('No verified deep current hand samples')
                angles=hsv[:,:,0]*np.pi/90
                hue=np.arctan2(np.mean(np.sin(angles[deep])),np.mean(np.cos(angles[deep])))
                hue_distance=np.abs(np.arctan2(np.sin(angles-hue),np.cos(angles-hue)))
                # The dominant material is measured in the current opaque
                # interior; purple/blue mixed boundary samples must not become
                # supposedly clean foreground. No fixed skin hue is imposed.
                core&=(hsv[:,:,1]>35)&(hsv[:,:,2]<235)&(hue_distance<np.pi/6)
                sy,sx=np.where(core)
                if len(sx)<32:raise ValueError('Insufficient current opaque hand material')
                yy,xx=np.indices((ch,cw));coords=np.stack([yy.ravel(),xx.ravel()],axis=1)
                distances,nearest=cKDTree(np.stack([sy,sx],axis=1)[::3]).query(coords,k=12)
                palette=C[sy,sx][::3]
                best=np.full((ch*cw,),np.inf,np.float32)
                ca=C.reshape(-1,3);ba=B.reshape(-1,3);delta=ca-ba
                prior=old.ravel();solved=aa.ravel().copy();colours=ff.reshape(-1,3).copy()
                for j in range(12):
                    material=palette[nearest[:,j]];vector=material-ba
                    contrast=np.sum(vector*vector,axis=1)
                    value=np.clip(np.sum(delta*vector,axis=1)/np.maximum(contrast,1e-6),0,1)
                    colour_residual=delta-value[:,None]*vector
                    score=np.sum(colour_residual*colour_residual,axis=1)+.001*((value-prior)/.5)**2+.00003*(distances[:,j]/30)**2
                    take=score<best;best[take]=score[take];solved[take]=value[take];colours[take]=material[take]
                aa=solved.reshape(ch,cw);ff=colours.reshape(ch,cw,3)
                # Soft suppression is calibrated to measured photograph noise;
                # true moving opaque interiors remain protected below.
                difference=np.linalg.norm(C-B,axis=2)
                aa*=np.clip((difference-3/255)/(6/255),0,1)
                aa=cv2.GaussianBlur(aa,(0,0),.55)
                ff=cv2.GaussianBlur(ff,(0,0),1.2)
            if args.physical_projection:
                C=rgb[sl].astype(float)/255;B=background[sl]/255
                vector=ff-B;delta=C-B;contrast=np.sum(vector*vector,axis=2)
                projected=np.clip(np.sum(delta*vector,axis=2)/np.maximum(contrast,1e-6),0,1)
                # Photograph formation with F in [0,1] bounds opacity. A model
                # cannot erase a dark moving finger over a measured light wall
                # by implicitly demanding negative foreground colour.
                lower=np.maximum(np.maximum((C-B)/np.maximum(1-B,1e-6),
                    (B-C)/np.maximum(B,1e-6)).max(axis=2),0).clip(0,1)
                aa=np.maximum(np.where(contrast>.01,projected,aa),lower)
                ff=((C-(1-aa[...,None])*B)/np.maximum(aa[...,None],.01)).clip(0,1)
            if args.joint_harmonic or args.fixed_alpha_colour:
                from photographed_joint_solver import solve
                aa,ff,_domain,diagnostics=solve(rgb[sl],background[sl].astype(np.uint8),
                    cache.frame(index)[sl],hand[sl],observed[sl],linear=args.linear_light,
                    material_weight=args.material_weight,include_cloth=args.include_cloth_material,
                    fixed_alpha=args.fixed_alpha_colour,cuff_in_hand=args.cuff_in_hand)
                print(json.dumps({'jointFrame':index,'component':ci,**diagnostics}),flush=True)
            if args.two_material:
                from photographed_joint_solver import solve_two_material
                aa,ff,_domain,diagnostics=solve_two_material(rgb[sl],background[sl].astype(np.uint8),
                    cache.frame(index)[sl],hand[sl],observed[sl])
                print(json.dumps({'jointFrame':index,'component':ci,**diagnostics}),flush=True)
            if args.material_plane:
                from photographed_joint_solver import solve_material_plane
                aa,ff,_domain,diagnostics=solve_material_plane(rgb[sl],background[sl].astype(np.uint8),
                    cache.frame(index)[sl],hand[sl],observed[sl],linear=args.linear_light)
                print(json.dumps({'materialPlaneFrame':index,'component':ci,**diagnostics}),flush=True)
            if args.material_simplex:
                from photographed_joint_solver import solve_material_simplex
                aa,ff,_domain,diagnostics=solve_material_simplex(rgb[sl],background[sl].astype(np.uint8),
                    cache.frame(index)[sl],hand[sl],observed[sl],linear=args.linear_light,
                    release_cores=args.release_segmentation_cores)
                print(json.dumps({'materialSimplexFrame':index,'component':ci,**diagnostics}),flush=True)
            if args.layered_exposure:
                from photographed_joint_solver import solve_layered_exposure
                cloth=np.array(Image.open(root/f'garment-tracks-r147-20261105/cuff-{ci-1}-{index:04d}.png'))
                aa,ff,diagnostics=solve_layered_exposure(rgb[sl],background[sl].astype(np.uint8),
                    cache.frame(index)[sl].astype(float)/255,hand[sl],cloth[sl],observed[sl])
                print(json.dumps({'layeredExposureFrame':index,'component':ci,**diagnostics}),flush=True)
            if args.source_consistent_pair:
                neural_a=aa.copy();neural_f=ff.copy()
                if args.photographed_affine_opacity:
                    from photographed_joint_solver import photographed_affine_transmission
                    corrected,texture_weight,_variance=photographed_affine_transmission(rgb[sl],
                        background[sl].astype(np.uint8),observed[sl],aa,radius=5)
                    # The neural matte was made translucent inside an actual
                    # hand simply because the captured screen has a line.
                    # Photographed texture permits BOTH alpha increases and
                    # decreases; the earlier min-only trial could not fix it.
                    if args.propagate_photographed_opacity:
                        from photographed_joint_solver import regularize_photographed_opacity
                        corrected=regularize_photographed_opacity(rgb[sl],aa,corrected,texture_weight,
                            background[sl].astype(np.uint8),observed[sl])
                    aa=corrected
                    Image.fromarray(np.rint(texture_weight*255).astype(np.uint8)).save(args.out/f'photographed-opacity-weight-{ci}-{index:04d}.png')
                if args.photographed_texture:
                    from photographed_joint_solver import photographed_texture_opacity
                    transmission_alpha,texture_confidence=photographed_texture_opacity(rgb[sl],background[sl].astype(np.uint8),observed[sl])
                    aa=aa*(1-texture_confidence)+np.minimum(aa,transmission_alpha)*texture_confidence
                C=rgb[sl].astype(float)/255;B=background[sl].astype(float)/255
                if args.linear_composite:C,B=decode(C),decode(B)
                noise=0.
                if args.source_pair_noise_floor:
                    if args.linear_composite:raise ValueError('Noise-floor check is in measured encoded source code values')
                    noise=float(np.clip(np.percentile(residual[empty],95),3,12))/255
                if args.coupled_photo_denoise:
                    if not args.source_pair_noise_floor:raise ValueError('Coupled photographed noise check needs measured noise')
                    difference=C-B
                    clean_difference=cv2.GaussianBlur(difference,(0,0),1.2)
                    # One shared soft-boundary observation drives BOTH the
                    # gamut bound and premultiplied colour. Using raw noisy C
                    # for one and filtered C for the other creates edge rims.
                    soft=np.clip((.995-aa)/.20,0,1)
                    C=B+difference*(1-soft[...,None])+clean_difference*soft[...,None]
                lower=np.maximum(np.maximum((C-B-noise)/np.maximum(1-B,1e-6),
                    (B-C-noise)/np.maximum(B,1e-6)).max(2),0).clip(0,1)
                previous_a=aa.copy();previous_f=ff.copy()
                aa=np.maximum(aa,lower)
                delta=C-B
                if args.source_pair_noise_floor and not args.coupled_photo_denoise:delta=cv2.GaussianBlur(delta,(0,0),.65)
                ff=((delta+aa[...,None]*B)/np.maximum(aa[...,None],.001)).clip(0,1)
                if args.source_pair_noise_floor:
                    confidence=np.clip((np.max(np.abs(C-B),axis=2)-noise)/(noise+1/255),0,1)
                    pa=previous_a*(1-confidence)+aa*confidence
                    pm=previous_f*previous_a[...,None]*(1-confidence[...,None])+ff*aa[...,None]*confidence[...,None]
                    ff=pm/np.maximum(pa[...,None],.001);aa=pa
                if args.linear_composite:ff=encode(ff)
                if args.neural_unobserved_regions:
                    photo_weight=np.minimum(cv2.distanceTransform(observed[sl].astype(np.uint8),cv2.DIST_L2,5)/6,1)
                    nexta=neural_a*(1-photo_weight)+aa*photo_weight
                    premul=neural_f*neural_a[...,None]*(1-photo_weight[...,None])+ff*aa[...,None]*photo_weight[...,None]
                    ff=premul/np.maximum(nexta[...,None],.001);aa=nexta
            if args.local_photographed_pair:
                from photographed_joint_solver import photographed_local_pair
                aa,ff,_local_confidence=photographed_local_pair(rgb[sl],background[sl].astype(np.uint8),observed[sl],aa,ff)
            if args.affine_joint_exposure:
                from photographed_joint_solver import affine_opacity_and_foreground
                aa,ff,_fit_confidence=affine_opacity_and_foreground(rgb[sl],background[sl].astype(np.uint8),observed[sl],aa,ff)
            if args.reject_background_shading:
                if not args.released_vitmatte:raise ValueError('Background shading correction needs current source-guided neural alpha')
                aa*=1-shadow_confidence
            domain=cv2.dilate((hand[sl]>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0
            if args.neural_unobserved_regions:
                if not args.released_vitmatte:raise ValueError('Only the independent source/trimap model can predict without photographed B')
            else:domain&=observed[sl]
            weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)
            depth=cv2.distanceTransform((hand[sl]>=224).astype(np.uint8),cv2.DIST_L2,5)
            protection=np.clip((24-depth)/12,0,1)
            if args.full_photographed_hand:
                # Source-only diagnostic: coarse opaque segmentation inside a
                # blurred hand must not veto actually photographed empty gaps.
                # This requires reviewed empty-background coverage; elsewhere
                # the original per-frame matte/foreground remain untouched.
                protection=np.ones_like(protection)
            if args.observed_background_gaps:
                # A segmentation core can wrongly contain curtain between
                # fingers. Actual measured empty-background agreement may
                # revoke that opaque seed; colour alone never expands a hand.
                difference=np.linalg.norm(rgb[sl].astype(float)/255-background[sl]/255,axis=2)
                measured_empty=np.clip((22/255-difference)/(10/255),0,1)
                protection=np.maximum(protection,measured_empty)
                aa*=np.clip((difference-7/255)/(12/255),0,1)
            weight*=protection
            if args.fixed_alpha_colour:
                # Canonical effective alpha may contain authored detail
                # corrections beyond the source cache. Preserve that exact
                # value below; only the foreground RGB is changed.
                aa=None
            estimates.append((sl,aa,ff,weight))
        captured=[]
        def paired(frame,alpha,active,width,height):
            fg,eff=prepare(frame,alpha,active,width,height)
            values=np.array(eff).astype(float)/255;colours=np.array(fg).astype(float)/255
            if args.linear_composite:colours=decode(colours)
            for sl,aa,ff,weight in estimates:
                if aa is None:aa=values[sl].copy()
                if args.linear_composite:ff=decode(ff)
                if args.chroma_only:
                    # Preserve photographed shading/detail. Only the excess
                    # background-like blue chroma relative to the current
                    # opaque-material field authorizes colour replacement.
                    oldf=colours[sl].copy()
                    coefficients=np.array([.2126,.7152,.0722])
                    oldy=oldf@coefficients;newy=ff@coefficients
                    recovered=(ff*(oldy/np.maximum(newy,.008))[...,None]).clip(0,1)
                    excess=(oldf[:,:,2]/np.maximum(oldy,.04)-ff[:,:,2]/np.maximum(newy,.04))
                    use=np.clip((excess-.08)/.25,0,1)
                    use=cv2.GaussianBlur(use.astype(np.float32),(0,0),.7)
                    ff=oldf*(1-use[...,None])+recovered*use[...,None]
                old=values[sl];nexta=old*(1-weight)+aa*weight
                premul=colours[sl]*old[...,None]*(1-weight[...,None])+ff*aa[...,None]*weight[...,None]
                colours[sl]=np.where(nexta[...,None]>.001,premul/np.maximum(nexta[...,None],.001),colours[sl])
                values[sl]=nexta
            if args.linear_composite:colours=encode(colours)
            pair=Image.fromarray(np.rint(colours.clip(0,1)*255).astype(np.uint8)),Image.fromarray(np.rint(values.clip(0,1)*255).astype(np.uint8))
            captured.append(pair)
            return pair
        renderer._prepare_foreground=paired;result=renderer.render(image,index)
        renderer._prepare_foreground=prepare;previous=renderer.render(image,index)
        if args.linear_composite:
            fg,opacity=captured[0]
            for effect in plan['effects']:
                if effect['type']!='foreground_grade' or not effect['start']<=index/24<effect['end']:continue
                fg=ImageEnhance.Color(fg).enhance(effect['saturation'])
                fg=ImageEnhance.Contrast(fg).enhance(effect['contrast'])
                fg=ImageEnhance.Brightness(fg).enhance(2**effect['exposure'])
            values=np.array(opacity).astype(float)/255
            physical=encode(decode(np.array(fg).astype(float)/255)*values[...,None]+linear_background*(1-values[...,None]))
            scope=np.zeros((h,w))
            for sl,_aa,_ff,weight in estimates:scope[sl]=np.maximum(scope[sl],weight)
            base=np.array(previous).astype(float)/255
            result=Image.fromarray(np.rint(np.clip(base*(1-scope[...,None])+physical*scope[...,None],0,1)*255).astype(np.uint8))
        result.save(args.out/f'actual-composite-{index:04d}.png')
        if args.write_pair:
            f,a=captured[0]
            f.save(args.out/f'foreground-{index:04d}.png');a.save(args.out/f'alpha-{index:04d}.png')
        for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
            cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24))
            for n,(title,picture) in enumerate([('Actual source',image),('Current canonical composite',previous),('Same-gesture photographed pair',result)]):
                sheet.paste(picture.crop(box),(cw*n,24));ImageDraw.Draw(sheet).text((cw*n+3,4),title,fill='white')
            sheet.save(args.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'photographedBackgroundMedianError255':float(np.median(residual[empty])),
            'photographedBackgroundP95Error255':float(np.percentile(residual[empty],95)),
            'currentExposureOffset':offset.tolist(),'visualPass':False})
        print(json.dumps(rows[-1]),flush=True)
    write_json(args.out/'receipt.json',{'sourceSha256':sha(source),'backgroundSupportSha256':sha(support_path),
        'referenceSourceFrame':None if args.pipeline_observed_background else 0,'referenceRgbSha256':sha(reference_path),
        'physicalProjection':args.physical_projection,'photographedColourPrior':args.photographed_colour_prior,
        'observedBackgroundGaps':args.observed_background_gaps,'allFrames':args.all_frames,
        'jointBackgroundModelExecuted':model is not None and not args.released_vitmatte,
        'fullPhotographedHand':args.full_photographed_hand,
        'jointHarmonic':args.joint_harmonic,'linearLight':args.linear_light,
        'materialWeight':args.material_weight,
        'includeClothMaterial':args.include_cloth_material,
        'twoMaterial':args.two_material,
        'localAdapterSha256':sha(args.local_adapter) if args.local_adapter else None,
        'adapterTiles':args.adapter_tiles,
        'materialPlane':args.material_plane,
        'materialSimplex':args.material_simplex,
        'fixedAlphaColour':args.fixed_alpha_colour,
        'chromaOnly':args.chroma_only,
        'cuffInHand':args.cuff_in_hand,
        'linearBt709CompositionOnlyWithinPhotographedHandScope':args.linear_composite,
        'releaseSegmentationCores':args.release_segmentation_cores,
        'releasedVitmatte':args.released_vitmatte,
        'sourceConsistentPair':args.source_consistent_pair,
        'sourcePairNoiseFloor':args.source_pair_noise_floor,
        'coupledPhotographedSoftBoundaryDenoise':args.coupled_photo_denoise,
        'sourceOnlyNeuralMatteAllowedWhereBackgroundUnobserved':args.neural_unobserved_regions,
        'photographedBackgroundTextureTransmission':args.photographed_texture,
        'rejectMeasuredBackgroundShadingWithinWeakHandSelection':args.reject_background_shading,
        'photographedAffineOpacityMayIncreaseOrDecrease':args.photographed_affine_opacity,
        'currentSourceEdgePropagationOfPhotographedOpacity':args.propagate_photographed_opacity,
        'localPhotographedPairUsesCommonPremultipliedFit':args.local_photographed_pair,
        'currentMotionAndIndependentCuffConditionedTrimap':args.motion_material_trimap,
        'privateCurrentWarmHandAndIndependentCuffCoreSeeds':args.material_core_seeds,
        'resnetBackgroundCheckpoint':sha(model_path) if args.resnet_background else None,
        'spatialFourMaterialExposureMixture':args.layered_exposure,'affineJointOpacityAndForeground':args.affine_joint_exposure,
        'optionalForegroundCacheDisabledForIndependentComparisons':True,
        'extendedRepeatedCurtain':extended_background,
        'pipelineRepeatedPhotographedBackground':args.pipeline_observed_background,
        'rows':rows,'elapsedSeconds':time.monotonic()-started,
        'sourceReferenceHiddenRegionsFilled':False,'newPretrainedWeightsDownloaded':False,
        'privateWeightsAdapted':args.local_adapter is not None,'nativeAdmission':False,
        'fourMinuteProof':False,'visualPass':False})


if __name__=='__main__':
    main()
