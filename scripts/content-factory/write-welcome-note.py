"""Short factual delivery note from actual retained validation/accounting."""
from pathlib import Path
import json

root=Path(__file__).resolve().parents[2]/'reports/welcome-cinematic-20261009'
validation=json.loads((root/'final-validation.json').read_text())
account=json.loads((root/'cloud-time-accounting.json').read_text())
gpu=json.loads((root/'gpu-final-receipt.json').read_text())
zero=json.loads((root/'gpu-zero-after.json').read_text())
assert validation['status']=='PASS' and zero['activeGpuTasks']==0
def clock(s):
    n=round(s);return f'{n//60}m {n%60:02d}s'
native=next(s for s in gpu['stages'] if s['name']=='native-optix')
studio=next(s for s in gpu['stages'] if s['name']=='existing-studio-final')
text=f'''AutoPromote — One idea. An entire creative world.

Finished film: **38 seconds, 1920×1080, 24 fps, stereo AAC**. Play `outputs/final/final.mp4`; the local player is http://127.0.0.1:8765/. Proxy: `outputs/proxy/final.mp4`.

AutoPromote authored and animated a native Blender world: waking physical Studio, staggered template/VFX cards, timeline-to-ribbon transformation, extruded original AP portal, independent founder/landscape layers, and a dimensional brand assembly. Four photographic textures/cutouts were created with imagegen from the supplied concepts. The original score and sound cues remain separate editable stereo stems. Narration is on-screen text with clean voice-over insertion windows.

The existing Director/Studio kernel assembled five normal generated-media sources, seven editable titles, music and sound effects. `outputs/final/project.json` is the canonical project; `studio-saved-project.json` is its saved Studio snapshot. Open http://127.0.0.1:5007/?fixture=factory&preserve=1 to edit locally. Camera, materials, geometry and animation remain editable in `assets/welcome-world.blend`.

The existing `viral-studio-rtx-qualification` Cloud Run Job used **one RTX PRO 6000** for OptiX ray tracing and NVENC source/final encoding. CPU OpenImageDenoise handled denoising. Native rendering took **{clock(native['seconds'])}**; shared Studio composition/export took **{clock(studio['seconds'])}**.

Total Cloud Run execution elapsed time, including two failures and two cancellations: **{clock(account['totalExecutionElapsedSeconds'])}**. Reported task run time: **{clock(account['totalReportedTaskRunSeconds'])}**. These measured API durations include the documented attempts; they are not a billing estimate.

Full decode, duration/frame count, stereo/headroom, retained-object hashes, and headless muted playback pass. All outputs are persisted. Final audit: **zero active GPU tasks/executions, zero GPU services or warm capacity**. Job definition and production traffic remain unchanged. This is a private deliverable; no welcome page was deployed.
'''
(root/'README.md').write_text(text)
print({'note':str(root/'README.md'),'executionElapsed':clock(account['totalExecutionElapsedSeconds'])})
