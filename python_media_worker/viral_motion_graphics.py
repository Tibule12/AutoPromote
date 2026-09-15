"""V1 motion/SFX renderer. No network calls or application imports.

All edit times precede speed changes. Both the browser and worker evaluate
motion and deterministic sound from that clock, including seeks and speed ranges.
"""
import functools
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

PRESETS = ("brand_reveal", "title", "kinetic", "counter", "comparison", "lower_third", "callout", "watermark", "badge", "progress", "quote", "cta")
SOUNDS = ("sweep", "impact", "pop", "click", "riser", "chime", "reverse", "glitch", "subdrop")
FONT = Path(__file__).parent / "assets/fonts/StudioMotion-Bold.ttf"
SAMPLE_RATE = 48000


def bound(value, low, high, default=None):
    try:
        number = float(value)
        if math.isfinite(number):
            return max(low, min(high, number))
    except (ValueError, TypeError):
        pass
    return low if default is None else default


def clean(value, length):
    return re.sub(r"[\x00-\x1f<>]", " ", str(value or ""))[:length]


def normalize_motion(raw):
    s = raw or {}
    result = {"id": clean(s.get("id"), 100), "preset": s.get("preset") if s.get("preset") in PRESETS else "title",
              "design": "editorial" if s.get("design") == "editorial" else "card",
              "canvasMode": "standalone" if (
                  s.get("canvasMode") == "standalone"
                  or (s.get("canvasMode") is None and s.get("preset") == "brand_reveal")
              ) else "overlay",
              "canvasColor": s.get("canvasColor") if re.fullmatch(r"#[0-9a-fA-F]{6}", str(s.get("canvasColor"))) else "#050713",
              "text": clean(s.get("text"), 96), "secondary": clean(s.get("secondary"), 96),
              "prefix": clean(s.get("prefix"), 8), "enabled": s.get("enabled") is not False,
              "color": s.get("color") if re.fullmatch(r"#[0-9a-fA-F]{6}", str(s.get("color"))) else "#a78bfa",
              "easing": s.get("easing") if s.get("easing") in ("smooth", "linear", "punch", "spring") else "smooth",
              "sound": s.get("sound") if s.get("sound") in SOUNDS else "none"}
    for key, low, high, default in (
        ("value", -9999999, 9999999, 100), ("startTime", 0, 86400, 0), ("duration", .5, 60, 4),
        ("x", 5, 95, 50), ("y", 5, 95, 50), ("scale", .3, 1.4, 1), ("rotation", -45, 45, 0),
        ("opacity", 0, 1, 1), ("soundOffset", 0, 59, 0), ("soundVolume", 0, 1, .45),
    ):
        result[key] = bound(s.get(key), low, high, default)
    for end, start, low, high in (("endX", "x", 5, 95), ("endY", "y", 5, 95),
                                 ("endScale", "scale", .3, 1.4), ("endRotation", "rotation", -45, 45)):
        result[end] = bound(s.get(end, s.get(start)), low, high, result[start])
    return result


def validate_design(motion_graphics=None, sound_effects=None):
    """Reject unsupported contracts rather than deliver a silently incomplete export."""
    motion_graphics = motion_graphics or {"version": 1, "scenes": []}
    if not isinstance(motion_graphics, dict) or motion_graphics.get("version", 1) != 1:
        raise ValueError("Unsupported motion graphics version")
    scenes = motion_graphics.get("scenes", [])
    effects = sound_effects or []
    if not isinstance(scenes, list) or len(scenes) > 24:
        raise ValueError("A clip supports at most 24 motion scenes")
    if not isinstance(effects, list) or len(effects) > 128:
        raise ValueError("A clip supports at most 128 sound cues")
    for scene in scenes:
        if not isinstance(scene, dict) or scene.get("preset") not in PRESETS:
            raise ValueError("Unknown motion preset")
    normalized_effects = []
    for effect in effects:
        if not isinstance(effect, dict):
            raise ValueError("Invalid sound cue")
        if effect.get("enabled") is False:
            continue
        if effect.get("builtIn") and effect.get("tone") not in SOUNDS:
            raise ValueError("Unknown built-in sound")
        if not effect.get("builtIn") and not effect.get("url"):
            raise ValueError("Uploaded sound is missing its media URL")
        e = dict(effect)
        if e.get("kind", "sfx") not in {"sfx", "voiceover"}:
            raise ValueError("Unknown audio cue kind")
        if e.get("kind") == "voiceover" and e.get("builtIn"):
            raise ValueError("Voice-over requires recorded audio")
        max_duration = 7200 if e.get("kind") == "voiceover" else 15
        for key, low, high, default in (("startTime", 0, 86400, 0), ("duration", .05, max_duration, .7),
                                      ("trimStart", 0, 86400, 0), ("volume", 0, 1, .8),
                                      ("fadeIn", 0, 15, 0), ("fadeOut", 0, 15, 0)):
            e[key] = bound(e.get(key), low, high, default)
        normalized_effects.append(e)
    return [normalize_motion(s) for s in scenes if s.get("enabled") is not False], normalized_effects


