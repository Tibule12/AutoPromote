"""Review existing native movies. This script creates no evaluated effects."""
import hashlib
import json
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / 'reports/studio-motion-flow-takeover-20261031/video-texture'
TIMES = [0, 2, 5.5, 6.5, 8.2, 9.9, 10.1, 15.9, 16.1, 23.9, 24.1, 30, 36, 42, 48, 54, 59.9]


def run(args):
    return subprocess.check_output(args)


def probe(file):
    result = json.loads(run(['ffprobe', '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', str(file)]))
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(file), '-f', 'null', '-'], check=True, capture_output=True)
    stream = next(s for s in result['streams'] if s['codec_type'] == 'video')
    assert stream['r_frame_rate'] == '24/1' and int(stream['nb_read_frames']) == 1440
    assert stream['width'] == 1280 and stream['height'] == 720
    result['sha256'] = hashlib.sha256(file.read_bytes()).hexdigest()
    result['fullDecodeClean'] = True
    return result


def main():
    edited = FOLDER / 'native-motion-flow/final.mp4'
    raw = FOLDER / 'native-raw-source/final.mp4'
    result = {'edited': probe(edited), 'raw': probe(raw), 'pairedPictureMeasurements': [],
              'perceptualListeningApproval': False, 'wholePictureParityQualified': False}
    pcm = np.frombuffer(run(['ffmpeg', '-v', 'error', '-i', str(edited), '-vn', '-ar', '48000', '-ac', '2',
                             '-c:a', 'pcm_f32le', '-f', 'f32le', '-']), '<f4').reshape(-1, 2)
    result['audio'] = {'sampleRate': 48000, 'samples': len(pcm), 'channels': 2,
                       'rms': np.sqrt(np.mean(pcm**2, axis=0)).tolist(),
                       'peak': np.abs(pcm).max(axis=0).tolist(),
                       'stereoDifferenceRms': float(np.sqrt(np.mean((pcm[:, 0]-pcm[:, 1])**2)))}
    assert len(pcm) >= 60*48000 and np.abs(pcm).max() < 1
    frames = FOLDER / 'export-frames'
    frames.mkdir(exist_ok=True)
    selection = '+'.join(f'eq(n\\,{round(time*24)})' for time in TIMES)
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(edited), '-vf', f'select={selection}', '-fps_mode', 'vfr', str(frames/'sample-%02d.png')])
    sheet = Image.new('RGB', (1152, 244*6), '#10131c')
    draw = ImageDraw.Draw(sheet)
    for index, time in enumerate(TIMES):
        picture = Image.open(frames/f'sample-{index+1:02d}.png').convert('RGB')
        picture.save(frames/f'{time:.2f}.png')
        preview = FOLDER/f'preview-{time:.2f}.png'
        if preview.exists():
            a = np.array(picture, dtype=float)
            b = np.array(Image.open(preview).convert('RGB').resize(picture.size, Image.Resampling.LANCZOS), dtype=float)
            mse = float(np.mean((a-b)**2))
            result['pairedPictureMeasurements'].append({'time': time, 'rgbRmse': mse**.5,
                'psnrDb': float(10*np.log10(255**2/max(mse, 1e-12))),
                'scope': 'Whole-frame resized screenshot measurement only; no weakened or newly invented parity pass threshold.'})
        picture.thumbnail((384, 216))
        x, y = (index % 3)*384, (index//3)*244
        sheet.paste(picture, (x, y+24))
        draw.text((x+8, y+5), f'{time:.2f}s', fill='white')
    sheet.save(FOLDER/'export-contact-sheet.jpg')
    (FOLDER/'output-verification.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({'frames': 1440, 'seconds': 60, 'sha256': result['edited']['sha256'], 'audioPeak': result['audio']['peak']}))


if __name__ == '__main__':
    main()
