"""Local I/O adapter using Studio's existing title, motion, group and audio engine.

No application-server import, .env loading, cloud clients or remote media.
"""
import hashlib
import json
import os
from pathlib import Path
import resource
import shutil
import subprocess
import sys

from studio_audio import build_dialogue_filter
from studio_composition import (blend_layer_block, connect_grouped_layer_blocks,
                                graphic_group_mask, validate_layer_order)
from studio_layer_motion import composition_layer, render_image_layer_motion
from studio_rendered_scene import rendered_scene_block
from studio_text import render_title_asset
from viral_motion_graphics import generate_transparent_motion_overlay, validate_design, write_sound_mix
from viral_render_contract import build_studio_audio_delivery_filter


def emit(**values):
    print(json.dumps(values), flush=True)


def run(command):
    result = subprocess.run(command, capture_output=True, text=True, timeout=300)
    if result.returncode:
        raise RuntimeError(result.stderr[-2500:])


def render(manifest_path):
    work = Path(manifest_path).resolve().parent
    spec = json.loads(Path(manifest_path).read_text())
    plan, profile = spec["plan"], spec["profile"]
    width, height, fps = profile["width"], profile["height"], plan["fps"]
    duration = plan["duration"]
    if spec["version"] != 1 or fps != 24 or not 0 < duration <= 60 or width != 1280 or height != 720:
        raise ValueError("Unsupported programme render manifest")
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_FSIZE, (2 * 1024**3, 2 * 1024**3))
    resource.setrlimit(resource.RLIMIT_AS, (12 * 1024**3, 12 * 1024**3))
    scratch = work / "assembly"
    scratch.mkdir(exist_ok=True)
    for media in [*spec["assets"].values(), *spec["renderedScenes"].values()]:
        if hashlib.sha256(Path(media["path"]).read_bytes()).hexdigest() != media["sha256"]:
            raise ValueError("Programme input changed after submission")
    emit(status="preparing", progress=.05)
    composition = plan["composition"]
    validate_layer_order(composition, [layer["id"] for layer in plan["overlays"]],
                         [scene["id"] for scene in plan["motionScenes"]],
                         [scene["id"] for scene in plan["scenes"]], source_overlays=plan["overlays"])
    inputs, filters, blocks, concat = [], [], [], []
    index = 0
    for i, cut in enumerate(plan["cuts"]):
        media = spec["assets"][cut["assetId"]]
        inputs.extend(["-threads", "1", "-protocol_whitelist", "file,pipe", "-i", media["path"]])
        resize = (f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2"
                  if plan["sourceFit"] == "contain" else
                  f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}")
        filters.append(f"[{index}:v]trim=start={cut['start_time']:.9f}:end={cut['end_time']:.9f},"
                       f"setpts=PTS-STARTPTS,fps={fps},{resize},setsar=1,format=rgba[vcut{i}];")
        if cut["hasAudio"]:
            filters.append(f"[{index}:a]atrim=start={cut['start_time']:.9f}:end={cut['end_time']:.9f},"
                           f"asetpts=PTS-STARTPTS,aresample=48000,"
                           f"aformat=sample_fmts=fltp:channel_layouts=stereo,"
                           f"apad=whole_dur={cut['duration']:.9f},atrim=0:{cut['duration']:.9f}[acut{i}];")
        else:
            filters.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{cut['duration']:.9f}[acut{i}];")
        concat.append(f"[vcut{i}][acut{i}]")
        index += 1
    filters.append(f"{''.join(concat)}concat=n={len(concat)}:v=1:a=1[programme][speech];")
    backdrop = "programme"
    for i, title in enumerate(plan["overlays"]):
        if title["start_time"] >= duration or title["duration"] <= 0:
            continue
        layer = dict(composition_layer(composition, title["id"]) or {})
        animator = None
        if layer.get("text_animator"):
            from studio_text_animator import AnimatedTitle
            animator = AnimatedTitle(title, layer["text_animator"], width, height)
        png, movie = scratch / f"title{i}.png", scratch / f"title{i}.mov"
        geometry = render_title_asset(title, png, width, height)
        layer["title_clip_box"] = geometry["clipBox"]
        styled = {**title, **{key: value for key, value in geometry.items() if key not in ("lines", "clipBox")}}
        receipt = render_image_layer_motion(png, movie, styled, layer, width, height,
                                            duration, None, fps, title_animator=animator)
        inputs.extend(["-itsoffset", str(receipt["start_time"]), "-i", str(movie)])
        output = f"title{i}_out"
        block = [f"[{backdrop}][{index}:v]overlay=0:0:eof_action=pass:repeatlast=0:format=auto[{output}];"]
        window = (receipt["start_time"], receipt["start_time"] + receipt["duration"])
        block = blend_layer_block(block, backdrop, output, layer.get("blend_mode", "normal"),
                                  width, height, duration, f"title{i}_blend", window, fps)
        blocks.append((title["id"], block, backdrop, output))
        index += 1
        emit(status="rendering", progress=.1 + .3 * (i + 1) / max(1, len(plan["overlays"])))
    for i, scene in enumerate(plan["motionScenes"]):
        movie = scratch / f"motion{i}.mov"
        generate_transparent_motion_overlay({"version": 1, "scenes": [scene]}, duration, movie, fps, width, height)
        inputs.extend(["-i", str(movie)])
        output = f"motion{i}_out"
        blocks.append((scene["id"], [f"[{backdrop}][{index}:v]overlay=0:0:eof_action=pass:repeatlast=0:format=auto[{output}];"], backdrop, output))
        index += 1
    for i, scene in enumerate(plan["scenes"]):
        media = spec["renderedScenes"][scene["jobId"]]
        inputs.extend(["-threads", "1", "-protocol_whitelist", "file,pipe", "-i", media["path"]])
        output = f"cinematic{i}_out"
        block = rendered_scene_block(index, backdrop, output, f"cinematic{i}", width, height,
                                     scene["startTime"], scene["duration"])
        blocks.append((scene["id"], block, backdrop, output))
        index += 1
    masks = {}
    for i, group in enumerate(composition.get("groups", [])):
        if not group.get("mask", {}).get("enabled"):
            continue
        matte = scratch / f"mask{i}.png"
        graphic_group_mask(group, width, height).save(matte)
        inputs.extend(["-loop", "1", "-framerate", str(fps), "-i", str(matte)])
        masks[group["id"]] = f"{index}:v"
        index += 1
    graphic_filters, picture = connect_grouped_layer_blocks(blocks, backdrop, composition["order"], composition,
                                                            width, height, duration, None, fps, masks)
    filters.extend(graphic_filters)
    audio, audio_settings = build_dialogue_filter(plan.get("audioRestoration"))
    audio = ",".join(filter(None, (audio, "volume=0" if plan["muteAudio"] else "", build_studio_audio_delivery_filter(duration))))
    cues = plan.get("soundEffects", [])
    if cues:
        if any(not cue.get("builtIn") or cue.get("url") or cue.get("kind") == "voiceover" for cue in cues):
            raise ValueError("Local sound accepts native built-in cues only")
        _, reviewed = validate_design(None, cues)
        sound_path = scratch / "native-sound-design.wav"
        write_sound_mix(sound_path, reviewed, duration,
                        [{"start_time": 0, "end_time": duration, "rate": 1}], {}, channels=2)
        inputs.extend(["-i", str(sound_path)])
        filters.append(f"[speech]{audio}[dialogue];")
        filters.append(f"[dialogue][{index}:a]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,"
                       "alimiter=limit=0.891251:level=disabled:latency=1[sound];")
    else:
        filters.append(f"[speech]{audio}[sound];")
    # Cuts already have a fixed frame grid. Rebase concat's microsecond clock
    # without running a second EOF-rounding frame-rate conversion.
    filters.append(f"[{picture}]settb=1/{fps},setpts=N,format=yuv420p[picture]")
    emit(status="assembling", progress=.55)
    graph = "".join(filters)
    (work / "filtergraph.txt").write_text(graph)
    run(["ffmpeg", "-nostdin", "-v", "error", "-filter_complex_threads", "1", *inputs,
         "-filter_complex_script", str(work / "filtergraph.txt"), "-map", "[picture]", "-map", "[sound]",
         "-c:v", "libx264", "-r", str(fps), "-threads", str(spec["threads"]), "-preset", "fast", "-crf", "18",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", str(duration),
         "-movflags", "+faststart", "-y", str(work / "movie.mp4")])
    probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-count_frames", "-show_entries",
        "stream=codec_type,nb_read_frames,width,height,duration,r_frame_rate", "-of", "json", str(work / "movie.mp4")], text=True))
    video = next(stream for stream in probe["streams"] if stream["codec_type"] == "video")
    frames = round(duration * fps)
    if int(video["nb_read_frames"]) != frames or abs(float(video["duration"]) - duration) > 1 / fps:
        raise ValueError("Programme output does not match the canonical frame clock")
    run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(work / "movie.mp4"), "-f", "null", "-"])
    receipt = {"version": 1, "manifestId": spec["manifestId"], "kind": "studio_programme",
               "documentHash": spec["documentHash"], "frames": frames, "fps": fps, "duration": duration,
               "width": width, "height": height, "probe": probe, "sourceCuts": plan["cuts"],
               "sceneInputs": plan["scenes"], "audioRestoration": audio_settings,
               "audioSource": "original_programme_bus", "embeddedSceneAudioMixed": False, "nativeSoundCues": cues,
               "cost": {"externalCharges": 0, "currency": "USD", "execution": "local_cpu"}}
    (work / "receipt.json").write_text(json.dumps(receipt, indent=2))
    shutil.rmtree(scratch)
    emit(status="completed", progress=1, receipt=receipt)


if __name__ == "__main__":
    try:
        render(sys.argv[1])
    except Exception as error:
        emit(status="failed", error=str(error)[-3000:])
        sys.exit(1)
