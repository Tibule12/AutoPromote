#!/usr/bin/env python3
"""Acquire the bounded private three-film audio selection, not a stock library.

These licensed files are customer project inputs. Do not bundle/redistribute
Mixkit recordings in the application, reusable template or public project files.
"""
import hashlib
import json
import re
from pathlib import Path
import subprocess
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / 'reports/model-capability-runtime-v1-20261009/proof/launch-template/materials-editing-20261010/materials'
SELECTION = [
    ('music', 1147, 'Midnight Funk', 'Michael Ramir C.', 'funk'),
    ('music', 369, 'Need for speed', 'Arulo', 'hip-hop'),
    ('music', 872, 'Gimme that Groove!', 'Michael Ramir C.', 'funk'),
    ('sfx', 1492, 'Cinematic whoosh fast transition', None, 'cinematic'),
    ('sfx', 1143, 'Cinematic whoosh deep impact', None, 'cinematic'),
    ('sfx', 788, 'Big cinematic impact', None, 'cinematic'),
    ('sfx', 2918, 'Epic movie trailer whoosh impact', None, 'cinematic'),
    ('sfx', 1093, 'Glitch sci fi rewind transition', None, 'cinematic'),
    ('sfx', 2353, 'Magic glitter shot', None, 'cinematic'),
]


def fetch(url, destination):
    subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error',
                    '--max-time', '60', '--user-agent', 'Mozilla/5.0',
                    url, '--output', str(destination)], check=True)


def main():
    FOLDER.mkdir(parents=True, exist_ok=True)
    receipts = []
    for kind, asset_id, title, artist, category in SELECTION:
        url = f'https://assets.mixkit.co/music/{asset_id}/{asset_id}.mp3'
        if kind == 'sfx':
            modal = FOLDER / f'download-{asset_id}.html'
            fetch(f'https://mixkit.co/free-sound-effects/download/{asset_id}/?context=item+grid', modal)
            url = re.search(r'data-download--modal-url-value="([^"]+)"', modal.read_text())[1]
            assert url.startswith(f'https://assets.mixkit.co/active_storage/sfx/{asset_id}/')
        extension = url.rsplit('.', 1)[-1]
        filename = f'mixkit-{kind}-{asset_id}.{extension}'
        destination = FOLDER / filename
        if not destination.exists():
            fetch(url, destination)
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error',
            '-show_entries', 'format=duration,size:stream=codec_type,sample_rate,channels',
            '-of', 'json', str(destination)]))
        assert any(s['codec_type'] == 'audio' for s in probe['streams'])
        license_kind = 'musicFree' if kind == 'music' else 'sfxFree'
        receipts.append({'kind': kind, 'id': asset_id, 'title': title, 'artist': artist,
            'path': str(destination.relative_to(ROOT)), 'sourceUrl': url,
            'listing': f'https://mixkit.co/free-stock-music/{category}/' if kind == 'music'
                else f'https://mixkit.co/free-sound-effects/{category}/',
            'license': f'https://mixkit.co/license/modal/{license_kind}/',
            'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
            'duration': float(probe['format']['duration']), 'bytes': destination.stat().st_size,
            'usage': 'private owned project input; incorporated movie only; no raw stock/template redistribution',
            'creativeListening': 'pending founder review'})
        print(f'Prepared {kind}: {title}', flush=True)
    pages = {
        'hip-hop': 'https://mixkit.co/free-stock-music/hip-hop/',
        'funk': 'https://mixkit.co/free-stock-music/funk/',
        'cinematic': 'https://mixkit.co/free-sound-effects/cinematic/',
        'music-license': 'https://mixkit.co/license/modal/musicFree/',
        'sfx-license': 'https://mixkit.co/license/modal/sfxFree/',
        'terms': 'https://mixkit.co/terms/',
    }
    for name, url in pages.items():
        fetch(url, FOLDER / f'{name}.html')
    (FOLDER / 'receipts.json').write_text(json.dumps({'createdAt': datetime.now(timezone.utc).isoformat(),
        'items': receipts, 'musicCount': 3, 'sampledSfxCount': 6, 'paidJobs': 0}, indent=2))


if __name__ == '__main__':
    main()