def ease(value, kind="smooth"):
    t = bound(value, 0, 1)
    if kind == "linear":
        return t
    elif kind == "punch":
        # Over-shoot (Back Out) for punchy feel
        s = 1.70158
        t -= 1
        return (t * t * ((s + 1) * t + s) + 1)
    elif kind == "spring":
        # Spring physics: damped sine wave
        c4 = (2 * math.pi) / 3
        if t == 0:
            return 0
        elif t == 1:
            return 1
        else:
            return pow(2, -10 * t) * math.sin((t * 10 - 0.75) * c4) + 1
    else:
        # Smooth: easeInOutCubic
        return t * t * (3 - 2 * t)


def motion_pose(s, time, width=1000, height=1778):
    local = time - s["startTime"]
    if not s["enabled"] or local < 0 or local >= s["duration"]:
        return None
    progress = ease(local / s["duration"], s["easing"])
    enter = ease(local / min(.45, s["duration"] / 3), "punch")
    leave = ease((s["duration"] - local) / min(.3, s["duration"] / 3))
    x = s["x"] + (s["endX"] - s["x"]) * progress
    y = s["y"] + (s["endY"] - s["y"]) * progress
    fit = 1
    if s["preset"] == "watermark":
        # Match the browser's rotated artwork bounds and entrance padding.
        angle = math.radians(max(abs(s["rotation"]), abs(s["endRotation"])))
        x_angle = min(angle, math.atan2(38, 180))
        extent_x = 180 * math.cos(x_angle) + 38 * math.sin(x_angle)
        extent_y = 180 * math.sin(angle) + 38 * math.cos(angle)
        # A moving brand is a corner signature, not a title card.
        max_scale = 1.35 * .5 * max(s["scale"], s["endScale"])
        half_x = extent_x * max_scale / 10
        half_y = extent_y * max_scale * width / (10 * height)
        # Clamp creator-authored start/end placement against a 4% action-safe
        # inset, including entrance travel.
        fit = min(1, 45 / half_x, 42 / half_y)
        safe_half_x, safe_half_y = half_x * fit, half_y * fit
        x = bound(x, 4 + safe_half_x, 96 - safe_half_x, 50)
        y = bound(y + (1 - enter) * 3, 4 + safe_half_y, 96 - safe_half_y, 50)
    else:
        # Match the browser's 600 x 260 rotated-card action-safe fit. Delivery
        # dimensions matter here: one edit must remain visible at every aspect.
        rotation = s["rotation"] + (s["endRotation"] - s["rotation"]) * progress
        angle = math.radians(abs(rotation))
        authored_scale = ((s["scale"] + (s["endScale"] - s["scale"]) * progress)
                          * (.92 + .08 * enter) * 1.35)
        half_x = (300 * math.cos(angle) + 130 * math.sin(angle)) * authored_scale / 10
        half_y = ((300 * math.sin(angle) + 130 * math.cos(angle)) * authored_scale
                  * width / (10 * height))
        fit = min(1, 46 / max(.001, half_x), 46 / max(.001, half_y))
        safe_half_x, safe_half_y = half_x * fit, half_y * fit
        x = bound(x, 4 + safe_half_x, 96 - safe_half_x, 50)
        y = bound(y + (1 - enter) * 3, 4 + safe_half_y, 96 - safe_half_y, 50)
    return dict(x=x, y=y,
                scale=(s["scale"] + (s["endScale"] - s["scale"]) * progress)
                      * (.92 + .08 * enter) * (.5 if s["preset"] == "watermark" else 1) * fit,
                rotation=s["rotation"] + (s["endRotation"] - s["rotation"]) * progress,
                opacity=s["opacity"] * enter * leave, reveal=enter,
                progress=bound(local / s["duration"], 0, 1),
                count=ease(local / min(1.5, s["duration"] * .65)),
                words=min(16, 1 + math.floor(local / min(.18, s["duration"] / 20))))


