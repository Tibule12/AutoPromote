"""Render and inspect the real 60-second podcast with every Motion preset.

This is an offline release proof: it uses the production motion/SFX renderer,
keeps source audio, extracts frames from every scene, and writes machine-readable
QA receipts plus contact sheets. It never calls cloud services.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from viral_motion_graphics import (
    FONT,
    PRESETS,
    SOUNDS,
    draw_motion_frame,
    normalize_motion,
    probe,
    render_motion_and_sound,
    run,
)


COPY = {
    "title": ("THE MOMENT THAT CHANGED IT", "A clear opening statement"),
    "kinetic": ("BUILD TRUST ONE WORD AT A TIME", "Kinetic word cascade"),
    "counter": ("COMMUNITY MILESTONE", ""),
    "comparison": ("NO PLAN", "CLEAR SYSTEM"),
    "lower_third": ("PODCAST GUEST", "Founder · creator · storyteller"),
    "callout": ("NOTICE THE KEY DETAIL", ""),
    "badge": ("WAIT FOR THE PAYOFF", "TRUE STORY"),
    "progress": ("WATCH TO THE END", ""),
    "quote": ("Consistency compounds when the work stays honest.", "@creator · verified"),
    "cta": ("FOLLOW FOR MORE", "New conversations every week"),
    "watermark": ("@AUTOPROMOTE", ""),
}


def ffmpeg_frame(path: Path, time: float) -> np.ndarray:
    info = probe(path)
    video = next(stream for stream in info["streams"] if stream["codec_type"] == "video")
    width, height = int(video["width"]), int(video["height"])
    raw = run([
        "ffmpeg", "-v", "error", "-ss", f"{time:.4f}", "-i", str(path),
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ])
    return np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3)


def pcm(path: Path) -> np.ndarray:
    return np.frombuffer(run([
        "ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1",
        "-ar", "48000", "-f", "f32le", "pipe:1",
    ]), dtype="<f4")


def build_scenes(duration: float):
    colors = ["#a78bfa", "#38bdf8", "#f59e0b", "#10b981", "#ec4899"]
    easings = ["smooth", "linear", "punch", "spring"]
    scenes = []
    for index, preset in enumerate(PRESETS):
        start = 1 + index * 5
        text, secondary = COPY[preset]
        # The source speakers occupy the upper-middle programme area. Alternate
        # between clean lower placements and the portrait-only background wall,
        # while still exercising authored X/Y travel and every easing.
        y = 78 if preset not in {"progress", "watermark"} else 88
        scene = normalize_motion({
            "id": f"proof-{index + 1}-{preset}",
            "preset": preset,
            "design": "editorial" if preset in {"title", "kinetic", "lower_third"} else "card",
            "text": text,
            "secondary": secondary,
            "prefix": "R",
            "value": 50000,
            "startTime": start,
            "duration": min(3.6, duration - start),
            "x": 78 if preset == "watermark" else (44 if index % 2 == 0 else 56),
            "endX": 68 if preset == "watermark" else (56 if index % 2 == 0 else 44),
            "y": y,
            "endY": y - 4,
            "scale": .68 + (index % 3) * .06,
            "endScale": .82 + (index % 2) * .08,
            "rotation": -8 + (index % 3) * 4,
            "endRotation": 8 - (index % 3) * 4,
            "opacity": .94,
            "color": colors[index % len(colors)],
            "easing": easings[index % len(easings)],
        })
        scenes.append(scene)
    return scenes


def make_source(source: Path, destination: Path, width: int, height: int, portrait: bool):
    if portrait:
        graph = (
            f"[0:v]split=2[bg][fg];"
            f"[bg]scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},boxblur=24:6[wall];"
            f"[fg]scale={width}:{height}:force_original_aspect_ratio=decrease[programme];"
            f"[wall][programme]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]"
        )
        command = [
            "ffmpeg", "-v", "error", "-i", str(source), "-t", "60",
            "-filter_complex", graph, "-map", "[v]", "-map", "0:a:0",
        ]
    else:
        command = [
            "ffmpeg", "-v", "error", "-i", str(source), "-t", "60",
            "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                   f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black",
            "-map", "0:v:0", "-map", "0:a:0",
        ]
    command += [
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-y", str(destination),
    ]
    run(command)


def contact_sheet(images, labels, destination: Path, portrait: bool):
    thumb_size = (270, 480) if portrait else (320, 180)
    label_height = 34
    columns = 4
    rows = math.ceil(len(images) / columns)
    sheet = Image.new("RGB", (thumb_size[0] * columns, (thumb_size[1] + label_height) * rows), "#090b12")
    draw = ImageDraw.Draw(sheet)
    face = ImageFont.truetype(str(FONT), 18)
    for index, (image_path, label) in enumerate(zip(images, labels)):
        image = Image.open(image_path).convert("RGB")
        image.thumbnail(thumb_size, Image.Resampling.LANCZOS)
        cell_x = index % columns * thumb_size[0]
        cell_y = index // columns * (thumb_size[1] + label_height)
        x = cell_x + (thumb_size[0] - image.width) // 2
        y = cell_y + (thumb_size[1] - image.height) // 2
        sheet.paste(image, (x, y))
        draw.text((cell_x + 8, cell_y + thumb_size[1] + 6), label, font=face, fill="#f8fafc")
    sheet.save(destination)


def inspect_render(base: Path, result: Path, scenes, output_dir: Path, portrait: bool):
    info = probe(result)
    video = next(stream for stream in info["streams"] if stream["codec_type"] == "video")
    audio = next(stream for stream in info["streams"] if stream["codec_type"] == "audio")
    width, height = int(video["width"]), int(video["height"])
    frames_dir = output_dir / "frames"
    frames_dir.mkdir()
    frame_paths = []
    frame_checks = []
    for index, scene in enumerate(scenes):
        time = scene["startTime"] + min(1.15, scene["duration"] * .45)
        path = frames_dir / f"{index + 1:02d}-{scene['preset']}.png"
        run(["ffmpeg", "-v", "error", "-ss", f"{time:.4f}", "-i", str(result), "-frames:v", "1", "-y", str(path)])
        rendered = ffmpeg_frame(result, time).astype(np.float32)
        clean = ffmpeg_frame(base, time).astype(np.float32)
        alpha_bounds = draw_motion_frame(scenes, time, width, height).getbbox()
        difference = float(np.mean(np.abs(rendered - clean)))
        assert difference > .35, f"{scene['preset']} was not visibly rendered"
        assert alpha_bounds is not None, f"{scene['preset']} produced an empty graphic"
        left, top, right, bottom = alpha_bounds
        assert left >= math.floor(width * .035) and right <= math.ceil(width * .965)
        assert top >= math.floor(height * .035) and bottom <= math.ceil(height * .965)
        frame_paths.append(path)
        frame_checks.append({
            "preset": scene["preset"], "time": time,
            "mean_pixel_difference": difference,
            "graphic_bounds": [left, top, right, bottom],
            "mean_luma": float(rendered.mean()),
        })

    empty_checks = []
    for time in np.linspace(.5, 59.5, 30):
        mean_luma = float(ffmpeg_frame(result, float(time)).mean())
        assert mean_luma > 4, f"Empty/black delivery frame at {time:.2f}s"
        empty_checks.append({"time": float(time), "mean_luma": mean_luma})

    base_pcm, result_pcm = pcm(base), pcm(result)
    sample_count = min(len(base_pcm), len(result_pcm))
    mask = np.ones(sample_count, dtype=bool)
    for scene in scenes:
        first = max(0, int((scene["startTime"] - .05) * 48000))
        last = min(sample_count, int((scene["startTime"] + 1.7) * 48000))
        mask[first:last] = False
    correlation = float(np.corrcoef(base_pcm[:sample_count][mask], result_pcm[:sample_count][mask])[0, 1])
    base_rms = float(np.sqrt(np.mean(base_pcm[:sample_count][mask] ** 2)))
    result_rms = float(np.sqrt(np.mean(result_pcm[:sample_count][mask] ** 2)))
    assert correlation > .985, f"Source audio correlation fell to {correlation:.4f}"
    assert result_rms > .005, "Final audio stream is silent"

    sheet = output_dir / "qa-contact-sheet.png"
    contact_sheet(frame_paths, [item["preset"].replace("_", " ").upper() for item in scenes], sheet, portrait)
    return {
        "file": str(result),
        "duration": float(info["format"]["duration"]),
        "dimensions": [width, height],
        "video_codec": video["codec_name"],
        "audio_codec": audio["codec_name"],
        "audio_sample_rate": int(audio["sample_rate"]),
        "source_audio_correlation_outside_cues": correlation,
        "source_audio_rms_outside_cues": base_rms,
        "result_audio_rms_outside_cues": result_rms,
        "frame_checks": frame_checks,
        "empty_frame_checks": empty_checks,
        "contact_sheet": str(sheet),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    source = Path(args.source).resolve()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    source_info = probe(source)
    assert abs(float(source_info["format"]["duration"]) - 60) < .15
    assert any(stream["codec_type"] == "audio" for stream in source_info["streams"])
    scenes = build_scenes(60)
    tones = list(SOUNDS)
    effects = [{
        "id": f"proof-cue-{index + 1}", "builtIn": True,
        "tone": tones[index % len(tones)], "startTime": scene["startTime"] + .08,
        "duration": 1.2 if tones[index % len(tones)] == "riser" else .62,
        "trimStart": 0, "volume": .24, "fadeIn": .015, "fadeOut": .12,
    } for index, scene in enumerate(scenes)]

    receipts = {}
    with tempfile.TemporaryDirectory(prefix="motion-60s-proof-") as temp:
        for name, width, height, portrait in (
            ("portrait-9x16", 540, 960, True),
            ("landscape-16x9", 960, 540, False),
        ):
            base = Path(temp) / f"{name}-base.mp4"
            result_dir = output / name
            result_dir.mkdir()
            result = result_dir / "all-motion-presets-60s.mp4"
            make_source(source, base, width, height, portrait)
            render_receipt = render_motion_and_sound(
                base, result, {"version": 1, "scenes": scenes}, effects
            )
            inspection = inspect_render(base, result, scenes, result_dir, portrait)
            receipts[name] = {"render": render_receipt, "inspection": inspection}

    receipt_path = output / "qa-results.json"
    receipt_path.write_text(json.dumps({
        "source": str(source),
        "source_duration": float(source_info["format"]["duration"]),
        "motion_presets": list(PRESETS),
        "sound_presets": list(SOUNDS),
        "results": receipts,
        "totals": {"renders_passed": 2, "renders_failed": 0,
                   "motion_presets_passed": len(PRESETS) * 2,
                   "motion_presets_failed": 0,
                   "audio_streams_passed": 2, "audio_streams_failed": 0},
    }, indent=2))
    print(json.dumps({"output": str(output), "receipt": str(receipt_path), "totals": json.loads(receipt_path.read_text())["totals"]}))


if __name__ == "__main__":
    main()
