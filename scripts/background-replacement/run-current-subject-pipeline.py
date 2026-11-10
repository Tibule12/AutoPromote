"""Private local review through the actual tracker, alpha adapter and compositor.

This creates honest local source-bound files, not an admitted/native model-job
result. It cannot qualify Studio ownership/recovery or creative readiness.
"""
import argparse,json,copy,time,os,shutil,socket,hashlib
from pathlib import Path
from PIL import Image
import numpy as np
import torch
from model_workers.common import sha,canonical
from model_workers.adapters.component_segmentation import segment as track
from model_workers.adapters.cpu_matting import refine
from python_media_worker.studio_subject_matte import CachedSubjectMatte,video_geometry
from python_media_worker.studio_vfx_plan import render_vfx
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--source',type=Path);p.add_argument('--selection',type=Path);p.add_argument('--scene',type=Path);p.add_argument('--device',choices=['cpu','cuda'],default='cuda');p.add_argument('--refresh-fixed',action='store_true');p.add_argument('--compose-only',action='store_true');p.add_argument('--preserve-authored-holdouts',action='store_true');p.add_argument('--reuse-tracking',type=Path);p.add_argument('--alpha-source-size',type=int,choices=[1024,1536],default=1024);a=p.parse_args();a.out.mkdir(exist_ok=a.compose_only);start=time.monotonic()
base=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/39e005f4354085956cb2bcc82468b18296955d32b26cf3958c53821cbc3f5526/2f43d6cc-1eda-4854-be75-66cceadd172a');preview=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/f2033724-fb92-44dd-b7ae-54114b51036f')
source=(a.source or preview/'source.mp4').resolve();geometry=video_geometry(source);count=geometry['frame_count'];assert 0<count<=120 and geometry['fps_fraction']=='24/1'
geometry['nb_read_frames']=count
if a.selection:params=json.load(open(a.selection))
else:
    components=json.load(open(base/'component_dependency/manifest.json'))['components'];primary=components[0]['selection'];params={'subjectId':primary['id'],'initialBox':primary['box'],'points':copy.deepcopy(primary['points']),'shotPrompts':copy.deepcopy(primary.get('shotPrompts',[])),'components':[copy.deepcopy(c['selection']) for c in components[1:]]}
    # Correct bad authored opaque examples on visibly blurred fingertips.
    # Actual pure-palm and body examples remain; negative gap clicks remain.
    h,w=geometry['height'],geometry['width']
    for subject in [params,*params['components']]:
        for correction in subject.get('shotPrompts',[]):
            if correction['frameIndex']==23:correction['points']=[q for q in correction['points'] if not(q['label']==1 and any(abs(q['position'][0]*w-x)<3 and abs(q['position'][1]*h-y)<3 for x,y in [(343,380),(385,395)]))]
authored_refinement=params.get('refinement',{})
params['refinement']={'radius':15,'holdouts':[],
    'colourComponentIds':copy.deepcopy(authored_refinement['colourComponentIds'])
        if 'colourComponentIds' in authored_refinement else
        [c['id'] for c in params['components'] if not c.get('propagate',True)]}