def motion_primitives(s, pose):
    a, color, ink, dark = [], s["color"], "#f8fafc", "#101526"
    def rect(x, y, w, h, fill, radius=0):
        a.append(dict(kind="rect", x=x, y=y, w=w, h=h, fill=fill, radius=radius))
    def text(value, x, y, size, fill=ink, maxWidth=None, weight="bold"):
        a.append(dict(kind="text", text=value, x=x, y=y, size=size, fill=fill,
                      maxWidth=568-x if maxWidth is None else maxWidth, weight=weight))
    def clamp01(value):
        return max(0, min(1, value))
    def stage(value, start, end):
        return ease(clamp01((value-start)/(end-start)), "smooth")
    def alpha(hex_color, opacity):
        return hex_color[:7] + format(math.floor(clamp01(opacity)*255+.5), "02x")
    def wrap(value, maximum=23):
        lines, line = [], ""
        for word in value.split():
            if len((line + " " + word).strip()) > maximum and line:
                lines.append(line)
                line = ""
            line = (line + " " + word).strip()
        if line:
            lines.append(line)
        return [v[:maximum - 1] + "…" if len(v) > maximum else v for v in lines[:3]]
    def title(value, x=32, y=48, size=32):
        for i, line in enumerate(wrap(value)):
            text(line, x, y + i * (size + 8), size)
    if s["preset"] == "brand_reveal":
        p = pose["progress"]
        launch, orbit = stage(p, .01, .18), stage(p, .08, .3)
        tile = stage(p, .16, .36)
        left_stroke, right_stroke = stage(p, .23, .39), stage(p, .27, .43)
        crossbar = stage(p, .36, .48)
        auto = ease(clamp01((p-.35)/.2), "spring")
        promote = ease(clamp01((p-.43)/.2), "spring")
        resolve = stage(p, .55, .72)
        impact = max(0, math.sin(math.pi*stage(p, .3, .56)))
        center_x = 122
        tile_size = 108*tile
        tile_x, tile_y = center_x-tile_size/2, 130-tile_size/2
        word_x = 205+42*(1-auto)

        a.append(dict(kind="circle", x=center_x, y=130, r=4+1.8*launch,
                      fill=alpha("#ffffff", max(.8, launch*(1-resolve)))))
        for index in range(5):
            head = -70+launch*(190+index*8)
            a.append(dict(kind="line", x1=head-90-index*15, y1=130+(index-2)*13,
                          x2=head, y2=130+(index-2)*4, width=1+index*.65,
                          fill=alpha("#38bdf8" if index % 2 else "#8b5cf6",
                                     (.18+index*.1)*(1-tile*.72))))
        a.append(dict(kind="circle", x=-15+launch*137, y=130, r=3+5*impact,
                      fill=alpha("#ffffff", launch*(1-resolve*.7))))
        for index, radius in enumerate((76, 62, 49)):
            a.append(dict(kind="stroke_circle", x=center_x, y=130,
                          r=radius+(1-orbit)*(24+index*9)+impact*(5-index),
                          width=2.4 if index == 1 else 1.1,
                          fill=alpha("#38bdf8" if index == 1 else "#8b5cf6",
                                     orbit*(.42-index*.07)*(1-resolve*.38))))
        for direction in (-1, 1):
            a.append(dict(kind="line", x1=center_x, y1=130,
                          x2=center_x+direction*(72+22*impact), y2=130, width=1,
                          fill=alpha("#ffffff", .2*orbit*(1-resolve))))
        for index, echo in enumerate((3, 2, 1)):
            offset = echo*(1-tile)*34
            rect(tile_x-offset, tile_y, tile_size, tile_size,
                 alpha("#38bdf8" if index == 1 else "#7c3aed", tile*(.06+index*.045)), 24*tile)
        rect(tile_x-8, tile_y-8, tile_size+16, tile_size+16,
             alpha("#8b5cf6", .11*tile+impact*.08), 30*tile)
        rect(tile_x, tile_y, tile_size, tile_size, alpha("#6d28d9", tile), 24*tile)
        if tile_size > 0:
            a.append(dict(kind="polygon", points=[
                [tile_x+tile_size*.64, tile_y], [tile_x+tile_size, tile_y],
                [tile_x+tile_size, tile_y+tile_size], [tile_x+tile_size*.76, tile_y+tile_size],
            ], fill=alpha("#0ea5e9", .9*tile)))
        base_y = 169
        top_y_left, top_y_right = base_y-73*left_stroke, base_y-73*right_stroke
        a.append(dict(kind="polygon", points=[[82, base_y], [100, base_y], [126, top_y_left], [111, top_y_left]],
                      fill=alpha("#ffffff", left_stroke)))
        a.append(dict(kind="polygon", points=[[126, top_y_right], [141, top_y_right], [166, base_y], [148, base_y]],
                      fill=alpha("#ffffff", right_stroke)))
        rect(101, 143, 53*crossbar, 11, alpha("#ffffff", crossbar), 3)
        rect(151, 98, 4, 63*crossbar, alpha("#67e8f9", .8*crossbar), 2)
        a.append(dict(kind="circle", x=157, y=81, r=3+3*impact, fill=alpha("#ffffff", tile)))
        text("Auto", word_x, 88-8*(1-auto), 50, alpha("#f8fafc", clamp01(auto)), 126)
        text("Promote", word_x+119, 88-8*(1-promote), 50,
             alpha("#a78bfa", clamp01(promote)), 246)
        rule = 344*resolve
        rect(word_x+2, 148, rule, 3, alpha("#38bdf8", resolve), 2)
        rect(word_x+2, 148, rule*.62, 3, alpha("#8b5cf6", resolve), 2)
        a.append(dict(kind="circle", x=word_x+2+rule, y=149.5, r=2+2.5*impact,
                      fill=alpha("#ffffff", resolve)))
        text(s["secondary"] or "CREATE · AMPLIFY · DOMINATE", word_x+2, 165, 15,
             alpha("#cbd5e1", resolve), 344, "normal")
        for index, point in enumerate(((42, 72), (184, 58), (187, 204), (527, 89), (555, 178))):
            a.append(dict(kind="circle", x=point[0]+impact*(index-2)*3, y=point[1],
                          r=.8+(index%2), fill=alpha("#38bdf8" if index % 2 else "#8b5cf6", .45*orbit)))
        a.append(dict(kind="circle", x=center_x, y=130, r=4+1.8*launch,
                      fill=alpha("#ffffff", .8*(1-tile))))
        return a
    if s.get("design") == "editorial" and s["preset"] in {"title", "kinetic", "lower_third"}:
        if s["preset"] == "lower_third":
            rect(0, 66, 600, 134, "#101526e8")
            rect(0, 66, 5, 134, color)
            names = wrap(s["text"], 26)[:2]
            for i, line in enumerate(names):
                text(line, 26, 80+i*43, 38, ink, 548)
            text(s["secondary"], 26, 172 if len(names) > 1 else 141, 24, color, 548)
            rect(26, 191, 82*min(1, pose["reveal"]), 3, color)
        else:
            words, lines, line = s["text"].split(), [], ""
            for word in words:
                if len((line+" "+word).strip()) > 22 and line:
                    lines.append(line)
                    line = ""
                line = (line+" "+word).strip()
            if line:
                lines.append(line)
            size = min(68, math.floor(178/max(1, len(lines)))-8)
            remaining = pose["words"] if s["preset"] == "kinetic" else len(words)
            for i, full in enumerate(lines):
                parts = full.split()
                copy = " ".join(parts[:max(0, remaining)])
                remaining -= len(parts)
                if copy:
                    text(copy, 28, 22+i*(size+8), size, "#101526", 548)
                    text(copy, 26, 20+i*(size+8), size, ink, 548)
            rect(26, 207, 90*min(1, pose["reveal"]), 5, color)
            text(s["secondary"], 26, 223, 24, ink, 548)
        return a
    if s["preset"] == "watermark":
        rect(120, 92, 360, 66, dark); rect(120, 92, 7, 66, color)
        text(s["text"][:22], 140, 111, 23, ink, 320)
    elif s["preset"] == "comparison":
        rect(0, 28, 284, 206, dark); rect(316, 28, 284, 206, dark)
        rect(0, 28, 284 * pose["reveal"], 6, color); rect(316, 228, 284 * pose["reveal"], 6, color)
        for i, line in enumerate(wrap(s["text"], 12)):
            text(line, 20, 74 + i * 38, 28, ink, 244)
        for i, line in enumerate(wrap(s["secondary"], 12)):
            text(line, 336, 74 + i * 38, 28, ink, 244)
        rect(275, 110, 50, 38, color); text("VS", 280, 118, 20, dark)
    elif s["preset"] == "callout":
        rect(92, 20, 508, 180, dark); rect(92, 20, 6, 180, color); title(s["text"], 115, 44, 28)
        rect(26, 195, 4, 44, color); rect(26, 195, 68 * pose["reveal"], 4, color)
        a.append(dict(kind="circle", x=28, y=239, r=10, fill=color))
        return a
    elif s["preset"] == "badge":
        rect(40, 70, 520, 110, dark)
        rect(40, 70, 8, 110, color)
        rect(40, 175, 520 * min(1, pose["reveal"]), 5, color)
        title(s["text"], 68, 92, 28)
        text(s["secondary"][:36], 68, 148, 20, color)
        return a
    elif s["preset"] == "progress":
        rect(20, 90, 560, 80, dark)
        rect(20, 90, 6, 80, color)
        rect(20, 164, 560 * pose["count"], 6, color)
        text(s["text"][:26], 42, 115, 24)
        text(str(math.floor(pose["count"] * 100 + .5)) + "%", 490, 115, 24, color, 80)
        return a
    elif s["preset"] == "quote":
        rect(10, 30, 580, 200, dark)
        rect(10, 30, 6, 200, color)
        a.append(dict(kind="circle", x=48, y=64, r=18, fill=color))
        text(s["secondary"][:30], 80, 52, 22, color, 480)
        for i, l in enumerate(wrap(s["text"], 26)):
            text(l, 35, 102 + i * 36, 26, ink, 530)
        rect(10, 224, 580 * min(1, pose["reveal"]), 6, color)
        return a
    elif s["preset"] == "cta":
        rect(40, 65, 520, 125, dark)
        rect(40, 65, 520, 6, color)
        a.append(dict(kind="circle", x=92, y=126, r=24, fill=color))
        text(s["text"][:22], 136, 88, 30, ink, 410)
        text(s["secondary"][:30], 136, 134, 20, color, 410)
        rect(40, 184, 520 * min(1, pose["reveal"]), 6, color)
        return a
    else:
        rect(0, 20, 600, 220, dark); rect(0, 20, 8, 220, color)
        if s["preset"] == "counter":
            text(s["prefix"] + str(math.floor(s["value"] * pose["count"] + .5)), 30, 45, 68, color)
            text(s["text"][:30], 32, 153, 24); rect(32, 203, 536 * pose["count"], 8, color)
        elif s["preset"] == "lower_third":
            rect(8, 20, 592 * pose["reveal"], 7, color); title(s["text"], 32, 55, 32)
            text(s["secondary"][:34], 32, 192, 20, color)
        else:
            title(" ".join(s["text"].split()[:pose["words"]]) if s["preset"] == "kinetic" else s["text"])
            rect(32, 190, 536 * pose["reveal"], 6, color); text(s["secondary"][:36], 32, 212, 16, color)
    return a


