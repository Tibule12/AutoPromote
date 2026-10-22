#!/usr/bin/env python3
"""Full authored-box alpha and declared2px boundaries for a native mask edit.

Never fit a shift or retime a frame. Preserve failures and report boundary
qualification separately from strict whole-box alpha agreement.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root))
from python_media_worker.studio_layer_motion import _render_pose, layer_pose
folder = root / "reports/studio-professional-mask-authoring-20261013/proof"
movie = folder / "authored-masks/final.mp4"
receipt = json.loads((folder / "authored-masks/render-receipt.json").read_text())
binding = json.loads((folder / "preview-binding.json").read_text())
assert binding["canonicalHash"] == receipt["projectHash"]
assert binding["projectId"] == receipt["projectId"]
request = json.loads((folder / "authored-masks-render-request.private.json").read_text())["options"]["viralData"]
samples = json.loads((folder / "native-preview.json").read_text())
size = (720, 1280)
asset = Image.open(folder / "opaque-marker.png").convert("RGBA")
sheet = Image.new("RGB", (1440, 1304 * len(samples)))
rows = []
for index, sample in enumerate(samples):
    time = sample["time"]
    assert time * 24 == round(time * 24)
    delivered = folder / f"final-{index}.png"
    subprocess.run(["ffmpeg", "-v", "error", "-threads", "1", "-i", str(movie),
                    "-vf", f"select=eq(n\\,{round(time * 24)})", "-frames:v", "1", "-y", str(delivered)], check=True)
    native_image = Image.open(folder / f"preview-{index}.png").convert("RGB")
    background_image = Image.open(folder / f"background-{index}.png").convert("RGB")
    assert max(abs(a-b) for a,b in zip(native_image.size, background_image.size)) <= 1
    native = np.asarray(native_image.resize(size, Image.Resampling.LANCZOS), dtype=float)
    background = np.asarray(background_image.resize(size, Image.Resampling.LANCZOS), dtype=float)
    final = np.asarray(Image.open(delivered).convert("RGB"), dtype=float)
    direction = np.array([255., 0., 255.]) - background
    denominator = np.maximum(1, np.sum(direction ** 2, axis=2))
    alphas = [np.clip(np.sum((pic-background)*direction, axis=2)/denominator, 0, 1) for pic in (native, final)]
    for overlay in request["overlays"]:
        if overlay["type"] != "image": continue
        layer = next(item for item in request["composition_plan"]["layers"] if item["id"] == overlay["id"])
        pose = layer_pose(layer, overlay, time)
        reference = np.asarray(_render_pose(asset, overlay, layer, pose, size))[..., 3] / 255.
        cx, cy = round(pose["x"]*size[0]/100), round(pose["y"]*size[1]/100)
        hw = round(size[0]*overlay["width"]/100*pose["scale"]/2)
        hh = round(size[1]*overlay["height"]/100*pose["scale"]/2)
        region = np.s_[cy-hh:cy+hh, cx-hw:cx+hw]
        a, b, r = alphas[0][region], alphas[1][region], reference[region]
        errors = [float(np.sqrt(np.mean((one-two)**2))) for one,two in [(a,r),(b,r),(a,b)]]
        contours = []
        for alpha in (a,b,r):
            coverage = np.pad((alpha >= .5).astype(np.uint8), 2)
            contours.append(coverage - cv2.erode(coverage, np.ones((3,3),np.uint8)))
        distances = []
        for contour in contours[:2]:
            measured = np.concatenate([
                cv2.distanceTransform(1-contour,cv2.DIST_L2,cv2.DIST_MASK_PRECISE)[contours[2]>0],
                cv2.distanceTransform(1-contours[2],cv2.DIST_L2,cv2.DIST_MASK_PRECISE)[contour>0],
            ])
            distances.append({"p95Pixels":float(np.percentile(measured,95)),"maximumPixels":float(measured.max())})
        rows.append({"time":time,"mask":layer["effects"]["mask"],
                     "nativeReferenceAlphaRmse":errors[0],"finalReferenceAlphaRmse":errors[1],"nativeFinalAlphaRmse":errors[2],
                     "nativeReferenceBoundary":distances[0],"finalReferenceBoundary":distances[1],
                     "wholeAlphaPassed":max(errors)<=.04,
                     "boundaryPassed":max(d["p95Pixels"] for d in distances)<=2})
    sheet.paste(Image.fromarray(native.astype(np.uint8)),(0,index*1304+24))
    sheet.paste(Image.fromarray(final.astype(np.uint8)),(720,index*1304+24))
    ImageDraw.Draw(sheet).text((5,index*1304+5),f"Native editable masks {time}s | exact CPU final",fill="white")
sheet.save(folder/"paired-masks.jpg",quality=90)
result={"projectId":receipt["projectId"],"canonicalHash":receipt["projectHash"],
        "outputSha256":hashlib.sha256(movie.read_bytes()).hexdigest(),"comparisons":rows,
        "alphaRmseTolerance":.04,"boundaryP95TolerancePixels":2,
        "wholeAlphaPassed":all(row["wholeAlphaPassed"] for row in rows),
        "boundaryPassed":all(row["boundaryPassed"] for row in rows),
        "scope":"Eight actual native/final pairs for one editable polygon/inversion and zero-radius rectangle, with feathering. Whole authored boxes; no fitted alignment, retiming or relaxed tolerance. Full matte/media/effect stack/sound readiness remains open."}
assert result["outputSha256"] == receipt["outputSha256"]
(folder/"paired-masks.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps(result,indent=2))
assert result["boundaryPassed"],"Native mask boundaries exceed the existing2px bound"
if "--strict-alpha" in sys.argv:
    assert result["wholeAlphaPassed"],"Whole mask alpha exceeds the existing.04 bound"
