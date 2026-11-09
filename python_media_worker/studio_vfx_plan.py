"""Bounded subject-aware VFX from structured commands and a frozen matte cache.

An internal renderer for Director integration. It does not add unsupported
Director operations, authorize assets, download models, or alter CPU pipelines.
Preview and final invoke the same pixel renderer on the same source/matte/plan.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile
import time

import numpy as np
from PIL import Image, ImageColor, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

try:
    from .studio_subject_matte import CachedSubjectMatte, canonical_hash, sha256, video_geometry
except ImportError:
    from studio_subject_matte import CachedSubjectMatte, canonical_hash, sha256, video_geometry

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FIELDS = {
    "text_behind": {"text", "x", "y", "font_size", "color"},
    "kinetic_type": {"text", "x", "y", "font_size", "color", "tracking", "travel", "align"},
    "background_grade": {"exposure", "saturation", "contrast"},
    "background_replace": {"asset_id", "asset_sha256", "blur", "exposure", "saturation"},
    "tracked_callout": {"text", "offset_x", "offset_y", "font_size", "color", "avoid_subject"},
    "depth": {"amount"},
    "glow": {"color", "strength", "radius"},
    "particles": {"seed", "count", "color", "opacity", "speed"},
    "screen_replace": {"asset_id", "asset_sha256", "corners"},
}


def bounded(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"Expected a finite value in [{low}, {high}]")
    return float(value)


def validate_plan(plan, cache):
    if not isinstance(plan, dict) or set(plan) != {"version", "source_sha256", "matte_sha256", "effects"} or plan["version"] != 1:
        raise ValueError("Expected strict version 1 VFX commands")
    if plan["source_sha256"] != cache.manifest["source_sha256"] or plan["matte_sha256"] != cache.artifact_sha256:
        raise ValueError("VFX plan source or matte identity changed")
    effects = plan["effects"]
    if not isinstance(effects, list) or not 1 <= len(effects) <= 12:
        raise ValueError("Expected 1–12 bounded VFX layers")
    duration = cache.manifest["frame_count"] / cache.manifest["fps"]
    ids = set()
    for effect in effects:
        base = {"id", "type", "start", "end"}
        kind = effect.get("type")
        if kind not in FIELDS or set(effect) != base | FIELDS[kind] or not isinstance(effect["id"], str) or not 1 <= len(effect["id"]) <= 64 or effect["id"] in ids:
            raise ValueError("Unsupported effect, duplicate ID or unknown command fields")
        ids.add(effect["id"])
        start, end = bounded(effect["start"], 0, duration), bounded(effect["end"], 0, duration)
        if start >= end:
            raise ValueError("Effect end must follow start")
        if "color" in effect:
            if not isinstance(effect["color"], str) or len(effect["color"]) != 7 or not effect["color"].startswith("#"):
                raise ValueError("Use an explicit hex effect color")
            ImageColor.getrgb(effect["color"])
        if "text" in effect:
            if not isinstance(effect["text"], str) or not 1 <= len(effect["text"]) <= 120 or any(ord(ch) < 32 for ch in effect["text"]):
                raise ValueError("Effect text must be bounded single-line text")
            bounded(effect["font_size"], 12, 320)
        for field in ("x", "y"):
            if field in effect: bounded(effect[field], 0, 100)
        for field in ("offset_x", "offset_y"):
            if field in effect: bounded(effect[field], -500, 500)
        if kind == "tracked_callout" and not isinstance(effect["avoid_subject"], bool):
            raise ValueError("Callout subject avoidance must be boolean")
        if kind == "kinetic_type":
            bounded(effect["tracking"], 0, 40)
            bounded(effect["travel"], 0, 150)
            if effect["align"] not in {"left", "center", "right"}: raise ValueError("Unknown type alignment")
        if kind in {"background_grade", "background_replace"}:
            bounded(effect["exposure"], -3, 1)
            bounded(effect["saturation"], 0, 2)
        if kind == "background_grade":
            bounded(effect["contrast"], .5, 2)
        if kind == "background_replace":
            bounded(effect["blur"], 0, 60)
            if not isinstance(effect["asset_id"], str) or not 1 <= len(effect["asset_id"]) <= 100: raise ValueError("An approved background asset ID is required")
        if "asset_sha256" in effect and (not isinstance(effect["asset_sha256"], str) or len(effect["asset_sha256"]) != 64
                or any(ch not in "0123456789abcdef" for ch in effect["asset_sha256"])): raise ValueError("Invalid asset hash")
        for field, limits in {"amount": (0, .06), "strength": (0, .6), "radius": (0, 40), "opacity": (0, .6), "speed": (0, 100)}.items():
            if field in effect: bounded(effect[field], *limits)
        if kind == "particles":
            for field, low, high in (("seed", 0, 2**32 - 1), ("count", 1, 80)):
                bounded(effect[field], low, high)
                if not isinstance(effect[field], int): raise ValueError("Particle seed/count must be integers")
        if kind == "screen_replace":
            if not isinstance(effect["asset_id"], str) or len(effect["asset_id"]) > 100 or not isinstance(effect["corners"], list) or len(effect["corners"]) != 4:
                raise ValueError("Screen replacement requires an approved asset ID and four corners")
            for point in effect["corners"]:
                if not isinstance(point, list) or len(point) != 2: raise ValueError("Invalid screen corner")
                bounded(point[0], 0, cache.manifest["width"] - 1)
                bounded(point[1], 0, cache.manifest["height"] - 1)
    return plan


class VfxFrameRenderer:
    def __init__(self, plan, cache, asset_resolver=None):
        self.plan = validate_plan(plan, cache)
        self.cache = cache
        self.assets = {}
        self.fonts = {}
        self.particles = {}
        self.backgrounds = {}
        for effect in plan["effects"]:
            if "font_size" in effect:
                self.fonts[effect["id"]] = ImageFont.truetype(FONT, round(effect["font_size"]))
            if effect["type"] == "particles":
                self.particles[effect["id"]] = np.random.default_rng(effect["seed"]).random((effect["count"], 3))
            if effect["type"] in {"screen_replace", "background_replace"}:
                if asset_resolver is None:
                    raise ValueError("Replacement needs the existing approved asset resolver")
                asset = Path(asset_resolver(effect["asset_id"]))
                if sha256(asset) != effect["asset_sha256"]:
                    raise ValueError("Replacement asset hash differs from the reviewed command")
                if effect["type"] == "background_replace":
                    import cv2
                    geometry = video_geometry(asset)
                    capture = cv2.VideoCapture(str(asset))
                    if not capture.isOpened(): raise ValueError("Background asset could not decode")
                    self.backgrounds[effect["id"]] = (capture, geometry)
                    continue
                with Image.open(asset) as image:
                    if image.width * image.height > 16_000_000: raise ValueError("Screen asset too large")
                    self.assets[effect["id"]] = image.convert("RGBA")

    def render(self, frame, index):
        data = self.cache.manifest
        width, height = data["width"], data["height"]
        if frame.mode != "RGB" or frame.size != (width, height): raise ValueError("Source frame differs from matte canvas")
        alpha = Image.fromarray(self.cache.frame(index))
        time_value = index / data["fps"]
        active = [effect for effect in self.plan["effects"] if effect["start"] <= time_value < effect["end"]]
        background = frame.convert("RGBA")
        for effect in active:
            if effect["type"] == "background_replace":
                import cv2
                capture, geometry = self.backgrounds[effect["id"]]
                asset_index = int((time_value - effect["start"]) * geometry["fps"]) % geometry["frame_count"]
                capture.set(cv2.CAP_PROP_POS_FRAMES, asset_index)
                available, pixels = capture.read()
                if not available: raise ValueError("Reviewed background frame could not decode")
                rgb = ImageOps.fit(Image.fromarray(cv2.cvtColor(pixels, cv2.COLOR_BGR2RGB)), (width, height), method=Image.Resampling.LANCZOS)
                rgb = ImageEnhance.Color(rgb.filter(ImageFilter.GaussianBlur(effect["blur"]))).enhance(effect["saturation"])
                background = ImageEnhance.Brightness(rgb).enhance(2 ** effect["exposure"]).convert("RGBA")
            if effect["type"] == "background_grade":
                rgb = background.convert("RGB")
                rgb = ImageEnhance.Color(rgb).enhance(effect["saturation"])
                rgb = ImageEnhance.Contrast(rgb).enhance(effect["contrast"])
                background = ImageEnhance.Brightness(rgb).enhance(2 ** effect["exposure"]).convert("RGBA")
            if effect["type"] == "depth":
                # Controlled 2.5D separation of the real set and original person.
                amount = effect["amount"] * math.sin(math.pi * (time_value - effect["start"]) / (effect["end"] - effect["start"]))
                scale = 1 + amount
                enlarged = background.filter(ImageFilter.GaussianBlur(amount * 20)).resize((round(width * scale), round(height * scale)), Image.Resampling.BICUBIC)
                left, top = (enlarged.width - width) // 2, (enlarged.height - height) // 2
                background = enlarged.crop((left, top, left + width, top + height))
            if effect["type"] == "screen_replace":
                import cv2
                asset = np.array(self.assets[effect["id"]])
                source = np.float32([[0, 0], [asset.shape[1] - 1, 0], [asset.shape[1] - 1, asset.shape[0] - 1], [0, asset.shape[0] - 1]])
                corners = np.float32(effect["corners"])
                if not cv2.isContourConvex(corners.reshape(-1, 1, 2)) or abs(cv2.contourArea(corners)) < 100:
                    raise ValueError("Screen corners must form a convex nonempty quadrilateral")
                matrix = cv2.getPerspectiveTransform(source, corners)
                projected = cv2.warpPerspective(asset, matrix, (width, height), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
                background.alpha_composite(Image.fromarray(projected))
        for effect in active:
            layer = Image.new("RGBA", (width, height))
            draw = ImageDraw.Draw(layer)
            color = ImageColor.getrgb(effect.get("color", "#ffffff"))
            if effect["type"] == "kinetic_type":
                local, remaining = time_value - effect["start"], effect["end"] - time_value
                progress = max(0, min(1, local / .65))
                eased = 1 - (1 - progress) ** 3
                opacity = max(0, min(1, local / .3, remaining / .3))
                font = self.fonts[effect["id"]]
                text_width = sum(font.getlength(letter) for letter in effect["text"]) + effect["tracking"] * (len(effect["text"]) - 1)
                x = width * effect["x"] / 100
                x -= text_width * {"left": 0, "center": .5, "right": 1}[effect["align"]]
                y = height * effect["y"] / 100 + (1 - eased) * effect["travel"]
                for letter in effect["text"]:
                    draw.text((x, y), letter, font=font, anchor="lm", fill=(*color, round(255 * opacity)))
                    x += font.getlength(letter) + effect["tracking"]
                if progress < 1: layer = layer.filter(ImageFilter.GaussianBlur((1 - eased) * 8))
                background.alpha_composite(layer)
            elif effect["type"] == "text_behind":
                local = time_value - effect["start"]
                opacity = min(1, local / .25, (effect["end"] - time_value) / .25)
                x, y = width * effect["x"] / 100, height * effect["y"] / 100
                draw.text((x, y), effect["text"], font=self.fonts[effect["id"]], anchor="mm",
                          fill=(*color, round(255 * max(0, opacity))), stroke_width=2, stroke_fill=(10, 8, 25, round(180 * max(0, opacity))))
                background.alpha_composite(layer)
            elif effect["type"] == "glow":
                glow = alpha.filter(ImageFilter.GaussianBlur(effect["radius"]))
                glow = glow.point(lambda value: round(value * effect["strength"]))
                layer = Image.new("RGBA", (width, height), (*color, 0))
                layer.putalpha(glow)
                background.alpha_composite(layer)
            elif effect["type"] == "particles":
                for x, y, size in self.particles[effect["id"]]:
                    px = x * width
                    py = (y * height - (time_value - effect["start"]) * effect["speed"]) % height
                    radius = 1 + size * 2
                    draw.ellipse((px - radius, py - radius, px + radius, py + radius), fill=(*color, round(255 * effect["opacity"])))
                background.alpha_composite(layer)
        # Reuse the exact original subject pixels in front of all behind layers.
        subject = frame.convert("RGBA")
        subject.putalpha(alpha)
        background.alpha_composite(subject)
        for effect in active:
            if effect["type"] != "tracked_callout": continue
            centroid = data["frames"][index]["centroid"]
            if not centroid: raise ValueError("Tracked callout has no source subject anchor")
            font = self.fonts[effect["id"]]
            box = font.getbbox(effect["text"])
            label_width, label_height = box[2] - box[0] + 24, box[3] - box[1] + 20
            x = max(8, min(width - label_width - 8, centroid[0] + effect["offset_x"]))
            y = max(8, min(height - label_height - 8, centroid[1] + effect["offset_y"]))
            if effect["avoid_subject"]:
                mask = np.array(alpha)
                bbox = data["frames"][index]["bbox"]
                candidates = [(x, y), (x, 8), (x, height - label_height - 8)]
                if bbox:
                    candidates += [(bbox[0] - label_width - 12, y), (bbox[2] + 12, y),
                                   (x, bbox[1] - label_height - 12), (x, bbox[3] + 12)]
                candidates = [(max(8, min(width - label_width - 8, px)), max(8, min(height - label_height - 8, py))) for px, py in candidates]
                def placement_cost(point):
                    px, py = map(round, point)
                    occupied = np.count_nonzero(mask[py:py + label_height, px:px + label_width] >= 128)
                    return occupied + .001 * math.hypot(px - x, py - y)
                x, y = min(candidates, key=placement_cost)
            color = ImageColor.getrgb(effect["color"])
            draw = ImageDraw.Draw(background)
            draw.line([tuple(centroid), (x + label_width / 2, y + label_height)], fill=(*color, 255), width=2)
            draw.ellipse((centroid[0] - 3, centroid[1] - 3, centroid[0] + 3, centroid[1] + 3), fill=(*color, 255))
            draw.rounded_rectangle((x, y, x + label_width, y + label_height), radius=7, fill=(16, 13, 30, 235), outline=(*color, 255), width=2)
            draw.text((x + 12, y + 10 - box[1]), effect["text"], font=font, fill=(255, 255, 255, 255))
        return background.convert("RGB")


def select_encoder(mode):
    if mode not in {"auto", "cpu", "nvenc"}: raise ValueError("Unknown encoder mode")
    if mode != "cpu":
        result = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=s=320x180:r=24:d=0.1",
            "-frames:v", "1", "-c:v", "h264_nvenc", "-f", "null", "-"], capture_output=True, timeout=30)
        if result.returncode == 0: return "h264_nvenc"
        if mode == "nvenc": raise RuntimeError("Explicit NVIDIA encoding is unavailable: " + result.stderr.decode()[-800:])
    return "libx264"


def render_vfx(source, matte, plan, output, encoder="auto", asset_resolver=None):
    cache = CachedSubjectMatte(matte, source)
    if cache.manifest.get("quality_warnings"):
        raise ValueError("Matte quality warnings need review before composition")
    renderer = VfxFrameRenderer(plan, cache, asset_resolver)
    codec = select_encoder(encoder)
    data = cache.manifest
    count, width, height = data["frame_count"], data["width"], data["height"]
    duration = count / data["fps"]
    target = Path(output)
    if target.exists(): raise ValueError("Refusing to overwrite an existing VFX output")
    target.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="studio-vfx-") as temp:
        intermediate = Path(temp) / "composite.mp4"
        encode_args = ["-preset", "p6", "-rc", "vbr", "-cq", "18", "-b:v", "0"] if codec == "h264_nvenc" else ["-preset", "veryfast", "-crf", "18"]
        decode = ["ffmpeg", "-nostdin", "-v", "error", "-i", str(source), "-map", "0:v:0", "-vsync", "0", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]
        encode = ["ffmpeg", "-nostdin", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", data["fps_fraction"], "-i", "pipe:0",
                  "-i", str(source), "-map", "0:v:0", "-map", "1:a?", "-c:v", codec, *encode_args, "-pix_fmt", "yuv420p", "-c:a", "copy", "-t", str(duration), "-movflags", "+faststart", str(intermediate)]
        with subprocess.Popen(decode, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as reader, subprocess.Popen(encode, stdin=subprocess.PIPE, stderr=subprocess.PIPE) as writer:
            try:
                for index in range(count):
                    raw = reader.stdout.read(width * height * 3)
                    if len(raw) != width * height * 3: raise RuntimeError(f"VFX source ended at frame {index}")
                    composed = renderer.render(Image.frombytes("RGB", (width, height), raw), index).tobytes()
                    digest.update(composed)
                    writer.stdin.write(composed)
                if reader.stdout.read(1): raise RuntimeError("Unexpected source frames")
                writer.stdin.close()
                if reader.wait(timeout=30): raise RuntimeError(reader.stderr.read().decode()[-1500:])
                if writer.wait(timeout=60): raise RuntimeError(writer.stderr.read().decode()[-1500:])
            except BaseException:
                reader.kill(); writer.kill(); reader.wait(); writer.wait(); raise
        probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-of", "json", str(intermediate)], capture_output=True, text=True, check=True).stdout)
        video = next(stream for stream in probe["streams"] if stream["codec_type"] == "video")
        if int(video["nb_read_frames"]) != count or abs(float(video["duration"]) - duration) > 1 / data["fps"]:
            raise RuntimeError("VFX output lost picture frames")
        target.write_bytes(intermediate.read_bytes())
    receipt = {"version": 1, "status": "RENDERED_PENDING_VISUAL_REVIEW", "source_sha256": data["source_sha256"],
               "matte_sha256": cache.artifact_sha256, "plan_sha256": canonical_hash(plan), "pixel_sha256": digest.hexdigest(),
               "output_sha256": sha256(target), "encoder": codec, "frames": count, "seconds": duration,
               "elapsed_seconds": time.monotonic() - started, "effects": [effect["type"] for effect in plan["effects"]],
               "probe": probe, "subject_quality": data["quality"]}
    target.with_suffix(".receipt.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps({"event": "vfx_render_complete", **{key: receipt[key] for key in ("encoder", "frames", "elapsed_seconds", "pixel_sha256")}}), flush=True)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "matte", "plan", "output"): parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--encoder", choices=["auto", "cpu", "nvenc"], default="auto")
    parser.add_argument("--approved-assets", type=Path)
    args = parser.parse_args()
    assets = json.loads(args.approved_assets.read_text()) if args.approved_assets else {}
    # Local CLI maps already-reviewed asset IDs. Cloud ownership still belongs to
    # the caller's existing resolver; this interface accepts no arbitrary URLs.
    resolver = lambda asset_id: assets[asset_id]
    render_vfx(args.source, args.matte, json.loads(args.plan.read_text()), args.output, args.encoder, resolver if assets else None)


if __name__ == "__main__":
    main()