@functools.lru_cache(maxsize=24)
def font(size):
    return ImageFont.truetype(str(FONT), size)


def draw_motion_frame(scenes, time, width, height):
    standalone = next((s for s in scenes if s.get("canvasMode") == "standalone"
                       and s["startTime"] <= time < s["startTime"] + s["duration"]), None)
    canvas = Image.new(
        "RGBA",
        (width, height),
        standalone.get("canvasColor", "#050713") if standalone else (0, 0, 0, 0),
    )
    for s in scenes:
        pose = motion_pose(s, time, width, height)
        if not pose or pose["opacity"] <= 0:
            continue
        # Supersample the canonical card, then transform around its centre.
        card = Image.new("RGBA", (1200, 520))
        draw = ImageDraw.Draw(card)
        for p in motion_primitives(s, pose):
            if p["kind"] == "text":
                x, y = p["x"] * 2, p["y"] * 2
                face = font(p["size"] * 2)
                text_width = max(1, math.ceil(face.getlength(p["text"])))
                text_layer = Image.new("RGBA", (text_width + 2, p["size"] * 3))
                ImageDraw.Draw(text_layer).text((0, 0), p["text"], font=face, fill=p["fill"], anchor="la")
                target_width = max(1, round(p["maxWidth"] * 2))
                if text_width > target_width:
                    text_layer = text_layer.resize((target_width, text_layer.height), Image.Resampling.LANCZOS)
                card.alpha_composite(text_layer, (round(x), round(y)))
            elif p["kind"] == "circle":
                x, y = p["x"] * 2, p["y"] * 2
                r = p["r"] * 2
                draw.ellipse((x-r, y-r, x+r, y+r), fill=p["fill"])
            elif p["kind"] == "stroke_circle":
                x, y = p["x"] * 2, p["y"] * 2
                r = p["r"] * 2
                draw.ellipse((x-r, y-r, x+r, y+r), outline=p["fill"], width=max(1, round(p["width"]*2)))
            elif p["kind"] == "line":
                draw.line((p["x1"]*2, p["y1"]*2, p["x2"]*2, p["y2"]*2),
                          fill=p["fill"], width=max(1, round(p["width"]*2)))
            elif p["kind"] == "polygon":
                draw.polygon([(px*2, py*2) for px, py in p["points"]], fill=p["fill"])
            elif p["w"] > 0 and p["h"] > 0:
                x, y = p["x"] * 2, p["y"] * 2
                x0, y0 = round(x), round(y)
                x1 = max(x0, round(x + p["w"] * 2 - 1))
                y1 = max(y0, round(y + p["h"] * 2 - 1))
                if p.get("radius", 0) > 0:
                    draw.rounded_rectangle((x0, y0, x1, y1), radius=round(p["radius"]*2), fill=p["fill"])
                else:
                    draw.rectangle((x0, y0, x1, y1), fill=p["fill"])
        scale = pose["scale"] * 1.35 * width / 1000
        card = card.resize((max(1, round(600*scale)), max(1, round(260*scale))), Image.Resampling.LANCZOS)
        card = card.rotate(-pose["rotation"], Image.Resampling.BICUBIC, expand=True)
        card.putalpha(card.getchannel("A").point(lambda v: round(v * pose["opacity"])))
        canvas.alpha_composite(card, (round(width*pose["x"]/100-card.width/2), round(height*pose["y"]/100-card.height/2)))
    return canvas


