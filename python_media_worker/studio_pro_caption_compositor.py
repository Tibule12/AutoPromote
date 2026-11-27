"""Pro-grade 2x supersampled RGBA kinetic caption compositor & RVM depth sandwich.

Brings modern CapCut / Submagic / Captions.ai visual craft to AutoPromote exports:
- Real backdrop frosted Gaussian glass cards (blurring live video pixels underneath)
- Smooth multi-stop gradient typography & floating active pills (zero jagged ASS vectors)
- Underdamped spring overshoot physics, elastic word hops, highlighter sweeps & optical bloom
- Mixed-weight editorial magazine lockups (tracked Sans + oversized Noto Serif Italic)
- Dynamic RVM foreground subject depth-occlusion (clean speaker silhouettes over wall type)
"""
from __future__ import annotations

from functools import lru_cache
import logging
import math
import os
from pathlib import Path
import re
import subprocess
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

import cv2
import numpy as np
from PIL import Image, ImageColor, ImageDraw, ImageFilter, ImageFont

try:
    from .studio_caption_safety import RvmMatteTracker
except ImportError:
    from studio_caption_safety import RvmMatteTracker

logger = logging.getLogger(__name__)

ASSETS_FONTS_DIR = Path(__file__).resolve().parent / "assets" / "fonts"
SYSTEM_NOTO_SERIF_BI = "/usr/share/fonts/truetype/noto/NotoSerif-BoldItalic.ttf"
SYSTEM_LIB_SERIF_BI = "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf"
SYSTEM_DEJAVU_SERIF_B = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SYSTEM_DEJAVU_MONO_B = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

# Styles best served by the Pro RGBA compositor instead of flat libass burn-in.
PRO_RGBA_STYLES = {
    "word_pill",
    "glass",
    "editorial_duo",
    "wall_type",
    "neon_bloom",
    "glow",
    "sticker",
    "marker",
    "spring_slam",
    "kinetic_bar",
    "story_pop",
    "retro",
    "bounce",
    "headline",
    "gradient",
    "luxury",
    "editorial",
    "newsroom",
    "comic",
    "typewriter",
    "watch_me",
    "bold_pop",
    "karaoke",
    "boxed",
    "rainbow",
    "minimal",
}

RAINBOW_RGB: Tuple[Tuple[int, int, int], ...] = (
    (255, 179, 61),
    (246, 230, 82),
    (114, 245, 155),
    (60, 224, 208),
    (84, 168, 255),
    (168, 117, 255),
    (255, 93, 143),
)


def ass_color_to_rgb(ass_color: str, default: Tuple[int, int, int] = (255, 255, 255)) -> Tuple[int, int, int]:
    cleaned = str(ass_color or "").replace("&H", "").replace("&", "").strip().upper()
    if len(cleaned) == 8:
        cleaned = cleaned[2:]
    if len(cleaned) != 6:
        return default
    try:
        b = int(cleaned[0:2], 16)
        g = int(cleaned[2:4], 16)
        r = int(cleaned[4:6], 16)
        return (r, g, b)
    except ValueError:
        return default


def hex_to_rgb(hex_color: str, default: Tuple[int, int, int] = (255, 179, 61)) -> Tuple[int, int, int]:
    raw = str(hex_color or "").strip()
    if raw.startswith("&H"):
        return ass_color_to_rgb(raw, default=default)
    try:
        rgb = ImageColor.getrgb(raw)
        return (int(rgb[0]), int(rgb[1]), int(rgb[2]))
    except Exception:
        return default


def _resolve_pro_font_path(fontname: str, serif_italic: bool = False, mono: bool = False) -> str:
    if serif_italic:
        for cand in (SYSTEM_NOTO_SERIF_BI, SYSTEM_LIB_SERIF_BI, SYSTEM_DEJAVU_SERIF_B):
            if os.path.isfile(cand):
                return cand
    if mono or "Mono" in fontname:
        if os.path.isfile(SYSTEM_DEJAVU_MONO_B):
            return SYSTEM_DEJAVU_MONO_B
    mapping = {
        "Inter Black": "Inter-Black.ttf",
        "Inter ExtraBold": "Inter-ExtraBold.ttf",
        "Inter SemiBold": "Inter-SemiBold.ttf",
        "Inter": "Inter-Regular.ttf",
        "DejaVu Sans": "DejaVuSans-Bold.ttf",
        "DejaVu Sans Condensed": "Inter-ExtraBold.ttf",
        "DejaVu Serif": "DejaVuSans-Bold.ttf",
        "Noto Sans Symbols2": "NotoSansSymbols2-Regular.ttf",
    }
    if fontname == "DejaVu Serif":
        for cand in (SYSTEM_NOTO_SERIF_BI, SYSTEM_LIB_SERIF_BI, SYSTEM_DEJAVU_SERIF_B):
            if os.path.isfile(cand):
                return cand
    bundled = mapping.get(fontname, "Inter-ExtraBold.ttf")
    p = ASSETS_FONTS_DIR / bundled
    if p.is_file():
        return str(p)
    fallback = ASSETS_FONTS_DIR / "DejaVuSans-Bold.ttf"
    return str(fallback)


@lru_cache(maxsize=128)
def _load_font(path: str, size_px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, max(10, int(size_px)))


def _spring_overshoot(elapsed_s: float, duration_s: float = 0.22, amplitude: float = 0.20) -> float:
    """Underdamped spring curve peaking smoothly then settling to 1.0."""
    if elapsed_s <= 0.0:
        return max(0.78, 1.0 - amplitude * 0.8)
    if elapsed_s >= duration_s:
        return 1.0
    t = elapsed_s / max(0.05, duration_s)
    # 0 -> peak (>1.0 around t=0.4) -> smooth settle at 1.0
    return 1.0 - (1.0 - t) * math.cos(t * math.pi * 1.45) * amplitude * 1.3 + (
        math.sin(t * math.pi) * amplitude * (1.0 - t * 0.5)
    )


def _measure_word_tracked(font: ImageFont.FreeTypeFont, text: str, tracking_px: float) -> float:
    if not text:
        return 0.0
    if abs(tracking_px) < 0.2 or len(text) <= 1:
        return float(font.getlength(text))
    return float(font.getlength(text)) + tracking_px * (len(text) - 1)


