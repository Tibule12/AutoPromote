"""Pure-Python + PIL renderer and contract validator for Studio behind-subject typography.

Keeps behind-subject presets, bundled Inter TTF fonts, depth shadows, backlit glow,
and speech-synced word pop cleanly separated from GPU/NumPy imports so both the NVIDIA
worker (via studio_vfx_plan.VfxFrameRenderer) and offline CPU/Pillow tests run identical code.
"""
from __future__ import annotations

from functools import lru_cache
import math
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from PIL import Image, ImageColor, ImageDraw, ImageFilter, ImageFont

ASSETS_FONTS_DIR = Path(__file__).resolve().parent / "assets" / "fonts"
FALLBACK_DEJAVU_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

TEXT_BEHIND_PRESETS = {
    "classic",
    "hero_poster",
    "neon_backlit",
    "caption_punch",
    "editorial_depth",
}
TEXT_BEHIND_FONTS = {
    "inter_black",
    "inter_extrabold",
    "inter_semibold",
    "dejavu_bold",
}
TEXT_BEHIND_ANIMATIONS = {
    "fade",
    "spring_pop",
    "rise_reveal",
    "word_pop",
}
TEXT_BEHIND_OPTIONAL_FIELDS = (
    "preset",
    "font",
    "animation",
    "accent_color",
    "shadow",
    "glow",
    "tracking",
    "words",
    "hide_fg_captions",
)

TEXT_BEHIND_PRESET_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "classic": {
        "font": "dejavu_bold",
        "animation": "fade",
        "shadow": 0.0,
        "glow": 0.0,
        "tracking": 0.0,
    },
    "hero_poster": {
        "font": "inter_black",
        "animation": "spring_pop",
        "shadow": 0.65,
        "glow": 0.18,
        "tracking": 1.5,
    },
    "neon_backlit": {
        "font": "inter_black",
        "animation": "fade",
        "shadow": 0.55,
        "glow": 0.78,
        "tracking": 2.0,
    },
    "caption_punch": {
        "font": "inter_extrabold",
        "animation": "word_pop",
        "shadow": 0.72,
        "glow": 0.24,
        "tracking": 0.5,
    },
    "editorial_depth": {
        "font": "inter_semibold",
        "animation": "rise_reveal",
        "shadow": 0.45,
        "glow": 0.0,
        "tracking": 3.5,
    },
}

_FONT_FILENAMES = {
    "inter_black": "Inter-Black.ttf",
    "inter_extrabold": "Inter-ExtraBold.ttf",
    "inter_semibold": "Inter-SemiBold.ttf",
}


def resolve_text_behind_font_path(font_key: str) -> str:
    """Resolve bundled Inter or DejaVu TTF path for a behind-subject font key."""
    filename = _FONT_FILENAMES.get(str(font_key or "dejavu_bold"))
    if filename:
        bundled = ASSETS_FONTS_DIR / filename
        if bundled.is_file():
            return str(bundled)
    if Path(FALLBACK_DEJAVU_BOLD).is_file():
        return FALLBACK_DEJAVU_BOLD
    regular_inter = ASSETS_FONTS_DIR / "Inter-Black.ttf"
    return str(regular_inter)


@lru_cache(maxsize=64)
def load_text_behind_font(font_path: str, pixel_size: int) -> ImageFont.FreeTypeFont:
    """Cache loaded FreeTypeFont instances across frame renders."""
    return ImageFont.truetype(font_path, max(8, int(pixel_size)))