def synthesize_effect(effect, sample_rate=SAMPLE_RATE):
    duration = bound(effect.get("duration"), .05, 15, .7)
    count = math.ceil(duration * sample_rate)
    samples = np.empty(count, dtype=np.float32)
    fade_in, fade_out = max(.001, effect.get("fadeIn", 0)), max(.005, effect.get("fadeOut", 0))
    tone, seed, phase, tau = effect.get("tone"), 123456789, 0, 2*math.pi
    for i in range(count):
        t = i/sample_rate
        p = t/duration
        seed = (seed*1664525+1013904223) & 0xffffffff
        noise = seed/4294967296*2-1
        if tone in ("sweep", "riser", "reverse"):
            rise = tone != "sweep"
            frequency = 2600-2300*p if tone == "reverse" else 180+3200*p if rise else 1800-1450*p
            phase += tau*frequency/sample_rate
            value = (.48*noise+.25*math.sin(phase))*(p if rise else math.sin(math.pi*p))
        elif tone == "chime":
            value = (math.sin(tau*880*t)+.45*math.sin(tau*1320*t)+.25*math.sin(tau*1760*t))*math.exp(-5*p)*.5
        elif tone == "glitch":
            value = (.3*noise+.4*math.sin(tau*(320+160*math.floor(p*8))*t))*(.15 if math.floor(p*16)%2 else 1)
        else:
            low = tone in ("impact", "subdrop")
            f0, f1 = (150, 42) if low else (1100, 420) if tone == "click" else (620, 240)
            phase += tau*(f0+(f1-f0)*p)/sample_rate
            value = (math.sin(phase)*.8+(noise*.2 if tone == "impact" else 0))*math.exp(-5*p)
        samples[i] = max(-1, min(1, value*min(1, t/fade_in, (duration-t)/fade_out)))
    return samples