def _draw_text_tracked(
    draw: ImageDraw.ImageDraw,
    xy: Tuple[float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: Tuple[int, int, int, int],
    tracking_px: float = 0.0,
    stroke_width: int = 0,
    stroke_fill: Optional[Tuple[int, int, int, int]] = None,
    anchor: str = "lm",
) -> None:
    if not text:
        return
    if abs(tracking_px) < 0.25 or len(text) <= 1:
        draw.text(
            xy,
            text,
            font=font,
            fill=fill,
            anchor=anchor,
            stroke_width=stroke_width,
            stroke_fill=stroke_fill,
        )
        return
    cursor = float(xy[0])
    y = float(xy[1])
    for ch in text:
        draw.text(
            (cursor, y),
            ch,
            font=font,
            fill=fill,
            anchor=anchor,
            stroke_width=stroke_width,
            stroke_fill=stroke_fill,
        )
        cursor += float(font.getlength(ch)) + tracking_px


def _make_gradient_patch(
    w: int,
    h: int,
    c1: Tuple[int, int, int],
    c2: Tuple[int, int, int],
    alpha: int = 255,
    diagonal: bool = True,
) -> Image.Image:
    gw = max(2, int(w))
    gh = max(2, int(h))
    if diagonal:
        gx = np.linspace(0.0, 1.0, gw, dtype=np.float32)[None, :]
        gy = np.linspace(0.0, 1.0, gh, dtype=np.float32)[:, None]
        t = np.clip(gx * 0.7 + gy * 0.3, 0.0, 1.0)
    else:
        t = np.linspace(0.0, 1.0, gw, dtype=np.float32)[None, :]
        t = np.broadcast_to(t, (gh, gw))
    arr = np.empty((gh, gw, 4), dtype=np.uint8)
    for c_idx in range(3):
        arr[:, :, c_idx] = np.clip(c1[c_idx] * (1.0 - t) + c2[c_idx] * t, 0, 255).astype(np.uint8)
    arr[:, :, 3] = int(max(0, min(255, alpha)))
    return Image.fromarray(arr)


def _complementary_gradient_pair(accent: Tuple[int, int, int]) -> Tuple[Tuple[int, int, int], Tuple[int, int, int]]:
    r, g, b = accent
    # Shift toward warmer or cooler vibrant twin stop for sleek gradient richness
    c2 = (
        min(255, int(r * 0.72 + 78)),
        min(255, int(g * 0.84 + 62)),
        min(255, int(b * 0.75 + 95)),
    )
    if abs(c2[0] - r) + abs(c2[1] - g) + abs(c2[2] - b) < 45:
        c2 = (min(255, r + 50), max(40, g - 20), min(255, b + 75))
    return accent, c2


def _build_word_cues(
    segments: Sequence[Mapping[str, Any]],
    style_name: str,
    style: Mapping[str, Any],
    resolve_story_treatment: Callable[..., Mapping[str, Any]],
    video_width: int,
    video_height: int,
    caption_scale: float,
    caption_position: str,
) -> List[Dict[str, Any]]:
    """Build timed phrase groups with resolved spatial stage/safety placement & words."""
    is_story = str(style.get("animation")) == "story_pop"
    scale = max(0.75, min(1.35, float(caption_scale or 1.0)))
    ref_dim = max(320, min(video_width, video_height))
    ratio = float(video_width) / float(max(1, video_height))
    aspect_scale = 0.84 if ratio >= 1.15 else (0.80 if ratio >= 0.88 else (0.84 if ratio >= 0.72 else 0.90))
    base_fs = float(style.get("fontsize", 60)) * (ref_dim / 1080.0) * scale * aspect_scale
    cues: List[Dict[str, Any]] = []

    for seg_idx, seg in enumerate(segments):
        s_start = float(seg.get("start_time", seg.get("start", 0.0)) or 0.0)
        s_end = float(seg.get("end_time", seg.get("end", s_start + 1.0)) or (s_start + 1.0))
        if s_end <= s_start:
            continue
        raw_text = re.sub(r"\[.*?\]|\(.*?\)", "", str(seg.get("text") or "")).strip()
        if not raw_text:
            continue

        # Extract word timings cleanly matching exported/ASS contract
        seg_words = seg.get("wordTimings") or seg.get("word_timings") or seg.get("words") or []
        timed: List[Dict[str, Any]] = []
        if isinstance(seg_words, list) and seg_words and isinstance(seg_words[0], Mapping):
            for w in seg_words:
                wt = str(w.get("word", "")).strip()
                if not wt:
                    continue
                ws = max(s_start, float(w.get("start", s_start)))
                we = max(ws + 0.03, min(s_end + 0.05, float(w.get("end", s_end))))
                timed.append({"word": wt, "start": ws, "end": we})
        if not timed:
            tokens = [t for t in raw_text.split() if t]
            dur = max(0.06, s_end - s_start) / max(1, len(tokens))
            timed = [
                {
                    "word": tok,
                    "start": s_start + i * dur,
                    "end": s_start + (i + 1) * dur,
                }
                for i, tok in enumerate(tokens)
            ]

        max_words = 4 if is_story else 5
        # Split into compact creator phrases (3-5 words max per beat)
        groups: List[List[Dict[str, Any]]] = []
        cur: List[Dict[str, Any]] = []
        for w in timed:
            cur_chars = len(" ".join([*[x["word"] for x in cur], w["word"]]))
            limit_chars = 24 if video_width < video_height else 28
            if cur and (len(cur) >= max_words or cur_chars > limit_chars):
                groups.append(cur)
                cur = [w]
            else:
                cur.append(w)
        if cur:
            groups.append(cur)

        total_segs = max(1, len(segments))
        treatment = resolve_story_treatment(
            seg,
            seg_idx,
            video_width,
            video_height,
            round(base_fs),
            caption_position,
            style_name=style_name,
            segment_count=total_segs,
        )
        accent_rgb = ass_color_to_rgb(str(treatment.get("accent") or ""), default=ass_color_to_rgb(str(style.get("highlight_color") or "&H00FFB33D")))
        primary_rgb = ass_color_to_rgb(str(style.get("primary_color") or "&H00FFFFFF"))

        placement = str(treatment.get("placement") or "lower")
        pos_match = re.search(r"\\an(\d+)\\pos\(([-\d.]+),([-\d.]+)\)", str(treatment.get("text_override") or ""))
        if pos_match:
            ass_align = int(pos_match.group(1))
            pos_x = float(pos_match.group(2))
            pos_y = float(pos_match.group(3))
        else:
            ass_align = int(style.get("alignment", 2))
            pos_x = float(video_width) * 0.5
            pos_y = float(video_height) * 0.84

        safety_meta = seg.get("captionSafety") if isinstance(seg.get("captionSafety"), Mapping) else {}
        needs_scrim = bool(safety_meta.get("needsScrim"))
        safety_rect = safety_meta.get("rect") if isinstance(safety_meta.get("rect"), (list, tuple)) and len(safety_meta.get("rect")) == 4 else None

        for grp in groups:
            if not grp:
                continue
            g_start = float(grp[0]["start"])
            g_end = max(g_start + 0.08, float(grp[-1]["end"]))
            words_sig = " ".join(w["word"] for w in grp)
            cues.append(
                {
                    "id": f"cue-{seg_idx}-{round(g_start, 3)}-{round(g_end, 3)}-{style_name}-{hash(words_sig) & 0xFFFF:x}",
                    "start": g_start,
                    "end": g_end,
                    "words": grp,
                    "style_name": style_name,
                    "style": style,
                    "placement": placement,
                    "ass_align": ass_align,
                    "pos_x": pos_x,
                    "pos_y": pos_y,
                    "base_fs": base_fs,
                    "accent_rgb": accent_rgb,
                    "primary_rgb": primary_rgb,
                    "icon": str(treatment.get("icon") or ""),
                    "tilt": float(treatment.get("tilt", 0.0) or 0.0),
                    "needs_scrim": needs_scrim,
                    "safety_rect": list(safety_rect) if safety_rect else None,
                    "stacked": bool(treatment.get("stacked")) or placement in {"side_left", "side_right", "shoulder_left", "shoulder_right", "background_left", "background_right", "top_left", "top_right", "bottom_left", "bottom_right", "custom"},
                }
            )
    return cues


def _layout_cue_lines(
    cue: Mapping[str, Any],
    video_width: int,
    video_height: int,
    aa: int = 2,
) -> Dict[str, Any]:
    """Compute crisp 2x supersampled word positions, line wraps, and bounding box."""
    style = cue["style"]
    style_name = cue["style_name"]
    anim = str(style.get("animation") or "scale_pop")
    nominal_fs = max(18, round(float(cue["base_fs"])))
    if style_name in {"wall_type", "headline", "spring_slam"}:
        nominal_fs = round(nominal_fs * 1.04)

    uppercase = bool(style.get("uppercase"))
    base_fontname = str(style.get("fontname") or "Inter ExtraBold")
    serif_mode = style_name in {"editorial", "luxury"}
    mono_mode = anim == "true_typewriter"

    base_path = _resolve_pro_font_path(base_fontname, serif_italic=serif_mode, mono=mono_mode)
    serif_path = _resolve_pro_font_path("DejaVu Serif", serif_italic=True)

    ratio = float(video_width) / float(max(1, video_height))
    is_wide = ratio >= 1.25
    is_square = 0.88 <= ratio < 1.25
    placement = str(cue["placement"] or "lower")
    s_rect = cue.get("safety_rect")
    rect_w_px = None
    rect_h_px = None
    if s_rect and placement != "behind_subject":
        sx1, sy1, sx2, sy2 = (
            round(s_rect[0] * video_width),
            round(s_rect[1] * video_height),
            round(s_rect[2] * video_width),
            round(s_rect[3] * video_height),
        )
        rect_w_px = max(140, sx2 - sx1)
        rect_h_px = max(64, sy2 - sy1)

    if placement in {"side_left", "side_right", "shoulder_left", "shoulder_right", "background_left", "background_right", "top_left", "top_right", "bottom_left", "bottom_right"}:
        max_line_w_1x = video_width * (0.29 if is_wide else (0.48 if is_square else 0.50))
        max_words_line = 2 if is_wide else 3
    elif placement == "custom":
        fallback_w = video_width * (0.34 if is_wide else (0.58 if is_square else 0.62))
        max_line_w_1x = max(fallback_w, float(rect_w_px - 18)) if rect_w_px else fallback_w
        max_words_line = 3 if (not is_wide or (rect_w_px and rect_w_px >= video_width * 0.36)) else 2
    else:
        max_line_w_1x = video_width * (0.64 if is_wide else (0.76 if is_square else 0.84))
        max_words_line = 4 if (is_wide or is_square) else 3

    chosen = None
    shrink_steps = (1.0, 0.90, 0.82, 0.74, 0.66) if rect_h_px else (1.0, 0.92, 0.84)
    for shrink in shrink_steps:
        fs_px = max(16, round(nominal_fs * shrink))
        base_font = _load_font(base_path, fs_px * aa)
        focus_font = _load_font(
            serif_path if style_name == "editorial_duo" else base_path,
            round(fs_px * (1.24 if style_name == "editorial_duo" else 1.07) * aa),
        )
        tracking = float(style.get("spacing") or 0.0) * aa * (1.15 if style_name in {"wall_type", "luxury"} else 0.70)
        max_line_w = max_line_w_1x * aa

        words_meta = []
        for idx, w in enumerate(cue["words"]):
            raw_w = str(w["word"]).strip()
            if style_name == "editorial_duo":
                disp_base = raw_w.upper()
                disp_active = raw_w.lower() if len(raw_w) <= 3 else raw_w
            else:
                disp_base = raw_w.upper() if uppercase else raw_w
                disp_active = disp_base
            w_base = _measure_word_tracked(base_font, disp_base, tracking)
            w_active = _measure_word_tracked(focus_font, disp_active, tracking)
            active_reserve = 1.14 if style_name == "editorial_duo" else 1.06
            words_meta.append(
                {
                    "idx": idx,
                    "raw": raw_w,
                    "disp_base": disp_base,
                    "disp_active": disp_active,
                    "w_slot": max(w_base, w_active * active_reserve),
                    "w_base": w_base,
                    "w_active": w_active,
                    "start": float(w["start"]),
                    "end": float(w["end"]),
                }
            )

        space_mult = 1.45 if style_name == "editorial_duo" else 1.12
        space_w = (float(base_font.getlength(" ")) + max(0.0, tracking * 0.4)) * space_mult
        lines: List[List[int]] = []
        cur_line: List[int] = []
        cur_w = 0.0
        for item in words_meta:
            ww = item["w_slot"]
            add = ww if not cur_line else space_w + ww
            if cur_line and (len(cur_line) >= max_words_line or (cur_w + add) > max_line_w):
                lines.append(cur_line)
                cur_line = [item["idx"]]
                cur_w = ww
            else:
                cur_line.append(item["idx"])
                cur_w += add
        if cur_line:
            lines.append(cur_line)

        line_step = fs_px * aa * (1.26 if style_name == "editorial_duo" else 1.18)
        total_h_aa = fs_px * aa * 1.12 + max(0, len(lines) - 1) * line_step
        max_w_aa = max(
            (sum(words_meta[k]["w_slot"] for k in l) + space_w * max(0, len(l) - 1)) for l in lines
        )

        pad_x = round(fs_px * aa * 0.38)
        pad_y = round(fs_px * aa * 0.26)
        extra_pad = round(fs_px * aa * 0.28)
        box_w_aa = int(math.ceil(max_w_aa + (pad_x + extra_pad) * 2))
        box_h_aa = int(math.ceil(total_h_aa + (pad_y + extra_pad) * 2))
        box_w = max(40, int(math.ceil(box_w_aa / aa)))
        box_h = max(32, int(math.ceil(box_h_aa / aa)))
        chosen = (
            fs_px, tracking, base_font, focus_font, words_meta, space_w, lines,
            line_step, pad_x, pad_y, extra_pad, box_w_aa, box_h_aa, box_w, box_h,
        )
        fits_lines = len(lines) <= 3
        fits_box = True
        if rect_w_px and rect_h_px:
            fits_box = (box_w <= rect_w_px + 18) and (box_h <= rect_h_px + 14)
        if fits_lines and fits_box:
            break

    assert chosen is not None
    (
        fs_px, tracking, base_font, focus_font, words_meta, space_w, lines,
        line_step, pad_x, pad_y, extra_pad, box_w_aa, box_h_aa, box_w, box_h,
    ) = chosen

    # Resolve top-left of box in 1x video pixels matching ASS anchor semantics
    ass_align = int(cue["ass_align"])
    px = float(cue["pos_x"])
    py = float(cue["pos_y"])

    if ass_align in (1, 4, 7):
        anchor_x = max(round(video_width * 0.05), round(px))
        x0 = anchor_x - round((pad_x + extra_pad) / aa)
    elif ass_align in (3, 6, 9):
        anchor_x = min(round(video_width * 0.95), round(px))
        x0 = anchor_x - box_w + round((pad_x + extra_pad) / aa)
    else:
        x0 = round(px - box_w * 0.5)

    if ass_align in (7, 8, 9):
        y0 = round(py - (pad_y + extra_pad) / aa)
    elif ass_align in (4, 5, 6):
        y0 = round(py - box_h * 0.5)
    else:
        y0 = round(py - box_h + (pad_y + extra_pad) / aa)

    # Hard clamp card center/edges inside verified Smart Safe pocket if available
    if s_rect and placement != "behind_subject":
        sx1, sy1, sx2, sy2 = (
            round(s_rect[0] * video_width),
            round(s_rect[1] * video_height),
            round(s_rect[2] * video_width),
            round(s_rect[3] * video_height),
        )
        if sx2 > sx1 + box_w:
            x0 = max(sx1 - 4, min(sx2 - box_w + 4, x0))
        if sy2 > sy1 + box_h:
            y0 = max(sy1 - 4, min(sy2 - box_h + 4, y0))
        else:
            y0 = max(round(video_height * 0.045), min(sy2 - box_h + 4, y0))

    # Clamp strictly inside video bounds with safe bezel margin
    x0 = max(round(video_width * 0.04), min(video_width - box_w - round(video_width * 0.04), x0))
    y0 = max(round(video_height * 0.04), min(video_height - box_h - round(video_height * 0.04), y0))

    # Position lines inside the aa sprite canvas
    word_positions: Dict[int, Dict[str, Any]] = {}
    first_cy = (pad_y + extra_pad) + fs_px * aa * 0.56
    for l_idx, line_idxs in enumerate(lines):
        lw = sum(words_meta[k]["w_slot"] for k in line_idxs) + space_w * max(0, len(line_idxs) - 1)
        if ass_align in (1, 4, 7):
            lx = float(pad_x + extra_pad)
        elif ass_align in (3, 6, 9):
            lx = float(box_w_aa - (pad_x + extra_pad) - lw)
        else:
            lx = (box_w_aa - lw) * 0.5
        cy = first_cy + l_idx * line_step
        for k in line_idxs:
            m = words_meta[k]
            word_positions[k] = {
                **m,
                "cx": lx + m["w_slot"] * 0.5,
                "cy": cy,
                "x_left": lx,
                "x_right": lx + m["w_slot"],
            }
            lx += m["w_slot"] + space_w

    return {
        "aa": aa,
        "fs_px": fs_px,
        "tracking": tracking,
        "base_path": base_path,
        "serif_path": serif_path,
        "base_font": base_font,
        "focus_font": focus_font,
        "lines": lines,
        "words": word_positions,
        "pad_x": pad_x,
        "pad_y": pad_y,
        "extra_pad": extra_pad,
        "box_w_aa": box_w * aa,
        "box_h_aa": box_h * aa,
        "roi_x0": x0,
        "roi_y0": y0,
        "roi_w": box_w,
        "roi_h": box_h,
        "card_x0": extra_pad,
        "card_y0": extra_pad,
        "card_x1": box_w * aa - extra_pad,
        "card_y1": box_h * aa - extra_pad,
    }


def _apply_frosted_backdrop(
    roi_bgr: np.ndarray,
    rect_1x: Tuple[int, int, int, int],
    radius_1x: int,
    tint_bgr: Tuple[int, int, int],
    tint_alpha: float,
    blur_sigma: float = 16.0,
    border_rgba: Optional[Tuple[int, int, int, int]] = None,
) -> np.ndarray:
    """True CapCut / Apple-style live backdrop frosted glass blur over video ROI."""
    rh, rw = roi_bgr.shape[:2]
    x0, y0, x1, y1 = (
        max(0, rect_1x[0]),
        max(0, rect_1x[1]),
        min(rw, rect_1x[2]),
        min(rh, rect_1x[3]),
    )
    if x1 <= x0 + 6 or y1 <= y0 + 6:
        return roi_bgr

    out = roi_bgr.copy()
    ksize = max(7, int(round(blur_sigma * 2)) | 1)
    blurred = cv2.GaussianBlur(roi_bgr[y0:y1, x0:x1], (ksize, ksize), blur_sigma)
    # Subtle contrast-preserving tint glaze
    tint = np.full_like(blurred, tint_bgr, dtype=np.uint8)
    frosted = cv2.addWeighted(blurred, 1.0 - tint_alpha, tint, tint_alpha, 0)

    # Anti-aliased rounded mask at 2x
    mw, mh = x1 - x0, y1 - y0
    mask_pil = Image.new("L", (mw * 2, mh * 2), 0)
    mdraw = ImageDraw.Draw(mask_pil)
    rad2 = max(4, min(mw, mh, int(radius_1x * 2)))
    mdraw.rounded_rectangle([0, 0, mw * 2 - 1, mh * 2 - 1], radius=rad2, fill=255)
    mask_aa = np.array(mask_pil.resize((mw, mh), Image.Resampling.LANCZOS), dtype=np.float32) / 255.0
    mask3 = mask_aa[:, :, None]

    # Ambient drop shadow slightly below card
    shadow_pil = Image.new("L", (rw, rh), 0)
    sdraw = ImageDraw.Draw(shadow_pil)
    sdraw.rounded_rectangle([x0, y0 + 4, x1, y1 + 4], radius=max(2, radius_1x), fill=145)
    shadow_pil = shadow_pil.filter(ImageFilter.GaussianBlur(radius=9))
    sh_alpha = (np.array(shadow_pil, dtype=np.float32) / 255.0)[:, :, None] * (1.0 - np.pad(mask_aa, ((y0, rh - y1), (x0, rw - x1))))[:, :, None]
    out = np.clip(out.astype(np.float32) * (1.0 - sh_alpha * 0.65), 0, 255).astype(np.uint8)

    patch = out[y0:y1, x0:x1].astype(np.float32)
    out[y0:y1, x0:x1] = np.clip(frosted.astype(np.float32) * mask3 + patch * (1.0 - mask3), 0, 255).astype(np.uint8)

    if border_rgba:
        b_overlay = Image.new("RGBA", (mw * 2, mh * 2), (0, 0, 0, 0))
        bdraw = ImageDraw.Draw(b_overlay)
        r_c, g_c, b_c, a_c = border_rgba
        bdraw.rounded_rectangle([1, 1, mw * 2 - 2, mh * 2 - 2], radius=rad2, outline=(b_c, g_c, r_c, a_c), width=3)
        # Subtle crisp 1px top specular catchlight
        bdraw.rounded_rectangle([3, 2, mw * 2 - 4, max(8, mh // 2)], radius=rad2, outline=(255, 255, 255, min(255, int(a_c * 0.9))), width=2)
        b_small = np.array(b_overlay.resize((mw, mh), Image.Resampling.LANCZOS), dtype=np.float32)
        ba = (b_small[:, :, 3:4] / 255.0)
        out[y0:y1, x0:x1] = np.clip(b_small[:, :, :3] * ba + out[y0:y1, x0:x1].astype(np.float32) * (1.0 - ba), 0, 255).astype(np.uint8)
    return out


def _render_cue_foreground_rgba(
    cue: Mapping[str, Any],
    layout: Mapping[str, Any],
    time_s: float,
) -> Image.Image:
    """Render 2x-supersampled transparent RGBA typography/pills/glow layer at `time_s`."""
    aa = int(layout["aa"])
    fs_px = int(layout["fs_px"])
    tracking = float(layout["tracking"])
    bw_aa = int(layout["box_w_aa"])
    bh_aa = int(layout["box_h_aa"])
    style = cue["style"]
    style_name = cue["style_name"]
    anim = str(style.get("animation") or "scale_pop")
    accent_rgb: Tuple[int, int, int] = cue["accent_rgb"]
    accent2_rgb: Tuple[int, int, int]
    _, accent2_rgb = _complementary_gradient_pair(accent_rgb)
    primary_rgb: Tuple[int, int, int] = cue["primary_rgb"]
    words_dict = layout["words"]
    word_count = len(words_dict)

    # Identify active spoken word + fractional progress + local elapsed time
    active_idx = 0
    for i in range(word_count):
        if time_s >= words_dict[i]["start"]:
            active_idx = i
        else:
            break
    cur_w = words_dict[active_idx]
    local_elapsed = max(0.0, time_s - cur_w["start"])
    word_dur = max(0.05, cur_w["end"] - cur_w["start"])
    word_frac = max(0.0, min(1.0, local_elapsed / word_dur))
    cue_elapsed = max(0.0, time_s - float(cue["start"]))
    cue_remaining = max(0.0, float(cue["end"]) - time_s)
    fade_alpha = 1.0
    if anim in {"fade_word", "editorial_duo"}:
        fade_alpha = max(0.0, min(1.0, cue_elapsed / 0.11, cue_remaining / 0.13))
    elif cue_elapsed < 0.06:
        fade_alpha = cue_elapsed / 0.06

    base_layer = Image.new("RGBA", (bw_aa, bh_aa), (0, 0, 0, 0))
    glow_layer = Image.new("RGBA", (bw_aa, bh_aa), (0, 0, 0, 0))
    shadow_layer = Image.new("RGBA", (bw_aa, bh_aa), (0, 0, 0, 0))
    pill_layer = Image.new("RGBA", (bw_aa, bh_aa), (0, 0, 0, 0))

    g_draw = ImageDraw.Draw(glow_layer)
    s_draw = ImageDraw.Draw(shadow_layer)
    b_draw = ImageDraw.Draw(base_layer)
    p_draw = ImageDraw.Draw(pill_layer)

    # 1. Architectural Wall Type vertical accent rule & sleek container (NO ugly brown block!)
    if style_name == "wall_type":
        cx0 = layout["card_x0"]
        cy0 = layout["card_y0"] + round(fs_px * aa * 0.16)
        cy1 = layout["card_y1"] - round(fs_px * aa * 0.16)
        bar_w = max(6, round(fs_px * aa * 0.11))
        bar_x = max(4, cx0 + round(fs_px * aa * 0.14))
        p_draw.rounded_rectangle(
            [bar_x, cy0, bar_x + bar_w, cy1],
            radius=max(3, bar_w // 2),
            fill=(*accent_rgb, 245),
        )
        g_draw.rounded_rectangle(
            [bar_x - 2, cy0 - 2, bar_x + bar_w + 2, cy1 + 2],
            radius=max(3, bar_w // 2),
            fill=(*accent_rgb, 145),
        )

    # Luxury delicate gold hairlines
    if style_name == "luxury":
        lx0 = layout["card_x0"] + round(fs_px * aa * 0.25)
        lx1 = layout["card_x1"] - round(fs_px * aa * 0.25)
        ly0 = layout["card_y0"] + round(fs_px * aa * 0.06)
        ly1 = layout["card_y1"] - round(fs_px * aa * 0.06)
        p_draw.line([(lx0, ly0), (lx1, ly0)], fill=(*accent_rgb, 165), width=max(2, aa))
        p_draw.line([(lx0, ly1), (lx1, ly1)], fill=(*accent_rgb, 165), width=max(2, aa))

    # Kinetic smooth sliding progress bar beneath active word
    if anim == "kinetic_bar":
        aw = words_dict[active_idx]
        bar_h = max(6, round(fs_px * aa * 0.095))
        bx0 = round(aw["x_left"] - fs_px * aa * 0.06)
        bx1 = round(aw["x_left"] + aw["w_slot"] + fs_px * aa * 0.06)
        by0 = round(aw["cy"] + fs_px * aa * 0.50)
        grad_bar = _make_gradient_patch(max(4, bx1 - bx0), bar_h, accent_rgb, accent2_rgb, alpha=250, diagonal=False)
        bar_mask = Image.new("L", grad_bar.size, 0)
        ImageDraw.Draw(bar_mask).rounded_rectangle([0, 0, grad_bar.width - 1, grad_bar.height - 1], radius=bar_h // 2, fill=255)
        pill_layer.paste(grad_bar, (bx0, by0), bar_mask)
        g_draw.rounded_rectangle([bx0, by0, bx1, by0 + bar_h], radius=bar_h // 2, fill=(*accent_rgb, 150))

    # Active background pill / sticker / highlighter swipe / editorial rule
    if anim in {"active_pill", "sticker_pill", "marker_swipe"}:
        aw = words_dict[active_idx]
        spring_s = _spring_overshoot(local_elapsed, duration_s=0.19, amplitude=0.14)
        padx = fs_px * aa * 0.24 * spring_s
        pady = fs_px * aa * 0.14 * spring_s
        half_w = (aw["w_slot"] * 0.5) * spring_s + padx
        half_h = (fs_px * aa * 0.52) * spring_s + pady
        px0 = round(aw["cx"] - half_w)
        px1 = round(aw["cx"] + half_w)
        py0 = round(aw["cy"] - half_h)
        py1 = round(aw["cy"] + half_h)

        if anim == "active_pill":
            rad = max(8, round(fs_px * aa * 0.28))
            pw, ph = max(8, px1 - px0), max(8, py1 - py0)
            c1, c2 = ((225, 29, 72), (168, 16, 52)) if style_name == "newsroom" else (accent_rgb, accent2_rgb)
            grad = _make_gradient_patch(pw, ph, c1, c2, alpha=252)
            pmask = Image.new("L", (pw, ph), 0)
            ImageDraw.Draw(pmask).rounded_rectangle([0, 0, pw - 1, ph - 1], radius=rad, fill=255)
            # Soft ambient glow behind active pill
            s_draw.rounded_rectangle([px0, py0 + 4 * aa, px1, py1 + 4 * aa], radius=rad, fill=(0, 0, 0, 145))
            g_draw.rounded_rectangle([px0 - 2 * aa, py0 - 2 * aa, px1 + 2 * aa, py1 + 2 * aa], radius=rad, fill=(*c1, 115))
            pill_layer.paste(grad, (px0, py0), pmask)
        elif anim == "sticker_pill":
            rad = max(8, round(fs_px * aa * 0.24))
            tilt_deg = -2.2 if (active_idx % 2 == 0) else 1.8
            pw, ph = max(12, px1 - px0 + 16), max(12, py1 - py0 + 16)
            sticker = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
            st_d = ImageDraw.Draw(sticker)
            # Accent offset slab + cream die-cut badge
            st_d.rounded_rectangle([10, 10, pw - 2, ph - 2], radius=rad, fill=(*accent_rgb, 255))
            st_d.rounded_rectangle([4, 4, pw - 8, ph - 8], radius=rad, fill=(252, 250, 242, 255), outline=(14, 14, 22, 255), width=max(3, round(aa * 1.8)))
            sticker_rot = sticker.rotate(tilt_deg, resample=Image.Resampling.BICUBIC, expand=True)
            pill_layer.alpha_composite(sticker_rot, (round(aw["cx"] - sticker_rot.width * 0.5), round(aw["cy"] - sticker_rot.height * 0.5)))
        elif anim == "marker_swipe":
            reveal_frac = min(1.0, 0.25 + word_frac * 0.95)
            mx0 = round(aw["x_left"] - fs_px * aa * 0.16)
            mx1 = round(mx0 + (aw["w_slot"] + fs_px * aa * 0.32) * reveal_frac)
            my0 = round(aw["cy"] - fs_px * aa * 0.44)
            my1 = round(aw["cy"] + fs_px * aa * 0.48)
            p_draw.rounded_rectangle([mx0, my0, max(mx0 + 8, mx1), my1], radius=max(5, round(fs_px * aa * 0.14)), fill=(*accent_rgb, 245))

    # 2. Draw all visible words cleanly with crisp shadows & focus curves
    for idx in range(word_count):
        if anim == "true_typewriter" and idx > active_idx:
            continue
        wm = words_dict[idx]
        is_active = idx == active_idx

        word_text = wm["disp_active"] if is_active else wm["disp_base"]
        if anim == "true_typewriter" and is_active:
            n_ch = max(1, min(len(word_text), math.ceil(len(word_text) * max(0.08, word_frac))))
            word_text = word_text[:n_ch] + ("|" if word_frac < 0.96 else "")

        # Per-word scale + vertical offset kinetics
        word_scale = 1.0
        dy = 0.0
        if is_active:
            if anim in {"spring_pop", "story_pop", "scale_pop", "focus_cut", "rainbow_words", "neon_bloom"}:
                amp = 0.24 if anim == "spring_pop" else 0.16
                word_scale = _spring_overshoot(local_elapsed, duration_s=0.20, amplitude=amp)
            elif anim == "editorial_duo":
                word_scale = _spring_overshoot(local_elapsed, duration_s=0.22, amplitude=0.12)
            elif anim == "vertical_bounce":
                hop_t = min(1.0, local_elapsed / 0.18)
                hop = math.sin(hop_t * math.pi) * (1.0 - hop_t * 0.35)
                dy = -fs_px * aa * 0.26 * hop
                word_scale = 1.0 + 0.12 * hop

        # Choose font & ink color
        is_serif_active = (style_name == "editorial_duo" and is_active) or style_name in {"editorial", "luxury"}
        target_path = layout["serif_path"] if is_serif_active else layout["base_path"]
        target_size = round(fs_px * aa * (1.24 if (style_name == "editorial_duo" and is_active) else 1.0) * word_scale)
        w_font = _load_font(target_path, target_size)

        if anim in {"active_pill", "sticker_pill"} and is_active:
            ink_rgb = (255, 255, 255) if style_name == "newsroom" else (14, 16, 24)
        elif anim == "marker_swipe" and is_active:
            ink_rgb = (14, 14, 20)
        elif anim == "rainbow_words":
            ink_rgb = RAINBOW_RGB[idx % len(RAINBOW_RGB)]
        elif is_active and style_name != "minimal":
            ink_rgb = (255, 255, 255) if anim == "neon_bloom" else accent_rgb
        elif style_name == "comic" and not is_active:
            ink_rgb = (16, 18, 28)
        elif style_name == "comic" and is_active:
            ink_rgb = (255, 255, 255)
        elif style_name == "sticker" and not is_active:
            ink_rgb = (255, 255, 255)
        elif anim in {"focus_cut", "fade_word"} and idx > active_idx:
            ink_rgb = primary_rgb
        else:
            ink_rgb = primary_rgb

        # Context dimming for creator spotlight contrast (Captions.ai / Hormozi focus)
        word_alpha = 255
        if not is_active:
            if anim in {"focus_cut", "editorial_duo", "glass_card"} or style_name == "wall_type":
                word_alpha = 185 if idx > active_idx else 218
            elif anim == "karaoke_fill" and idx < active_idx:
                ink_rgb = accent_rgb

        cx = wm["cx"]
        cy = wm["cy"] + dy
        w_measured = _measure_word_tracked(w_font, word_text, tracking)
        draw_x = cx - w_measured * 0.5

        # Crisp optical neon bloom on active/bloom words (tight inner tube + vibrant outer aura + subtle contrast edge)
        if anim == "neon_bloom" or (style_name in {"word_pill", "editorial_duo", "spring_slam"} and is_active):
            bloom_a = 245 if anim == "neon_bloom" else 78
            _draw_text_tracked(
                g_draw,
                (draw_x, cy),
                word_text,
                w_font,
                fill=(*accent_rgb, bloom_a if is_active else 140),
                tracking_px=tracking,
                stroke_width=max(4, round(fs_px * aa * 0.10)) if anim == "neon_bloom" else 0,
                stroke_fill=(*accent_rgb, bloom_a if is_active else 130),
            )
            if anim == "neon_bloom" and is_active:
                _draw_text_tracked(
                    p_draw,
                    (draw_x, cy),
                    word_text,
                    w_font,
                    fill=(*accent_rgb, 245),
                    tracking_px=tracking,
                    stroke_width=max(3, round(fs_px * aa * 0.065)),
                    stroke_fill=(14, 24, 34, 210),
                )

        # Soft diffuse shadow under bare/open words (never harsh inside solid light pills)
        use_clean_pill_ink = anim in {"active_pill", "sticker_pill", "marker_swipe"} and is_active and style_name != "newsroom"
        bright_backdrop = float(cue.get("roi_luma", 0.5)) > 0.56
        stroke_w = 0
        stroke_col: Optional[Tuple[int, int, int, int]] = None
        if not use_clean_pill_ink:
            if style_name in {"sticker", "comic", "spring_slam", "watch_me", "rainbow", "bounce", "retro"}:
                stroke_w = max(2, round(fs_px * aa * 0.048))
                stroke_col = (8, 10, 16, 235)
            elif anim == "neon_bloom":
                stroke_w = max(2, round(fs_px * aa * 0.032))
                stroke_col = (*accent_rgb, 235) if is_active else (14, 18, 28, 185)
            elif bright_backdrop:
                # Crisp dark contour on light studio walls so serif/minimal/karaoke stay effortlessly legible
                stroke_w = max(2, round(fs_px * aa * 0.032))
                stroke_col = (6, 8, 14, 195)
            else:
                stroke_w = max(1, round(fs_px * aa * 0.018))
                stroke_col = (6, 8, 14, 145)
            sh_offset_y = round(fs_px * aa * 0.068)
            sh_offset_x = round(fs_px * aa * 0.045) if style_name in {"retro", "comic"} else 0
            _draw_text_tracked(
                s_draw,
                (draw_x + sh_offset_x, cy + sh_offset_y),
                word_text,
                w_font,
                fill=(4, 6, 12, 200 if bright_backdrop else 170),
                tracking_px=tracking,
                stroke_width=stroke_w,
                stroke_fill=(4, 6, 12, 185 if bright_backdrop else 150),
            )

        # Render gradient fill on open display active words (NEVER inside filled gradient pill where active_pill ink is dark)
        if is_active and style_name in {"spring_slam", "headline", "editorial_duo"}:
            text_mask_img = Image.new("RGBA", (bw_aa, bh_aa), (0, 0, 0, 0))
            tm_draw = ImageDraw.Draw(text_mask_img)
            _draw_text_tracked(
                tm_draw,
                (draw_x, cy),
                word_text,
                w_font,
                fill=(255, 255, 255, word_alpha),
                tracking_px=tracking,
            )
            if stroke_w > 0 and stroke_col is not None:
                _draw_text_tracked(
                    b_draw,
                    (draw_x, cy),
                    word_text,
                    w_font,
                    fill=(0, 0, 0, 0),
                    tracking_px=tracking,
                    stroke_width=stroke_w,
                    stroke_fill=stroke_col,
                )
            grad_fill = _make_gradient_patch(bw_aa, bh_aa, accent_rgb if is_active else primary_rgb, accent2_rgb if is_active else (218, 232, 252), alpha=word_alpha)
            base_layer.paste(grad_fill, (0, 0), text_mask_img.getchannel("A"))
        else:
            _draw_text_tracked(
                b_draw,
                (draw_x, cy),
                word_text,
                w_font,
                fill=(*ink_rgb, word_alpha),
                tracking_px=tracking,
                stroke_width=stroke_w,
                stroke_fill=stroke_col,
            )

    # Composite glow + shadow blurs + pills + crisp typography in correct order
    out = Image.new("RGBA", (bw_aa, bh_aa), (0, 0, 0, 0))
    if glow_layer.getbbox():
        blur_rad = round(fs_px * aa * (0.24 if anim == "neon_bloom" else 0.14))
        out.alpha_composite(glow_layer.filter(ImageFilter.GaussianBlur(radius=max(2, blur_rad))))
    if shadow_layer.getbbox():
        sh_rad = round(fs_px * aa * (0.04 if style_name in {"retro", "comic"} else 0.11))
        out.alpha_composite(shadow_layer.filter(ImageFilter.GaussianBlur(radius=max(1, sh_rad))))
    out.alpha_composite(pill_layer)
    out.alpha_composite(base_layer)

    if fade_alpha < 0.995:
        a = out.getchannel("A").point(lambda v: int(round(v * fade_alpha)))
        out.putalpha(a)

    # Downsample cleanly 2x -> 1x with Lanczos anti-aliasing
    return out.resize((bw_aa // aa, bh_aa // aa), Image.Resampling.LANCZOS)


def render_pro_caption_on_frame(
    frame_bgr: np.ndarray,
    time_s: float,
    cues: Sequence[Mapping[str, Any]],
    rvm_alpha_full: Optional[np.ndarray] = None,
    layout_cache: Optional[Dict[str, Dict[str, Any]]] = None,
) -> np.ndarray:
    """Composite active Pro RGBA cue(s) onto `frame_bgr`, with backdrop blur and depth occlusion."""
    active = [c for c in cues if float(c["start"]) <= time_s <= float(c["end"])]
    if not active:
        return frame_bgr

    fh, fw = frame_bgr.shape[:2]
    out = frame_bgr.copy()
    cache = layout_cache if layout_cache is not None else {}

    for cue in active:
        cid = (
            f"{cue.get('id', '')}|{round(float(cue['start']), 3)}|{cue.get('style_name', '')}|"
            f"{round(float(cue.get('pos_x', 0.0)), 1)},{round(float(cue.get('pos_y', 0.0)), 1)}|"
            f"{' '.join(str(w.get('word', '')) for w in cue.get('words') or ())}"
        )
        layout = cache.get(cid)
        if layout is None:
            layout = _layout_cue_lines(cue, fw, fh, aa=2)
            cache[cid] = layout

        x0, y0, rw, rh = int(layout["roi_x0"]), int(layout["roi_y0"]), int(layout["roi_w"]), int(layout["roi_h"])
        x1, y1 = min(fw, x0 + rw), min(fh, y0 + rh)
        if x1 <= x0 + 8 or y1 <= y0 + 8:
            continue

        style_name = str(cue["style_name"])
        anim = str(cue["style"].get("animation") or "")
        roi_bgr = out[y0:y1, x0:x1]
        bg_saved = roi_bgr.copy() if rvm_alpha_full is not None else None
        roi_luma = float(cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY).mean()) / 255.0
        cue_with_luma = {**cue, "roi_luma": roi_luma}

        # 1. Backdrop frosted blur / card surface for Glass, Story, Kinetic Bar, Typewriter, or high-clutter Scrim
        aa = int(layout["aa"])
        card_1x = (
            max(2, round(layout["card_x0"] / aa)),
            max(2, round(layout["card_y0"] / aa)),
            min(rw - 2, round(layout["card_x1"] / aa)),
            min(rh - 2, round(layout["card_y1"] / aa)),
        )
        accent_bgr = (cue["accent_rgb"][2], cue["accent_rgb"][1], cue["accent_rgb"][0])
        if anim == "glass_card":
            roi_bgr = _apply_frosted_backdrop(
                roi_bgr,
                card_1x,
                radius_1x=14,
                tint_bgr=(28, 19, 12),
                tint_alpha=0.46,
                blur_sigma=16.0,
                border_rgba=(255, 255, 255, 88),
            )
        elif anim == "story_pop":
            roi_bgr = _apply_frosted_backdrop(
                roi_bgr,
                card_1x,
                radius_1x=16,
                tint_bgr=(44, 14, 24),
                tint_alpha=0.68,
                blur_sigma=14.0,
                border_rgba=(*cue["accent_rgb"], 120),
            )
        elif anim in {"kinetic_bar", "true_typewriter"} or style_name == "boxed":
            roi_bgr = _apply_frosted_backdrop(
                roi_bgr,
                card_1x,
                radius_1x=12 if anim == "kinetic_bar" else 8,
                tint_bgr=(24, 16, 10),
                tint_alpha=0.72,
                blur_sigma=12.0,
                border_rgba=(*cue["accent_rgb"], 110),
            )
        elif style_name == "comic":
            roi_bgr = _apply_frosted_backdrop(
                roi_bgr,
                card_1x,
                radius_1x=12,
                tint_bgr=accent_bgr,
                tint_alpha=0.92,
                blur_sigma=2.0,
                border_rgba=(12, 14, 22, 245),
            )
        elif cue.get("needs_scrim") and style_name in {"wall_type", "editorial", "luxury", "minimal"}:
            # Automatic frosted readability glaze when background pocket has high clutter / TV glare
            roi_bgr = _apply_frosted_backdrop(
                roi_bgr,
                card_1x,
                radius_1x=10,
                tint_bgr=(18, 12, 8),
                tint_alpha=0.52,
                blur_sigma=15.0,
                border_rgba=(255, 255, 255, 42),
            )

        # 2. Alpha-composite 2x supersampled RGBA typography layer over ROI
        sprite_rgba = _render_cue_foreground_rgba(cue_with_luma, layout, time_s)
        sprite_np = np.array(sprite_rgba, dtype=np.uint8)[: y1 - y0, : x1 - x0]
        # PIL is RGBA -> convert RGB slice to BGR for OpenCV ROI blending
        fg_bgr = sprite_np[:, :, 2::-1].astype(np.float32)
        fg_a = sprite_np[:, :, 3:4].astype(np.float32) / 255.0
        comp = np.clip(fg_bgr * fg_a + roi_bgr.astype(np.float32) * (1.0 - fg_a), 0, 255).astype(np.uint8)

        # 3. Real Depth-Behind-Subject Occlusion ONLY for explicit wall/depth stage treatments (not Safe dodge modes)
        placement = str(cue.get("placement") or "")
        allow_depth_sandwich = (
            style_name == "wall_type"
            or placement in {"behind_subject", "background_center"}
        )
        if (
            rvm_alpha_full is not None
            and bg_saved is not None
            and allow_depth_sandwich
        ):
            roi_alpha = rvm_alpha_full[y0:y1, x0:x1]
            if float((roi_alpha > 0.35).mean()) > 0.008:
                # Feather alpha slightly so hair & clothing edges sit seamlessly in front of typography
                soft_a = cv2.GaussianBlur(np.clip(roi_alpha, 0.0, 1.0), (5, 5), 0)[:, :, None]
                # Soft drop shadow cast by foreground subject edges onto caption layer behind them
                dil_shadow = np.clip(cv2.dilate(roi_alpha, np.ones((7, 7), np.uint8)) - roi_alpha, 0.0, 1.0)
                shadow_dark = 1.0 - cv2.GaussianBlur(dil_shadow, (9, 9), 0)[:, :, None] * 0.45
                comp_shadowed = comp.astype(np.float32) * shadow_dark
                comp = np.clip(
                    bg_saved.astype(np.float32) * soft_a + comp_shadowed * (1.0 - soft_a),
                    0,
                    255,
                ).astype(np.uint8)

        out[y0:y1, x0:x1] = comp

    return out


def composite_pro_captions_on_video(
    input_video_path: str,
    output_video_path: str,
    segments: Sequence[Mapping[str, Any]],
    style_name: str,
    resolve_story_treatment: Callable[..., Mapping[str, Any]],
    caption_styles: Mapping[str, Mapping[str, Any]],
    caption_scale: float = 1.0,
    caption_position: str = "bottom",
    enable_depth_sandwich: bool = True,
    encode_args: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    """Composite Pro RGBA captions + optional RVM depth occlusion onto `input_video_path` via FFmpeg pipe."""
    cap = cv2.VideoCapture(str(input_video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video for Pro caption compositing: {input_video_path}")

    vw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1080)
    vh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1920)
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    if fps <= 0.1 or fps > 120.0:
        fps = 30.0

    style = dict(caption_styles.get(style_name) or caption_styles.get("word_pill") or {})
    cues = _build_word_cues(
        segments,
        style_name=style_name,
        style=style,
        resolve_story_treatment=resolve_story_treatment,
        video_width=vw,
        video_height=vh,
        caption_scale=caption_scale,
        caption_position=caption_position,
    )

    if not cues:
        cap.release()
        raise ValueError("No caption cues generated for Pro compositor")

    # Probe audio presence so audio track streams untouched (-c:a copy)
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(input_video_path)],
        capture_output=True,
        text=True,
    )
    has_audio = bool(probe.stdout.strip())

    ffmpeg_cmd = [
        "ffmpeg",
        "-y",
        "-v",
        "error",
        "-f",
        "rawvideo",
        "-vcodec",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "-s",
        f"{vw}x{vh}",
        "-r",
        f"{fps:.6g}",
        "-i",
        "-",
    ]
    if has_audio:
        ffmpeg_cmd.extend(["-i", str(input_video_path), "-map", "0:v:0", "-map", "1:a:0", "-c:a", "copy"])
    if encode_args:
        ffmpeg_cmd.extend([str(arg) for arg in encode_args])
    else:
        ffmpeg_cmd.extend(
            [
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "17",
                "-pix_fmt",
                "yuv420p",
            ]
        )
    if str(output_video_path).lower().endswith(".mov"):
        ffmpeg_cmd.extend(["-f", "mov"])
    ffmpeg_cmd.extend(["-movflags", "+faststart", str(output_video_path)])

    use_rvm_depth = (
        enable_depth_sandwich
        and style_name in {"wall_type", "headline", "editorial_duo", "editorial", "luxury"}
    )
    rvm_tracker = RvmMatteTracker(target_long_edge=384, downsample_ratio=0.5) if use_rvm_depth else None
    layout_cache: Dict[str, Dict[str, Any]] = {}
    last_alpha: Optional[np.ndarray] = None
    frames_written = 0

    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        assert proc.stdin is not None
        frame_idx = 0
        while True:
            ok, frame_bgr = cap.read()
            if not ok or frame_bgr is None:
                break
            t_s = frame_idx / fps
            has_active = any(float(c["start"]) <= t_s <= float(c["end"]) for c in cues)
            alpha_full = None
            if has_active and rvm_tracker is not None and rvm_tracker.available:
                # Run RVM every 2nd frame smoothly with temporal recurrent state for crisp speed
                if frame_idx % 2 == 0 or last_alpha is None:
                    last_alpha = rvm_tracker.step(frame_bgr, warmup_passes=1 if frames_written > 0 else 2)
                alpha_full = last_alpha

            composited = (
                render_pro_caption_on_frame(frame_bgr, t_s, cues, rvm_alpha_full=alpha_full, layout_cache=layout_cache)
                if has_active
                else frame_bgr
            )
            proc.stdin.write(np.ascontiguousarray(composited).tobytes())
            frame_idx += 1
            frames_written += 1

        proc.stdin.close()
        stderr_out = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
        ret = proc.wait()
        if ret != 0:
            raise RuntimeError(f"FFmpeg Pro caption composite failed ({ret}): {stderr_out}")
    finally:
        cap.release()
        if proc.poll() is None:
            proc.kill()

    return {
        "cuesRendered": len(cues),
        "framesWritten": frames_written,
        "usedRvmDepthSandwich": bool(rvm_tracker is not None and rvm_tracker.available),
        "styleName": style_name,
    }
