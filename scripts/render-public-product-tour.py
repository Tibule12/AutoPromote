#!/usr/bin/env python3
"""Edit recorded application footage into the AutoPromote public tour.

FFmpeg composes the footage on CPU; NVIDIA NVENC encodes when its probe passes.
No AI video inference, cloud provisioning, or production requests are performed.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reports/public-product-tour-20261006"
ASSETS = ROOT / "frontend/public/landing"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def run(args):
    result = subprocess.run(args, check=False, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-5000:])
    return result


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--encoder", choices=("auto", "h264_nvenc", "libx264"), default="auto")
    args = parser.parse_args()
    receipt = json.loads((REPORT / "capture-receipt.json").read_text())
    assert receipt["status"] == "PASS" and receipt["productionRequests"] == 0
    captures = {row["name"]: row for row in receipt["captures"]}
    raw = REPORT / "raw/application-workflow.webm"
    output = ASSETS / "product-tour.mp4"
    work = REPORT / "render"
    work.mkdir(exist_ok=True)
    probe = subprocess.run([
        "ffmpeg", "-hide_banner", "-f", "lavfi", "-i", "color=s=640x360:r=30",
        "-t", "1", "-c:v", "h264_nvenc", "-preset", "p4", "-f", "null", "-",
    ], capture_output=True, text=True)
    encoder = args.encoder
    if encoder == "auto":
        encoder = "h264_nvenc" if probe.returncode == 0 else "libx264"
    if encoder == "h264_nvenc" and probe.returncode:
        raise RuntimeError("NVIDIA encoding probe failed; choose --encoder libx264")
    settings = ["-c:v", encoder, "-preset", "p4", "-rc", "vbr", "-cq", "20", "-b:v", "0"] if encoder == "h264_nvenc" else ["-c:v", encoder, "-preset", "medium", "-crf", "20"]
    # Two editorial shots per chapter: workspace context, then the actual control.
    specs = [
        ("uploads", "UPLOADS", "Start with your story.", "Bring in footage. Choose your destinations.", "uploads-before", "uploads-customize", (320, 240, 1200, 675)),
        ("studio", "STUDIO", "Every cut is yours.", "Compare the source. Split the timeline.", "studio-ready", "studio-edit", (440, 430, 820, 460)),
        ("schedule", "SCHEDULE", "Give it a release date.", "Move from the publishing queue to the calendar.", "schedule-list", "schedule-calendar", (300, 200, 1280, 680)),
        ("analytics", "ANALYTICS", "See the next opportunity.", "Explore performance by platform and date range.", "analytics-week", "analytics-month", (300, 250, 1250, 600)),
    ]
    logs = []
    started = time.monotonic()
    for index, (key, label, title, subtitle, first, last, crop) in enumerate(specs):
        begin = max(0, captures[first]["elapsed"] - 0.12)
        end = captures[last]["elapsed"] + (1.1 if key != "uploads" else 0.9)
        duration = end - begin
        assert duration > 0
        title_file, subtitle_file = work / f"{key}-title.txt", work / f"{key}-subtitle.txt"
        title_file.write_text(title)
        subtitle_file.write_text(subtitle)
        x, y, w, h = crop
        # Stretch only the local recording. The product itself is never speed-tested here.
        # Fixed framing after the midpoint is a deliberate cut, not a simulated UI action.
        graph = (
            f"[0:v]trim=duration={duration:.6f},setpts=(PTS-STARTPTS)*{9/duration:.9f},fps=30,split=2[wide][close];"
            "[wide]scale=1360:765:flags=lanczos,pad=1600:900:120:76:color=0x080a12[context];"
            f"[close]crop={w}:{h}:{x}:{y},scale=1360:765:force_original_aspect_ratio=decrease:flags=lanczos,"
            "pad=1360:765:(ow-iw)/2:(oh-ih)/2:color=0x080a12,pad=1600:900:120:76:color=0x080a12[detail];"
            "[context][detail]blend=all_expr='if(lt(T,4.0),A,if(lt(T,4.16),A*(1-(T-4)/0.16)+B*(T-4)/0.16,B))'[edit];"
            "[edit]drawbox=x=120:y=75:w=1360:h=2:color=0xa18aff:t=fill,"
            f"drawtext=fontfile={BOLD}:text='AutoPromote.':x=120:y=30:fontsize=25:fontcolor=white,"
            f"drawtext=fontfile={FONT}:text='{index+1:02d} / {label}':x=w-tw-120:y=36:fontsize=15:fontcolor=0xb9a4ef,"
            "drawbox=x=1100:y=79:w=380:h=30:color=0x080a12@0.95:t=fill,"
            f"drawtext=fontfile={FONT}:text='SAMPLE WORKSPACE / METRICS':x=1120:y=88:fontsize=13:fontcolor=0xc2b6d6,"
            "drawbox=x=0:y=810:w=1600:h=90:color=0x080a12:t=fill,"
            f"drawtext=fontfile={BOLD}:textfile={title_file}:x=120:y=825:fontsize=27:fontcolor=white,"
            f"drawtext=fontfile={FONT}:textfile={subtitle_file}:x=120:y=865:fontsize=15:fontcolor=0xbeb4cf,"
            # The thin moving playhead is repeated in the web chapter controls.
            f"drawtext=fontfile={BOLD}:text='/':x=1470-1350*(1-t/9):y=885:fontsize=14:fontcolor=0xa18aff,"
            "fade=t=in:st=0:d=0.18,fade=t=out:st=8.84:d=0.16,format=yuv420p[out]"
        )
        chapter = work / f"{index+1:02d}-{key}.mp4"
        command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning", "-filter_complex_threads", "2", "-ss", str(begin), "-i", str(raw), "-filter_complex", graph, "-map", "[out]", "-an", "-t", "9", *settings, "-movflags", "+faststart", str(chapter)]
        print(f"Rendering {label} with {encoder}", flush=True)
        result = run(command)
        logs.append({"chapter": key, "start": index * 9, "duration": 9, "sourceStart": begin, "sourceEnd": end, "crop": crop, "encoder": encoder, "stderr": result.stderr})
    playlist = work / "chapters.txt"
    playlist.write_text("".join(f"file '{(work / f'{i+1:02d}-{row[0]}.mp4').as_posix()}'\n" for i, row in enumerate(specs)))
    # A quiet original two-note pulse; no stock music, voices, or invented speech.
    audio = r"aevalsrc=0.065*sin(2*PI*82.41*t)*exp(-9*mod(t\,0.625))+0.025*sin(2*PI*164.82*t)*(0.6+0.4*sin(2*PI*t/9)):s=48000:d=36"
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning", "-f", "concat", "-safe", "0", "-i", str(playlist), "-f", "lavfi", "-i", audio, "-c:v", "copy", "-c:a", "aac", "-b:a", "96k", "-af", "afade=t=in:d=0.6,afade=t=out:st=34.6:d=1.4", "-t", "36", "-movflags", "+faststart", str(output)])
    captions = ["WEBVTT", ""]
    for i, (_, _, title, subtitle, *_rest) in enumerate(specs):
        captions += [f"00:00:{i*9:02d}.000 --> 00:00:{(i+1)*9:02d}.000", f"{title} {subtitle}", ""]
    (ASSETS / "product-tour.vtt").write_text("\n".join(captions))
    for i, row in enumerate(specs):
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", str(i*9+2), "-i", str(output), "-frames:v", "1", "-c:v", "libwebp", "-quality", "85", str(ASSETS / f"product-tour-{row[0]}.webp")])
    (ASSETS / "product-tour.webp").write_bytes((ASSETS / "product-tour-uploads.webp").read_bytes())
    info = json.loads(run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(output)]).stdout)
    assert abs(float(info["format"]["duration"]) - 36) < 0.1
    result = {"status": "PASS", "encoder": encoder, "nvencProbePassed": probe.returncode == 0, "composition": "CPU FFmpeg filters", "videoInference": False, "cloudInstancesCreated": 0, "audio": "Original procedural two-note pulse; no speech", "source": str(raw.relative_to(ROOT)), "sourceSha256": digest(raw), "output": str(output.relative_to(ROOT)), "sha256": digest(output), "bytes": output.stat().st_size, "elapsedSeconds": round(time.monotonic() - started, 3), "chapters": logs, "media": info}
    (REPORT / "render-receipt.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({key: result[key] for key in ("status", "encoder", "bytes", "elapsedSeconds")}))


if __name__ == "__main__":
    main()
