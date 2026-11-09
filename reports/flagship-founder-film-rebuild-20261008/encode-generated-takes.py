"""Materialize completed raw GPU takes, without editing or accepting them."""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('/film')
for name in ['ident', 'magic']:
    asset = root / 'assets' / name
    receipt = json.loads((asset / 'render-receipt.json').read_text())
    count = round(receipt['duration'] * 24)
    if sorted(p.name for p in asset.glob('frame-*.png')) != [f'frame-{i:04d}.png' for i in range(count)]:
        raise RuntimeError('Incomplete sequence: ' + name)
    target = asset / 'video.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-threads', '2',
        '-framerate', '24', '-i', str(asset / 'frame-%04d.png'), '-an',
        '-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '17',
        '-b:v', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(target)], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-threads', '2', '-i', str(target),
        '-f', 'null', '-'], check=True)
    metadata = json.loads(subprocess.check_output(['ffprobe', '-v', 'error',
        '-show_streams', '-show_format', '-of', 'json', str(target)]))
    video = next(s for s in metadata['streams'] if s['codec_type'] == 'video')
    if video['nb_frames'] != str(count) or abs(float(metadata['format']['duration']) - receipt['duration']) > 1 / 24:
        raise RuntimeError('Encoded clock mismatch')
    receipt['artifact'] = {'path': 'video.mp4', 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'encoder': 'h264_nvenc', 'metadata': metadata, 'fullDecode': True,
        'audio': 'Raw visual asset only; sound is a separate editorial asset.'}
    (asset / 'render-receipt.json').write_text(json.dumps(receipt, indent=2))
    print(json.dumps({'encoded': name, 'frames': count, 'bytes': target.stat().st_size}), flush=True)