def edit_clock(output_times, speed_plan):
    """Vector/scalar inverse of viral_render_contract.map_timeline_time."""
    times = np.asarray(output_times, dtype=np.float64)
    mapped = np.zeros_like(times)
    cursor = 0.0
    for segment in speed_plan:
        start, end, rate = (float(segment[k]) for k in ("start_time", "end_time", "rate"))
        length = (end-start)/rate
        mapped = np.where(times >= cursor, start + np.clip(times-cursor, 0, length)*rate, mapped)
        cursor += length
    return mapped


def run(command):
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=1800)
    if result.returncode:
        raise RuntimeError("Motion/SFX render failed: " + result.stderr.decode(errors="replace")[-1600:])
    return result.stdout


def probe(path):
    return json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]))


def prepare_voiceover_samples(effect, source, speed_plan):
    """Time-stretch recorded speech without changing pitch, retaining cue boundaries."""
    try:
        from .viral_render_contract import map_timeline_time
    except ImportError:
        from viral_render_contract import map_timeline_time
    start, end = effect["startTime"], effect["startTime"] + effect["duration"]
    ranges = [(max(start, p["start_time"]), min(end, p["end_time"]), p["rate"])
              for p in speed_plan if p["end_time"] > start and p["start_time"] < end]
    if not ranges:
        return np.empty(0, dtype=np.float32), 0
    chain = [f"[0:a]atrim=start={effect['trimStart']}:duration={effect['duration']},asetpts=PTS-STARTPTS"]
    if effect["fadeIn"] > 0:
        chain[0] += f",afade=t=in:d={effect['fadeIn']}"
    if effect["fadeOut"] > 0:
        chain[0] += f",afade=t=out:st={max(0, effect['duration']-effect['fadeOut'])}:d={effect['fadeOut']}"
    chain[0] += f",asplit={len(ranges)}" + "".join(f"[vo{i}]" for i in range(len(ranges)))
    for index, (first, last, rate) in enumerate(ranges):
        tempos = []
        remaining = rate
        while remaining < .5:
            tempos.append("atempo=0.5"); remaining /= .5
        while remaining > 2:
            tempos.append("atempo=2"); remaining /= 2
        tempos.append(f"atempo={remaining}")
        chain.append(f"[vo{index}]atrim=start={first-start}:end={last-start},asetpts=PTS-STARTPTS,"
                     + ",".join(tempos) + f",apad,atrim=duration={(last-first)/rate}[vot{index}]")
    chain.append("".join(f"[vot{i}]" for i in range(len(ranges))) + f"concat=n={len(ranges)}:v=0:a=1[out]")
    raw = run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(source), "-filter_complex", ";".join(chain),
               "-map", "[out]", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1"])
    return np.frombuffer(raw, dtype="<f4"), map_timeline_time(speed_plan, ranges[0][0])


