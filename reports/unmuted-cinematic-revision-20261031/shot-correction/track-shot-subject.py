"""Run the existing pinned CPU video segmenter on this source shot only.

Private pixel experiment, without application authentication, dispatch or cloud I/O.
The photographed person is tracked through temporal memory, not a fixed silhouette.
"""
from pathlib import Path
import json, os, subprocess, sys, time

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
sys.path.insert(0, '/home/tibule12/.cache/autopromote-model-runtime/sam-cpu-eval-deps')
sys.path.insert(0, str(REPO))
os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1',
    HF_HUB_DISABLE_TELEMETRY='1', CUDA_VISIBLE_DEVICES='', OMP_NUM_THREADS='4',
    OPENBLAS_NUM_THREADS='1')
from model_workers.adapters.cpu_segmentation import segment
from model_workers.common import probe, sha

MODEL = Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned')
WORK = ROOT / 'private/temporal-subject'
WORK.mkdir(exist_ok=True)
all_frames = '--all' in sys.argv
output = WORK / ('full' if all_frames else 'sample')
output.mkdir()
source = ROOT / 'private/native-composite-cleanup/source.mkv'
if not all_frames:
    sample = output / 'source.mkv'
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(source), '-frames:v', '1',
        '-an', '-c:v', 'ffv1', str(sample)], check=True)
    source = sample
def point(x, y, label=1):
    return {'position': [x / 1110, y / 1000], 'label': label}
spec = {
    'model': {'checkpoint': 'facebook/sam2.1-hiera-small',
        'revision': 'ee5bba1d82bb8749febdf90f45e84b687142ba03',
        'weights': [{'path': 'model.safetensors', 'sha256':
            '0a4067b11ce1e23d5229203f11c718a823060d15a4b23fa2372a7d4b77cbbc60'}]},
    'request': {'sourceSha256': '7a16b8ba2eba836eac74bcfb1f830313907ac0e19f314e636d4b7f833643578c',
        'sourceRange': {'space': 'source', 'startTick': 539 * 3750,
            'endTick': (611 if all_frames else 540) * 3750},
        'parameters': {'subjectId': 'recorded-person',
            'initialBox': [190/1110, 150/1000, 850/1110, 1],
            'points': [point(520,250), point(450,520), point(610,690),
                point(400,900), point(100,780,0), point(900,450,0),
                point(700,260,0), point(350,300,0)],
            'shotPrompts': [], 'components': []}}}
(output / 'request.json').write_text(json.dumps(spec, indent=2) + '\n')
started = time.monotonic()
result = segment(spec, source, probe(source), MODEL, output)
(output / 'receipt.json').write_text(json.dumps({'result': result,
    'elapsedSeconds': time.monotonic() - started, 'localWorkerDirectCall': True,
    'authenticatedNativeJob': False, 'cloudJobs': 0}, indent=2) + '\n')
print(json.dumps({'seconds': time.monotonic()-started, 'output': str(output)}), flush=True)
