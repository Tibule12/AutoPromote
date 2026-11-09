"""Fresh existing SAM2 + actual current alpha adapter on local CUDA.

All model frames are real source frames and all fixed objects examine current
RGB. The local file loader below is explicit diagnostic plumbing, not a signed
artifact, authorization check, model-router admission or native Studio flow.
No historical component masks are substituted for this run's neural outputs.
"""
from pathlib import Path
import argparse
import copy
import gc
import hashlib
import json
import time
from types import SimpleNamespace
from unittest.mock import patch


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--name',default='fresh-local-pipeline-r357-20261107')
    parser.add_argument('--bounded-attention',action='store_true')
    parser.add_argument('--parameters',type=Path,
        help='Explicit reviewed source-click parameters for this private run')
    args=parser.parse_args()
    if '/'in args.name or '..'in args.name:raise ValueError('Private run name differs')
    private=Path('reports/background-replacement-20261101/private')
    out=private/args.name;out.mkdir(mode=0o700,exist_ok=False)
    (out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    runtime=private/'local-gpu-runtime-r356-20261107/receipt.json'
    deadline=time.monotonic()+900
    while True:
        try:ready=json.loads(runtime.read_text()).get('complete',False)
        except (OSError,json.JSONDecodeError):ready=False
        if ready:break
        if time.monotonic()>deadline:raise RuntimeError('Pinned local CUDA runtime did not complete')
        time.sleep(3)
    import cv2
    import numpy as np
    from PIL import Image
    import torch
    from model_workers.common import sha,write_json
    from model_workers.adapters import component_segmentation as component
    from model_workers.adapters import source_edge_alpha as edge
    from model_workers.adapters.cpu_matting import refine
    from recovered_motion_inputs import RECOVERED
    torch.backends.cuda.enable_flash_sdp(False)
    torch.backends.cuda.enable_mem_efficient_sdp(False)
    torch.backends.cuda.enable_math_sdp(True)
    assert torch.__version__=='2.5.1+cu118' and torch.cuda.get_device_capability()==(5,0)
    check=torch.arange(256,device='cuda',dtype=torch.float32).reshape(16,16)
    assert (check@check).is_cuda;torch.cuda.synchronize()
    write_json(out/'gpu-health.json',{'torch':torch.__version__,'cuda':torch.version.cuda,
        'gpu':torch.cuda.get_device_name(),'actualMatrixMultiplicationOnCuda':True,
        'runtimeInRam':True,'paidCloudInference':False})
    work=Path('/dev/shm')/('autopromote-'+args.name);work.mkdir(mode=0o700,exist_ok=False)
    segmentation=work/'segmentation';segmentation.mkdir()
    old=private/'native-source-click-footprint-r312-20261107'
    source=old/'retained-native-model-artifact/normalized_source.mp4'
    parent=json.loads(Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107/manifest.json').read_text())
    assert sha(source)==parent['source_sha256']
    registry=json.loads(Path('config/model-runtime/registry.v1.json').read_text())
    sam=next(m for m in registry['models']if m['id']=='sam21-multiobject-cpu-v2')
    vit=next(m for m in registry['models']if m['id']=='vitmatte-small-temporal-cpu-v2')
    corrected=json.loads((private/'occluded-clothing-track-r352-20261107/input.json').read_text())['parameters']
    params={**copy.deepcopy(corrected),'components':copy.deepcopy(parent['components'][1:])}
    if args.parameters:
        params=json.loads(args.parameters.read_text())
        component.component_selections(params)
    request={'parameters':params,'sourceSha256':parent['original_source_sha256'],'sourceRange':parent['sourceRange']}
    spec={'model':sam,'request':request}
    write_json(out/'input.json',{'request':request,'normalizedSourceSha256':sha(source),
        'actualFreshComponentInference':True,'historicalComponentMasksUsed':False,
        'localCudaOverrideOfCpuQualificationEntry':True,'nativeArtifactAdmission':False,
        'samWeightFiles':sam['weights'],'alphaModelVersion':vit['modelVersion'],
        'alphaWeightFiles':vit['weights'],'paidCloudInference':False,'providerUpload':False})
    original_tracker=component.ComponentVideoTracker
    class OffloadedReviewTracker(original_tracker):
        def __init__(self,*args,**kwargs):super().__init__(*args,**kwargs,offload_state=True)
    started=time.monotonic()
    if args.bounded_attention:
        from bounded_attention import bounded_attention
        # The model invokes this in the same owned inference process. Keep
        # causal/training calls untouched and record every distinct real shape.
        shapes={}
        def report_shape(row):
            key=json.dumps(row,sort_keys=True)
            if key not in shapes:
                shapes[key]=row;write_json(out/'bounded-attention-shapes.json',list(shapes.values()))
        attention_context=bounded_attention(128,record=report_shape,verify_actual=True)
        attention_context.__enter__()
    component.ComponentVideoTracker=OffloadedReviewTracker
    try:
        component.segment(spec,source,{'width':1430,'height':1000,'nb_read_frames':48},
            Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned'),segmentation,
            device='cuda',refresh_fixed=True)
    finally:component.ComponentVideoTracker=original_tracker
    print(json.dumps({'event':'fresh_all_components_complete','seconds':time.monotonic()-started}),flush=True)
    gc.collect();torch.cuda.empty_cache()
    guide_dir=segmentation/'component_masks';guide=json.loads((guide_dir/'manifest.json').read_text())
    assert guide['frame_count']==48 and guide['source_sha256']==sha(source)
    for c in guide['components']:
        for i,row in enumerate(c['frames']):
            assert row['index']==i and sha(guide_dir/row['file'])==row['sha256']
    guide['_reference_rgb']=np.array(Image.open(RECOVERED/'rgb/rgb_0000.png'))
    manifest=json.loads((segmentation/'subject_masks/manifest.json').read_text())
    cache=SimpleNamespace(manifest=manifest,frame=lambda i:np.array(Image.open(segmentation/f'subject_masks/matte_{i:04d}.png')))
    alpha=work/'alpha';alpha.mkdir()
    ids=[c['id']for c in parent['components'][1:]if not c.get('propagate',True)]
    params['refinement']={'radius':15,'holdouts':[],'colourComponentIds':ids}
    spec={'model':vit,'request':{**request,'parameters':params}}
    # Local outputs have just been verified above. There is no signed artifact
    # here, so do not forge owner IDs, generations or an admission receipt.
    with patch.object(edge,'load_guidance',lambda *unused:(guide_dir,guide)):
        refine(spec,source,{'width':1430,'height':1000,'nb_read_frames':48},
            Path('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned'),
            alpha,cache,{'artifactHash':'explicit-private-unadmitted-neural-source'},device='cuda')
    for stage,directory,names in [('segmentation',segmentation,['subject_masks_manifest.json','component_masks_manifest.json','subject_masks.tar.gz','component_masks.tar.gz']),
            ('alpha',alpha,['subject_masks_manifest.json','subject_masks.tar.gz','temporal_diagnostics.json'])]:
        target=out/stage;target.mkdir()
        for name in names:
            import shutil
            shutil.copyfile(directory/name,target/name)
    write_json(out/'receipt.json',{'complete':True,'seconds':time.monotonic()-started,
        'actualSourceFrames':48,'actualFreshSamComponents':len(params['components'])+1,
        'historicalComponentMasksUsed':False,'alphaModelVersion':vit['modelVersion'],
        'allFixedObjectsExamineCurrentRgb':True,'nativeArtifactAdmission':False,
        'nativeBrowserSaveReopenExport':False,'fourMinuteProof':False,'visualReviewPending':True,
        'gpuPeakAllocatedBytes':torch.cuda.max_memory_allocated(),'runtimeDirectory':str(work),
        'paidCloudInference':False,'providerUpload':False})
    print('FRESH_ACTUAL_LOCAL_PIPELINE_COMPLETE',flush=True)


if __name__=='__main__':main()
