"""Internal current-RGB clothing/furniture recovery on the rejected first chunk.

The retained SAM files are binary selections, not original soft model logits.
This diagnostic therefore makes no admitted-model or native export claim.
No held image or polygon is pasted into the composite.
"""
import argparse
import json
from pathlib import Path
import socket
import subprocess
import time

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw

from model_workers.common import sha, write_json


def decode(file, filters=None):
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-threads', '1', '-i', str(file)]
    if filters:
        command += ['-vf', filters]
    return subprocess.Popen([*command, '-an', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE)


def pixels(process, width, height):
    data = process.stdout.read(width * height * 3)
    if len(data) != width * height * 3:
        raise ValueError('Source/mask archive clock differs')
    return np.frombuffer(data, np.uint8).reshape(height, width, 3)


def classify(rgb, evidence, reliable, *, reference=None, points=(), face_bottom=None):
    probable = (evidence >= 64).astype(np.uint8)
    # The old dilation made every large missed cloth patch KNOWN background.
    # A convex hull also exposed unrelated photographed wall behind the head
    # in the rejected r90 trial. Expand only enclosed holes and gaps between
    # the current body's actual intersections with the image's lower edge.
    # This is only a classifier search domain, never an opaque polygon.
    closed = probable.copy()
    count, labels, stats, _ = cv2.connectedComponentsWithStats(probable, 8)
    if count > 1:
        body = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        xs = np.flatnonzero(labels[-1] == body)
        if len(xs) > 1:
            closed[-1, xs.min():xs.max() + 1] = 1
    padded = np.pad(closed, 1)
    flood = padded.copy()
    cv2.floodFill(flood, None, (0, 0), 1)
    envelope = closed | (flood[1:-1, 1:-1] == 0).astype(np.uint8)
    if face_bottom is not None:
        envelope = np.zeros(probable.shape, np.uint8)
        count, components, stats, _ = cv2.connectedComponentsWithStats(probable, 8)
        for component in range(1, count):
            if stats[component, cv2.CC_STAT_AREA] >= 1000:
                cv2.fillConvexPoly(envelope, cv2.convexHull(cv2.findNonZero(
                    (components == component).astype(np.uint8))), 1)
        # Current face geometry keeps a clothing repair from adding the wall
        # beside an otherwise correctly isolated head. Existing model evidence
        # above this boundary remains unchanged, including real raised hands.
        envelope[:face_bottom] = probable[:face_bottom]
    labels = np.full(evidence.shape, cv2.GC_PR_BGD, np.uint8)
    labels[probable > 0] = cv2.GC_PR_FGD
    labels[cv2.dilate(envelope, np.ones((15, 15), np.uint8)) == 0] = cv2.GC_BGD
    labels[cv2.erode(reliable.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0] = cv2.GC_FGD
    for x, y in points:
        # Reviewed source-material points are used only while their actual RGB
        # still agrees. They cannot leave fixed circles on a moving wall/hand.
        x, y = round(x * rgb.shape[1]), round(y * rgb.shape[0])
        if reference is not None and np.max(np.abs(rgb[y, x].astype(np.int16) - reference[y, x].astype(np.int16))) <= 12:
            cv2.circle(labels, (x, y), 2, cv2.GC_FGD, -1)
    if not (labels == cv2.GC_FGD).any() or not (labels == cv2.GC_BGD).any():
        raise ValueError('Current-source recovery lacks reliable colour seeds')
    cv2.setRNGSeed(0)
    cv2.grabCut(rgb.copy(), labels, None, np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
    selected = np.isin(labels, [cv2.GC_FGD, cv2.GC_PR_FGD]).astype(np.uint8) * 255
    return np.maximum(evidence, selected)


def recover_fixed_surface(rgb, evidence, selection, reference):
    """Classify the reviewed furniture from CURRENT source material colours.

    The shape envelope is a search area only. In particular it is never filled
    with opaque alpha, which would paste the old room into the replacement.
    """
    h, w = evidence.shape
    x0, y0, x1, y1 = [round(v * (w if n % 2 == 0 else h))
        for n, v in enumerate(selection['box'])]
    picture = rgb[y0:y1, x0:x1].copy()
    prior = evidence[y0:y1, x0:x1]
    binary = (prior >= 128).astype(np.uint8)
    locations = cv2.findNonZero(binary)
    if locations is None:
        raise ValueError('Furniture has no independent current-source support')
    envelope = np.zeros(binary.shape, np.uint8)
    cv2.fillConvexPoly(envelope, cv2.convexHull(locations), 1)
    labels = np.full(binary.shape, cv2.GC_PR_BGD, np.uint8)
    labels[binary > 0] = cv2.GC_PR_FGD
    labels[cv2.dilate(envelope, np.ones((15, 15), np.uint8)) == 0] = cv2.GC_BGD
    labels[cv2.erode(binary, np.ones((7, 7), np.uint8)) > 0] = cv2.GC_FGD
    for point in selection['points']:
        px, py = [round(v * size) for v, size in zip(point['position'], [w, h])]
        if not (x0 <= px < x1 and y0 <= py < y1):
            continue
        if np.max(np.abs(rgb[py, px].astype(np.int16) - reference[py, px].astype(np.int16))) <= 12:
            cv2.circle(labels, (px-x0, py-y0), 2, cv2.GC_FGD if point['label'] else cv2.GC_BGD, -1)
    cv2.setRNGSeed(0)
    cv2.grabCut(picture, labels, None, np.zeros((1,65)), np.zeros((1,65)), 5, cv2.GC_INIT_WITH_MASK)
    recovered = evidence.copy()
    recovered[y0:y1, x0:x1] = np.maximum(prior,
        np.isin(labels, [cv2.GC_FGD, cv2.GC_PR_FGD]).astype(np.uint8) * 255)
    return recovered


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('out', type=Path)
    parser.add_argument('--frames', type=int, default=48, choices=[1, 12, 48])
    parser.add_argument('--below-current-face', action='store_true')
    parser.add_argument('--prepare-alpha', action='store_true')
    args = parser.parse_args()
    args.out.mkdir(exist_ok=False)
    (args.out / 'implementation.py').write_bytes(Path(__file__).read_bytes())
    cv2.setNumThreads(2)
    private = Path('reports/background-replacement-20261101/private')
    chunk = private / 'full-rate-podcast-r89-20261105/camera-00-0000-1188/frames-0000-0048'
    receipt = json.loads((chunk / 'receipt.json').read_text())
    selections = json.loads((chunk / 'selection.json').read_text())
    archived_components = json.loads((chunk / 'component-manifest.json').read_text())['components']
    for entry in receipt['maskArchives']:
        if sha(chunk / entry['file']) != entry['sha256']:
            raise ValueError('Retained source selection/alpha archive changed')
    geometry = json.loads((private / 'full-rate-registration-20261104/smoothed-registration.json').read_text())
    source = decode(geometry['source'], f'fps=24,trim=start_frame=0:end_frame={args.frames},setpts=PTS-STARTPTS')
    masks = [decode(chunk / f'component-{n:02d}-selection-lossless.mkv',
        f'trim=end_frame={args.frames},setpts=PTS-STARTPTS') for n in range(8)]
    streams = [source, *masks]
    checkpoint = Path('/home/tibule12/.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx')
    if sha(checkpoint) != '88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828':
        raise ValueError('Private recurrent checkpoint changed')
    socket.socket.connect = lambda *a, **k: (_ for _ in ()).throw(RuntimeError('No network inference'))
    options = ort.SessionOptions()
    options.intra_op_num_threads, options.inter_op_num_threads = 2, 1
    recurrent = ort.InferenceSession(str(checkpoint), sess_options=options, providers=['CPUExecutionProvider'])
    detector = cv2.FaceDetectorYN_create('/home/tibule12/Projects/AutoPromte/AutoPromote/python_media_worker/models/yunet/face_detection_yunet_2023mar.onnx', '', (1430, 1000), .6, .3, 5000)
    state = {f'r{n}i': np.zeros((1, 1, 1, 1), np.float32) for n in range(1, 5)}
    rows, reference = [], None
    source_writer = None
    component_rows, union_rows = [[] for _ in range(8)], []
    if args.prepare_alpha:
        (args.out/'segmentation/subject_masks').mkdir(parents=True)
        (args.out/'segmentation/component_masks').mkdir()
        source_writer = subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1',
            '-f','rawvideo','-pix_fmt','rgb24','-s','1430x1000','-r','24','-i','pipe:0',
            '-an','-c:v','ffv1','-level','3','-threads','2',str(args.out/'source.mkv')],stdin=subprocess.PIPE)
    started = time.monotonic()
    try:
        for index in range(args.frames):
            raw = pixels(source, 1920, 1080)
            rgb = cv2.warpAffine(raw, np.asarray(geometry['rows'][index]['smoothedMatrix']), (1430, 1000))
            if reference is None:
                reference = rgb.copy()
            planes = [pixels(process, 1430, 1000)[:, :, 0].copy() for process in masks]
            _, person, *states = recurrent.run(None, {'src': rgb.transpose(2, 0, 1)[None].astype(np.float32) / 255,
                'downsample_ratio': np.array([.5], np.float32), **state})
            state = {f'r{n}i': value for n, value in enumerate(states, 1)}
            person = np.rint(person[0, 0].clip(0, 1) * 255).astype(np.uint8)
            support = np.maximum(planes[0], person)
            face_bottom = None
            if args.below_current_face:
                _, faces = detector.detect(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
                if faces is None:
                    raise ValueError('No actual face anchor for bounded clothing recovery')
                x, y, w, h = max(faces, key=lambda f: f[2] * f[3])[:4]
                face_bottom = min(1000, round(y + h * 1.25))
            recovered = classify(rgb, support, person >= 248, reference=reference,
                points=[(.45, .93), (.42, .97)], face_bottom=face_bottom)
            if face_bottom is not None:
                recovered[:face_bottom] = support[:face_bottom]
            planes[0] = recovered
            furniture = recover_fixed_surface(rgb, planes[6], selections['components'][5], reference) if args.prepare_alpha else None
            if furniture is not None:
                planes[6] = furniture
            Image.fromarray(recovered).save(args.out / f'person-{index:04d}.png')
            if source_writer is not None:
                from python_media_worker.studio_subject_matte import mask_geometry
                source_writer.stdin.write(rgb.tobytes())
                for number, plane in enumerate(planes):
                    file = f'component_{number:02d}_{index:04d}.png'
                    path = args.out/'segmentation/component_masks'/file
                    Image.fromarray(plane).save(path)
                    component_rows[number].append({'index':index,'file':file,'sha256':sha(path),**mask_geometry(plane)})
                file = f'matte_{index:04d}.png'
                path = args.out/'segmentation/subject_masks'/file
                union = np.maximum.reduce(planes)
                Image.fromarray(union).save(path)
                union_rows.append({'index':index,'time':index/24,'sourceTick':index*3750,'file':file,'sha256':sha(path),**mask_geometry(union)})
            if index in [0, 1, 6, 9, 12, 18, 23, 24, 36, 47]:
                canvas = Image.new('RGB', (2145, 520))
                for col, (label, mask) in enumerate([('Source', np.full(planes[0].shape, 255, np.uint8)),
                    ('Rejected person selection', planes[0]), ('Current RGB recovery (selection only)', recovered)]):
                    view = Image.composite(Image.fromarray(rgb), Image.new('RGB', (1430, 1000), (85, 90, 95)), Image.fromarray(mask))
                    canvas.paste(view.resize((715, 500)), (col * 715, 20))
                    ImageDraw.Draw(canvas).text((col * 715 + 4, 3), f'{label} | frame {index}', fill='white')
                canvas.save(args.out / f'actual-classification-{index:04d}.jpg', quality=97)
                if furniture is not None:
                    view = Image.composite(Image.fromarray(rgb),Image.new('RGB',(1430,1000),(85,90,95)),
                        Image.fromarray(np.maximum.reduce(planes)))
                    view.save(args.out/f'actual-recovered-union-{index:04d}.jpg',quality=98)
            rows.append({'frame': index, 'recoveredPersonPixels': int((recovered >= 128).sum()),
                'binaryArchiveInputs': True, 'visualPass': False})
            print(json.dumps({'frame': index, 'elapsedSeconds': time.monotonic() - started}), flush=True)
        for process in streams:
            if process.stdout.read(1) or process.wait() != 0:
                raise ValueError('Unexpected source/mask archive frames')
        if source_writer is not None:
            source_writer.stdin.close()
            if source_writer.wait() != 0:
                raise ValueError('Lossless actual source encoder failed')
            from model_workers.adapters.segmentation import sha_json
            from model_workers.common import bundle_masks
            source_hash = sha(args.out/'source.mkv')
            prompt = {'version':1,'source_sha256':source_hash,
                'points':[[p['position'][0]*1430,p['position'][1]*1000] for p in selections['points']],
                'labels':[p['label'] for p in selections['points']], 'shot_prompts':[]}
            common = {'version':1,'kind':'source_bound_subject_matte','source_sha256':source_hash,
                'width':1430,'height':1000,'fps':24.0,'fps_fraction':'24/1','frame_count':args.frames,
                'model':'PRIVATE_REVIEW_BINARY_SELECTION_PLUS_CURRENT_RGB_CLASSIFIER',
                'model_revision':'private-rgb-recovery-20261105','model_weights_sha256':sha(checkpoint),
                'prompt':prompt,'prompt_sha256':sha_json(prompt),'shot_cuts':[],
                'sourceRange':{'startTick':0,'endTick':args.frames*3750},
                'quality':'Unadmitted private current-RGB recovery, binary SAM archives, not original soft model output'}
            choices = [c['selection'] for c in archived_components]
            write_json(args.out/'segmentation/subject_masks/manifest.json',
                {**common,'frames':union_rows,'components':choices,'fixed_roi_current_frame_evaluation':True})
            write_json(args.out/'segmentation/component_masks/manifest.json',
                {**common,'components':[{'selection':c['selection'],'roi':c['roi'],'frames':r}
                    for c,r in zip(archived_components,component_rows)]})
            bundle_masks(args.out/'segmentation/component_masks',args.out/'segmentation/component_masks.tar.gz')
            write_json(args.out/'selection.json',selections)
        write_json(args.out / 'diagnostic.json', {'actualFrames': len(rows), 'rows': rows,
            'belowCurrentFace': args.below_current_face,
            'implementationSha256': sha(args.out / 'implementation.py'),
            'license': 'Previously pinned GPL-3.0 recurrent weights; private local evaluation only',
            'originalSoftSamEvidenceAvailable': False, 'productConfigurationChanged': False,
            'fullMattingOrComposite': False, 'visualPass': False, 'nativeQualification': False})
    finally:
        if source_writer is not None and source_writer.poll() is None:
            source_writer.kill()
            source_writer.wait()
        for process in streams:
            if process.poll() is None:
                process.kill()
                process.wait()
            process.stdout.close()


if __name__ == '__main__':
    main()