def write_sound_mix(path, effects, duration, speed_plan, resolved_audio):
    prepared = []
    for e in effects:
        if e["volume"] <= 0:
            continue
        if e.get("builtIn"):
            samples = synthesize_effect(e)
        else:
            source = resolved_audio.get(e.get("url"))
            if not source:
                raise ValueError("Uploaded sound was not downloaded")
            if e.get("kind") == "voiceover":
                samples, output_start = prepare_voiceover_samples(e, source, speed_plan)
                prepared.append(({**e, "outputStart": output_start}, samples))
                continue
            raw = run(["ffmpeg", "-v", "error", "-nostdin", "-ss", str(e["trimStart"]), "-i", str(source),
                       "-t", str(e["duration"]), "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1"])
            samples = np.frombuffer(raw, dtype="<f4").copy()
            if not len(samples):
                raise ValueError("Uploaded sound trim has no audio samples")
            t = np.arange(len(samples))/SAMPLE_RATE
            envelope = np.minimum(1, np.minimum(t/max(.001, e["fadeIn"]), (e["duration"]-t)/max(.005, e["fadeOut"])))
            samples *= envelope
        prepared.append((e, samples))
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(SAMPLE_RATE)
        # Bound memory independently of podcast length; preserve partial cues at the end.
        for first in range(0, math.ceil(duration*SAMPLE_RATE), SAMPLE_RATE):
            count = min(SAMPLE_RATE, math.ceil(duration*SAMPLE_RATE)-first)
            time = edit_clock((first+np.arange(count))/SAMPLE_RATE, speed_plan)
            mix = np.zeros(count, dtype=np.float64)
            for e, samples in prepared:
                if not len(samples):
                    continue
                position = ((first+np.arange(count))/SAMPLE_RATE-e["outputStart"])*SAMPLE_RATE if e.get("kind") == "voiceover" else (time-e["startTime"])*SAMPLE_RATE
                mix += np.interp(position, np.arange(len(samples)), samples, left=0, right=0)*e["volume"]
            output.writeframes((np.clip(mix, -.95, .95)*32767).astype("<i2").tobytes())


