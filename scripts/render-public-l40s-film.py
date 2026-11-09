#!/usr/bin/env python3
"""Render recorded AutoPromote footage on the existing NVIDIA L40S.

CUDA decodes the actual recordings; NVENC encodes every chapter. Typography,
mattes and editorial composition use FFmpeg CPU filters. This is authored
motion design, not generative video or an After Effects source export.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import time


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", type=Path, required=True)
    args = parser.parse_args()
    work = args.work.resolve()
    output = work / "output"
    output.mkdir(exist_ok=True)
    commands = []
    started = time.monotonic()
    receipt = {"status": "RUNNING", "startedAt": datetime.now(timezone.utc).isoformat(),
               "instance": "autopromote-l40s-staging", "productionRequests": 0,
               "createdInstances": 0, "googleCloudRequests": 0,
               "composition": "Authored CPU FFmpeg filters; CUDA decoding; NVIDIA NVENC encoding",
               "generativeVideo": False, "sampleWorkspaceAndMetrics": True,
               "sourceSha256": sha(Path(__file__)), "commands": commands, "chapters": []}

    def run(argv, timeout=180):
        clock = time.monotonic()
        result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        commands.append({"argv": argv, "exitCode": result.returncode,
                         "elapsedSeconds": round(time.monotonic() - clock, 4),
                         "stdout": result.stdout, "stderr": result.stderr})
        if result.returncode:
            raise RuntimeError(result.stderr[-6000:])
        return result.stdout

    def text(name, value):
        path = work / f"{name}.txt"
        path.write_text(value)
        return str(path)

    bold, regular = work / "brand-bold.ttf", work / "brand-regular.ttf"
    raw, creator = work / "application-workflow.webm", work / "podcast-conversation.mp4"
    caption = json.loads((work / "capture-receipt.json").read_text())
    if caption["status"] != "PASS" or caption["productionRequests"] != 0:
        raise RuntimeError("Only the verified sample-workspace recording is permitted")
    captures = {row["name"]: row for row in caption["captures"]}
    receipt["inputs"] = [{"file": p.name, "bytes": p.stat().st_size, "sha256": sha(p)}
                         for p in [raw, creator, bold, regular, work / "capture-receipt.json"]]
    settings = ["-c:v", "h264_nvenc", "-preset", "p6", "-rc", "vbr", "-cq", "19",
                "-b:v", "0", "-pix_fmt", "yuv420p"]
    ff = ["ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "verbose",
          "-filter_complex_threads", "2"]
    specs = [
        ("uploads", "Bring your story in.", "Footage first. Your destinations next.",
         "uploads-before", "uploads-customize", (320, 240, 1200, 675), (300, 175, 1280, 700)),
        ("studio", "Make the cut yours.", "Compare. Reframe. Split the real timeline.",
         "studio-ready", "studio-edit", (340, 430, 1000, 460), (90, 185, 1100, 700)),
        ("schedule", "Give it a release date.", "From the publishing queue to your calendar.",
         "schedule-list", "schedule-calendar", (300, 200, 1280, 680), (300, 205, 1280, 680)),
        ("analytics", "Find your next move.", "Explore performance. Change the perspective.",
         "analytics-week", "analytics-month", (300, 250, 1250, 600), (300, 200, 1250, 600)),
    ]
    try:
        smi = run(["nvidia-smi", "--query-gpu=name,driver_version,memory.total",
                   "--format=csv,noheader,nounits"])
        if "L40S" not in smi:
            raise RuntimeError("This render is restricted to the existing L40S")
        receipt["gpu"] = smi.strip()
        receipt["ffmpegVersion"] = run(["ffmpeg", "-version"]).splitlines()[0]
        for index, (key, title, subtitle, first, last, crop, portrait_crop) in enumerate(specs):
            begin = max(0, captures[first]["elapsed"] - .12)
            end = captures[last]["elapsed"] + (1.1 if key != "uploads" else .9)
            duration = end - begin
            title_file, subtitle_file = text(f"{key}-title", title), text(f"{key}-subtitle", subtitle)
            x, y, width, height = crop
            # The first chapter includes a 2-second licensed creator opening.
            film_duration = 7.4 if index == 0 else 9
            midpoint = film_duration / 2
            effective_duration = duration
            if key == "analytics":
                # Remove the actual range-change loading interval. Retain the
                # recorded seven-day and thirty-day states; invent no metrics.
                effective_duration -= .57
                decoded = (
                    "[0:v]hwdownload,format=nv12,split=2[beforeLoad][afterLoad];"
                    "[beforeLoad]trim=start=0:end=1.1,setpts=PTS-STARTPTS[week];"
                    f"[afterLoad]trim=start=1.67:end={duration:.6f},setpts=PTS-STARTPTS[month];"
                    "[week][month]concat=n=2:v=1:a=0[recorded];"
                    f"[recorded]setpts=PTS*{film_duration/effective_duration:.9f},fps=30,split=2[wide][close];"
                )
            else:
                decoded = (
                    f"[0:v]hwdownload,format=nv12,trim=duration={duration:.6f},"
                    f"setpts=(PTS-STARTPTS)*{film_duration/duration:.9f},fps=30,split=2[wide][close];"
                )
            if key == "studio":
                detail = (
                    "[close]split=2[previewCrop][timelineCrop];"
                    "[previewCrop]crop=1090:320:100:200,scale=1760:517:flags=lanczos,"
                    "pad=1920:1080:80:72:color=0x080a12[previewBase];"
                    "[timelineCrop]crop=1600:260:0:620,scale=1760:286:flags=lanczos[timelineDetail];"
                    "[previewBase][timelineDetail]overlay=x=80:y=610[detail];"
                )
            else:
                detail = (
                    f"[close]crop={width}:{height}:{x}:{y},scale=1760:990:force_original_aspect_ratio=decrease:flags=lanczos,"
                    "pad=1760:990:(ow-iw)/2:(oh-ih)/2:color=0x080a12,pad=1920:1080:80:44:color=0x080a12[detail];"
                )
            graph = (
                decoded +
                "[wide]scale=1760:990:flags=lanczos,pad=1920:1080:80:44:color=0x080a12[context];"
                + detail +
                f"[context][detail]blend=all_expr='if(lt(T,{midpoint}),A,if(lt(T,{midpoint+.14}),"
                f"A*(1-(T-{midpoint})/.14)+B*(T-{midpoint})/.14,B))'[cut];"
                "[cut]drawbox=x=80:y=43:w=1760:h=2:color=0xa18aff:t=fill,"
                "drawbox=x=0:y=930:w=1920:h=150:color=0x080a12:t=fill,"
                f"drawtext=fontfile={bold}:text='AutoPromote':x=80:y=11:fontsize=24:fontcolor=white,"
                f"drawtext=fontfile={regular}:text='{index+1:02d} / {key.upper()}':x=1660:y=15:fontsize=16:fontcolor=0xa18aff,"
                "drawbox=x=1410:y=47:w=430:h=29:color=0x080a12@0.98:t=fill,"
                f"drawtext=fontfile={regular}:text='SAMPLE WORKSPACE / METRICS':x=1450:y=54:fontsize=16:fontcolor=0xc3bacf,"
                "drawbox=x=80:y=960:w=4:h=74:color=0xa18aff:t=fill,"
                f"drawtext=fontfile={bold}:textfile={title_file}:x='110+90*pow(max(0,1-t/.5),3)':y=953:"
                "fontsize=39:fontcolor=white:alpha='min(1,t/.25)',"
                f"drawtext=fontfile={regular}:textfile={subtitle_file}:x=112:y=1009:fontsize=21:fontcolor=0xbeb4cf,"
                f"drawtext=fontfile={bold}:text='/':x='80+1760*t/{film_duration}':y=1052:fontsize=18:fontcolor=0xa18aff,"
                "format=yuv420p[programme]"
            )
            base_inputs = ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-c:v", "vp8_cuvid",
                           "-ss", str(begin), "-i", str(raw)]
            inputs = list(base_inputs)
            if index == 0:
                inputs += ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-c:v", "h264_cuvid", "-i", str(creator)]
                story = text("opening-story", "Your story.")
                screens = text("opening-screens", "Every screen.")
                graph += (
                    ";[1:v]hwdownload,format=nv12,trim=duration=2,setpts=PTS-STARTPTS,fps=30,"
                    "scale=1920:1080:flags=lanczos,drawbox=x=0:y=0:w=1920:h=1080:color=black@0.52:t=fill,"
                    f"drawtext=fontfile={bold}:text='AutoPromote':x=100:y=86:fontsize=38:fontcolor=white,"
                    f"drawtext=fontfile={bold}:textfile={story}:x='100+180*pow(max(0,1-t/.6),3)':y=395:"
                    "fontsize=104:fontcolor=white:alpha='min(1,t/.2)',"
                    f"drawtext=fontfile={bold}:textfile={screens}:x='100+180*pow(max(0,1-(t-.15)/.65),3)':y=515:"
                    "fontsize=104:fontcolor=0xa18aff:alpha='max(0,min(1,(t-.15)/.25))',"
                    "fade=t=in:st=0:d=0.18,format=yuv420p[opening];"
                    "[opening][programme]xfade=transition=diagtl:duration=0.4:offset=1.6[out]"
                )
            elif index == 3:
                outro = text("outro-copy", "Make your next release.")
                graph += (
                    ";[programme]drawbox=x=0:y=0:w=1920:h=1080:color=0x080a12:t=fill:enable='gte(t,7)',"
                    f"drawtext=fontfile={bold}:text='AutoPromote':x=100:y=88:fontsize=38:fontcolor=white:enable='gte(t,7)',"
                    f"drawtext=fontfile={bold}:textfile={outro}:x=100:y=430:fontsize=86:fontcolor=white:enable='gte(t,7)',"
                    f"drawtext=fontfile={regular}:text='START CREATING':x=105:y=580:fontsize=30:fontcolor=0xa18aff:enable='gte(t,7)',"
                    "fade=t=out:st=8.75:d=0.25[out]"
                )
            else:
                graph += ";[programme]null[out]"
            chapter = output / f"{index+1:02d}-{key}.mp4"
            print(f"L40S master / {key}", flush=True)
            run([*ff, *inputs, "-filter_complex", graph, "-map", "[out]", "-an", "-t", "9",
                 *settings, "-movflags", "+faststart", str(chapter)], timeout=240)
            receipt["chapters"].append({"chapter": key, "start": index*9,
                                         "sourceStart": begin, "sourceEnd": end,
                                         "duration": 9, "sha256": sha(chapter),
                                         "removedLoadingInterval": [begin+1.1, begin+1.67] if key == "analytics" else None,
                                         "studioDetail": "Synchronized preview and actual timeline crops" if key == "studio" else None})
            # An independently composed portrait shot; never crop the landscape master.
            px, py, pw, ph = portrait_crop
            head = text(f"{key}-portrait-heading", title.replace(" ", "\n", 1))
            if key == "analytics":
                pdecoded = (
                    "[0:v]hwdownload,format=nv12,split=2[beforeLoad][afterLoad];"
                    "[beforeLoad]trim=start=0:end=1.1,setpts=PTS-STARTPTS[week];"
                    f"[afterLoad]trim=start=1.67:end={duration:.6f},setpts=PTS-STARTPTS[month];"
                    "[week][month]concat=n=2:v=1:a=0[recorded];"
                    f"[recorded]setpts=PTS*{6/effective_duration:.9f},fps=30,"
                )
            else:
                pdecoded = f"[0:v]hwdownload,format=nv12,trim=duration={duration:.6f},setpts=(PTS-STARTPTS)*{6/duration:.9f},fps=30,"
            pgraph = (
                pdecoded +
                f"crop={pw}:{ph}:{px}:{py},scale=980:980:force_original_aspect_ratio=decrease:flags=lanczos,"
                "pad=980:980:(ow-iw)/2:(oh-ih)/2:color=0x10121b,pad=1080:1920:50:520:color=0x080a12,"
                f"drawtext=fontfile={bold}:text='AutoPromote':x=66:y=80:fontsize=44:fontcolor=white,"
                f"drawtext=fontfile={regular}:text='{index+1:02d} / {key.upper()}':x=66:y=193:fontsize=24:fontcolor=0xa18aff,"
                f"drawtext=fontfile={bold}:textfile={head}:x='66+100*pow(max(0,1-t/.5),3)':y=257:"
                "fontsize=62:line_spacing=16:fontcolor=white:alpha='min(1,t/.2)',"
                "drawbox=x=50:y=519:w=980:h=3:color=0xa18aff:t=fill,"
                f"drawtext=fontfile={regular}:text='RECORDED IN AUTOPROMOTE':x=66:y=1580:fontsize=24:fontcolor=0xc3bacf,"
                f"drawtext=fontfile={regular}:text='Sample workspace and metrics':x=66:y=1622:fontsize=24:fontcolor=0x9b91ad,"
                f"drawtext=fontfile={regular}:text='YOUR STORY. EVERY SCREEN.':x=66:y=1790:fontsize=24:fontcolor=white,"
                "fade=t=in:st=0:d=0.13,fade=t=out:st=5.88:d=0.12,format=yuv420p[out]"
            )
            print(f"L40S portrait / {key}", flush=True)
            run([*ff, *base_inputs, "-filter_complex", pgraph, "-map", "[out]", "-an", "-t", "6",
                 *settings, "-movflags", "+faststart", str(output / f"portrait-{index+1:02d}.mp4")], timeout=240)
        for name, chapters, duration in [
            ("product-tour-l40s.mp4", [output / f"{i+1:02d}-{s[0]}.mp4" for i, s in enumerate(specs)], 36),
            ("product-tour-l40s-vertical.mp4", [output / f"portrait-{i+1:02d}.mp4" for i in range(4)], 24),
        ]:
            playlist = output / f"{name}.concat.txt"
            playlist.write_text("".join(f"file '{p}'\n" for p in chapters))
            audio = r"aevalsrc=0.05*sin(2*PI*82.41*t)*exp(-8*mod(t\,0.5))+0.019*sin(2*PI*164.82*t)*(0.6+0.4*sin(2*PI*t/9))+0.026*sin(2*PI*55*t)*exp(-22*mod(t\,0.5)):s=48000:d=" + str(duration)
            target = output / name
            run([*ff, "-f", "concat", "-safe", "0", "-i", str(playlist), "-f", "lavfi", "-i", audio,
                 "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-af", f"afade=t=in:d=0.4,afade=t=out:st={duration-1}:d=1",
                 "-t", str(duration), "-movflags", "+faststart", str(target)])
            probe = json.loads(run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(target)]))
            video = next(s for s in probe["streams"] if s["codec_type"] == "video")
            if int(video["nb_read_frames"]) != duration*30 or abs(float(probe["format"]["duration"])-duration) > .08:
                raise RuntimeError("Film frame count or duration differs")
            run([*ff, "-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-c:v", "h264_cuvid", "-i", str(target),
                 "-map", "0:v:0", "-vf", "hwdownload,format=nv12", "-f", "null", "-"], timeout=120)
            receipt.setdefault("outputs", []).append({"file": name, "sha256": sha(target), "bytes": target.stat().st_size, "probe": probe})
        receipt["status"] = "PASS"
    except Exception as error:
        receipt["status"] = "FAIL"
        receipt["error"] = f"{type(error).__name__}: {error}"
    finally:
        receipt["elapsedSeconds"] = round(time.monotonic()-started, 4)
        receipt["finishedAt"] = datetime.now(timezone.utc).isoformat()
        (output / "render-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
        print(json.dumps({k: receipt.get(k) for k in ["status", "elapsedSeconds", "error"]}), flush=True)
    if receipt["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