def validate_text_behind_effect(
    effect: Dict[str, Any],
    bounded_fn: Callable[[Any, float, float], float],
) -> None:
    """Validate optional behind-subject creative fields matching the frontend contract."""
    if "preset" in effect and effect["preset"] not in TEXT_BEHIND_PRESETS:
        raise ValueError("Unsupported behind-subject caption preset")
    if "font" in effect and effect["font"] not in TEXT_BEHIND_FONTS:
        raise ValueError("Unsupported behind-subject font")
    if "animation" in effect and effect["animation"] not in TEXT_BEHIND_ANIMATIONS:
        raise ValueError("Unsupported behind-subject animation")
    if "accent_color" in effect:
        accent = effect["accent_color"]
        if not isinstance(accent, str) or len(accent) != 7 or not accent.startswith("#"):
            raise ValueError("Use an explicit hex accent color for behind-subject captions")
        ImageColor.getrgb(accent)
    for field, limits in (("shadow", (0.0, 1.0)), ("glow", (0.0, 1.0)), ("tracking", (0.0, 40.0))):
        if field in effect:
            bounded_fn(effect[field], *limits)
    if "hide_fg_captions" in effect and type(effect["hide_fg_captions"]) is not bool:
        raise ValueError("Choose whether to hide duplicate foreground captions")
    if "words" in effect:
        words = effect["words"]
        if not isinstance(words, list) or not 1 <= len(words) <= 32:
            raise ValueError("Behind-subject words require 1–32 timed entries")
        start_bound = float(effect["start"])
        end_bound = float(effect["end"])
        for entry in words:
            if not isinstance(entry, dict) or set(entry.keys()) != {"word", "start", "end"}:
                raise ValueError("Behind-subject word entry must have word, start and end")
            token = entry["word"]
            if not isinstance(token, str) or not 1 <= len(token) <= 40 or any(ord(ch) <= 31 for ch in token):
                raise ValueError("Behind-subject word must be single-line text up to 40 chars")
            w_start = bounded_fn(entry["start"], start_bound, end_bound)
            w_end = bounded_fn(entry["end"], start_bound, end_bound)
            if w_end <= w_start:
                raise ValueError("Behind-subject word end must follow start")


def resolve_text_behind_options(effect: Dict[str, Any]) -> Dict[str, Any]:
    """Merge preset defaults and explicit overrides cleanly; preserves legacy classic defaults."""
    preset = effect.get("preset") or "classic"
    defaults = TEXT_BEHIND_PRESET_DEFAULTS.get(preset, TEXT_BEHIND_PRESET_DEFAULTS["classic"])
    return {
        "preset": preset,
        "font": effect.get("font") or defaults["font"],
        "animation": effect.get("animation") or defaults["animation"],
        "shadow": float(effect["shadow"]) if "shadow" in effect else float(defaults["shadow"]),
        "glow": float(effect["glow"]) if "glow" in effect else float(defaults["glow"]),
        "tracking": float(effect["tracking"]) if "tracking" in effect else float(defaults["tracking"]),
        "accent_color": effect.get("accent_color") or "#ffb33d",
    }


def _measure_tracked_word(font: ImageFont.FreeTypeFont, word: str, tracking: float) -> float:
    if not word:
        return 0.0
    if tracking <= 0.01:
        return float(font.getlength(word))
    return sum(float(font.getlength(ch)) for ch in word) + tracking * max(0, len(word) - 1)


def _draw_tracked_word(
    draw: ImageDraw.ImageDraw,
    x: float,
    y: float,
    word: str,
    font: ImageFont.FreeTypeFont,
    tracking: float,
    fill: Tuple[int, int, int, int],
    stroke_width: int = 0,
    stroke_fill: Optional[Tuple[int, int, int, int]] = None,
) -> float:
    if tracking <= 0.01:
        draw.text(
            (x, y),
            word,
            font=font,
            anchor="lm",
            fill=fill,
            stroke_width=stroke_width,
            stroke_fill=stroke_fill,
        )
        return float(font.getlength(word))
    cursor = x
    for ch in word:
        draw.text(
            (cursor, y),
            ch,
            font=font,
            anchor="lm",
            fill=fill,
            stroke_width=stroke_width,
            stroke_fill=stroke_fill,
        )
        cursor += float(font.getlength(ch)) + tracking
    return max(0.0, cursor - x - tracking)


def _split_lines_with_tokens(
    tokens: List[Tuple[int, str]],
    font: ImageFont.FreeTypeFont,
    max_line_width: float,
    tracking: float,
) -> List[List[Tuple[int, str]]]:
    if not tokens:
        return []
    space_w = float(font.getlength(" ")) + tracking
    lines: List[List[Tuple[int, str]]] = [[]]
    line_w = 0.0
    for idx, word in tokens:
        word_w = _measure_tracked_word(font, word, tracking)
        added = word_w if not lines[-1] else space_w + word_w
        if lines[-1] and (line_w + added) > max_line_width:
            lines.append([(idx, word)])
            line_w = word_w
        else:
            lines[-1].append((idx, word))
            line_w += added
    return lines


