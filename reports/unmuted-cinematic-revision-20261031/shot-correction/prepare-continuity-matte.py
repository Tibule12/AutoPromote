"""Shot-specific temporal person matte plus real, separately selected equipment.

Only source pixels are retained. No invented microphone/post or missing anatomy.
The native foreground cleanup function is called directly on these local pixels;
this is not an authenticated Studio job or a new application workflow.
"""
from pathlib import Path
import json, os, sys, time
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'private/native-edge-deps'))
sys.path.insert(0, str(ROOT.parents[2]))
os.environ.update(NUMBA_CACHE_DIR=str(ROOT/'private/numba-cache'),
    OMP_NUM_THREADS='2', OPENBLAS_NUM_THREADS='1', NUMBA_NUM_THREADS='2')
import cv2, numpy as np
from PIL import Image
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import sha256

cv2.setNumThreads(1)
WORK = ROOT / 'private/continuity'
OUT = WORK / 'presenter'
OUT.mkdir(exist_ok=True)
width, height = 1280, 1000
def polygon(points):
    result = np.zeros((height,width), np.uint8)
    cv2.fillPoly(result, [np.array(points, np.int32)], 255)
    return result

# These selections follow the actual locked-camera chair and equipment. They
# are private authored roto, not model-generated reconstruction or tracking.
chair_region = np.maximum(
    polygon([(198,1000),(200,753),(208,714),(230,686),(270,669),(370,647),
        (427,711),(467,1000)]),
    polygon([(850,1000),(1011,1000),(1025,745),(1014,710),(1003,694),
        (974,696),(936,720),(872,758)]))
seated_envelope = polygon([(198,1000),(200,753),(208,714),(230,686),
    (270,669),(370,647),(1003,694),(1014,710),(1025,745),(1011,1000)])
seated_core = cv2.erode(seated_envelope,np.ones((25,25),np.uint8))
garment_core = polygon([(610,425),(760,425),(825,450),(870,520),
    (890,610),(890,700),(850,800),(500,820),(470,700),(475,600),(520,485)])
boom_region = polygon([(778,641),(1183,548),(1210,550),(1230,580),
    (1200,620),(1175,614),(793,700),(772,686)])
capsule = polygon([(646,493),(655,479),(681,465),(708,462),(724,471),
    (741,524),(755,550),(771,569),(792,568),(800,583),(799,625),
    (775,639),(748,655),(744,671),(720,674),(712,650),(684,641),
    (665,623),(654,589),(645,552),(641,522)])
# The real mount and cable cross the moving presenter. Protect them separately
# instead of allowing a person-only model to cut holes through those pixels.
mount = polygon([(711,642),(748,631),(786,654),(808,637),(832,636),
    (835,677),(818,695),(792,702),(769,679),(744,679),(726,687)])
cable = np.zeros((height,width),np.uint8)
cv2.polylines(cable,[np.array([(731,651),(741,702),(754,758),(768,820),
    (783,881),(798,941),(813,999)],np.int32)],False,255,6,cv2.LINE_AA)
effect = json.loads((ROOT/'private/native-composite-cleanup/radius-0/plan.json').read_text())['effects'][0]
effect = {**effect, 'edge_radius': 2}
all_frames = '--all' in sys.argv
indices = range(72) if all_frames else [0,12,16]
records=[];started=time.monotonic()
transforms=[]
first=np.array(Image.open(WORK/'raw/000001.png').convert('RGB'))
previous_gray=cv2.cvtColor(first,cv2.COLOR_RGB2GRAY)
selection=np.zeros((height,width),np.uint8);selection[190:315,630:755]=255
origin=cv2.goodFeaturesToTrack(previous_gray,30,.015,8,mask=selection)
tracked=origin.copy()
for i in range(72):
    gray=cv2.cvtColor(np.array(Image.open(WORK/'raw'/f'{i+1:06d}.png').convert('RGB')),cv2.COLOR_RGB2GRAY)
    if i:
        next_points,status,_=cv2.calcOpticalFlowPyrLK(previous_gray,gray,tracked,None)
        assert int(status.sum())>=10,'Head feature tracking failed'
        tracked=next_points
    affine,inliers=cv2.estimateAffinePartial2D(origin,tracked,method=cv2.RANSAC,ransacReprojThreshold=2)
    assert affine is not None
    transforms.append(affine);previous_gray=gray
