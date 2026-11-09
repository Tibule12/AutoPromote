"""Check the existing authored bottom strip against real pixels, no admission."""
import copy
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from PIL import Image, ImageDraw

from model_workers.common import sha, write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    private = Path('reports/background-replacement-20261101/private')
    out = private/'source-border-exclusion-r313-20261107'
    out.mkdir(mode=0o700, exist_ok=False)
    work = Path('/tmp/autopromote-application-demo-FDokC2/subject-previews/1d977b58-4f18-4bd7-a6a3-7e37ec9e61ac')
    cache = CachedSubjectMatte(work/'matte', work/'source.mp4')
    effects = json.loads((work/'spec.json').read_text())['spec']['scene']['effects']
    adjusted = copy.deepcopy(effects)
    clear = next(e for e in adjusted if e['id'] == 'background-edge-cleanup')
    assert clear['clear_box'] == [0, .992, 1, 1]
    clear['clear_box'] = [0, 0, 0, 0]
    for index in [15, 47]:
        rgb = Image.open(private/f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png').convert('RGB')
        alpha_file = private/f'current-native-opaque-body-r304-20261107/alpha-{index:04d}.png'
        alpha = np.array(Image.open(alpha_file))
        identity = sha(alpha_file)
        candidate = SimpleNamespace(manifest=cache.manifest, artifact_sha256=identity,
                                    observed_background=cache.observed_background, frame=lambda _: alpha)
        renderer = VfxFrameRenderer({'version': 1, 'source_sha256': cache.manifest['source_sha256'],
            'matte_sha256': identity, 'effects': adjusted}, candidate, lambda _: private/'replacement.png')
        renderer.foreground_cache.root = None
        result = renderer.render(rgb, index)
        result.save(out/f'actual-composite-{index:04d}.png')
        old = Image.open(private/f'current-native-opaque-body-r304-20261107/actual-composite-{index:04d}.png').convert('RGB')
        box = (430, 940, 1250, 1000)
        sheet = Image.new('RGB', (820, 252))
        for number, (label, picture) in enumerate([('Actual source', rgb), ('Existing full-width strip exclusion', old), ('Same alpha without strip exclusion', result)]):
            sheet.paste(picture.crop(box), (0, number*84+24))
            ImageDraw.Draw(sheet).text((4, number*84+4), label, fill='white')
        sheet.resize((1640, 504)).save(out/f'actual-lower-{index:04d}.jpg', quality=98)
    write_json(out/'receipt.json', {'frames': [15, 47], 'sameSourceAndAlpha': True,
        'onlyEffectChange': {'from': [0, .992, 1, 1], 'to': [0, 0, 0, 0]},
        'nativeAdmission': False, 'visualReviewPending': True, 'fourMinuteProof': False})


if __name__ == '__main__':
    main()