def _resolve_active_word_index(
    effect: Dict[str, Any],
    tokens: List[str],
    time_value: float,
) -> int:
    timed = effect.get("words")
    if isinstance(timed, list) and timed:
        best_idx = 0
        for idx, entry in enumerate(timed):
            if float(entry["start"]) <= time_value < float(entry["end"]):
                return idx
            if float(entry["start"]) <= time_value:
                best_idx = idx
        return min(best_idx, len(tokens) - 1) if tokens else 0
    if not tokens:
        return -1
    duration = max(0.05, float(effect["end"]) - float(effect["start"]))
    frac = max(0.0, min(0.999, (time_value - float(effect["start"])) / duration))
    return min(len(tokens) - 1, int(frac * len(tokens)))


def _spring_scale(local: float) -> float:
    if local <= 0.0:
        return 0.84
    if local >= 0.34:
        return 1.0
    t = local / 0.34
    overshoot = math.sin(t * math.pi) * 0.14 * (1.0 - t * 0.5)
    ease = 1.0 - (1.0 - t) ** 3
    return max(0.84, min(1.16, 0.84 + 0.16 * ease + overshoot))


def render_text_behind_layer(
    background: Image.Image,
    effect: Dict[str, Any],
    width: int,
    height: int,
    time_value: float,
    legacy_font: Optional[ImageFont.FreeTypeFont] = None,
) -> None:
    """Render stylized behind-subject text onto `background` prior to subject alpha composite."""
    has_modern_fields = any(field in effect for field in TEXT_BEHIND_OPTIONAL_FIELDS)
    opts = resolve_text_behind_options(effect)
    local = float(time_value) - float(effect["start"])
    remaining = float(effect["end"]) - float(time_value)
    color = ImageColor.getrgb(effect.get("color", "#ffffff"))
    x_center = width * float(effect["x"]) / 100.0
    y_center = height * float(effect["y"]) / 100.0

    # Exact fast-path compatibility when using pure legacy 5-field classic text_behind
    if (
        not has_modern_fields
        and opts["preset"] == "classic"
        and opts["animation"] == "fade"
        and opts["shadow"] == 0.0
        and opts["glow"] == 0.0
        and opts["tracking"] == 0.0
        and legacy_font is not None
    ):
        opacity = max(0.0, min(1.0, local / 0.25, remaining / 0.25))
        if opacity <= 0.0:
            return
        layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        draw.text(
            (x_center, y_center),
            effect["text"],
            font=legacy_font,
            anchor="mm",
            fill=(*color, round(255 * opacity)),
            stroke_width=2,
            stroke_fill=(10, 8, 25, round(180 * opacity)),
        )
        background.alpha_composite(layer)
        return

    anim = opts["animation"]
    fade_window = 0.25 if anim == "fade" else 0.18
    opacity = max(0.0, min(1.0, local / fade_window, remaining / fade_window))
    if opacity <= 0.0:
        return

    font_size = float(effect["font_size"])
    tracking = opts["tracking"]
    font_path = resolve_text_behind_font_path(opts["font"])

    scale = _spring_scale(local) if anim == "spring_pop" else 1.0
    motion_blur_radius = 0.0
    if anim == "rise_reveal" and local < 0.34:
        prog = max(0.0, min(1.0, local / 0.34))
        eased = 1.0 - (1.0 - prog) ** 3
        y_center += (1.0 - eased) * font_size * 0.42
        motion_blur_radius = (1.0 - eased) * 4.5

    base_px = max(8, round(font_size * scale))
    base_font = load_text_behind_font(font_path, base_px)
    accent_rgb = ImageColor.getrgb(opts["accent_color"])

    # Determine word tokens for multi-line layout & optional word_pop highlight
    timed_words = effect.get("words") if isinstance(effect.get("words"), list) else None
    if anim == "word_pop" and timed_words:
        raw_tokens = [str(w["word"]) for w in timed_words]
    else:
        raw_tokens = [tok for tok in str(effect["text"]).split(" ") if tok] or [str(effect["text"])]

    indexed_tokens = list(enumerate(raw_tokens))
    max_line_width = max(120.0, width * 0.86)
    lines = _split_lines_with_tokens(indexed_tokens, base_font, max_line_width, tracking)
    if not lines:
        return

    active_idx = _resolve_active_word_index(effect, raw_tokens, float(time_value)) if anim == "word_pop" else -1
    pop_font = (
        load_text_behind_font(font_path, max(8, round(base_px * 1.13)))
        if anim == "word_pop" and active_idx >= 0
        else base_font
    )
    line_height = font_size * 1.16 * scale
    total_block_h = line_height * len(lines)
    first_y = y_center - total_block_h / 2.0 + line_height / 2.0
    stroke_w = max(2, round(base_px * 0.032))

    # Build glow / shadow / crisp foreground layers
    glow_strength = opts["glow"]
    shadow_strength = opts["shadow"]
    glow_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0)) if glow_strength > 0 else None
    shadow_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0)) if shadow_strength > 0 else None
    fg_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))

    glow_draw = ImageDraw.Draw(glow_layer) if glow_layer is not None else None
    shadow_draw = ImageDraw.Draw(shadow_layer) if shadow_layer is not None else None
    fg_draw = ImageDraw.Draw(fg_layer)

    space_adv = float(base_font.getlength(" ")) + tracking
    shadow_dx = 0.0
    shadow_dy = max(3.0, base_px * 0.07)

    for line_idx, line_tokens in enumerate(lines):
        ly = first_y + line_idx * line_height
        token_widths: List[float] = []
        for tok_idx, tok_text in line_tokens:
            tok_font = pop_font if (anim == "word_pop" and tok_idx == active_idx) else base_font
            token_widths.append(_measure_tracked_word(tok_font, tok_text, tracking))
        total_w = sum(token_widths) + space_adv * max(0, len(line_tokens) - 1)
        cursor_x = x_center - total_w / 2.0

        for pos, (tok_idx, tok_text) in enumerate(line_tokens):
            is_active = anim == "word_pop" and tok_idx == active_idx
            tok_font = pop_font if is_active else base_font
            tok_w = token_widths[pos]
            tok_color = accent_rgb if is_active else color
            word_opacity = opacity if (anim != "word_pop" or tok_idx <= active_idx) else opacity * 0.86

            if glow_draw is not None:
                local_glow = glow_strength * (1.45 if is_active else 1.0)
                glow_alpha = max(0, min(255, round(210 * min(1.0, local_glow) * word_opacity)))
                glow_rgb = accent_rgb if (opts["preset"] == "neon_backlit" or is_active) else color
                _draw_tracked_word(
                    glow_draw,
                    cursor_x,
                    ly,
                    tok_text,
                    tok_font,
                    tracking,
                    fill=(*glow_rgb, glow_alpha),
                    stroke_width=stroke_w + 4,
                    stroke_fill=(*glow_rgb, glow_alpha),
                )

            if shadow_draw is not None:
                sh_alpha = max(0, min(255, round(215 * shadow_strength * word_opacity)))
                _draw_tracked_word(
                    shadow_draw,
                    cursor_x + shadow_dx,
                    ly + shadow_dy,
                    tok_text,
                    tok_font,
                    tracking,
                    fill=(6, 8, 18, sh_alpha),
                    stroke_width=stroke_w + 2,
                    stroke_fill=(6, 8, 18, sh_alpha),
                )

            _draw_tracked_word(
                fg_draw,
                cursor_x,
                ly,
                tok_text,
                tok_font,
                tracking,
                fill=(*tok_color, max(0, min(255, round(255 * word_opacity)))),
                stroke_width=stroke_w,
                stroke_fill=(8, 10, 22, max(0, min(255, round(215 * word_opacity)))),
            )
            cursor_x += tok_w + space_adv

    if glow_layer is not None:
        blur_r = max(4.0, base_px * (0.12 + 0.18 * glow_strength))
        background.alpha_composite(glow_layer.filter(ImageFilter.GaussianBlur(blur_r)))
    if shadow_layer is not None:
        sh_blur = max(3.0, base_px * 0.085)
        background.alpha_composite(shadow_layer.filter(ImageFilter.GaussianBlur(sh_blur)))
    if motion_blur_radius > 0.25:
        fg_layer = fg_layer.filter(ImageFilter.GaussianBlur(motion_blur_radius))
    background.alpha_composite(fg_layer)