def render_motion_and_sound(source, destination, motion_graphics=None, sound_effects=None, speed_plan=None, resolved_audio=None):
    scenes, effects = validate_design(motion_graphics, sound_effects)
    info = probe(source)
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    width, height = int(video["width"]), int(video["height"])
    duration = float(info["format"]["duration"])
    if width*height > 4096*2160 or duration > 7200:
        raise ValueError("Motion export supports up to 4K and two hours per clip")
    plan = speed_plan or [{"start_time": 0, "end_time": duration, "rate": 1}]
    has_audio = any(s["codec_type"] == "audio" for s in info["streams"])
    end_clock = float(edit_clock(duration, plan))
    scenes = [s for s in scenes if s["startTime"] < end_clock]
    effects = [e for e in effects if e["startTime"] < end_clock and e["volume"] > 0]
    with tempfile.TemporaryDirectory(prefix="viral-design-") as temp:
        cmd = ["ffmpeg", "-v", "error", "-nostdin", "-threads", "2", "-i", str(source)]
        filters, next_input = [], 1
        if scenes:
            overlay = str(Path(temp)/"motion.mov")
            # Stream one frame at a time; transparent frames compress well with QTRLE.
            with tempfile.TemporaryFile() as log:
                encoder = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba",
                    "-s", f"{width}x{height}", "-r", "30", "-i", "pipe:0", "-an", "-c:v", "qtrle", "-threads", "2", overlay],
                    stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log)
                try:
                    for frame in range(math.ceil(duration*30)):
                        time = math.floor(float(edit_clock(frame/30, plan))*30+1e-7)/30
                        encoder.stdin.write(draw_motion_frame(scenes, time, width, height).tobytes())
                    encoder.stdin.close()
                    if encoder.wait(timeout=1800):
                        log.seek(0)
                        raise RuntimeError("Motion frame encoding failed: " + log.read().decode(errors="replace")[-1600:])
                except BrokenPipeError as exc:
                    encoder.wait(timeout=30)
                    log.seek(0)
                    raise RuntimeError("Motion frame encoding failed: " + log.read().decode(errors="replace")[-1600:]) from exc
                finally:
                    if encoder.poll() is None:
                        encoder.kill(); encoder.wait()
            cmd += ["-i", overlay]
            filters.append("[0:v][1:v]overlay=eof_action=pass:format=auto,format=yuv420p[v]")
            next_input += 1
        if effects:
            audio = str(Path(temp)/"cues.wav")
            write_sound_mix(audio, effects, duration, plan, resolved_audio or {})
            cmd += ["-i", audio]
            if has_audio:
                filters.append(f"[0:a][{next_input}:a]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95:level=false:latency=true[a]")
            else:
                filters.append(f"[{next_input}:a]anull[a]")
        if filters:
            cmd += ["-filter_complex_threads", "1", "-filter_complex", ";".join(filters)]
        cmd += ["-map", "[v]" if scenes else "0:v:0"]
        cmd += ["-map", "[a]" if effects else "0:a?"]
        cmd += ["-c:v", "libx264" if scenes else "copy"]
        if scenes:
            cmd += ["-preset", "fast", "-crf", "18", "-threads", "2"]
        cmd += ["-c:a", "aac" if effects else "copy", "-t", str(duration), "-movflags", "+faststart", "-y", str(destination)]
        run(cmd)
    return {"version": 1, "motion_scenes": len(scenes), "sound_cues": len(effects), "duration": duration}

def generate_transparent_motion_overlay(motion_data, duration_sec, output_path, fps=30,
                                        width=1080, height=1920, speed_plan=None):
    """Stream alpha frames at the delivery size, using the retained edit clock.

    QTRLE in MOV preserves alpha in standard FFmpeg decoders. File-backed stderr
    cannot deadlock when encoding a long programme, unlike an unread PIPE.
    """
    scenes, _ = validate_design(motion_data)
    if not scenes:
        return None
        
    width, height = int(width), int(height)
    if width < 2 or height < 2 or width*height > 4096*2160 or not 0 < duration_sec <= 7200:
        raise ValueError("Motion export supports up to 4K and two hours per clip")
    plan = speed_plan or [{"start_time": 0, "end_time": duration_sec, "rate": 1}]
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba",
           "-s", f"{width}x{height}", "-r", str(fps), "-i", "pipe:0", "-an",
           "-c:v", "qtrle", "-threads", "2", "-f", "mov", str(output_path)]
    with tempfile.TemporaryFile() as log:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log)
        try:
            for frame_idx in range(math.ceil(duration_sec*fps)):
                t = math.floor(float(edit_clock(frame_idx/fps, plan))*30+1e-7)/30
                proc.stdin.write(draw_motion_frame(scenes, t, width, height).tobytes())
            proc.stdin.close()
            if proc.wait(timeout=1800):
                log.seek(0)
                raise RuntimeError("Motion overlay failed: " + log.read().decode(errors="replace")[-1600:])
        except BrokenPipeError as exc:
            proc.wait(timeout=30)
            log.seek(0)
            raise RuntimeError("Motion overlay failed: " + log.read().decode(errors="replace")[-1600:]) from exc
        finally:
            if proc.poll() is None:
                proc.kill(); proc.wait()
            if not proc.stdin.closed:
                proc.stdin.close()
    return output_path
