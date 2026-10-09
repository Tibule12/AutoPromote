"""Prepare a bounded, CPU-only VACE correction package from retained reviewed inputs.

This changes motion conditioning, not source footage. It never runs inference or
claims that the resulting film is accepted. Run it again only into a new folder.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SIZE = (832, 480)
COUNT = 81
SOURCE_SHA = '0f5016cbf1e8af1d327eae9715d14394b26606f9be0919f294890ac0858088fa'
FIRST_SHA = 'b3eb1b794e787906cf7539ed5bd0df180c9c16c98e90364ae320cc455ecb0115'
LAST_SHA = 'ec65d8f80b03608a8a638482d849d4cdc16c02d81f5d6af03fc7ce05388ae462'


def sha(file):
    h = hashlib.sha256()
    with file.open('rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def run(source_root, output):
    control = source_root / 'assets/founder-control-transform-v17/control.mp4'
    first = source_root / 'assets/founder-guided-transform-v16/firstImage.png'
    last = source_root / 'assets/founder-guided-transform-v16/lastImage.png'
    for file, expected in ((control, SOURCE_SHA), (first, FIRST_SHA), (last, LAST_SHA)):
        if sha(file) != expected:
            raise ValueError('Reviewed input changed: ' + str(file))
    if output.exists() and any(output.iterdir()):
        raise FileExistsError('Use a fresh v4 preparation directory; retained work is immutable')
    assets = output / 'gpu-package/assets'
    assets.mkdir(parents=True)
    shutil.copy2(first, assets / 'firstImage.png')
    shutil.copy2(last, assets / 'lastImage.png')
    generator = Path(__file__).parent / 'generate-controlled-video.py'
    shutil.copy2(generator, output / 'gpu-package/generate-controlled-video.py')
    decoded = subprocess.check_output([
        'ffmpeg', '-threads', '1', '-v', 'error', '-i', str(control),
        '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
    frames = np.frombuffer(decoded, dtype=np.uint8).reshape((-1, SIZE[1], SIZE[0], 3))
    if len(frames) != COUNT:
        raise ValueError('Expected exactly 81 structural-control frames')
    # Spend longer with the readable paper hull. The sail/mast starts rising
    # after its triangular crease is established, with no abrupt frame jump.
    anchors = [(0, 0), (16, 9), (32, 23), (48, 40), (64, 60), (80, 80)]
    indices = [round(float(np.interp(i, *zip(*anchors)))) for i in range(COUNT)]
    if indices[0] != 0 or indices[-1] != 80 or max(b-a for a, b in zip(indices, indices[1:])) > 2:
        raise ValueError('Unsafe temporal remap')
    mapped = frames[indices].copy()
    control_out = assets / 'control.mp4'
    subprocess.run([
        'ffmpeg', '-y', '-threads', '1', '-v', 'error', '-f', 'rawvideo',
        '-pix_fmt', 'rgb24', '-s', '832x480', '-r', '16', '-i', 'pipe:0',
        '-c:v', 'libx264rgb', '-threads', '1', '-crf', '0', '-preset', 'fast',
        '-pix_fmt', 'rgb24', str(control_out)], input=mapped.tobytes(), check=True)
    samples = (0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80)
    thumb = (416, 240)
    sheet = Image.new('RGB', (thumb[0] * 4, (thumb[1]+25) * 3), '#090b12')
    draw = ImageDraw.Draw(sheet)
    for n, frame_idx in enumerate(samples):
        x, y = (n % 4) * thumb[0], (n // 4) * (thumb[1]+25)
        sheet.paste(Image.fromarray(mapped[frame_idx]).resize(thumb), (x, y))
        draw.text((x+8, y+244), f'{frame_idx/16:.2f}s  source={indices[frame_idx]/16:.2f}s', fill='white')
    sheet.save(output / 'control-contact-sheet.png')
    parent = json.loads((source_root / 'assets/founder-control-transform-v17/request.json').read_text())
    request = {
        'sourceBrief': parent['sourceBrief'],
        'deadlineEpoch': 0,
        'firstImage': '/work/assets/firstImage.png',
        'firstImageSha256': FIRST_SHA,
        'lastImage': '/work/assets/lastImage.png',
        'lastImageSha256': LAST_SHA,
        'controlVideo': '/work/assets/control.mp4',
        'controlVideoSha256': sha(control_out),
        'referenceMode': 'endpoints_only',
        'seed': 20261008211,
        'prompt': ('One unbroken photographic camera shot, visually continuous from its first frame to its last. '
                   'A handmade folded ivory paper boat on a warm workbench begins to change. Hold long enough '
                   'to recognize the original folded hull. One central paper crease lifts and becomes the mast; '
                   'the same connected paper sail stretches into real cream canvas. Keep the bow and hull clearly '
                   'visible while the folded paper facets become curved wet mahogany planks. The camera eases '
                   'back as the workbench gradually becomes deep reflective blue water around the same vessel. '
                   'Water gains depth and wake only as the hull grows; spray remains light and does not cover the '
                   'material change. End on a full-size working yacht sailing forward in open water, sunlight '
                   'grazing wood and canvas. Natural optical depth, coherent geometry, realistic fluid motion.'),
        'negativePrompt': ('premature mast, disconnected mast, floating sail, second boat, duplicate boat, '
                           'hard cut, jump cut, fade, dissolve, suddenly flooded desk, spray hiding hull, '
                           'miniature, toy, paper boat unchanged on water, plastic, flat water disc, '
                           'cartoon, CGI appearance, blurry, writing, watermark'),
        'reference': {
            'parentControlVideoSha256': SOURCE_SHA,
            'parentRequestSha256': sha(source_root / 'assets/founder-control-transform-v17/request.json'),
            'firstImageSourceSha256': FIRST_SHA,
            'lastImageSourceSha256': LAST_SHA,
            'motionRemapAnchors': anchors,
            'sourceFrameIndices': indices,
            'sourceArtifact': 'Private VACE v17 Canny condition from connected native Blender geometry',
            'creativeReason': 'Delay premature mast and world change; remove extra yacht image reference that may bias early frames.',
            'limitation': 'Conditioning only; result requires decoded-frame and full-film creative review.'}}
    (output / 'gpu-package/request-template.json').write_text(json.dumps(request, indent=2))
    (output / 'preparation-receipt.json').write_text(json.dumps({
        'status': 'PREPARED_CPU_ONLY_PENDING_NVIDIA_GENERATION',
        'sourceControlSha256': SOURCE_SHA,
        'preparedControlSha256': request['controlVideoSha256'],
        'firstImageSha256': FIRST_SHA,
        'lastImageSha256': LAST_SHA,
        'requestTemplateSha256': sha(output / 'gpu-package/request-template.json'),
        'generatorSha256': sha(output / 'gpu-package/generate-controlled-video.py'),
        'frameCount': COUNT, 'fps': 16, 'review': 'Not a generated image or film; no creative acceptance.'}, indent=2))
    print(json.dumps({'status': 'prepared', 'controlSha256': request['controlVideoSha256']}))


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--source-root', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    run(a.source_root.resolve(), a.output.resolve())