for index in indices:
    raw = np.array(Image.open(WORK/'raw'/f'{index+1:06d}.png').convert('RGB'))
    previous = np.array(Image.open(ROOT/'private/attempt-2/raw'/f'{index+1:06d}.png').convert('RGB'))
    assert np.array_equal(raw[:,170:], previous), 'Source clock/crop differs'
    person = np.array(Image.open(ROOT/'private/temporal-subject/full/subject_masks'/f'matte_{index:04d}.png'))
    values = np.zeros((height,width),np.uint8);values[:,170:] = person
    # Retain the already source-resolution-refined scalp/earring detail. Blend
    # inside the photographed collar, without a hard rectangular neck seam.
    detail=np.array(Image.open(ROOT/'private/head-model/presenter'/f'{index+1:06d}.png').getchannel('A'))
    values[115:355,555:840]=detail[115:355,385:670]
    mix=np.linspace(1,0,40)[:,None]
    values[355:395,555:840]=np.rint(detail[355:395,385:670]*mix+values[355:395,555:840]*(1-mix)).astype(np.uint8)
    red,green,blue = [raw[:,:,i].astype(float) for i in range(3)]
    chair = (chair_region>0)&(blue>red*1.12)&(blue>green*1.04)
    values[chair]=255
    # Every pixel deep inside this reviewed seated envelope is real body,
    # clothing, cushion or chair. A person-only mask must not hollow them out.
    # Its external boundary remains source-colour selected, not a large opaque
    # rectangle. No part of this fixed envelope reaches the moving shoulders.
    values[seated_core>0]=255
    values[garment_core>0]=255
    # The independent recurrent prior correctly retains this dark forearm,
    # which SAM's person semantics partially omit. Admit it only inside the
    # reviewed arm/seat ROI, ending before the old television bezel. In
    # particular, do not union the old right-side equipment/background mask.
    values[620:735,850:980]=np.maximum(values[620:735,850:980],detail[620:735,680:810])
    # Close only enclosed body/chair omissions, before adding the microphone.
    # The empty spaces between the real boom rails are never hole-filled.
    binary=(values>=128).astype(np.uint8)
    count,labels,stats,_=cv2.connectedComponentsWithStats(1-binary,8)
    for label in range(1,count):
        x,y,w,h,area=stats[label]
        if y>=395 and area>=32 and x>0 and y>0 and x+w<width and y+h<height:
            values[labels==label]=255
    # Exclude the television bezel: it is outside the real boom's diagonal
    # envelope. Keep the actual springs/rails; they must not terminate in air.
    hardware = (boom_region>0)&(raw.max(2)<137)&((raw.max(2).astype(float)-raw.min(2))<85)
    values[hardware]=255
    values=np.maximum.reduce([values,capsule,mount,cable])
    original=Image.fromarray(values)
    _,alpha=VfxFrameRenderer._prepare_foreground(None,Image.fromarray(raw),original,[{**effect,'decontaminate':0}],width,height)
    # Do not solve already image-refined head detail a second time with a
    # binary trimap: that reintroduced bright old-wall pixels at the earring.
    alpha_values=np.array(alpha)
    alpha_values[115:355,555:840]=detail[115:355,385:670]
    mix=np.linspace(1,0,40)[:,None]
    alpha_values[355:395,555:840]=np.rint(detail[355:395,385:670]*mix+alpha_values[355:395,555:840]*(1-mix)).astype(np.uint8)
    # The real left hoop is dark against the old beige wall. Its colour-derived
    # alpha clears the photographed wall inside the ring; tracked face features
    # move this small review region, not a rigid fabricated ear contour.
    roi=polygon([(588,308),(628,308),(628,354),(588,354)])
    roi=cv2.warpAffine(roi,transforms[index],(width,height),flags=cv2.INTER_LINEAR)
    region=roi>0
    rgbf=raw.astype(float)
    neutral=(rgbf[:,:,1]>.85*rgbf[:,:,0])&(rgbf[:,:,2]>.70*rgbf[:,:,0])
    luminance=(rgbf*np.array([.2126,.7152,.0722])).sum(2)
    sample=np.array([[[581.,330.]]],np.float32)
    sx,sy=np.rint(cv2.transform(sample,transforms[index])[0,0]).astype(int)
    backing=float(np.median(luminance[sy-10:sy+11,sx-3:sx+4]))
    color_alpha=np.clip((backing-luminance)/max(1,backing-105),0,1)
    alpha_values[region&neutral]=np.rint(color_alpha[region&neutral]*255).astype(np.uint8)
    alpha=Image.fromarray(alpha_values)
    clean,alpha=VfxFrameRenderer._prepare_foreground(None,Image.fromarray(raw),alpha,[{**effect,'edge_radius':0}],width,height)
    pixels=np.array(clean).astype(float)/255
    # Reduce photographed orange screen spill only on selected dark equipment.
    metal=hardware & (raw.max(2)<105)
    luma=(pixels*np.array([.2126,.7152,.0722])).sum(2,keepdims=True)
    pixels[metal]=luma[metal]
    pixels=np.clip((luma+(pixels-luma)*.9-.02)*1.02,0,1)
    rgba=np.dstack([np.rint(pixels*255).astype(np.uint8),np.array(alpha)])
    Image.fromarray(rgba).save(OUT/f'{index+1:06d}.png')
    if not all_frames or index in [0,12,16,24,36,48,60,71]:
        a=np.array(alpha).astype(float)/255
        review=pixels*a[:,:,None]+np.array([.15,.13,.15])*(1-a[:,:,None])
        Image.fromarray(np.rint(review*255).astype(np.uint8)).save(WORK/f'review-{index:03d}.png')
    records.append({'frame':index,'foregroundPixels':int((np.array(alpha)>127).sum()),
        'rgbaSha256':sha256(OUT/f'{index+1:06d}.png')})
    if not all_frames or (index+1)%12==0:print(json.dumps({'frames':index+1,'seconds':time.monotonic()-started}),flush=True)
(WORK/('matte-all.json' if all_frames else 'matte-samples.json')).write_text(json.dumps({
    'records':records,'elapsedSeconds':time.monotonic()-started,'sourceCrop':[0,40,1280,1000],
    'person':'Pinned existing SAM2 CPU streaming video segmenter, temporal memory retained',
    'equipment':'Private source-specific authored real capsule/mount/cable and dark boom selection',
    'chair':'Private source-specific blue chair selection', 'cleanup':effect,
    'inventedEquipment':False,'authenticatedNativeJob':False,'cloudJobs':0},indent=2)+'\n')
