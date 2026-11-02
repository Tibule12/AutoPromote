"""Isolated local render adapter. No Firebase, cloud credentials or billing imports."""
import json
import os
import resource
import subprocess
import sys
import time
from pathlib import Path


def emit(**values):
    print(json.dumps(values), flush=True)


def run(command, timeout, progress=None):
    with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True) as proc:
        tail = []
        # Parent supervisor enforces wall time and kills the entire process group.
        for line in proc.stdout:
            tail.append(line.rstrip())
            tail = tail[-25:]
            if progress:
                progress(line)
        code = proc.wait(timeout=timeout)
        if code:
            raise RuntimeError(f"Media process exited {code}: " + "\n".join(tail)[-2500:])


def render(manifest_path):
    manifest_path = Path(manifest_path).resolve()
    work = manifest_path.parent
    spec = json.loads(manifest_path.read_text())
    profile = spec["profile"]
    duration, fps = spec["graph"]["duration"], spec["fps"]
    if spec["version"] != 1 or not 4 <= duration <= 10 or fps != 24 or profile["width"] not in (640, 1280):
        raise ValueError("Unsupported local render manifest")
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_FSIZE, (2 * 1024**3, 2 * 1024**3))
    resource.setrlimit(resource.RLIMIT_AS, (12 * 1024**3, 12 * 1024**3))
    os.environ.update({"OMP_NUM_THREADS": str(spec["threads"]), "OPENBLAS_NUM_THREADS": "1", "CUDA_VISIBLE_DEVICES": "", "HIP_VISIBLE_DEVICES": ""})
    count = round(duration * fps)
    roles = ("presenter",) if spec["graph"].get("preset") == "podcast_stage_v1" else ("presenter", "evidence")
    for role in roles:
        asset = spec["assets"][role]
        if asset["duration"] + .001 < duration + asset["offset"]:
            raise ValueError(f"{role} source ends before the requested scene")
        folder = work / role
        folder.mkdir(exist_ok=True)
        emit(status="preparing", progress=.02 if role == "presenter" else .05)
        transparent = spec["graph"].get("preset") == "podcast_stage_v1" and role == "presenter"
        run(["ffmpeg", "-nostdin", "-v", "error", "-threads", "2", "-ss", str(asset["offset"]), "-i", asset["path"],
             "-an", "-vf", f"fps={fps},format=rgba,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color={'black@0' if transparent else 'black'}",
             "-frames:v", str(count), "-threads", "2", "-compression_level", "1", "-y", str(folder / "%06d.png")], 120)
        if len(list(folder.glob("*.png"))) != count:
            raise ValueError("Incomplete source decode; no held/fabricated tail frames")
    (work / "frames").mkdir(exist_ok=True)
    emit(status="rendering", progress=.08)
    def progress(line):
        if "Saved:" in line and ".png" in line:
            done = len(list((work / "frames").glob("*.png")))
            emit(status="rendering", frame=done, frames=count, progress=.08 + .82 * done / count)
    run([spec["blender"], "-b", "--factory-startup", "--disable-autoexec", "-t", str(spec["threads"]),
         "--python-exit-code", "1", "--python", str(Path(__file__).with_name("cinematic_scene.py")), "--", str(manifest_path)], 3600, progress)
    if len(list((work / "frames").glob("*.png"))) != count:
        raise ValueError("Incomplete Blender render")
    emit(status="assembling", progress=.92)
    presenter = spec["assets"]["evidence" if spec["graph"].get("preset") == "podcast_stage_v1" else "presenter"]
    (work / "disclosure.txt").write_text(spec["disclosure"])
    font_size = round(profile["height"] * .025)
    filter_text = (f"drawbox=x=0:y=ih-{font_size*3}:w=iw:h={font_size*3}:color=black@0.72:t=fill,"
                   f"drawtext=fontfile='{spec['font']}':textfile='{work / 'disclosure.txt'}':"
                   f"fontcolor=white:fontsize={font_size}:x=(w-tw)/2:y=h-{font_size*2},format=yuv420p")
    command = ["ffmpeg", "-nostdin", "-v", "error", "-threads", "2", "-framerate", str(fps), "-i", str(work / "frames" / "%04d.png"),
               "-ss", str(presenter["offset"]), "-i", presenter["path"], "-map", "0:v:0", "-map", "1:a:0?",
               "-vf", "format=yuv420p" if spec["graph"].get("preset") == "podcast_stage_v1" else filter_text, "-af", "atrim=duration=" + str(duration) + ",asetpts=PTS-STARTPTS",
               "-c:v", "libx264", "-threads", "2", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
               "-t", str(duration), "-movflags", "+faststart", "-y", str(work / "movie.mp4")]
    run(command, 120)
    result = subprocess.check_output(["ffprobe", "-v", "error", "-count_frames", "-show_entries", "stream=codec_type,nb_read_frames,width,height,duration,r_frame_rate", "-of", "json", str(work / "movie.mp4")], text=True)
    probe = json.loads(result)
    video = next(s for s in probe["streams"] if s["codec_type"] == "video")
    if int(video["nb_read_frames"]) != count:
        raise ValueError("Final frame count does not match the scene")
    run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(work / "movie.mp4"), "-f", "null", "-"], 120)
    receipt = {"version": 1, "manifestId": spec["manifestId"], "renderer": spec.get("renderer", "blender_cycles_cpu"), "frames": count,
               "fps": fps, "duration": duration, "width": profile["width"], "height": profile["height"], "probe": probe,
               "cost": {"externalCharges": 0, "currency": "USD", "execution": "local_graphics" if spec.get("renderer") == "blender_eevee_local" else "local_cpu"}}
    (work / "receipt.json").write_text(json.dumps(receipt, indent=2))
    # Retain source sequences referenced by the editable .blend; remove render scratch.
    import shutil
    for folder in ("frames",):
        shutil.rmtree(work / folder)
    emit(status="completed", progress=1, receipt=receipt)


if __name__ == "__main__":
    try:
        render(sys.argv[1])
    except Exception as error:
        emit(status="failed", error=str(error)[-3000:])
        sys.exit(1)
