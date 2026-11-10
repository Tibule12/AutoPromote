"""Private, resumable four-minute review through the existing model adapters.

Source RGB and SAM inference run at 24 Hz. Tracker memory survives bounded
matting chunks and resets only at camera cuts or the explicit corrective shot.
This is local review orchestration, never a forged admitted Studio model job.
Only derived chunk scratch is discarded, after lossless mask-video verification.
"""
import argparse
from contextlib import nullcontext
import copy
import gc
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import time

import cv2
import numpy as np
from PIL import Image
import torch
import onnxruntime as ort

from model_workers.adapters.component_segmentation import ComponentVideoTracker
from model_workers.adapters.cpu_matting import refine
from model_workers.adapters.segmentation import sha_json
from model_workers.common import bundle_masks, canonical, sha, write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte, mask_geometry
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


PRIVATE = Path('reports/background-replacement-20261101/private')
SAM_DIR = Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned')
ALPHA_DIR = Path('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned')
FACE_MODEL = '/home/tibule12/Projects/AutoPromte/AutoPromote/python_media_worker/models/yunet/face_detection_yunet_2023mar.onnx'
FPS = 24
TOTAL = 5760


def run(command, **kwargs):
    return subprocess.run(command, check=True, **kwargs)


def writer(path, width, height, *, mask=False):
    # RGB lossless encoding also preserves all 256 mask codes exactly. Verify
    # decoded bytes before removing redundant PNG staging, rather than trusting
    # a codec name or gray/video-range conversion.
    options = (['-c:v', 'libx264rgb', '-qp', '0', '-preset', 'veryfast'] if mask
               else ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p'])
    return subprocess.Popen([
        'ffmpeg', '-nostdin', '-v', 'error', '-threads', '1', '-f', 'rawvideo',
        '-pix_fmt', 'rgb24', '-s', f'{width}x{height}', '-r', str(FPS), '-i', 'pipe:0',
        '-an', *options, '-threads', '2', str(path)], stdin=subprocess.PIPE)


def finish(process):
    process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError('Local video encoder failed')


def archive_masks(directory, rows, output, width, height, *, binary=False):
    process = writer(output, width, height, mask=True)
    expected = hashlib.sha256()
    try:
        for row in rows:
            values = np.asarray(Image.open(directory / row['file']).convert('L'))
            if binary:
                values = (values >= 128).astype(np.uint8) * 255
            expected.update(values.tobytes())
            process.stdin.write(np.repeat(values[:, :, None], 3, axis=2).tobytes())
        finish(process)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
    decoder = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '1',
        '-i', str(output), '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE)
    actual = hashlib.sha256()
    try:
        for _ in rows:
            data = decoder.stdout.read(width * height * 3)
            if len(data) != width * height * 3:
                raise RuntimeError('Lossless mask archive ended early')
            pixels = np.frombuffer(data, np.uint8).reshape(height, width, 3)
            if not (np.array_equal(pixels[:, :, 0], pixels[:, :, 1]) and
                    np.array_equal(pixels[:, :, 0], pixels[:, :, 2])):
                raise RuntimeError('Mask archive channel values changed')
            actual.update(pixels[:, :, 0].tobytes())
        if decoder.stdout.read(1) or decoder.wait() != 0 or actual.digest() != expected.digest():
            raise RuntimeError('Lossless mask archive verification failed')
    finally:
        if decoder.poll() is None:
            decoder.kill()
            decoder.wait()
    return {'file': output.name, 'sha256': sha(output), 'decodedGraySha256': actual.hexdigest(),
            'frames': len(rows), 'width': width, 'height': height, 'allDecodedBytesVerified': True,
            'semantics': 'Binary selection at SAM evidence >=128; raw logit planes are staging only.' if binary
                else 'All 256 alpha code values preserved exactly.'}


def subject_points(rgb, angle, face_detector):
    h, w = rgb.shape[:2]
    face_detector.setInputSize((w, h))
    _, faces = face_detector.detect(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    if faces is None:
        raise ValueError('Current source needs a reviewed face anchor; refusing a guessed person seed')
    fx, fy, fw, fh = max(faces, key=lambda item: item[2] * item[3])[:4]
    # Existing reviewed clothing/leg anchors, with separate current face.
    clothing = ([[.20, .60], [.38, .80], [.25, .93]] if angle == 0 else
                [[.80, .60], [.88, .75], [.60, .96], [.35, .85], [.35, .95], [.40, .82]])
    return [{'position': [float((fx + fw * .5) / w), float((fy + fh * .55) / h)], 'label': 1},
            *[{'position': point, 'label': 1} for point in clothing],
            {'position': [.90 if angle == 0 else .05, .3], 'label': 0}]


def current_native_person_input(scene, rgb, source_frame, face_points):
    """Carry native authoring into its own photograph; qualify later clicks.

    A camera return may have another pose. Existing point coordinates are
    retained only on agreeing current source patches; the detected current
    face is always the anchor. No body silhouette or alpha is held.
    """
    primary = copy.deepcopy(scene['primarySelection'])
    if source_frame == scene['primaryReferenceFrame']:
        return primary
    reference = np.asarray(Image.open(scene['primaryReferenceRgb']).convert('RGB'))
    if reference.shape != rgb.shape:
        raise ValueError('Native person reference geometry changed')
    h, w = rgb.shape[:2]
    kept = []
    for point in primary['points']:
        x, y = min(w-1,round(point['position'][0]*w)), min(h-1,round(point['position'][1]*h))
        sl = np.s_[max(0,y-1):min(h,y+2), max(0,x-1):min(w,x+2)]
        difference = np.abs(rgb[sl].astype(np.int16)-reference[sl].astype(np.int16))
        if difference.max() <= 24 and np.median(difference) <= 12:
            kept.append(point)
    primary['points'] = [copy.deepcopy(face_points[0]), *kept][:16]
    primary['shotPrompts'] = []
    return primary


def rebase_native_chunk_parameters(params, first, data_first, data_end, current_face):
    """Keep first-photograph clicks, and rebase actual later corrections."""
    result = copy.deepcopy(params)
    if data_first != first:
        # Original garment/hand coordinates are not new clicks on a later
        # bounded alpha window. Its measured current face is the new anchor.
        result['points'] = copy.deepcopy(current_face[:1])
    for selection in [result, *result['components']]:
        selection['shotPrompts'] = [{**p, 'frameIndex': first+p['frameIndex']-data_first}
            for p in selection.get('shotPrompts', [])
            if data_first <= first+p['frameIndex'] < data_end]
    return result


def classify_person_support(rgb, sam, recurrent):
    """Private source-RGB classification of the reproduced striped-body holes.

    All seeds come from the current independent models. No static clothing
    polygon, remembered first pose or source-colour rectangle is inserted.
    The result is segmentation evidence, never final calibrated opacity.
    """
    support = np.maximum(sam, recurrent)
    probable = support >= 64
    labels = np.full(sam.shape, cv2.GC_PR_BGD, np.uint8)
    labels[probable] = cv2.GC_PR_FGD
    labels[cv2.dilate(probable.astype(np.uint8), np.ones((15,15),np.uint8)) == 0] = cv2.GC_BGD
    labels[cv2.erode((recurrent >= 248).astype(np.uint8), np.ones((9,9),np.uint8)) > 0] = cv2.GC_FGD
    if not np.any(labels == cv2.GC_FGD) or not np.any(labels == cv2.GC_BGD):
        raise ValueError('Current person classification lacks reliable foreground/background evidence')
    cv2.setRNGSeed(0)
    cv2.grabCut(rgb, labels, None, np.zeros((1,65)), np.zeros((1,65)), 5, cv2.GC_INIT_WITH_MASK)
    selected = np.isin(labels, [cv2.GC_FGD, cv2.GC_PR_FGD]).astype(np.uint8) * 255
    return np.maximum(support, selected)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('out', type=Path)
    parser.add_argument('--scratch', required=True, type=Path)
    parser.add_argument('--chunk-frames', default=48, type=int, choices=[24, 48])
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--recurrent-person-guidance', action='store_true')
    parser.add_argument('--classify-striped-person', action='store_true')
    parser.add_argument('--reviewed-equipment-selections', action='store_true')
    parser.add_argument('--reviewed-scene-cleanup', action='store_true')
    parser.add_argument('--review-first-frames', type=int, choices=[1, 12, 24, 48])
    parser.add_argument('--shot-corrections', type=Path)
    parser.add_argument('--current-source-scenes', type=Path,
        help='Verified current native scene inputs mapped to this original source')
    parser.add_argument('--gesture-corrections', type=Path,
        help='Reviewed source-coordinate gesture selections for the same master')
    parser.add_argument('--archive-soft-guidance', action='store_true')
    parser.add_argument('--sam-large-evaluation', action='store_true')
    parser.add_argument('--source-reference-tracker', choices=['sam21','edgetam','hybrid'], default='sam21',
        help='Private local evaluation: hybrid keeps SAM equipment tracking and uses EdgeTAM only for moving subjects')
    parser.add_argument('--composite-workers', type=int, choices=[1,2], default=1,
        help='Bounded local CPU composition; canonical pixel operations stay unchanged')
    parser.add_argument('--stateless-equipment', action='store_true',
        help='Private evaluation of the existing current-image mode for fixed equipment; moving tracks keep temporal memory')
    parser.add_argument('--bounded-attention', action='store_true',
        help='Use verified full-key query chunking on the local GPU')
    parser.add_argument('--attention-query-rows', type=int, choices=[32,64,128], default=128,
        help='Original float32 math query block size; full key context and verification bounds stay unchanged')
    parser.add_argument('--attention-fallback-rows', type=int, choices=[32],
        help='Verify every attention call and retry with32 rows if the unchanged actual numerical guard fails')
    parser.add_argument('--efficient-attention', action='store_true',
        help='Private float32 CUDA kernel; verify actual queries against math')
    parser.add_argument('--registered-alpha-limits', action='store_true',
        help='Retain the current registered alpha inference size')
    args = parser.parse_args()
    if args.attention_fallback_rows is not None and (not args.bounded_attention or
            args.attention_fallback_rows>=args.attention_query_rows):
        parser.error('Numerical fallback requires bounded attention with a larger initial query block')
    if args.bounded_attention and args.efficient_attention:
        parser.error('Choose one explicit attention implementation')
    attention = nullcontext()
    if args.efficient_attention:
        from efficient_attention import verified_efficient_attention
        shapes = {}
        def record_efficient_shape(row):
            shapes[json.dumps([row['queryShape'], row['keyShape']])] = row
            write_json(args.out / 'efficient-attention-shapes.json', list(shapes.values()))
        attention = verified_efficient_attention(record=record_efficient_shape)
    if args.bounded_attention:
        from bounded_attention import bounded_attention
        shapes = {}
        def record_shape(row):
            key = json.dumps(row, sort_keys=True)
            if key not in shapes:
                shapes[key] = row
                write_json(args.out / 'bounded-attention-shapes.json', list(shapes.values()))
        attention = bounded_attention(args.attention_query_rows, record=record_shape, verify_actual=True,
                                      fallback_query_rows=args.attention_fallback_rows)
    with attention:
        process(args)


def process(args):
    if args.source_reference_tracker != 'sam21' and (
            args.sam_large_evaluation or args.recurrent_person_guidance or
            not args.registered_alpha_limits):
        raise ValueError('Source-reference tracking requires the existing registered-size local pipeline')
    if args.classify_striped_person and not args.recurrent_person_guidance:
        raise ValueError('Current-source person classification requires independent recurrent guidance')
    def stop(_signal, _frame):
        raise KeyboardInterrupt('Owned local review interrupted; prior evidence is retained')
    signal.signal(signal.SIGTERM, stop)
    args.out.mkdir(exist_ok=args.resume)
    args.scratch.mkdir(exist_ok=args.resume)
    if any(args.scratch.iterdir()):
        raise ValueError('Preserve prior interrupted scratch; choose a fresh scratch directory')
    cv2.setNumThreads(2)
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    if not torch.cuda.is_available():
        raise RuntimeError('The verified local CUDA runtime is required')
    if args.bounded_attention:
        torch.backends.cuda.enable_flash_sdp(False)
        torch.backends.cuda.enable_mem_efficient_sdp(False)
        torch.backends.cuda.enable_math_sdp(True)
    # Cached pinned models only: never fetch weights or contact a provider.
    socket.socket.connect = lambda *a, **k: (_ for _ in ()).throw(RuntimeError('Review inference networking disabled'))
    registry = json.loads(Path('config/model-runtime/registry.v1.json').read_text())
    sam_model = copy.deepcopy(next(m for m in registry['models'] if m['id'] == 'sam21-multiobject-cpu-v2'))
    sam_dir=SAM_DIR
    if args.sam_large_evaluation:
        sam_dir=Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-large-private-eval-20261106')
        provenance=json.loads((sam_dir/'provenance.json').read_text())
        if provenance['repo']!='facebook/sam2.1-hiera-large' or provenance['revision']!='665f8e2ad61cf5f53d65644ff27c8ee525124610' or provenance['license']!='Apache-2.0':
            raise ValueError('Unqualified local segmentation model identity')
        for item in provenance['files']:
            if sha(sam_dir/item['path'])!=item['sha256']:
                raise ValueError('Pinned local evaluation model bytes changed')
        weight=next(item for item in provenance['files']if item['path']=='model.safetensors')
        if weight['sha256']!='dc407dce21301fd94abb395c5099b4f2c455fdc8a8f261ac3d0ea6d4cd197230':
            raise ValueError('Segmentation evaluation checkpoint differs')
        sam_model.update({'id':'private-sam21-large-evaluation','checkpoint':provenance['repo'],
            'revision':provenance['revision'],'modelVersion':'private-publisher-665f8e2',
            'weights':[{'path':weight['path'],'size':weight['bytes'],'sha256':weight['sha256']}]})
    alpha_model = copy.deepcopy(next(m for m in registry['models'] if m['id'] == 'vitmatte-small-temporal-cpu-v2'))
    # This review driver already requires the guarded local CUDA runtime.
    # Use its declared profile, including bounded CPU source-frame work,
    # rather than silently borrowing the default CPU profile's execution flags.
    local_registry = json.loads(Path('config/model-runtime/local-cuda-evaluation.v1.json').read_text())
    local_alpha = next(m for m in local_registry['models']
                       if m['id'] == 'vitmatte-small-temporal-local-cuda-v2')
    for key in ['checkpoint', 'revision', 'modelVersion', 'weights']:
        if local_alpha[key] != alpha_model[key]:
            raise ValueError('Local alpha profile differs from the pinned current pipeline')
    alpha_model = copy.deepcopy(local_alpha)
    source_reference_profile = None
    source_reference_model = None
    source_current_model = None
    source_moving_model = None
    if args.source_reference_tracker in ('edgetam','hybrid'):
        from transformers import EdgeTamVideoConfig, EdgeTamVideoModel, Sam2VideoModel
        from safetensors.torch import load_file
        folder = Path('/home/tibule12/.cache/autopromote-model-runtime/edgetam-publisher-private-eval-20261109/hf-converted')
        weight_hash = '8858f8e4757b0b96dab8763f296ecffd845efbbbf698f64163cfa20a63d5fff4'
        if (sha(folder/'model.safetensors') != weight_hash or
                sha(folder/'config.json') != '5d3dd467475f78c9f4f2cdc940a98370aaa151cee97a5d11676fb2bbe5f81af0'):
            raise ValueError('Pinned local source-reference tracker changed')
        for weight in sam_model['weights']:
            if sha(sam_dir/weight['path']) != weight['sha256']:
                raise ValueError('Fixed reference weights changed')
        left=json.loads((sam_dir/'preprocessor_config.json').read_text())
        right=json.loads((folder/'preprocessor_config.json').read_text())
        if any(left[key] != right[key] for key in ['image_mean','image_std','rescale_factor']):
            raise ValueError('Current and fixed reference source preprocessing differs')
        source_reference_model=Sam2VideoModel.from_pretrained(sam_dir,local_files_only=True).to('cuda',dtype=torch.float32).eval()
        source_current_model=EdgeTamVideoModel(EdgeTamVideoConfig.from_json_file(folder/'config.json'))
        source_current_model.load_state_dict(load_file(folder/'model.safetensors'),strict=True)
        source_current_model=source_current_model.to('cuda',dtype=torch.float32).eval()
        source_reference_profile={'currentCheckpoint':'facebook/EdgeTAM',
            'currentRevision':'14d7ecc48c656b94e5184519f698cd5386c5a2bf',
            'currentWeightSha256':weight_hash,'currentLicense':'Apache-2.0',
            'fixedReferenceCheckpoint':sam_model['checkpoint'],
            'fixedReferenceRevision':sam_model['revision'],
            'fixedReferenceWeights':copy.deepcopy(sam_model['weights']),
            'fixedReferenceLicense':sam_model['license'],
            'fixedReferenceSourceFrame':'First actual exposure at each camera/reseed interval',
            'referenceAndCurrentSessionsIsolated':True,
            'currentTemporalModelWarmedOnSameFirstExposure':True,
            'movingPersonAlwaysCurrent':True,'nativeAdmission':False}
        source_reference_profile['referenceGuidanceRetention'] = {
            'strongReferenceCodeAtLeast':128,'maximumCurrentSourceChannelDifference':24,
            'maximum3x3MeanChannelDifference':12,
            'currentAndReferenceMovingEnvelopesExcluded':True,
            'heldAlphaOrSourceRgb':False}
        sam_model.update(id='private-edgetam-with-sam-fixed-reference',checkpoint='facebook/EdgeTAM',
            revision=source_reference_profile['currentRevision'],modelFamily='EdgeTAM+SAM2-source-reference',
            modelVersion='private-source-reference-evaluation-v2',
            weights=[{'path':'model.safetensors','sha256':weight_hash,
                      'size':(folder/'model.safetensors').stat().st_size}])
        sam_dir=folder
        if args.source_reference_tracker == 'hybrid':
            source_moving_model=source_current_model
            source_current_model=source_reference_model
            source_reference_model=None
            sam_model=copy.deepcopy(next(m for m in registry['models'] if m['id']=='sam21-multiobject-cpu-v2'))
            sam_dir=SAM_DIR
            source_reference_profile={
                'mode':'SAM2 fixed equipment + EdgeTAM moving subjects',
                'fixedCheckpoint':sam_model['checkpoint'],'fixedRevision':sam_model['revision'],
                'fixedWeights':copy.deepcopy(sam_model['weights']),
                'movingCheckpoint':'facebook/EdgeTAM',
                'movingRevision':'14d7ecc48c656b94e5184519f698cd5386c5a2bf',
                'movingWeightSha256':weight_hash,'movingLicense':'Apache-2.0',
                'actualCurrentSourceForEveryObject':True,
                'referenceGuidanceRetention':False,
                'separateModelSessions':True,'nativeAdmission':False}
    if args.stateless_equipment:
        sam_model['limits']['statelessFixedSourceFrames']=True
        if source_reference_profile is not None:
            source_reference_profile['fixedCurrentImageStateless']=True
    # Preserve source-size head/hair boundaries in this private review. Pinned
    # weights and registered production inference limits are not changed.
    if not args.registered_alpha_limits:
        alpha_model['limits']['alphaInferenceMaxSide'] = 1536
    registration = json.loads((PRIVATE / 'full-rate-registration-20261104/smoothed-registration.json').read_text())
    rows = registration['rows']
    assert len(rows) == TOTAL and all(row['accepted'] and row['frame'] == i for i, row in enumerate(rows))
    source = Path(registration['source'])
    current_scenes=None
    if args.current_source_scenes:
        if args.reviewed_equipment_selections or args.reviewed_scene_cleanup:
            raise ValueError('Current source scenes cannot be mixed with historical scene presets')
        current_scenes=json.loads(args.current_source_scenes.read_text())
        if (current_scenes.get('masterSha256')!=sha(source) or
                current_scenes.get('registrationSha256')!=sha(PRIVATE/'full-rate-registration-20261104/smoothed-registration.json') or
                current_scenes.get('frameCount')!=TOTAL or current_scenes.get('fps')!=FPS or
                [s.get('angle')for s in current_scenes.get('scenes',[])]!=[0,1]):
            raise ValueError('Current native scenes differ from this source and programme clock')
        for scene in current_scenes['scenes']:
            if sha(Path(scene['nativeProject']))!=scene['nativeProjectSha256']:
                raise ValueError('Current native scene project changed')
            if ('primarySelection' in scene and
                    sha(Path(scene['primaryReferenceRgb']))!=scene['primaryReferenceRgbSha256']):
                raise ValueError('Current native person source reference changed')
    authored_shots=None
    if args.shot_corrections:
        authored_shots=json.loads(args.shot_corrections.read_text())
        if authored_shots.get('sourceSha256')!=sha(source):
            raise ValueError('Authored shot corrections belong to a different source')
    camera_cuts = json.loads((PRIVATE / 'long-podcast-r7/frame-camera-verification.json').read_text())['exactTransitions']
    gesture_file = args.gesture_corrections or PRIVATE / 'corrective-click-agreement-r66/full-source-corrective-gesture.json'
    gesture = json.loads(gesture_file.read_text())
    if args.gesture_corrections and gesture.get('sourceSha256') != sha(source):
        raise ValueError('Gesture corrections belong to a different source')
    cut_frames = sorted({c['frame'] for c in camera_cuts} | {gesture['startFrame'], gesture['endFrame']})
    cuts = [{'frame': frame, 'angle': rows[frame]['angle'],
             'correctiveReseed': frame in {gesture['startFrame'], gesture['endFrame']}}
            for frame in cut_frames]
    target_frames = args.review_first_frames or TOTAL
    if args.review_first_frames:
        cuts = [cut for cut in cuts if cut['frame'] < target_frames]
    assert all(rows[i]['angle'] == gesture['angle'] for i in range(gesture['startFrame'], gesture['endFrame']))
    if current_scenes:
        scenes=[{'scene':{'effects':copy.deepcopy(s['effects'])},
                 'maskComponents':copy.deepcopy(s['components'])}for s in current_scenes['scenes']]
        equipment_selections=[{'components':copy.deepcopy(s['components']),
            'refinement':{'colourComponentIds':s['colourComponentIds']}}
            for s in current_scenes['scenes']]
    else:
        scenes = json.loads((PRIVATE / 'piece-review-r6/final-detail-pass/native-final/two-speaker-final-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes']
        equipment_selections = [json.loads(scene['maskJob']['selectionJson']) for scene in scenes]
    if args.reviewed_equipment_selections:
        recent = json.loads((PRIVATE / 'fine-props-r8/native-scoped-final/final-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]
        equipment_selections[0] = json.loads(recent['maskJob']['selectionJson'])
        if args.reviewed_scene_cleanup:
            scenes[0] = recent
            # Actual source comparison identifies a real cyan butterfly among
            # the brown leaves. A broad blue key/despill must not recolour or
            # erase it. Restrict the authored TV-bar exclusion above the wings.
            for effect in scenes[0]['scene']['effects']:
                if effect.get('blue_spill'):
                    effect['blue_spill'] = 0
                    effect['detail_box'][3] = min(effect['detail_box'][3], .54)
    face_detector = cv2.FaceDetectorYN_create(FACE_MODEL, '', (1430, 1000), .6, .3, 5000)
    recurrent = None
    recurrent_checkpoint = Path('/home/tibule12/.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx')
    if args.recurrent_person_guidance:
        if sha(recurrent_checkpoint) != '88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828':
            raise ValueError('Private recurrent person checkpoint changed')
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        recurrent = ort.InferenceSession(str(recurrent_checkpoint), sess_options=options, providers=['CPUExecutionProvider'])
    plan_identity = {
        'master': str(source), 'masterSha256': sha(source), 'frames': target_frames, 'fps': FPS,
        'fourMinuteProcessing': target_frames == TOTAL,
        'registrationSha256': sha(PRIVATE / 'full-rate-registration-20261104/smoothed-registration.json'),
        'modelVersions': [sam_model['modelVersion'], alpha_model['modelVersion']],
        'alphaExecutionProfile': alpha_model['id'],
        'localSourceFrameParallelism': alpha_model['limits'].get('localSourceFrameParallelism', 1),
        'segmentationCheckpoint':sam_model['checkpoint'],
        'sourceReferenceTracker':source_reference_profile,
        'segmentationWeightsSha256':sam_model['weights'][0]['sha256'],
        'privateAlphaInferenceMaxSide': alpha_model['limits']['alphaInferenceMaxSide'],
        'registeredLimitsChanged': False,
        'boundedFullKeyAttention': args.bounded_attention,
        'attentionQueryRows':args.attention_query_rows if args.bounded_attention else None,
        'attentionFallbackQueryRows':args.attention_fallback_rows,
        'efficientFullKeyAttention': args.efficient_attention,
        'trackerHistoryStorage': 'cpu; local GPU still performs every neural frame',
        'recurrentPersonGuidance': {'enabled': bool(recurrent), 'license': 'GPL-3.0; private local evaluation only, not registered or distributed',
            'checkpointSha256': sha(recurrent_checkpoint) if recurrent else None,
            'appliedToCameraAngle': 0, 'currentSourceClassification': args.classify_striped_person},
        'implementationSha256': {name: sha(Path(name)) for name in [
            'config/model-runtime/registry.v1.json',
            'config/model-runtime/local-cuda-evaluation.v1.json',
            'scripts/background-replacement/process-full-rate-podcast.py',
            'scripts/background-replacement/bounded_attention.py',
            'scripts/background-replacement/efficient_attention.py',
            'model_workers/adapters/component_segmentation.py', 'model_workers/adapters/cpu_matting.py',
            'model_workers/adapters/temporal_alpha.py', 'model_workers/adapters/moving_detail_alpha.py',
            'model_workers/adapters/source_edge_alpha.py', 'python_media_worker/studio_vfx_plan.py',
            'model_workers/adapters/person_material_alpha.py','model_workers/adapters/photographed_opacity.py',
            'model_workers/adapters/fixed_source_neural.py',
            'python_media_worker/studio_source_background.py', 'python_media_worker/studio_vfx_foreground_cache.py']},
        'actualModelInferenceEveryFrame': True, 'sourceRgbEveryFrame': True,
        'refreshFixedRois': True, 'actualCameraIntervals': len(camera_cuts),
        'fixedEquipmentStatelessCurrentImage':args.stateless_equipment,
        'localCompositeWorkers':args.composite_workers,
        'localCompositeImplementationSha256':sha(Path('python_media_worker/studio_vfx_parallel.py')) if args.composite_workers>1 else None,
        'trackerResetPolicy': 'Actual camera cuts plus two explicit reviewed-gesture boundaries',
        'correctiveGestureSha256': sha(gesture_file),
        'currentSourceScenesSha256':sha(args.current_source_scenes)if args.current_source_scenes else None,
        'authoredShotCorrectionsSha256': sha(args.shot_corrections) if args.shot_corrections else None,
        'archivedGuidance': 'all256-source-logit-codes' if args.archive_soft_guidance else 'binary-selected-foreground; regenerate neural guidance for new inference',
        'reviewedEquipmentSelections': args.reviewed_equipment_selections,
        'reviewedSceneCleanup': args.reviewed_scene_cleanup,
        'boundedOutputChunkFrames': args.chunk_frames, 'mattingContextEachSide': 8, 'paidCloud': False,
        'nativeStudioQualification': False, 'visualPass': False,
    }
    identity_file = args.out / 'source-plan.json'
    if identity_file.exists():
        if json.loads(identity_file.read_text()) != plan_identity:
            raise ValueError('Resume source/model/registration identity differs')
    else:
        write_json(identity_file, plan_identity)
    started = time.monotonic()
    records = []
    shared_sam = source_current_model
    for interval_index, cut in enumerate(cuts):
        first = cut['frame']
        end = cuts[interval_index + 1]['frame'] if interval_index + 1 < len(cuts) else target_frames
        angle = cut['angle']
        width, height = [1430, 1440][angle], 1000
        interval_out = args.out / f'camera-{interval_index:02d}-{first:04d}-{end:04d}'
        interval_out.mkdir(exist_ok=True)
        completed = interval_out / 'completed.json'
        if completed.exists():
            old = json.loads(completed.read_text())
            for chunk in old['chunks']:
                receipt = json.loads((interval_out / chunk / 'receipt.json').read_text())
                for item in [receipt['picture'], *receipt['maskArchives']]:
                    if sha(interval_out / chunk / item['file']) != item['sha256']:
                        raise ValueError('Completed interval archive changed')
                records.append(receipt)
            continue
        # A partial camera cannot resume a fabricated tracker memory. Preserve
        # its chunks and require a new revision directory for that interval.
        if any(interval_out.iterdir()):
            raise ValueError(f'Interrupted camera evidence retained at {interval_out}; review before resuming')
        decoder = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '1',
            '-i', str(source), '-vf', f'fps=24,trim=start_frame={first}:end_frame={end},setpts=PTS-STARTPTS',
            '-frames:v', str(end - first), '-an', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'],
            stdout=subprocess.PIPE)
        tracker = None
        recurrent_states = {f'r{number}i': np.zeros((1,1,1,1),np.float32) for number in range(1,5)}
        source_writer = None
        buffer = []
        next_absolute = first
        chunks = []
        try:
            for chunk_first in range(first, end, args.chunk_frames):
                count = min(args.chunk_frames, end - chunk_first)
                data_first = max(first, chunk_first - 8)
                data_end = min(end, chunk_first + count + 8)
                data_count = data_end - data_first
                if shutil.disk_usage(args.out).free < 5 * 1024**3:
                    raise RuntimeError('Preserving 5GiB root disk reserve; no source/project media will be deleted')
                if shutil.disk_usage(args.scratch).free < 180 * 1024**2:
                    raise RuntimeError('Preserving temporary-volume capacity before a bounded chunk')
                name = f'frames-{chunk_first:04d}-{chunk_first + count:04d}'
                archive = interval_out / name
                archive.mkdir()
                scratch = args.scratch / name
                scratch.mkdir()
                sam = scratch / 'segmentation'
                sam.mkdir()
                union_dir, components_dir = sam / 'subject_masks', sam / 'component_masks'
                union_dir.mkdir()
                components_dir.mkdir()
                source_chunk = scratch / 'source.mkv'
                source_writer = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '1',
                    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{width}x{height}', '-r', '24',
                    '-i', 'pipe:0', '-an', '-c:v', 'ffv1', '-level', '3', '-threads', '2', str(source_chunk)],
                    stdin=subprocess.PIPE)
                union_rows, component_rows = [], None
                chunk_params = None
                while next_absolute < data_end:
                    absolute = next_absolute
                    raw = decoder.stdout.read(1920 * 1080 * 3)
                    if len(raw) != 1920 * 1080 * 3:
                        raise RuntimeError(f'Original source ended at {absolute}')
                    assert rows[absolute]['angle'] == angle
                    rgb = cv2.warpAffine(np.frombuffer(raw, np.uint8).reshape(1080, 1920, 3),
                        np.asarray(rows[absolute]['smoothedMatrix']), (width, height), flags=cv2.INTER_LINEAR)
                    if tracker is None:
                        if first == gesture['startFrame']:
                            params = copy.deepcopy(gesture['parameters'])
                        else:
                            components = copy.deepcopy(equipment_selections[angle]['components'] if args.reviewed_equipment_selections or current_scenes
                                else scenes[angle]['maskComponents'])
                            if current_scenes:
                                # Later cuts do not turn an earlier raised hand
                                # into stationary furniture. The original
                                # corrective gesture retains its true tracks.
                                components=[c for c in components if not c.get('propagate',True)]
                            for component in components:
                                component['shotPrompts'] = []
                                # The rig/couch/plant occupy fixed source ROIs;
                                # visibility is still evaluated from CURRENT RGB.
                                component['propagate'] = False
                            params = {'subjectId': f'private-speaker-{angle}',
                                'initialBox': [.04, .02, .68, 1] if angle == 0 else [.20, 0, 1, 1],
                                'points': subject_points(rgb, angle, face_detector), 'shotPrompts': [],
                                'components': components}
                            if current_scenes and 'primarySelection' in current_scenes['scenes'][angle]:
                                params.update(current_native_person_input(current_scenes['scenes'][angle],
                                    rgb, first, params['points']))
                        if authored_shots:
                            matches=[row for row in authored_shots['shots']if row['firstFrame']==first]
                            if len(matches)>1:raise ValueError('Duplicate authored shot correction')
                            if matches:
                                correction=matches[0]
                                points=correction['points']
                                if correction['angle']!=angle or not 1<=len(points)<=16:
                                    raise ValueError('Invalid authored source-shot correction')
                                if any(p['label']not in [0,1] or len(p['position'])!=2 or
                                    any(not 0<=v<=1 for v in p['position'])for p in points):
                                    raise ValueError('Invalid source-coordinate correction')
                                params['points']=copy.deepcopy(points)
                                if 'components'in correction:
                                    authored_components=correction['components']
                                    if not isinstance(authored_components,list) or len(authored_components)>7 or len({c['id']for c in authored_components})!=len(authored_components):
                                        raise ValueError('Existing foreground selection limits exceeded')
                                    for c in authored_components:
                                        if len(c['points'])>16 or len(c['box'])!=4 or not 0<=c['box'][0]<c['box'][2]<=1 or not 0<=c['box'][1]<c['box'][3]<=1:
                                            raise ValueError('Invalid authored object geometry')
                                        if any(p['label']not in [0,1] or len(p['position'])!=2 or any(not 0<=v<=1 for v in p['position'])for p in c['points']):
                                            raise ValueError('Invalid authored object points')
                                    params['components']=copy.deepcopy(authored_components)
                                by_id={component['id']:component for component in params['components']}
                                for component_id,component_points in correction.get('componentPoints',{}).items():
                                    if component_id not in by_id or not 1<=len(component_points)<=16:
                                        raise ValueError('Invalid authored component correction')
                                    if any(p['label']not in [0,1] or len(p['position'])!=2 or
                                        any(not 0<=v<=1 for v in p['position'])for p in component_points):
                                        raise ValueError('Invalid authored component coordinates')
                                    by_id[component_id]['points']=copy.deepcopy(component_points)
                                colour_ids=correction.get('colourComponentIds')
                                if colour_ids is not None:
                                    if not isinstance(colour_ids,list) or len(set(colour_ids))!=len(colour_ids) or any(c not in by_id for c in colour_ids):
                                        raise ValueError('Invalid authored fixed-object refinement selection')
                        tracker = ComponentVideoTracker({'model': sam_model, 'request': {'parameters': params}},
                            {'width': width, 'height': height}, sam_dir, device='cuda', model=shared_sam,
                            refresh_fixed=True, offload_state=True,fixed_reference_model=source_reference_model,
                            moving_model=source_moving_model)
                        shared_sam = tracker.model
                    union, planes = tracker.frame(rgb, absolute - first)
                    if recurrent is not None and angle == 0:
                        _, person, *state = recurrent.run(None, {
                            'src': rgb.transpose(2,0,1)[None].astype(np.float32)/255,
                            'downsample_ratio': np.array([.5],np.float32), **recurrent_states})
                        recurrent_states = {f'r{number}i': value for number,value in enumerate(state,1)}
                        person = np.rint(np.clip(person[0,0],0,1)*255).astype(np.uint8)
                        # Independent current-frame person evidence repairs a
                        # reproduced missing striped torso. No held RGB/mask.
                        planes[0] = (classify_person_support(rgb,planes[0],person) if args.classify_striped_person
                            else np.maximum(planes[0],person))
                        union = np.maximum.reduce(planes)
                    buffer.append((absolute, rgb.copy(), union, planes))
                    next_absolute += 1
                    if (absolute - first) % 12 == 0:
                        progress = {'phase': 'CURRENT_SOURCE_TRACKING', 'sourceFrame': absolute,
                            'sourceSeconds': absolute / FPS, 'camera': interval_index,
                            'completedFrames': sum(r['frames'] for r in records), 'totalFrames': target_frames,
                            'runtimeSeconds': time.monotonic() - started, 'visualPass': False}
                        write_json(args.out / 'progress.json', progress)
                        print(json.dumps(progress), flush=True)
                buffer = [item for item in buffer if item[0] >= data_first]
                assert len(buffer) == data_count and buffer[0][0] == data_first
                chunk_params = rebase_native_chunk_parameters(params, first, data_first, data_end,
                    subject_points(buffer[0][1], angle, face_detector))
                colours = ([c['id'] for c in params['components'] if not c.get('propagate', True)]
                    if first == gesture['startFrame'] or not(args.reviewed_equipment_selections or current_scenes) else
                    equipment_selections[angle].get('refinement',{}).get('colourComponentIds',[]))
                if authored_shots:
                    authored=next((row for row in authored_shots['shots']if row['firstFrame']==first),None)
                    if authored and 'colourComponentIds'in authored:
                        colours=authored['colourComponentIds']
                chunk_params['refinement'] = {'radius': 15, 'holdouts': [], 'colourComponentIds': colours}
                component_rows = [[] for _ in tracker.components]
                for local, (absolute, rgb, union, planes) in enumerate(buffer):
                    source_writer.stdin.write(rgb.tobytes())
                    file = f'matte_{local:04d}.png'
                    Image.fromarray(union).save(union_dir / file)
                    union_rows.append({'index': local, 'time': local / FPS, 'sourceTick': absolute * 3750,
                        'file': file, 'sha256': sha(union_dir / file), **mask_geometry(union)})
                    for number, plane in enumerate(planes):
                        file = f'component_{number:02d}_{local:04d}.png'
                        Image.fromarray(plane).save(components_dir / file)
                        component_rows[number].append({'index': local, 'file': file,
                            'sha256': sha(components_dir / file), **mask_geometry(plane)})
                finish(source_writer)
                source_writer = None
                source_hash = sha(source_chunk)
                prompt = {'version': 1, 'source_sha256': source_hash,
                    'points': [[p['position'][0] * width, p['position'][1] * height] for p in chunk_params['points']],
                    'labels': [p['label'] for p in chunk_params['points']],
                    'shot_prompts': [{'frame_index': p['frameIndex'],
                        'points': [[v['position'][0] * width, v['position'][1] * height] for v in p['points']],
                        'labels': [v['label'] for v in p['points']]} for p in chunk_params['shotPrompts']]}
                source_range = {'startTick': data_first * 3750, 'endTick': data_end * 3750}
                common = {'version': 1, 'kind': 'source_bound_subject_matte', 'source_sha256': source_hash,
                    'width': width, 'height': height, 'fps': 24.0, 'fps_fraction': '24/1', 'frame_count': data_count,
                    'model': sam_model['checkpoint'], 'model_revision': sam_model['revision'],
                    'model_weights_sha256': next(w['sha256'] for w in sam_model['weights'] if w['path'] == 'model.safetensors'),
                    'prompt': prompt, 'prompt_sha256': sha_json(prompt), 'original_source_sha256': source_hash,
                    'sourceRange': source_range, 'shot_cuts': []}
                selections = [{'id': chunk_params['subjectId'], 'box': chunk_params['initialBox'],
                    'points': chunk_params['points'], 'shotPrompts': chunk_params['shotPrompts'], 'propagate': True}, *chunk_params['components']]
                manifest = {**common, 'frames': union_rows, 'components': selections,
                    'mask_semantics': 'Actual current-frame full-rate SAM2 tracks; persistent camera memory, refreshed fixed ROIs.' +
                        (' Primary-person evidence includes separately pinned current-frame recurrent person guidance (private GPL3 evaluation).' if recurrent else ''),
                    'quality': 'Private review guidance; no creative approval.'}
                details = {**common, 'components': [{'selection': c, 'roi': roi, 'frames': frames}
                    for c, roi, frames in zip(selections, tracker.rois, component_rows)]}
                if source_reference_profile is not None:
                    diagnostics = [{'components':s['indices'],
                        'currentModelNeuralFrames':s['neural_frames'],
                        'samReferenceFrames':s['reference_model_frames'],
                        'sourceQualifiedRetainedGuidePixels':s['source_reference_retained_pixels'],
                        'agreeingSourceReuses':s['agreeing_reuses']}
                        for s in tracker.fixed_roi_diagnostics
                        if not tracker.components[s['indices'][0]].get('propagate', True)]
                    for metadata in (manifest, details):
                        metadata['source_reference_tracker'] = copy.deepcopy(source_reference_profile)
                        metadata['fixed_roi_evaluation_counts'] = diagnostics
                    manifest['mask_semantics'] = (('Current-frame SAM 2 equipment tracking and separate EdgeTAM moving-subject tracking; '
                        'no reference guidance retention. Private evaluation, not native admission.') if args.source_reference_tracker=='hybrid' else
                        ('Current-frame EdgeTAM moving and fixed guidance; '
                        'SAM 2 initializes each fixed source reference. Only strong source-agreeing '
                        'reference evidence outside both moving envelopes may be retained. '
                        'No held alpha or source picture. Private evaluation, not native admission.'))
                write_json(union_dir / 'manifest.json', manifest)
                write_json(components_dir / 'manifest.json', details)
                scope = {'ownerUid': 'PRIVATE_REVIEW_ONLY', 'projectId': 'PRIVATE_REVIEW_ONLY',
                    'sourceAssetId': 'PRIVATE_REVIEW_ONLY', 'sourceSha256': source_hash,
                    'sourceRange': source_range, 'provenance': {'sourceGeneration': source_hash}, 'privateReviewOnly': True}
                scope['artifactHash'] = hashlib.sha256(canonical(scope).encode()).hexdigest()
                work = scratch / 'alpha-work'
                work.mkdir()
                outputs = work / 'outputs'
                outputs.mkdir()
                bundle_masks(components_dir, work / 'component_dependency.tar.gz')
                # The exact bundle is independently checked and materialized by
                # the existing alpha adapter, so don't retain duplicate staging.
                shutil.rmtree(components_dir)
                spec = {'ownerUid': scope['ownerUid'], 'source': {'generation': source_hash},
                    'request': {'projectId': scope['projectId'], 'sourceAssetId': scope['sourceAssetId'],
                        'sourceSha256': source_hash, 'sourceRange': source_range, 'parameters': chunk_params},
                    'model': alpha_model, 'componentDependency': {'artifact': scope,
                        'file': {'bytes': (work / 'component_dependency.tar.gz').stat().st_size,
                                 'sha256': sha(work / 'component_dependency.tar.gz')}}}
                geometry = {'width': width, 'height': height, 'nb_read_frames': data_count}
                print(json.dumps({'phase': 'CURRENT_ALPHA_ADAPTER', 'firstFrame': data_first, 'frames': data_count}), flush=True)
                torch.cuda.empty_cache()
                cache = CachedSubjectMatte(union_dir, source_chunk)
                refine(spec, source_chunk, geometry, ALPHA_DIR, outputs, cache, scope, device='cuda')
                alpha_cache = CachedSubjectMatte(outputs / 'subject_masks', source_chunk)
                # Keep source-corrected alpha; obsolete broad static holdouts and
                # positional colour-key rectangles cannot be copied over motion.
                effects = copy.deepcopy([e for e in scenes[angle]['scene']['effects']
                    if e['type'] in ['background_replace', 'foreground_grade'] or
                    current_scenes and e['type']=='foreground_holdout' or
                    e['type'] == 'foreground_refine' and (e.get('decontaminate', 0) > 0 or args.reviewed_scene_cleanup)])
                for effect in effects:
                    effect['start'], effect['end'] = 0, data_count / FPS
                plan = {'version': 1, 'source_sha256': source_hash,
                    'matte_sha256': alpha_cache.artifact_sha256, 'effects': effects}
                picture = archive / 'picture.mp4'
                video_writer = writer(picture, 1430, 1000)
                try:
                    def source_frames():
                        for local in range(chunk_first-data_first,chunk_first+count-data_first):
                            with Image.open(outputs/'rgb'/f'rgb_{local:04d}.png') as image:
                                yield local,image.convert('RGB')
                    if args.composite_workers>1:
                        from python_media_worker.studio_vfx_parallel import compose_frames
                        assets={e['asset_id']:str(PRIVATE/'replacement.png') for e in effects if 'asset_id' in e}
                        composed=compose_frames(source_frames(),source_chunk,outputs/'subject_masks',plan,assets,
                                                workers=args.composite_workers)
                    else:
                        renderer=VfxFrameRenderer(plan,alpha_cache,lambda _:PRIVATE/'replacement.png')
                        composed=((local,renderer.render(image,local))for local,image in source_frames())
                    for local,result in composed:
                        if width != 1430:
                            result = result.resize((1430, 1000), Image.Resampling.LANCZOS)
                        video_writer.stdin.write(result.tobytes())
                        if data_first + local in {chunk_first, chunk_first + count - 1} or (data_first + local) % 24 == 0:
                            sample = archive / 'samples'
                            sample.mkdir(exist_ok=True)
                            result.save(sample / f'replacement-{data_first + local:04d}.jpg', quality=96)
                            with Image.open(outputs/'rgb'/f'rgb_{local:04d}.png') as image:
                                image.convert('RGB').save(sample / f'source-{data_first + local:04d}.jpg', quality=96)
                    finish(video_writer)
                finally:
                    if video_writer.poll() is None:
                        video_writer.kill()
                        video_writer.wait()
                masks = [archive_masks(outputs / 'subject_masks', alpha_cache.manifest['frames'],
                    archive / 'alpha-lossless.mkv', width, height)]
                extracted = work / 'component_dependency'
                if not extracted.is_dir():
                    raise ValueError('Verified component dependency directory missing')
                for number, component in enumerate(details['components']):
                    masks.append(archive_masks(extracted, component['frames'],
                        archive / f'component-{number:02d}-selection-lossless.mkv', width, height,
                        binary=not args.archive_soft_guidance))
                write_json(archive / 'segmentation-manifest.json', manifest)
                write_json(archive / 'component-manifest.json', details)
                write_json(archive / 'alpha-manifest.json', alpha_cache.manifest)
                # Keep the exact observed evidence referenced by the alpha
                # manifest after deleting this job's regenerable staging.
                # Otherwise a completed chunk could not reproduce its colour
                # recovery from the retained masks and source.
                photographed=[]
                if alpha_cache.observed_background is not None:
                    from python_media_worker.studio_source_background import FILES
                    for name in FILES.values():
                        shutil.copyfile(outputs/'subject_masks'/name,archive/name)
                        photographed.append({'file':name,'sha256':sha(archive/name)})
                write_json(archive / 'selection.json', chunk_params)
                write_json(archive / 'composition-plan.json', plan)
                receipt = {'firstFrame': chunk_first, 'frames': count, 'camera': interval_index,
                    'angle': angle, 'sourceChunkSha256': source_hash, 'sourceRange': source_range,
                    'mattingFirstFrame': data_first, 'mattingFrames': data_count,
                    'outputStartIndex': chunk_first - data_first,
                    'picture': {'file': picture.name, 'sha256': sha(picture)}, 'maskArchives': masks,
                    'photographedBackgroundFiles': photographed,
                    'trackerFrameFirst': chunk_first - first, 'trackerMemoryResetForChunk': False,
                    'currentSourceAndModelEveryFrame': True, 'visualPass': False,
                    'nativeModelAdmission': False, 'paidCloud': False}
                write_json(archive / 'receipt.json', receipt)
                records.append(receipt)
                chunks.append(name)
                # Only this helper's generated staging is removed; original
                # source, prior movies, other worktrees and models stay intact.
                shutil.rmtree(scratch)
                buffer = [item for item in buffer if item[0] >= chunk_first + count - 8]
                gc.collect()
                torch.cuda.empty_cache()
                progress = {'phase': 'CHUNK_ARCHIVED_PENDING_VISUAL_REVIEW',
                    'completedFrames': sum(r['frames'] for r in records), 'totalFrames': target_frames,
                    'lastSourceFrame': chunk_first + count - 1, 'runtimeSeconds': time.monotonic() - started,
                    'diskFreeBytes': shutil.disk_usage(args.out).free, 'visualPass': False}
                write_json(args.out / 'progress.json', progress)
                print(json.dumps(progress), flush=True)
            if decoder.stdout.read(1) or decoder.wait() != 0:
                raise RuntimeError('Original camera interval clock differs')
            write_json(completed, {'firstFrame': first, 'endFrame': end, 'chunks': chunks})
        finally:
            if source_writer is not None and source_writer.poll() is None:
                source_writer.kill()
                source_writer.wait()
            if decoder.poll() is None:
                decoder.kill()
                decoder.wait()
        del tracker
        gc.collect()
        torch.cuda.empty_cache()
    assert sum(record['frames'] for record in records) == target_frames
    ordered = sorted(args.out.glob('camera-*/frames-*/picture.mp4'), key=lambda path: int(path.parent.name.split('-')[1]))
    concat = args.out / 'pictures.txt'
    concat.write_text(''.join("file '" + str(path.resolve()).replace("'", "'\\''") + "'\n" for path in ordered))
    run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat),
        '-i', str(source), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac',
        '-b:a', '192k', '-t', str(target_frames / FPS), '-movflags', '+faststart', str(args.out / 'replacement-pending-review.mp4')])
    write_json(args.out / 'processing-complete.json', {**plan_identity,
        'processedFrames': sum(record['frames'] for record in records), 'chunks': len(records),
        'elapsedSeconds': time.monotonic() - started, 'fullActualFrameReviewComplete': False,
        'nativeStudioSaveReopenExportComplete': False, 'visualPass': False})


if __name__ == '__main__':
    main()
