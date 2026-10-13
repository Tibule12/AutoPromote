"""Local production-handler QA. No cloud upload or render credits.

Run from python_media_worker with PYTHONPATH=.. and --output a NEW directory.
Only external ingestion/upload boundaries are replaced; the render graph,
caption renderer, motion renderer, sound synthesis and quality gates are real.
Speech-provider testing is opt-in with --transcribe; render captions are authored.
"""
import argparse
import asyncio
import json
from pathlib import Path
import shutil
import tempfile
from unittest.mock import patch

import numpy as np
from python_media_worker import main_media_server as worker
from viral_motion_graphics import PRESETS, SOUNDS, probe, run


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--source", help="Optional real local footage; read-only")
    parser.add_argument("--speed", type=float, default=1)
    parser.add_argument("--framing", choices=["none", "split", "split-track", "track"], default="none")
    parser.add_argument("--transcribe", action="store_true", help="Also test the configured speech provider and retain its unedited response")
    args = parser.parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory(prefix="studio-handler-qa-") as temp:
        source = Path(temp) / "source.mp4"
        if args.source:
            source_filter = ("fps=30" if args.framing != "none" else
                             "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,fps=30")
            run(["ffmpeg", "-v", "error", "-i", str(Path(args.source).resolve()), "-t", "9",
                 "-vf", source_filter,
                 "-c:v", "libx264", "-threads", "2", "-c:a", "aac", "-n", str(source)])
        else:
            run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=9",
                 "-f", "lavfi", "-i", "sine=frequency=220:duration=9", "-af", "volume=0.15",
                 "-c:v", "libx264", "-threads", "2", "-c:a", "aac", "-shortest", "-n", str(source)])
        if args.transcribe:
            transcript = asyncio.run(worker.transcribe_video({"video_url": str(source), "translate_to_english": "false"}))
            (output / "unedited-local-transcript.json").write_text(json.dumps(transcript, indent=2, default=str))
        presets = list(PRESETS)
        tones = list(SOUNDS)
        assert set(presets) == set(PRESETS)
        assert set(tones) == set(SOUNDS)
        scene_starts = [0.12 + i * 0.72 for i in range(len(presets))]
        sound_starts = [0.2 + i * 0.86 for i in range(len(tones))]
        scenes = [dict(id=f"scene-{i}", preset=preset, text=preset.upper().replace("_", " "),
                       secondary="LOCAL RENDER CHECK", startTime=scene_starts[i], duration=.58,
                       x=50, y=62, endX=50, endY=62, scale=.42, endScale=.42, value=250, prefix="R")
                  for i, preset in enumerate(presets)]
        effects = [dict(id=f"sound-{i}", builtIn=True, tone=tone, startTime=sound_starts[i],
                        duration=.55, volume=.35, fadeIn=.02, fadeOut=.08)
                   for i, tone in enumerate(tones)]
        request = worker.RenderViralRequest(
            video_url="local-qa-source", start_time=0, end_time=9, overlays=[],
            smart_crop=False, professional_cleanup=False, brand_watermark=False,
            auto_captions=True, caption_style="minimal", caption_position="lower",
            caption_segments=[dict(id="corrected-line", start_time=0, end_time=9,
                                   text="Spelling corrected. Preview approved.", language="en",
                                   text_reviewed=True, review_required=False)],
            motionGraphics={"version": 1, "scenes": scenes}, sound_effects=effects,
            preview_speed=args.speed,
            output_settings={"resolution": "source", "fps": "30", "codec": "h264", "quality": "high"},
        )
        if args.framing != "none":
            request.smart_crop = True
            request.smart_crop_mode = "center" if args.framing.startswith("split") else "speaker_track"
            request.finish_plan = {"enabled": False, "reframe": {
                "enabled": True, "mode": request.smart_crop_mode, "aspect": "9:16", "zoom": 1.3,
                "keyframes": [{"time": 0, "x": 29, "y": 50}],
                **({"split_source": {"top": {"x": 34, "y": 47, "zoom": 1.1},
                                     "bottom": {"x": 89, "y": 17, "zoom": 5}}}
                   if args.framing.startswith("split") else {}),
            }}
            if args.framing == "split-track":
                for slot, start, end in [("top", 34, 38), ("bottom", 89, 90)]:
                    frame = request.finish_plan["reframe"]["split_source"][slot]
                    frame["keyframes"] = [{"time": 0, "x": start, "y": frame["y"]},
                                          {"time": 4.5, "x": end, "y": frame["y"]},
                                          {"time": 9, "x": start, "y": frame["y"]}]

        async def local_ingest(url, destination, **kwargs):
            assert url == "local-qa-source", f"Unexpected external ingestion: {url}"
            assert Path(destination).resolve() != source.resolve()
            shutil.copyfile(source, destination)
            return destination

        def local_delivery(path):
            target = output / "motion-sound-corrected-captions.mp4"
            assert not target.exists()
            shutil.copyfile(path, target)
            return str(target)

        def reject_external(*args, **kwargs):
            raise AssertionError("Cloud access is disabled in this local QA run")

        with patch.object(worker, "materialize_video_input", local_ingest), \
             patch.object(worker, "upload_file_to_firebase", local_delivery), \
             patch.object(worker, "update_firestore_job", reject_external):
            receipt = asyncio.run(worker.render_viral_clip(request))
        result = Path(receipt["output_url"])
        info = probe(result)
        assert abs(float(info["format"]["duration"])-9/args.speed) < .1
        assert receipt["audio_proof"]["verified"]
        dimensions = (info["streams"][0]["width"], info["streams"][0]["height"])
        assert dimensions == ((640, 360) if args.framing == "none" else (1080, 1920))
        frames = []
        for i, preset in enumerate(presets):
            time = (scene_starts[i]+.32)/args.speed
            raw = run(["ffmpeg", "-v", "error", "-ss", str(time), "-i", str(result), "-frames:v", "1",
                       "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"])
            baseline = run(["ffmpeg", "-v", "error", "-ss", str(time*args.speed), "-i", str(source), "-frames:v", "1",
                            "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"])
            difference = None
            if args.framing == "none":
                difference = float(np.mean(np.abs(np.frombuffer(raw, np.uint8).astype(float)-np.frombuffer(baseline, np.uint8))))
                assert difference > 1, f"No visible edit at {preset}"
            run(["ffmpeg", "-v", "error", "-ss", str(time), "-i", str(result), "-frames:v", "1",
                 "-n", str(output / f"{i+1}-{preset}.png")])
            frames.append({"preset": preset, "time": time, "mean_pixel_difference": difference})
        pcm = np.frombuffer(run(["ffmpeg", "-v", "error", "-i", str(result), "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"]), "<f4")
        cue_levels = []
        for i, tone in enumerate(tones):
            samples = pcm[int((sound_starts[i]+.02)*48000/args.speed):int((sound_starts[i]+.45)*48000/args.speed)]
            rms = float(np.sqrt(np.mean(samples*samples)))
            assert rms > .005, f"Silent delivery around {tone}"
            cue_levels.append({"tone": tone, "rms": rms})
        (output / "receipt.json").write_text(json.dumps({
            "scope": "Actual production render handler; only ingestion and cloud upload mocked. Authored captions, not ASR proof.",
            "request": request.model_dump(), "result": receipt, "frames": frames, "audio_cues": cue_levels,
        }, indent=2, default=str))
        print(json.dumps({"output": str(result), "frames": len(frames), "sound_cues": len(cue_levels), "audio_verified": True}))


if __name__ == "__main__":
    main()
