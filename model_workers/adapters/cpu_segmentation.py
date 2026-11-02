"""SAM2 streaming on CPU with separately selected foreground components.

No downloads, GPU probing, or rendering. Components remain distinct during
inference and are unioned only at the immutable mask output boundary.
"""
import hashlib
import json
import subprocess
import time
from pathlib import Path

import numpy as np
from PIL import Image

from model_workers.common import sha, write_json, blob, bundle_masks
from model_workers.adapters.segmentation import sha_json


def segment(spec, source, geometry, model_dir, output):
    import torch
    from transformers import Sam2VideoModel, Sam2VideoProcessor
    from python_media_worker.studio_subject_matte import detect_shot_cuts, mask_geometry

    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    params = spec['request']['parameters']
    width, height = int(geometry['width']), int(geometry['height'])
    count = int(geometry['nb_read_frames'])
    if detect_shot_cuts(source, 24):
        raise ValueError('Use a separate source-bound selection for each camera shot')
    corrections = {prompt['frameIndex']: prompt for prompt in params['shotPrompts']}
    if any(not prompt.get('points') for prompt in corrections.values()):
        raise ValueError('Add subject/background points to each correction frame; use separate sources for camera cuts')
    weights = next(item for item in spec['model']['weights'] if item['path'] == 'model.safetensors')
    if sha(model_dir / 'model.safetensors') != weights['sha256']:
        raise ValueError('CPU checkpoint differs from pinned weights')
    model = Sam2VideoModel.from_pretrained(model_dir, local_files_only=True).to('cpu', dtype=torch.float32).eval()
    # Prompt handling and session management are the upstream implementations.
    # The CPU image transform below reproduces the pinned processor config;
    # it does not require installing torchvision/CUDA into the CPU worker.
    processor = Sam2VideoProcessor.__new__(Sam2VideoProcessor)
    config = json.loads((model_dir / 'preprocessor_config.json').read_text())
    processor.target_size = config['size']['height']
    processor.point_pad_value = -10
    mean = torch.tensor(config['image_mean'])[None, :, None, None]
    std = torch.tensor(config['image_std'])[None, :, None, None]
    components = [{'id': params['subjectId'], 'box': params['initialBox'], 'points': params['points']}, *params.get('components', [])]
    moving = [c for c in components if c.get('propagate', True)]
    fixed = [c for c in components if not c.get('propagate', True)]
    def make_session(selections):
        session = processor.init_video_session(inference_device='cpu', dtype=torch.float32)
        boxes = [[b[0]*width, b[1]*height, b[2]*width, b[3]*height] for b in (c['box'] for c in selections)]
        points = [[[p['position'][0]*width, p['position'][1]*height] for p in c['points']] for c in selections]
        kwargs = dict(inference_session=session, frame_idx=0, obj_ids=list(range(1, len(selections)+1)),
                      input_boxes=[boxes], original_size=(height, width))
        if any(points):
            kwargs.update(input_points=[points], input_labels=[[[p['label'] for p in c['points']] for c in selections]])
        processor.add_inputs_to_inference_session(**kwargs)
        return session
    session = make_session(moving)
    static_alpha = None
    masks = output / 'subject_masks'
    masks.mkdir()
    rows = []
    decoder = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(source),
        '-map', '0:v:0', '-vsync', '0', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        with torch.inference_mode():
            for index in range(count):
                data = decoder.stdout.read(width * height * 3)
                if len(data) != width * height * 3:
                    raise ValueError('CPU mask source ended early')
                pixels = torch.from_numpy(np.frombuffer(data, dtype=np.uint8).reshape(height, width, 3).copy()).permute(2, 0, 1)[None].float()*config['rescale_factor']
                pixels = torch.nn.functional.interpolate(pixels, (processor.target_size, processor.target_size),
                    mode='bilinear', align_corners=False, antialias=True)
                frame = ((pixels-mean)/std)[0]
                if index == 0 and fixed:
                    static_session = make_session(fixed)
                    static_masks = model(inference_session=static_session, frame=frame).pred_masks
                    static_alpha = torch.nn.functional.interpolate(static_masks.float(), (height,width), mode='bilinear',align_corners=False)[:,0].amax(dim=0).numpy() > 0
                    del static_session, static_masks
                if index in corrections:
                    # Apply the actual later-frame clicks to the person in the
                    # existing session. Keeping its temporal memory avoids a
                    # fresh first-frame silhouette at every correction. Other
                    # selected objects retain their own independent tracking.
                    prompt = corrections[index]
                    processor.add_inputs_to_inference_session(
                        inference_session=session, frame_idx=index, obj_ids=[1],
                        input_boxes=[[[prompt['box'][0]*width, prompt['box'][1]*height,
                                       prompt['box'][2]*width, prompt['box'][3]*height]]],
                        input_points=[[[[p['position'][0]*width, p['position'][1]*height]
                                        for p in prompt['points']]]],
                        input_labels=[[[p['label'] for p in prompt['points']]]],
                        original_size=(height, width))
                result = model(inference_session=session, frame=frame, frame_idx=index)
                logits = torch.nn.functional.interpolate(result.pred_masks.float(), (height, width), mode='bilinear', align_corners=False)[:, 0]
                # A microphone must not disappear because the human component
                # excludes it. No non-overlap constraint is applied to the union.
                union = logits.amax(dim=0).numpy()
                if not np.isfinite(union).all():
                    raise ValueError('Nonfinite CPU mask')
                alpha = (union > 0).astype(np.uint8)*255
                if static_alpha is not None:
                    alpha[static_alpha] = 255
                name = f'matte_{index:04d}.png'
                Image.fromarray(alpha).save(masks/name)
                rows.append({'index': index, 'time': index/24, 'sourceTick': spec['request']['sourceRange']['startTick']+index*3750,
                             'file': name, 'sha256': sha(masks/name), **mask_geometry(alpha)})
                # Streaming uses a finite memory/pointer window. Retain every
                # conditioning output and the complete pointer window, while
                # releasing decoded frames and expired non-conditioning state.
                session.processed_frames.pop(index, None)
                keep = max(model.num_maskmem, model.config.max_object_pointers_in_encoder)
                for history in session.output_dict_per_obj.values():
                    for old in list(history['non_cond_frame_outputs']):
                        if old < index-keep:
                            del history['non_cond_frame_outputs'][old]
                if index % 12 == 0:
                    print(json.dumps({'event': 'cpu_component_masks', 'index': index, 'total': count}), flush=True)
        if decoder.stdout.read(1) or decoder.wait(timeout=30):
            raise ValueError('CPU mask source clock differs')
    finally:
        if decoder.poll() is None:
            decoder.kill(); decoder.wait()
    box = params['initialBox']
    prompt = {'version': 1, 'source_sha256': sha(source),
        'points': [[p['position'][0]*width, p['position'][1]*height] for p in params['points']] or [[(box[0]+box[2])*width/2, (box[1]+box[3])*height/2]],
        'labels': [p['label'] for p in params['points']] or [1],
        'shot_prompts': [{'frame_index': p['frameIndex'],
            'points': [[v['position'][0]*width, v['position'][1]*height] for v in p['points']],
            'labels': [v['label'] for v in p['points']]} for p in params['shotPrompts']]}
    manifest = {'version': 1, 'kind': 'source_bound_subject_matte', 'source_sha256': sha(source),
        'width': width, 'height': height, 'fps': 24.0, 'fps_fraction': '24/1', 'frame_count': count,
        'model': spec['model']['checkpoint'], 'model_revision': spec['model']['revision'],
        'model_weights_sha256': weights['sha256'], 'prompt': prompt, 'prompt_sha256': sha_json(prompt),
        'frames': rows, 'shot_cuts': [], 'original_source_sha256': spec['request']['sourceSha256'],
        'sourceRange': spec['request']['sourceRange'], 'components': components,
        'mask_semantics': 'Union of separately prompted SAM2 components at logit>0; CPU float32. Components explicitly marked propagate=false retain their first-frame model mask in this locked shot.',
        'quality': 'Object segmentation; source-guided alpha refinement and full moving review still required'}
    write_json(masks/'manifest.json', manifest)
    write_json(output/'subject_masks_manifest.json', manifest)
    bundle_masks(masks, output/'subject_masks.tar.gz')
    return {'subjectId': params['subjectId'], 'width': width, 'height': height,
        'fpsNumerator': 24, 'fpsDenominator': 1, 'frameCount': count, 'sourceRange': spec['request']['sourceRange'],
        'maskManifest': blob(output/'subject_masks_manifest.json'),
        'maskBundle': blob(output/'subject_masks.tar.gz', media_type='application/gzip'),
        'coverageBasis': 'decoded_frames', 'confidence': None,
        'warnings': [f"Near-empty foreground at frame {row['index']}" for row in rows if row['coverage'] < .005]}
