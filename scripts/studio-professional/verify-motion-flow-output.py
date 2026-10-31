#!/usr/bin/env python3
"""Inspect existing native outputs; this tool never authors evaluated effects."""
import hashlib
import json
import os
import subprocess
from pathlib import Path

import numpy as np
import cv2
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion, distance_transform_edt
from scipy.spatial import ConvexHull

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / 'reports/studio-motion-flow-takeover-20261031'
BASE_FOLDER = FOLDER
VARIANT = os.environ.get('STUDIO_MOTION_VARIANT')
if VARIANT in {'cinematic', 'dialogue'}:
    FOLDER = FOLDER / VARIANT


def run(args):
    return subprocess.run(args, check=True, capture_output=True).stdout


def probe(path):
    info = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]))
    check = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'null', '-'], capture_output=True)
    assert check.returncode == 0 and not check.stderr, check.stderr.decode()
    info['fullDecodeClean'] = True
    info['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    return info


def audio(path):
    return np.frombuffer(run(['ffmpeg', '-v', 'error', '-i', str(path), '-vn', '-acodec', 'pcm_f32le',
                             '-ar', '48000', '-ac', '2', '-f', 'f32le', '-']), dtype='<f4').reshape(-1, 2)


def parity(a, b):
    union = (a | b).sum()
    ea, eb = a ^ binary_erosion(a), b ^ binary_erosion(b)
    if not union or not ea.any() or not eb.any():
        return {'iou': 0, 'boundaryP95Px': None, 'pass': False}
    distances = np.r_[distance_transform_edt(~eb)[ea], distance_transform_edt(~ea)[eb]]
    iou, p95 = float((a & b).sum() / union), float(np.percentile(distances, 95))
    return {'iou': iou, 'boundaryP95Px': p95, 'previewArea': int(a.sum()), 'exportArea': int(b.sum()),
            'pass': iou >= .95 and p95 <= 2}


def clock_mask(image, side):
    rgb = np.asarray(image.convert('RGB')).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mask = (r > 130) & (g > 90) & (b < 160) & (r > b * 1.25) & (g > b * 1.15)
    h, w = mask.shape
    roi = np.zeros_like(mask)
    x0, x1 = (.02, .43) if side == 'source' else (.60, .98)
    roi[int(h*.16):int(h*.69), int(w*x0):int(w*x1)] = True
    return mask & roi


def outline_hull(mask):
    # Keep the dial's largest connected outline, excluding detached evidence
    # callout strokes that may enter the same comparison crop.
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype('uint8'), 8)
    if count > 1:
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        mask = labels == largest
    y, x = np.nonzero(mask)
    if len(x) < 3:
        return mask
    points = np.column_stack([x, y])
    hull = ConvexHull(points)
    image = Image.new('1', (mask.shape[1], mask.shape[0]))
    ImageDraw.Draw(image).polygon([tuple(p) for p in points[hull.vertices]], fill=1)
    return np.asarray(image).astype(bool)