(a.out/'actual-selection.json').write_text(json.dumps(params,indent=2)+'\n')
registry=json.load(open('config/model-runtime/registry.v1.json'));segmodel=next(m for m in registry['models'] if m['id']=='sam21-multiobject-cpu-v2');alphamodel=next(m for m in registry['models'] if m['id']=='vitmatte-small-temporal-cpu-v2');source_hash=sha(source);scope={'ownerUid':'PRIVATE_REVIEW_ONLY','projectId':'PRIVATE_REVIEW_ONLY','sourceAssetId':'PRIVATE_REVIEW_ONLY','sourceSha256':source_hash,'sourceRange':{'startTick':0,'endTick':count*3750},'provenance':{'sourceGeneration':source_hash},'privateReviewOnly':True};scope['artifactHash']=hashlib.sha256(canonical(scope).encode()).hexdigest()
alphamodel=copy.deepcopy(alphamodel);alphamodel['limits']['alphaInferenceMaxSide']=a.alpha_source_size
request={'projectId':scope['projectId'],'sourceAssetId':scope['sourceAssetId'],'sourceSha256':source_hash,'sourceRange':scope['sourceRange'],'parameters':params}
spec={'ownerUid':scope['ownerUid'],'source':{'generation':source_hash},'request':request,'model':segmodel}
socket.socket.connect=lambda *args,**kwargs:(_ for _ in ()).throw(RuntimeError('Private inference networking disabled'))
sam=a.out/'segmentation';work=a.out/'alpha-work';outputs=work/'outputs'
if not a.compose_only:
    sam.mkdir()
    if a.reuse_tracking:
        from model_workers.adapters.component_segmentation import component_selections
        previous=CachedSubjectMatte(a.reuse_tracking/'subject_masks',source)
        if previous.manifest['components']!=component_selections(params):raise ValueError('Reused tracking selections differ')
        if previous.manifest.get('fixed_roi_current_frame_evaluation')!=a.refresh_fixed:raise ValueError('Reused fixed ROI policy differs')
        shutil.copytree(a.reuse_tracking/'subject_masks',sam/'subject_masks',copy_function=os.link)
        os.link(a.reuse_tracking/'component_masks.tar.gz',sam/'component_masks.tar.gz')
        print('REUSING_VERIFIED_SOURCE_BOUND_TRACKING',count,str(a.reuse_tracking),flush=True)
    else:
        print('ACTUAL_CURRENT_PIPELINE_TRACKING',count,a.device,a.refresh_fixed,flush=True);track(spec,source,geometry,Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned'),sam,device=a.device,refresh_fixed=a.refresh_fixed)
    cache=CachedSubjectMatte(sam/'subject_masks',source);work.mkdir();outputs.mkdir();bundle=sam/'component_masks.tar.gz';os.link(bundle,work/'component_dependency.tar.gz')
    alpha_spec={**spec,'model':alphamodel,'componentDependency':{'artifact':scope,'file':{'bytes':bundle.stat().st_size,'sha256':sha(bundle)}}}
# Bundled component bytes are retained; avoid a redundant extracted tree while
# the adapter independently verifies and materializes that exact archive.
    if (sam/'component_masks').is_dir():shutil.rmtree(sam/'component_masks')
    torch.cuda.empty_cache() if a.device=='cuda' else None
    print('ACTUAL_CURRENT_PIPELINE_ALPHA',count,flush=True);refine(alpha_spec,source,geometry,Path('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned'),outputs,cache,scope,device=a.device)
cache=CachedSubjectMatte(outputs/'subject_masks',source)
saved=json.load(open(preview/'spec.json'))['spec'];scene=json.load(open(a.scene)) if a.scene else copy.deepcopy(saved['scene']);effects=copy.deepcopy(scene['effects'])
for e in effects:e['start']=0;e['end']=count/24
def small_holdout(e):
    points=e.get('corners',[])
    return points and max(q[0] for q in points)-min(q[0] for q in points)<.03 and max(q[1] for q in points)-min(q[1] for q in points)<.03
effects=[e for e in effects if e['type']!='foreground_holdout' or a.preserve_authored_holdouts or small_holdout(e)]
assets={v['assetId']:preview/f'replacement-{i}.asset' for i,v in enumerate(saved['replacementAssets'])}
plan={'version':1,'source_sha256':source_hash,'matte_sha256':cache.artifact_sha256,'effects':effects};(a.out/'actual-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
print('ACTUAL_CURRENT_PIPELINE_COMPOSITE',flush=True);render_vfx(source,outputs/'subject_masks',plan,a.out/'replacement.mp4',encoder='cpu',asset_resolver=assets.__getitem__,audio_source=preview/'original.mp4' if not a.source else None)
receipt={'frames':count,'source':str(source),'sourceSha256':source_hash,'device':a.device,'gpu':torch.cuda.get_device_name() if a.device=='cuda' else None,'currentRgbEveryFrame':True,'refreshFixedRois':a.refresh_fixed,'usesActualRegisteredAdapterFunctions':True,'admittedNativeModelJob':False,'nativeStudioQualification':False,'visualPass':False,'fourMinuteProof':False,'elapsedSeconds':time.monotonic()-start,'paidCloud':False}
(a.out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print('ACTUAL_CURRENT_PIPELINE_FINISHED',json.dumps(receipt),flush=True)
