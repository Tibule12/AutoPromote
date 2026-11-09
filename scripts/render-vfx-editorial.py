#!/usr/bin/env python3
"""Authored 13-second review cut from actual footage and reviewed GPU assets."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--film-work", type=Path, required=True)
    parser.add_argument("--closing", type=Path, required=True)
    parser.add_argument("--output-name", default="cinematic-editorial")
    args = parser.parse_args()
    if not args.output_name.replace("-", "").isalnum(): raise ValueError("Invalid output name")
    out = args.work / args.output_name
    out.mkdir(exist_ok=False)
    commands = []
    def run(command):
        result = subprocess.run(command, capture_output=True, text=True, timeout=240)
        commands.append({"argv": command, "exit_code": result.returncode, "stderr": result.stderr[-2500:]})
        if result.returncode: raise RuntimeError(result.stderr[-4000:])
        return result.stdout
    inventory = run(["nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"])
    if "NVIDIA L40S" not in inventory: raise RuntimeError("Existing authorized NVIDIA L40S required")
    bold = args.film_work / "brand-bold.ttf"
    regular = args.film_work / "brand-regular.ttf"
    ff = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-filter_complex_threads", "2"]
    encode = ["-c:v", "h264_nvenc", "-preset", "p6", "-rc", "vbr", "-cq", "17", "-b:v", "0", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart"]
    bars = "drawbox=x=0:y=0:w=iw:h=66:color=0x07070b:t=fill,drawbox=x=0:y=ih-66:w=iw:h=66:color=0x07070b:t=fill"
    def chapter(name, source, duration, graph, seek=None):
        command = [*ff, "-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-c:v", "vp8_cuvid" if source.suffix == ".webm" else "h264_cuvid"]
        if seek is not None: command += ["-ss", str(seek)]
        command += ["-i", str(source), "-vf", "hwdownload,format=nv12,setpts=PTS-STARTPTS," + graph + "," + bars,
                    "-frames:v", str(round(duration * 30)), "-r", "30", *encode, str(out / (name + ".mp4"))]
        run(command)
    chapter("01-lens", args.work / "generated/creative-lens.mp4", 1.8,
        f"scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,"
        f"drawtext=fontfile={bold}:text='AutoPromote':x=112:y=103:fontsize=30:fontcolor=0xf5f1ed,"
        f"drawtext=fontfile={bold}:text='MAKE IT MOVE.':x='112+80*pow(max(0,1-t/.55),3)':y=765:fontsize=94:fontcolor=0xf5f1ed:alpha='min(1,t/.25)',"
        "fade=t=in:st=0:d=0.2", seek=.3)
    chapter("02-voice", args.work / "vfx-cinematic-stage.mp4", 6,
        f"fps=30,drawtext=fontfile={regular}:text='AUTOPROMOTE / CREATIVE STUDIO':x=112:y=103:fontsize=20:fontcolor=0xf5f1ed")
    recording = args.film_work / "application-workflow.webm"
    capture = json.loads((args.film_work / "capture-receipt.json").read_text())
    if capture["status"] != "PASS" or capture["productionRequests"] != 0: raise RuntimeError("Verified local app recording required")
    begin = next(item["elapsed"] for item in capture["captures"] if item["name"] == "studio-ready")
    chapter("03-studio", recording, 2.2,
        "scale=1920:948:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x07070b,fps=30", seek=begin)
    close = out / "04-close.mp4"
    run([*ff, "-f", "lavfi", "-i", "color=c=0x080710:s=1920x1080:r=30:d=3", "-i", str(args.closing),
         "-filter_complex", f"[1:v]scale=1920:1080[title];[0:v][title]overlay=0:0:format=auto,{bars},fade=t=out:st=2.72:d=0.28[out]",
         "-map", "[out]", "-t", "3", *encode, str(close)])
    chapters = [out / f"{name}.mp4" for name in ("01-lens", "02-voice", "03-studio", "04-close")]
    listing = out / "chapters.txt"
    listing.write_text("".join(f"file '{file}'\n" for file in chapters))
    audio = r"aevalsrc=0.07*sin(2*PI*55*t)*exp(-14*mod(t\,0.6))+0.026*sin(2*PI*110*t)*(0.5+0.5*sin(2*PI*t/13))+0.014*sin(2*PI*220*t):s=48000:d=13"
    target = out / "autopromote-vfx-review.mp4"
    voice = args.work / "vfx-cinematic-stage.mp4"
    voice_probe = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(voice)]))
    if not any(stream["codec_type"] == "audio" for stream in voice_probe["streams"]):
        raise RuntimeError("The source chapter must retain its original speaker audio")
    sound = "[2:a]atrim=0:6,asetpts=PTS-STARTPTS,adelay=1800:all=1,apad=whole_dur=13[voice];" \
            "[1:a]volume=0.16[bed];[bed][voice]amix=inputs=2:duration=longest:normalize=0," \
            "afade=t=in:d=0.3,afade=t=out:st=11.9:d=1.1[sound]"
    run([*ff, "-f", "concat", "-safe", "0", "-i", str(listing), "-f", "lavfi", "-i", audio, "-i", str(voice),
         "-filter_complex", sound, "-map", "0:v:0", "-map", "[sound]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", "13", "-movflags", "+faststart", str(target)])
    probe = json.loads(run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(target)]))
    video = next(item for item in probe["streams"] if item["codec_type"] == "video")
    if int(video["nb_read_frames"]) != 390 or abs(float(video["duration"]) - 13) > .04: raise RuntimeError("Editorial output clock changed")
    receipt = {"status": "RENDERED_PENDING_PLAYBACK_REVIEW", "created_at": datetime.now(timezone.utc).isoformat(),
        "gpu": inventory.strip(), "frames": 390, "duration": 13, "output_sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "pipeline": "Reviewed Wan opening/background; SAM2 original subject; authored CPU typography/compositing; OptiX brand close; CUDA decode and NVENC encode",
        "audio": "Original speaker audio retained from 1.8–7.8 seconds; quiet original synthesized bed; no invented voice or transcript", "commands": commands, "probe": probe}
    (out / "receipt.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps({"output": str(target), "frames": 390, "duration": 13}))


if __name__ == "__main__": main()
