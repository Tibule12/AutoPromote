"""Verify the private v4 GPU package before staging or running any paid work."""
import hashlib
import json
import sys
from pathlib import Path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(root):
    manifest=json.loads((root/'package-manifest.json').read_text())
    for name,expected in manifest['files'].items():
        path=root/name
        if not path.is_file() or sha(path)!=expected:
            raise SystemExit('V4 package missing or changed: '+name)
    vace=json.loads((root/'request-template.json').read_text())
    ident=json.loads((root/'ident-preview-request-template.json').read_text())
    if vace['deadlineEpoch']!=0 or ident['deadlineEpoch']!=0:
        raise SystemExit('Templates must not retain an old GPU window')
    if vace['referenceMode']!='endpoints_only' or vace['controlVideoSha256']!=sha(root/'assets/control.mp4'):
        raise SystemExit('V4 structural control contract changed')
    if vace['firstImageSha256']!=sha(root/'assets/firstImage.png') or vace['lastImageSha256']!=sha(root/'assets/lastImage.png'):
        raise SystemExit('V4 photographic endpoints changed')
    if ident['logoGeometrySha256']!=sha(root/'logo-geometry.json') or ident['mode']!='preview':
        raise SystemExit('Ident preview or geometry contract changed')
    for shot in ('cascade','capacity-turn'):
        item=json.loads((root/f'{shot}-preview-request-template.json').read_text())
        if item['shot']!=shot or item['mode']!='preview' or item['deadlineEpoch']!=0:
            raise SystemExit('Unexpected story preview template: '+shot)
        if item['fontSha256']!=sha(root/'font.ttf') or item['evidenceSha256']!=sha(root/Path(item['evidencePath']).name):
            raise SystemExit('Story evidence or font changed: '+shot)
    print(json.dumps({'status':'VERIFIED_CPU_ONLY','files':len(manifest['files']),'root':str(root)}))


if __name__=='__main__':
    if len(sys.argv)!=2:
        raise SystemExit('Usage: verify-v4-package.py <gpu-package-dir>')
    main(Path(sys.argv[1]).resolve())
