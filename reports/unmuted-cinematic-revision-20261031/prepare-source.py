"""Private source-bound rotoscope; cached RVM CPU inference, reviewed equipment mask.

Not an application model integration. Requires the locally pinned evaluation
model, never downloads weights, and writes new assets without changing originals.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

os.environ.update(CUDA_VISIBLE_DEVICES="", HF_HUB_OFFLINE="1", OMP_NUM_THREADS="2")
REPORT = Path(__file__).resolve().parent
sys.path.insert(0, str(REPORT / "private-local/matting-deps"))
import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

SOURCE = Path("/home/tibule12/Videos/cam-combiner-60sec.mp4")
MODEL = Path.home() / ".cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx"
CUTS = [(294 / 24, 322 / 24), (471 / 24, 834 / 24)]
hash_file = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
cv2.setNumThreads(1)


def main():
    work = REPORT / "private-local/source"
    work.mkdir(parents=True, exist_ok=False)
    provenance = json.loads((MODEL.parent / "provenance.json").read_text())
    assert hash_file(MODEL) == provenance["sha256"]
    assert hash_file(SOURCE) == "7a16b8ba2eba836eac74bcfb1f830313907ac0e19f314e636d4b7f833643578c"
    # Fixed, declared CFR cut list. The original speech is retained and no
    # generated speech or missing reaction is substituted.
    graph = []
    for i, (a, b) in enumerate(CUTS):
        graph.append(f"[0:v]trim=start={a}:end={b},setpts=PTS-STARTPTS,fps=24,scale=1280:720[v{i}];")
        graph.append(f"[0:a]atrim=start={a}:end={b},asetpts=PTS-STARTPTS,aresample=48000[a{i}];")
    graph.append("[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]")
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(SOURCE), "-filter_complex_threads", "1",
                    "-filter_complex", "".join(graph), "-map", "[v]", "-map", "[a]", "-c:v", "libx264",
                    "-threads", "2", "-crf", "17", "-preset", "fast", "-c:a", "aac", "-b:a", "192k",
                    str(work / "selected-original.mp4")], check=True)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    model = ort.InferenceSession(str(MODEL), sess_options=options, providers=["CPUExecutionProvider"])
    frames = work / "alpha-frames"
    frames.mkdir()
    states = [np.zeros((1, 1, 1, 1), np.float32) for _ in range(4)]
    index, started, reviews = 0, time.monotonic(), []
    for cut, (first, last) in enumerate(CUTS):
        states = [np.zeros((1, 1, 1, 1), np.float32) for _ in range(4)]
        decoder = subprocess.Popen(["ffmpeg", "-v", "error", "-threads", "1", "-ss", str(first),
            "-i", str(SOURCE), "-t", str(last-first), "-an", "-vf", "fps=24,crop=1000:1000:180:50,scale=720:720",
            "-threads", "1", "-pix_fmt", "bgr24", "-f", "rawvideo", "pipe:1"], stdout=subprocess.PIPE)
        for local in range(round((last - first) * 24)):
            timestamp = first + local / 24
            raw = decoder.stdout.read(720*720*3)
            assert len(raw) == 720*720*3, timestamp
            bgr = np.frombuffer(raw, np.uint8).reshape((720,720,3)).copy()
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            tensor = rgb.transpose(2, 0, 1)[None].astype(np.float32) / 255
            _, alpha, *states = model.run(None, {"src": tensor,
                **{f"r{i+1}i": value for i, value in enumerate(states)},
                "downsample_ratio": np.array([.5], np.float32)})
            prior = np.clip(alpha[0, 0], 0, 1)
            mask = np.full((720, 720), cv2.GC_PR_BGD, np.uint8)
            mask[prior > .05] = cv2.GC_PR_FGD
            mask[prior > .95] = cv2.GC_FGD
            mask[245:690, 105:560] = cv2.GC_PR_FGD
            mask[335:580, 235:470] = cv2.GC_FGD
            mask[120:235, 287:415] = cv2.GC_FGD
            mask[:70, :] = cv2.GC_BGD
            mask[:260, :160] = cv2.GC_BGD
            mask[:240, 470:] = cv2.GC_BGD
            mask[:300, 440:] = cv2.GC_BGD
            mask[:, 680:] = cv2.GC_BGD
            mask[:, :25] = cv2.GC_BGD
            bg, fg = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
            cv2.grabCut(bgr, mask, None, bg, fg, 2, cv2.GC_INIT_WITH_MASK)
            matte = np.isin(mask, [cv2.GC_FGD, cv2.GC_PR_FGD]).astype(np.float32)
            # Preserve source-reviewed dark microphone rails, not the old wall
            # between them. The selection is specific to this locked camera.
            matte[:, 585:] = 0
            for a, b in [((407, 378), (719, 310)), ((407, 393), (719, 331))]:
                rail = np.zeros((720, 720), np.uint8)
                cv2.line(rail, a, b, 255, 10)
                matte = np.maximum(matte, ((rail > 0) & (rgb.max(axis=2) < 95)).astype(np.float32))
            matte = cv2.GaussianBlur(matte, (3, 3), .5)
            matte[:245] = np.clip((prior[:245] - .45) / .4, 0, 1)
            matte[:300, 440:] = 0
            rgba = np.dstack([rgb, np.rint(matte * 255).astype(np.uint8)])
            image = Image.fromarray(rgba)
            image.save(frames / f"{index+1:06d}.png")
            if index % 48 == 0 or index in [27, 28, 390]:
                plate = np.array([.1, .14, .2])
                review = Image.fromarray(np.rint((rgb / 255 * matte[:, :, None] +
                    plate * (1 - matte[:, :, None])) * 255).astype(np.uint8))
                reviews.append((index, review.resize((360, 360))))
            index += 1
            if index % 24 == 0:
                print(json.dumps({"frames": index, "seconds": round(time.monotonic() - started, 1)}), flush=True)
        decoder.stdout.close()
        assert decoder.wait() == 0
    assert index == 391
    subprocess.run(["ffmpeg", "-v", "error", "-framerate", "24", "-i", str(frames / "%06d.png"),
        "-vf", "pad=1280:720:280:0:color=black@0,format=argb", "-c:v", "qtrle", "-threads", "2",
        str(work / "presenter-alpha.mov")], check=True)
    assert (work / "presenter-alpha.mov").stat().st_size < 512 * 1024**2
    canvas = Image.new("RGB", (720, ((len(reviews)+1)//2)*360))
    for i, (frame, image) in enumerate(reviews):
        canvas.paste(image, (i % 2 * 360, i // 2 * 360))
    canvas.save(REPORT / "review/moving-matte-contact.jpg")
    result = {"source": SOURCE.name, "sourceSha256": hash_file(SOURCE), "cuts": CUTS,
        "frameCount": index, "fps": 24, "crop": [180, 50, 1180, 1050],
        "model": provenance, "device": model.get_providers(), "gpu": False,
        "method": "Local recurrent person prior + source-colour GrabCut + reviewed equipment selection",
        "limitations": "Source-specific manual rotoscope, not general automatic background replacement",
        "assets": {name: {"path": str(work / name), "sha256": hash_file(work / name)}
            for name in ["presenter-alpha.mov", "selected-original.mp4"]}}
    (work / "source-provenance.json").write_text(json.dumps(result, indent=2))
    print(json.dumps({"completed": True, "frames": index, "seconds": time.monotonic()-started}), flush=True)


if __name__ == "__main__":
    main()
