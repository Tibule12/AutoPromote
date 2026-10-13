"""Real single-master tracking and frame-cut render proof; not a final editorial cut."""
import argparse
import json
from pathlib import Path
from studio_face_tracking import track_faces
from python_media_worker.main_media_server import build_reviewed_reframe_filter
from viral_motion_graphics import run, probe

parser = argparse.ArgumentParser()
parser.add_argument("--source", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--analysis", help="Reuse saved real detection while checking renderer changes")
args = parser.parse_args()
out = Path(args.output).resolve()
out.mkdir(parents=True, exist_ok=False)
zoom = 1.05
width, height = (9/16)/(16/9)/zoom, 1/zoom
anchor = {"x": width*50+(1-width)*29, "y": height*50+(1-height)*40}
data = json.loads(Path(args.analysis).read_text())["analysis"] if args.analysis else track_faces(args.source, {"solo": anchor}, end=60, mode="source_shots")
keys = [{**key, "x": max(0, min(100, (key["x"]-width*50)/(1-width))),
    "y": max(0, min(100, (key["y"]-height*50)/(1-height)))} for key in data["tracks"]["solo"]["keyframes"]]
(out / "tracking.json").write_text(json.dumps({"analysis": data, "objectPositionKeys": keys, "zoom": zoom}, indent=2))
assert len(data["sceneCuts"]) == 4, data["sceneCuts"]
assert data["tracks"]["solo"]["coverage"] >= .65
assert len([key for key in keys if key["cut"]]) == 4
print(json.dumps({"cuts": data["sceneCuts"], "coverage": data["tracks"]["solo"]["coverage"],
    "cutKeys": [key for key in keys if key["cut"]]}), flush=True)
graph = build_reviewed_reframe_filter(keys, 1080, 1920, zoom=zoom)
video = out / "source-shot-follow-60s.mp4"
run(["ffmpeg", "-v", "error", "-threads", "2", "-i", args.source, "-filter_threads", "2",
     "-vf", graph, "-map", "0:v:0", "-map", "0:a:0", "-t", "60", "-r", "30",
     "-c:v", "libx264", "-threads", "4", "-preset", "fast", "-crf", "18", "-c:a", "copy",
     "-movflags", "+faststart", "-n", str(video)])
info = probe(video)
assert abs(float(info["format"]["duration"])-60) < .1
(out / "probe.json").write_text(json.dumps(info, indent=2))
print(str(video), flush=True)
