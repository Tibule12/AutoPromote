AutoPromote — One idea. An entire creative world.

Finished film: **38 seconds, 1920×1080, 24 fps, stereo AAC**. Play `outputs/final/final.mp4`; the local player is http://127.0.0.1:8765/. Proxy: `outputs/proxy/final.mp4`.

AutoPromote authored and animated a native Blender world: waking physical Studio, staggered template/VFX cards, timeline-to-ribbon transformation, extruded original AP portal, independent founder/landscape layers, and a dimensional brand assembly. Four photographic textures/cutouts were created with imagegen from the supplied concepts. The original score and sound cues remain separate editable stereo stems. Narration is on-screen text with clean voice-over insertion windows.

The existing Director/Studio kernel assembled five normal generated-media sources, seven editable titles, music and sound effects. `outputs/final/project.json` is the canonical project; `studio-saved-project.json` is its saved Studio snapshot. Open http://127.0.0.1:5007/?fixture=factory&preserve=1 to edit locally. Camera, materials, geometry and animation remain editable in `assets/welcome-world.blend`.

The existing `viral-studio-rtx-qualification` Cloud Run Job used **one RTX PRO 6000** for OptiX ray tracing and NVENC source/final encoding. CPU OpenImageDenoise handled denoising. Native rendering took **12m 49s**; shared Studio composition/export took **0m 28s**.

Total Cloud Run execution elapsed time, including two failures and two cancellations: **31m 55s**. Reported task run time: **16m 24s**. These measured API durations include the documented attempts; they are not a billing estimate.

Full decode, duration/frame count, stereo/headroom, retained-object hashes, and headless muted playback pass. All outputs are persisted. Final audit: **zero active GPU tasks/executions, zero GPU services or warm capacity**. Job definition and production traffic remain unchanged. This is a private deliverable; no welcome page was deployed.