def main():
    edited = FOLDER / 'native-motion-flow/final.mp4'
    raw = BASE_FOLDER / 'native-raw-source/final.mp4'
    info = probe(edited)
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    sound = next(s for s in info['streams'] if s['codec_type'] == 'audio')
    assert video['r_frame_rate'] == '24/1' and sound['channels'] == 2
    pcm = audio(edited)
    report = {'edited': info, 'audio': {
        'sampleRate': 48000, 'samples': len(pcm), 'channels': 2,
        'rms': np.sqrt(np.mean(pcm**2, axis=0)).tolist(),
        'peak': np.max(np.abs(pcm), axis=0).tolist(),
        'stereoDifferenceRms': float(np.sqrt(np.mean((pcm[:, 0]-pcm[:, 1])**2))),
        'channelCorrelation': float(np.corrcoef(pcm.T)[0, 1]),
        'perceptualListeningApproval': False}, 'clockGeometryPairs': [], 'strictGoldEdgePairs': []}
    if raw.exists():
        report['raw'] = probe(raw)
        reference = audio(raw)
        n = min(len(reference), len(pcm))
        report['audio']['nativeRawCorrelation'] = [float(np.corrcoef(pcm[:n, c], reference[:n, c])[0, 1]) for c in range(2)]
        report['audio']['nativeRawSampleDifference'] = len(pcm)-len(reference)
        # Inspect overlap/cut windows as well as the complete signal.
        report['audio']['cutWindowCorrelations'] = []
        for t in [6.7666666667, 8.009]:
            a, b = int((t-.25)*48000), min(n, int((t+.25)*48000))
            report['audio']['cutWindowCorrelations'].append({'programmeTime': t,
                'channels': [float(np.corrcoef(pcm[a:b, c], reference[a:b, c])[0, 1]) for c in range(2)]})
    pictures = []
    (FOLDER / 'export-frames').mkdir(exist_ok=True)
    for t in [0, 1.5, 3.5, 5, 6.5, 6.8, 7.5, 8.1, 9.5, 11, 12.5, 13.5, 14.5, 15.5]:
        destination = FOLDER / 'export-frames' / f'{t:.2f}.png'
        run(['ffmpeg', '-v', 'error', '-y', '-i', str(edited), '-vf', f'select=eq(n\\,{round(t*24)})',
             '-frames:v', '1', str(destination)])
        image = Image.open(destination).convert('RGB')
        preview_path = FOLDER / f'preview-{t:.2f}.png'
        if VARIANT != 'dialogue' and t in [11, 12.5, 13.5] and preview_path.exists():
            preview = Image.open(preview_path).convert('RGB').resize(image.size, Image.Resampling.LANCZOS)
            for side in ['source', 'studio']:
                p, e = clock_mask(preview, side), clock_mask(image, side)
                report['strictGoldEdgePairs'].append({'time': t, 'side': side, **parity(p, e)})
                report['clockGeometryPairs'].append({'time': t, 'side': side,
                    **parity(outline_hull(p), outline_hull(e))})
        image.thumbnail((384, 216))
        pictures.append((t, image.copy()))
    sheet = Image.new('RGB', (384*3, 244*5), '#10131c')
    draw = ImageDraw.Draw(sheet)
    for i, (t, picture) in enumerate(pictures):
        x, y = (i % 3)*384, (i // 3)*244
        sheet.paste(picture, (x, y+24)); draw.text((x+8, y+6), f'{t:.2f}s', fill='white')
    sheet.save(FOLDER / 'export-contact-sheet.jpg', quality=92)
    if VARIANT == 'dialogue':
        destination = FOLDER / 'export-frames' / 'voice-10.9.png'
        run(['ffmpeg', '-v', 'error', '-y', '-i', str(edited), '-vf',
             f'select=eq(n\\,{round(10.9*24)})', '-frames:v', '1', str(destination)])
        exported = Image.open(destination).convert('RGB')
        preview = Image.open(FOLDER / 'composition-10.9.png').convert('RGB').resize(exported.size, Image.Resampling.LANCZOS)
        def voice_mask(im):
            rgb = np.asarray(im).astype(np.int16)
            r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
            mask = (r > 130) & (g > 90) & (b < 180) & (r > b*1.25) & (g > b*1.15)
            h, w = mask.shape
            roi = np.zeros_like(mask)
            roi[int(.60*h):int(.715*h), int(.04*w):int(.36*w)] = True
            return mask & roi
        report['voiceContourPair'] = {'time': 10.9, **parity(voice_mask(preview), voice_mask(exported)),
            'scope': 'Single native contour raster pair, unchanged IoU .95 / p95 2px limits; not whole-picture parity.'}
    small = np.frombuffer(run(['ffmpeg', '-v', 'error', '-i', str(edited), '-vf', 'scale=160:90,format=gray',
                              '-f', 'rawvideo', '-']), dtype=np.uint8).reshape(-1, 90, 160).astype(np.float32)
    differences = np.mean(np.abs(np.diff(small, axis=0)), axis=(1, 2))
    report['continuousPicture'] = {'decodedFrames': len(small), 'identicalAdjacentFrames': int((differences == 0).sum()),
        'minimumAdjacentMeanDifference': float(differences.min()), 'medianAdjacentMeanDifference': float(np.median(differences)),
        'scope': 'Full decoded sequence numerical motion check; not a perceptual smoothness qualification.'}
    report['scope'] = ('Actual native exports. Clock geometry measures the convex silhouette of the isolated gold outline; '
                       'strictGoldEdgePairs separately retains thin-stroke colour/raster failures. '
                       'No whole-picture, listening or creative approval inferred.')
    if VARIANT == 'dialogue':
        report['scope'] = 'Dialogue-led revision; no clock graphics. Native contour pair and complete decode/audio measurements do not establish cinematic, listening or whole-picture approval.'
    (FOLDER / 'output-verification.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'frames': len(small), 'channels': sound['channels'], 'geometryPairs': report['clockGeometryPairs'],
                      'stereoDifferenceRms': report['audio']['stereoDifferenceRms']}))


if __name__ == '__main__':
    main()
