"""One-frame local selection of the real equipment and its plant occluders."""
from pathlib import Path
import json,os,sys,time
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,'/home/tibule12/.cache/autopromote-model-runtime/sam-cpu-eval-deps')
sys.path.insert(0,str(ROOT.parents[2]))
os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',
    CUDA_VISIBLE_DEVICES='',OMP_NUM_THREADS='4',OPENBLAS_NUM_THREADS='1')
from model_workers.adapters.cpu_segmentation import segment
from model_workers.common import probe
WORK=ROOT/'private/source-matched-20261101'
OUT=WORK/'props-verified-points';OUT.mkdir()
def point(x,y,label=1):return {'position':[x/1430,y/1000],'label':label}
def box(x0,y0,x1,y1):return [x0/1430,y0/1000,x1/1430,y1/1000]
spec={'model':{'checkpoint':'facebook/sam2.1-hiera-small','revision':'ee5bba1d82bb8749febdf90f45e84b687142ba03',
    'weights':[{'path':'model.safetensors','sha256':'0a4067b11ce1e23d5229203f11c718a823060d15a4b23fa2372a7d4b77cbbc60'}]},
    'request':{'sourceSha256':'7a16b8ba2eba836eac74bcfb1f830313907ac0e19f314e636d4b7f833643578c',
        'sourceRange':{'space':'source','startTick':539*3750,'endTick':540*3750},
        'parameters':{'subjectId':'brown-arrangement','initialBox':box(900,465,1380,1000),
            'points':[point(1150,830),point(1240,740),point(1200,484),point(1120,560,0),point(1360,440,0),point(930,690,0)],
            'shotPrompts':[], 'components':[
                {'id':'real-left-microphone','box':box(450,425,1080,1000),
                    'points':[point(530,520),point(830,602),point(1013,750),point(1040,650),point(925,680,0),point(780,680,0)]},
                {'id':'real-right-microphone','box':box(1240,540,1430,1000),
                    'points':[point(1295,780),point(1400,568),point(1400,580,0),point(1420,620,0)]},
                {'id':'real-green-plant','box':box(650,850,1120,1000),
                    'points':[point(820,920),point(1015,915),point(600,930,0)]}
            ]}}}
(OUT/'request.json').write_text(json.dumps(spec,indent=2)+'\n')
t=time.monotonic()
result=segment(spec,WORK/'selection.mkv',probe(WORK/'selection.mkv'),
    Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned'),OUT)
(OUT/'receipt.json').write_text(json.dumps({'result':result,'seconds':time.monotonic()-t,
    'oneFrameSelectionOnly':True,'authenticatedStudioJob':False,'cloudJobs':0},indent=2)+'\n')
print('Source equipment/occluder selection complete',time.monotonic()-t,flush=True)
