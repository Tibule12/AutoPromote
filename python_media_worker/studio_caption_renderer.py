"""Pure-Python + PIL + ASS caption renderer for Studio templates and FFmpeg export.

Keeps ASS generation, typography measurement, rounded vector pill badges, bloom layers,
typewriter progressive slices, vertical word hop coordinates, and behind-subject
suppression filtering free of heavyweight GPU/FastAPI imports so tests and worker share
one exact source of truth.
"""
from __future__ import annotations

from functools import lru_cache
import os
from pathlib import Path
import re
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

from PIL import ImageFont

try:
    from .viral_render_contract import resolve_caption_layout
except ImportError:
    from viral_render_contract import resolve_caption_layout

ASSETS_FONTS_DIR = Path(__file__).resolve().parent / "assets" / "fonts"

FONTNAME_TO_BUNDLED: Dict[str, str] = {
    "Inter Black": "Inter-Black.ttf",
    "Inter ExtraBold": "Inter-ExtraBold.ttf",
    "Inter SemiBold": "Inter-SemiBold.ttf",
    "Inter": "Inter-Regular.ttf",
    "DejaVu Sans": "DejaVuSans-Bold.ttf",
    "Noto Sans Symbols2": "NotoSansSymbols2-Regular.ttf",
}

FONTNAME_CSS_PER_ASS: Dict[str, float] = {
    "Inter Black": 0.8264729620661824,
    "Inter ExtraBold": 0.8264729620661824,
    "Inter SemiBold": 0.8264729620661824,
    "Inter": 0.8264729620661824,
    "DejaVu Sans": 0.8590604026845637,
    "DejaVu Sans Condensed": 0.8590604026845637,
    "DejaVu Sans Mono": 0.8590604026845637,
    "DejaVu Serif": 0.8590604026845637,
    "Noto Sans Symbols2": 0.5885815185403178,
}

SYSTEM_FONT_CANDIDATES: Dict[str, str] = {
    "DejaVu Sans": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "DejaVu Sans Condensed": "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf",
    "DejaVu Sans Mono": "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "DejaVu Serif": "/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf",
}


def seconds_to_ass_time(seconds: float) -> str:
    """Convert seconds to ASS time format: H:MM:SS.CC."""
    s = max(0.0, float(seconds))
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    cs = int(round((s % 1) * 100))
    if cs >= 100:
        sec += 1
        cs -= 100
        if sec >= 60:
            m += 1
            sec -= 60
            if m >= 60:
                h += 1
                m -= 60
    return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"


def escape_ass(text: Any) -> str:
    """Escape special ASS characters in dialogue text."""
    return str(text or "").replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


def chunk_words(
    words: Sequence[Mapping[str, Any]],
    max_words: int = 5,
    max_chars: Optional[int] = None,
) -> List[List[Mapping[str, Any]]]:
    """Split timed words into readable caption phrases without clipping mixed-language lines."""
    groups: List[List[Mapping[str, Any]]] = []
    current: List[Mapping[str, Any]] = []
    for w in words:
        word_text = str(w.get("word", "")).strip()
        if not word_text:
            continue
        clean = re.sub(r"\[.*?\]|\(.*?\)", "", word_text).strip()
        if not clean:
            continue
        prospective_length = len(
            " ".join([str(item.get("word", "")).strip() for item in [*current, w]])
        )
        if current and max_chars and prospective_length > int(max_chars):
            groups.append(current)
            current = [w]
            continue
        current.append(w)
        if len(current) >= max_words:
            groups.append(current)
            current = []
    if current:
        groups.append(current)
    return groups


def filter_suppressed_whisper_segments(
    whisper_result: Mapping[str, Any],
    suppress_ranges: Optional[Sequence[Mapping[str, Any]]],
) -> Dict[str, Any]:
    """Remove foreground caption segments or words overlapping behind-subject suppress windows."""
    segments = list(whisper_result.get("segments") or [])
    if not suppress_ranges:
        return {**whisper_result, "segments": segments}
    windows: List[Tuple[float, float]] = []
    for entry in suppress_ranges:
        try:
            s = float(entry.get("start_time", entry.get("start", 0.0)))
            e = float(entry.get("end_time", entry.get("end", 0.0)))
            if e > s:
                windows.append((s, e))
        except (TypeError, ValueError, AttributeError):
            continue
    if not windows:
        return {**whisper_result, "segments": segments}

    def is_suppressed(start: float, end: float) -> bool:
        dur = max(0.01, end - start)
        for ws, we in windows:
            overlap = min(end, we) - max(start, ws)
            if overlap >= min(dur * 0.45, 0.2):
                return True
        return False

    filtered: List[Dict[str, Any]] = []
    for seg in segments:
        s_start = float(seg.get("start", 0.0))
        s_end = float(seg.get("end", s_start))
        words = seg.get("words") or []
        if words:
            kept_words = [
                w
                for w in words
                if not is_suppressed(float(w.get("start", s_start)), float(w.get("end", s_end)))
            ]
            if not kept_words:
                continue
            filtered.append(
                {
                    **seg,
                    "start": float(kept_words[0].get("start", s_start)),
                    "end": float(kept_words[-1].get("end", s_end)),
                    "text": " ".join(str(w.get("word", "")).strip() for w in kept_words if str(w.get("word", "")).strip()),
                    "words": kept_words,
                }
            )
        else:
            if not is_suppressed(s_start, s_end):
                filtered.append(dict(seg))
    return {**whisper_result, "segments": filtered}


def _resolve_font_file(fontname: str, bold: bool = False) -> Optional[Path]:
    if fontname == "DejaVu Sans" and not bold:
        reg = ASSETS_FONTS_DIR / "DejaVuSans.ttf"
        if reg.is_file():
            return reg
    bundled_name = FONTNAME_TO_BUNDLED.get(fontname)
    if bundled_name:
        bundled = ASSETS_FONTS_DIR / bundled_name
        if bundled.is_file():
            return bundled
    sys_cand = SYSTEM_FONT_CANDIDATES.get(fontname)
    if sys_cand and Path(sys_cand).is_file():
        return Path(sys_cand)
    fallback = ASSETS_FONTS_DIR / "DejaVuSans-Bold.ttf"
    return fallback if fallback.is_file() else None


@lru_cache(maxsize=96)
def _load_pil_font(font_path: str, pixel_size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(font_path, max(8, int(pixel_size)))


def _measure_text_px(
    text: str,
    fontname: str,
    ass_fontsize: int,
    bold: bool = False,
    spacing: float = 0.0,
) -> float:
    if not text:
        return 0.0
    ratio = FONTNAME_CSS_PER_ASS.get(fontname, 0.84)
    em_px = max(8, round(ass_fontsize * ratio))
    font_path = _resolve_font_file(fontname, bold=bold)
    if font_path is None:
        return len(text) * (ass_fontsize * 0.56 + max(0.0, spacing))
    pil_font = _load_pil_font(str(font_path), em_px)
    width = float(pil_font.getlength(text))
    if spacing and len(text) > 1:
        width += float(spacing) * (len(text) - 1)
    return width


def _ass_rounded_rect_path(x0: float, y0: float, x1: float, y1: float, radius: float) -> str:
    ix0, iy0, ix1, iy1 = round(x0), round(y0), round(x1), round(y1)
    max_r = max(2, min((ix1 - ix0) // 2, (iy1 - iy0) // 2))
    r = max(2, min(max_r, round(radius)))
    return (
        f"m {ix0 + r} {iy0} "
        f"l {ix1 - r} {iy0} "
        f"b {ix1} {iy0} {ix1} {iy0} {ix1} {iy0 + r} "
        f"l {ix1} {iy1 - r} "
        f"b {ix1} {iy1} {ix1} {iy1} {ix1 - r} {iy1} "
        f"l {ix0 + r} {iy1} "
        f"b {ix0} {iy1} {ix0} {iy1} {ix0} {iy1 - r} "
        f"l {ix0} {iy0 + r} "
        f"b {ix0} {iy0} {ix0} {iy0} {ix0 + r} {iy0}"
    )


def _split_bgr_hex(ass_color: str, default_bgr: str = "FFFFFF") -> str:
    cleaned = str(ass_color or "").replace("&H", "").replace("&", "").strip().upper()
    if len(cleaned) == 8:
        return cleaned[2:]
    if len(cleaned) == 6:
        return cleaned
    return default_bgr


def _parse_placement_xy(
    caption_treatment: Mapping[str, Any],
    style: Mapping[str, Any],
    video_width: int,
    video_height: int,
) -> Tuple[int, float, float]:
    override = str(caption_treatment.get("text_override") or "")
    m = re.search(r"\\an(\d+)\\pos\(([-\d.]+),([-\d.]+)\)", override)
    if m:
        return int(m.group(1)), float(m.group(2)), float(m.group(3))
    align = int(style.get("alignment", 2))
    margin_v = float(style.get("margin_v", round(video_height * 0.12)))
    if align in (1, 4, 7):
        px = float(max(8, round(video_width * 0.04)))
    elif align in (3, 6, 9):
        px = float(video_width - max(8, round(video_width * 0.04)))
    else:
        px = float(video_width) / 2.0
    if align in (7, 8, 9):
        py = margin_v
    elif align in (4, 5, 6):
        py = float(video_height) / 2.0
    else:
        py = float(video_height) - margin_v
    return align, px, py


def chunk_words_to_fit(
    words: Sequence[Mapping[str, Any]],
    fontname: str,
    ass_fontsize: int,
    bold: bool,
    spacing: float,
    max_line_width: float,
    max_words: int = 4,
    uppercase: bool = False,
    separator: str = " ",
) -> List[List[Mapping[str, Any]]]:
    """Chunk words so every phrase fits on one single measured line inside max_line_width."""
    groups: List[List[Mapping[str, Any]]] = []
    current: List[Mapping[str, Any]] = []
    for w in words:
        word_text = str(w.get("word", "")).strip()
        if not word_text:
            continue
        clean = re.sub(r"\[.*?\]|\(.*?\)", "", word_text).strip()
        if not clean:
            continue
        candidate_tokens = [
            (str(item.get("word", "")).strip().upper() if uppercase else str(item.get("word", "")).strip())
            for item in [*current, w]
        ]
        candidate_width = _measure_text_px(
            separator.join(t for t in candidate_tokens if t),
            fontname,
            ass_fontsize,
            bold,
            spacing,
        )
        if current and (len(current) >= max_words or candidate_width > max_line_width):
            groups.append(current)
            current = [w]
        else:
            current.append(w)
    if current:
        groups.append(current)
    return groups


def _measure_group_word_boxes(
    words_raw: Sequence[str],
    icon_char: str,
    fontname: str,
    ass_fontsize: int,
    bold: bool,
    spacing: float,
    align: int,
    pos_x: float,
    pos_y: float,
    scale_override: float = 1.0,
    separator: str = " ",
) -> Tuple[List[Tuple[float, float]], float, float, float]:
    """Compute exact (left_x, right_x) of each word and overall block top_y/total_w in canvas px."""
    icon_w = 0.0
    if icon_char:
        icon_w = _measure_text_px(icon_char, "Noto Sans Symbols2", round(ass_fontsize * 1.36), False, 0.0)
        icon_w += _measure_text_px(" ", fontname, ass_fontsize, bold, spacing)
    space_w = _measure_text_px(separator, fontname, ass_fontsize, bold, spacing)
    word_widths = [
        _measure_text_px(w, fontname, round(ass_fontsize * scale_override), bold, spacing)
        for w in words_raw
    ]
    total_w = icon_w + sum(word_widths) + space_w * max(0, len(word_widths) - 1)
    if align in (1, 4, 7):
        left_start = pos_x
    elif align in (3, 6, 9):
        left_start = pos_x - total_w
    else:
        left_start = pos_x - total_w / 2.0
    if align in (7, 8, 9):
        top_y = pos_y
    elif align in (4, 5, 6):
        top_y = pos_y - ass_fontsize / 2.0
    else:
        top_y = pos_y - ass_fontsize

    boxes: List[Tuple[float, float]] = []
    cursor = left_start + icon_w
    for w_width in word_widths:
        boxes.append((cursor, cursor + w_width))
        cursor += w_width + space_w
    return boxes, left_start, top_y, total_w


def generate_studio_ass_captions(
    whisper_result: Mapping[str, Any],
    caption_styles: Mapping[str, Mapping[str, Any]],
    resolve_story_treatment: Callable[..., Dict[str, Any]],
    style_name: str = "bold_pop",
    video_width: int = 1080,
    video_height: int = 1920,
    caption_position: str = "lower",
    caption_scale: float = 1.0,
    suppress_ranges: Optional[Sequence[Mapping[str, Any]]] = None,
) -> str:
    """Generate Studio-grade ASS subtitles synced 1:1 with preview styling & FFmpeg export."""
    clean_transcript = (
        filter_suppressed_whisper_segments(whisper_result, suppress_ranges)
        if suppress_ranges
        else dict(whisper_result)
    )
    style = resolve_caption_layout(
        caption_position,
        caption_scale,
        caption_styles.get(style_name, caption_styles["bold_pop"]),
    )
    caption_pixel_scale = max(0.1, float(video_width) / 1080.0)
    style["fontsize"] = max(12, round(style["fontsize"] * caption_pixel_scale))
    style["outline"] = max(1, round(style["outline"] * caption_pixel_scale))
    style["shadow"] = max(0, round(style["shadow"] * caption_pixel_scale))
    style["margin_v"] = 0 if style["alignment"] == 5 else round(video_height * 0.12)
    caption_margin_x = max(8, round(video_width * 0.04))
    segments = clean_transcript.get("segments", [])

    bold_flag = "-1" if style.get("bold") else "0"
    italic_flag = "-1" if style.get("italic") else "0"

    ass_lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {video_width}",
        f"PlayResY: {video_height}",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
        "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,{style['fontname']},{style['fontsize']},{style['primary_color']},"
        f"{style['highlight_color']},{style['outline_color']},{style.get('back_color', '&H80000000')},"
        f"{bold_flag},{italic_flag},0,0,100,100,{style.get('spacing', 0)},0,{style.get('border_style', 1)},{style['outline']},"
        f"{style['shadow']},{style['alignment']},{caption_margin_x},{caption_margin_x},{style['margin_v']},1",
        f"Style: Active,{style['fontname']},{style['fontsize']},{style['highlight_color']},"
        f"{style['primary_color']},{style['outline_color']},{style.get('back_color', '&H80000000')},"
        f"{bold_flag},{italic_flag},0,0,100,100,{style.get('spacing', 0)},0,{style.get('border_style', 1)},{style['outline'] + 1},"
        f"{style['shadow']},{style['alignment']},{caption_margin_x},{caption_margin_x},{style['margin_v']},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    hallucinations = {"thank you.", "thanks.", "bye.", "music.", "watching.", "mbc", "lbc", "you", "silence"}

    def caption_word_raw(value: Any) -> str:
        clean_value = str(value or "").strip()
        if style.get("uppercase"):
            clean_value = clean_value.upper()
        return clean_value

    def caption_word(value: Any) -> str:
        return escape_ass(caption_word_raw(value))

    anim = style.get("animation", "fade_word")

    for segment_index, segment in enumerate(segments):
        words = segment.get("words", [])
        seg_text = str(segment.get("text", "")).strip()

        if seg_text.lower().strip(". ") in hallucinations:
            continue
        if segment.get("no_speech_prob", 0) > 0.8:
            continue

        caption_treatment = resolve_story_treatment(
            segment,
            segment_index,
            video_width,
            video_height,
            style["fontsize"],
            default_position=caption_position,
        )
        placement_override = str(caption_treatment.get("text_override") or "")
        active_accent = str(caption_treatment.get("accent") or "&H003DB3FF")
        emphasis_accent = (
            style["primary_color"] if style_name == "marker" else active_accent
        )
        design_override = (
            f"{{\\3c{active_accent}\\c{style['primary_color']}}}"
            if style_name == "marker"
            else ""
        )
        icon_char = str(caption_treatment.get("icon") or "")
        bold_override = "\\b1" if style.get("bold") else "\\b0"
        icon_prefix = (
            f"{{\\fnNoto Sans Symbols2\\c{active_accent}\\fscx136\\fscy136}}"
            f"{escape_ass(icon_char)}"
            f"{{\\fn{style['fontname']}\\c{style['primary_color']}{bold_override}\\fscx100\\fscy100}}\\h"
            if icon_char
            else ""
        )

        if not words:
            start_ass = seconds_to_ass_time(segment["start"])
            end_ass = seconds_to_ass_time(segment["end"])
            clean = re.sub(r"\[.*?\]|\(.*?\)", "", seg_text).strip()
            if clean and len(clean) >= 2:
                ass_lines.append(
                    f"Dialogue: 0,{start_ass},{end_ass},Default,,0,0,0,,"
                    f"{placement_override}{design_override}{{\\c{emphasis_accent}}}"
                    f"{icon_prefix}{caption_word(clean)}"
                )
            continue

        fs = int(style["fontsize"])
        pad_x = max(6, round(fs * 0.20))
        pad_y = max(3, round(fs * 0.09))
        pill_radius = max(4, round(fs * 0.22))
        word_sep = "  " if anim in {"active_pill", "sticker_pill", "marker_swipe", "vertical_bounce"} else " "
        max_single_line_w = max(140.0, float(video_width) - 2.0 * caption_margin_x - 2.0 * pad_x * 1.6)

        story_group_size = 4
        story_max_chars = max(
            20,
            min(34, int(video_width / max(1.0, style["fontsize"] * 0.58))),
        )
        if anim in {
            "active_pill",
            "sticker_pill",
            "marker_swipe",
            "glass_card",
            "kinetic_bar",
            "vertical_bounce",
            "true_typewriter",
        }:
            groups = chunk_words_to_fit(
                words,
                style["fontname"],
                fs,
                bool(style.get("bold")),
                float(style.get("spacing", 0) or 0),
                max_single_line_w,
                max_words=(5 if anim == "true_typewriter" else 4),
                uppercase=bool(style.get("uppercase")),
                separator=word_sep,
            )
        else:
            groups = chunk_words(
                words,
                max_words=(story_group_size if anim == "story_pop" else 5),
                max_chars=(story_max_chars if anim == "story_pop" else None),
            )

        align, pos_x, pos_y = _parse_placement_xy(
            caption_treatment, style, video_width, video_height
        )
        accent_bgr = _split_bgr_hex(active_accent, "3DB3FF")

        for group in groups:
            if not group:
                continue
            group_start = float(group[0]["start"])
            group_end = float(group[-1]["end"])
            start_ass = seconds_to_ass_time(group_start)
            end_ass = seconds_to_ass_time(group_end)
            raw_tokens = [caption_word_raw(w.get("word", "")) for w in group]
            raw_tokens = [t for t in raw_tokens if t]
            if not raw_tokens:
                continue

            if anim in {"rainbow_words", "focus_cut"}:
                rainbow_palette = [
                    "&H008F5DFF", "&H003DB3FF", "&H0052E6F6", "&H009BF572",
                    "&H00D0E03C", "&H00FFA854", "&H00FF75A8",
                ]
                for i, word in enumerate(group):
                    w_start = seconds_to_ass_time(word["start"])
                    w_end = seconds_to_ass_time(word["end"])
                    parts = []
                    for j, candidate in enumerate(group):
                        candidate_text = caption_word(candidate.get("word", ""))
                        if not candidate_text:
                            continue
                        word_color = rainbow_palette[j % len(rainbow_palette)]
                        if anim == "rainbow_words":
                            if j == i:
                                parts.append(
                                    f"{{\\c{word_color}\\fscx122\\fscy122\\bord{style['outline'] + 2}"
                                    f"\\t(60,190,\\fscx106\\fscy106)}}{candidate_text}"
                                    f"{{\\fscx100\\fscy100\\bord{style['outline']}}}"
                                )
                            else:
                                parts.append(f"{{\\c{word_color}}}{candidate_text}")
                        elif j == i:
                            parts.append(
                                f"{{\\alpha&H00&\\c{emphasis_accent}\\fscx120\\fscy120"
                                f"\\bord{style['outline'] + 2}\\t(70,210,\\fscx106\\fscy106)}}"
                                f"{candidate_text}{{\\fscx100\\fscy100\\bord{style['outline']}}}"
                            )
                        else:
                            parts.append(f"{{\\alpha&H38&\\c{style['primary_color']}}}{candidate_text}{{\\alpha&H00&}}")
                    if parts:
                        ass_lines.append(
                            f"Dialogue: 2,{w_start},{w_end},Default,,0,0,0,,"
                            f"{placement_override}{design_override}{{\\fad(45,65)}}{icon_prefix}{' '.join(parts)}"
                        )

            elif anim == "story_pop":
                for i, word in enumerate(group):
                    w_start = seconds_to_ass_time(word["start"])
                    w_end = seconds_to_ass_time(word["end"])
                    parts = []
                    for j, candidate in enumerate(group):
                        candidate_text = caption_word(candidate.get("word", ""))
                        if not candidate_text:
                            continue
                        if j == i:
                            parts.append(
                                f"{{\\c{emphasis_accent}\\fscx118\\fscy118\\bord{style['outline'] + 1}"
                                f"\\t(70,210,\\fscx104\\fscy104)}}{candidate_text}"
                                f"{{\\c{style['primary_color']}\\fscx100\\fscy100\\bord{style['outline']}}}"
                            )
                        else:
                            parts.append(candidate_text)
                    if parts:
                        ass_lines.append(
                            f"Dialogue: 2,{w_start},{w_end},Default,,0,0,0,,"
                            f"{placement_override}{design_override}{{\\fad(55,70)}}{icon_prefix}{' '.join(parts)}"
                        )

            elif anim == "karaoke_fill":
                text_parts = []
                rendered_words = [caption_word(word.get("word", "")) for word in group]
                rendered_words = [word for word in rendered_words if word]
                break_index = None
                if (
                    style_name == "boxed"
                    and len(rendered_words) > 2
                    and (sum(len(word) for word in rendered_words) + len(rendered_words) - 1)
                    * style["fontsize"] * 0.58
                    > video_width * 0.72
                ):
                    target_chars = (sum(len(word) for word in rendered_words) + len(rendered_words) - 1) / 2
                    break_index = min(
                        range(1, len(rendered_words)),
                        key=lambda index: abs(
                            sum(len(word) for word in rendered_words[:index]) + index - 1 - target_chars
                        ),
                    )
                prev_end = float(group[0]["start"])
                for word_index, word in enumerate(group):
                    w_start = max(prev_end, float(word["start"]))
                    w_end = max(w_start + 0.01, float(word["end"]))
                    gap_cs = max(0, int(round((w_start - prev_end) * 100)))
                    w_dur_cs = max(1, int(round((w_end - w_start) * 100)))
                    prev_end = w_end
                    word_text = caption_word(word.get("word", ""))
                    if word_text:
                        spacer = "" if not text_parts else "\\N" if word_index == break_index else " "
                        gap_tag = f"{{\\k{gap_cs}}}" if gap_cs > 0 else ""
                        text_parts.append(f"{spacer}{gap_tag}{{\\kf{w_dur_cs}}}{word_text}")
                if text_parts:
                    line = "".join(text_parts)
                    ass_lines.append(
                        f"Dialogue: 0,{start_ass},{end_ass},Default,,0,0,0,,"
                        f"{placement_override}{design_override}{{\\2c{emphasis_accent}}}{icon_prefix}{line}"
                    )

            elif anim == "scale_pop":
                for i, word in enumerate(group):
                    w_start = seconds_to_ass_time(word["start"])
                    w_end = seconds_to_ass_time(word["end"])
                    if not caption_word(word.get("word", "")):
                        continue
                    parts = []
                    for j, w in enumerate(group):
                        wt = caption_word(w.get("word", ""))
                        if not wt:
                            continue
                        if j == i:
                            parts.append(f"{{\\fscx115\\fscy115\\c{emphasis_accent}\\b1}}{wt}{{\\fscx100\\fscy100\\c{style['primary_color']}\\b1}}")
                        else:
                            parts.append(wt)
                    ass_lines.append(
                        f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,"
                        f"{placement_override}{design_override}{icon_prefix}{' '.join(parts)}"
                    )

            elif anim == "spring_pop":
                for i, word in enumerate(group):
                    w_start = seconds_to_ass_time(word["start"])
                    w_end = seconds_to_ass_time(word["end"])
                    if not caption_word(word.get("word", "")):
                        continue
                    tilt_tag = f"\\frz{(-2 if i % 2 == 0 else 2)}" if style_name == "spring_slam" else ""
                    parts = []
                    for j, w in enumerate(group):
                        wt = caption_word(w.get("word", ""))
                        if not wt:
                            continue
                        if j == i:
                            parts.append(
                                f"{{\\fscx84\\fscy84\\c{emphasis_accent}{bold_override}{tilt_tag}"
                                f"\\t(0,75,\\fscx122\\fscy122)\\t(75,180,\\fscx106\\fscy106\\frz0)}}"
                                f"{wt}{{\\fscx100\\fscy100\\c{style['primary_color']}{bold_override}\\frz0}}"
                            )
                        else:
                            parts.append(wt)
                    ass_lines.append(
                        f"Dialogue: 2,{w_start},{w_end},Default,,0,0,0,,"
                        f"{placement_override}{design_override}{icon_prefix}{' '.join(parts)}"
                    )

            elif anim == "neon_bloom":
                bloom_bgr = accent_bgr
                for i, word in enumerate(group):
                    w_start = seconds_to_ass_time(word["start"])
                    w_end = seconds_to_ass_time(word["end"])
                    bloom_parts = []
                    core_parts = []
                    for j, w in enumerate(group):
                        wt = caption_word(w.get("word", ""))
                        if not wt:
                            continue
                        if j == i:
                            bloom_parts.append(
                                f"{{\\fscx114\\fscy114\\1a&HFF&\\3c&H00{bloom_bgr}&\\bord{max(6, style['outline'] + 7)}\\blur14}}{wt}"
                                f"{{\\fscx100\\fscy100\\bord{max(4, style['outline'] + 4)}\\blur9}}"
                            )
                            core_parts.append(
                                f"{{\\fscx114\\fscy114\\c{emphasis_accent}\\3c&H00{bloom_bgr}&\\bord{max(2, style['outline'])}\\blur2"
                                f"\\t(65,185,\\fscx105\\fscy105)}}"
                                f"{wt}{{\\fscx100\\fscy100\\c{style['primary_color']}\\3c{style['outline_color']}\\blur0}}"
                            )
                        else:
                            bloom_parts.append(f"{{\\1a&HFF&\\3c&H00{bloom_bgr}&\\3a&H60&\\bord{max(4, style['outline'] + 3)}\\blur9}}{wt}")
                            core_parts.append(wt)
                    if core_parts:
                        ass_lines.append(
                            f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,"
                            f"{placement_override}{design_override}{icon_prefix}{' '.join(bloom_parts)}"
                        )
                        ass_lines.append(
                            f"Dialogue: 2,{w_start},{w_end},Default,,0,0,0,,"
                            f"{placement_override}{design_override}{icon_prefix}{' '.join(core_parts)}"
                        )

            elif anim in {"active_pill", "sticker_pill", "marker_swipe", "glass_card", "kinetic_bar"}:
                boxes, block_x0, top_y, total_w = _measure_group_word_boxes(
                    raw_tokens,
                    icon_char,
                    style["fontname"],
                    fs,
                    bool(style.get("bold")),
                    float(style.get("spacing", 0) or 0),
                    align,
                    pos_x,
                    pos_y,
                    separator=word_sep,
                )
                pill_fill_bgr = accent_bgr
                pill_alpha = "00"
                active_text_color = "&H00100C08"
                if anim == "sticker_pill":
                    pill_fill_bgr = "F8FBFF"
                    active_text_color = f"&H00{accent_bgr}&" if style_name == "sticker" else "&H00120C08"
                elif anim == "glass_card":
                    pill_fill_bgr = "1D140E"
                    pill_alpha = "48"
                    active_text_color = emphasis_accent
                elif anim == "kinetic_bar":
                    pill_fill_bgr = "16100C"
                    pill_alpha = "38"
                    active_text_color = emphasis_accent
                elif style_name == "newsroom":
                    pill_fill_bgr = "251AD9"
                    active_text_color = "&H00FFFFFF"

                # Backdrop rounded pill for glass_card / kinetic_bar spanning whole caption phrase
                if anim in {"glass_card", "kinetic_bar"}:
                    card_x0 = max(2.0, block_x0 - pad_x * 1.4)
                    card_x1 = min(float(video_width - 2), block_x0 + total_w + pad_x * 1.4)
                    card_y0 = max(2.0, top_y - pad_y * 1.35)
                    card_y1 = min(float(video_height - 2), top_y + fs + pad_y * (1.85 if anim == "kinetic_bar" else 1.35))
                    card_path = _ass_rounded_rect_path(card_x0, card_y0, card_x1, card_y1, pill_radius * 1.15)
                    border_bgr = accent_bgr if anim == "kinetic_bar" else "FFFFFF"
                    ass_lines.append(
                        f"Dialogue: 0,{start_ass},{end_ass},Default,,0,0,0,,"
                        f"{{\\an7\\pos(0,0)\\bord2\\shad0\\1c&H00{pill_fill_bgr}&\\1a&H{pill_alpha}&"
                        f"\\3c&H00{border_bgr}&\\3a&HB0&\\blur1.2\\p1}}{card_path}{{\\p0}}"
                    )

                for i, word in enumerate(group):
                    w_start = seconds_to_ass_time(word["start"])
                    w_end = seconds_to_ass_time(word["end"])
                    wx0, wx1 = boxes[i]
                    if anim in {"active_pill", "sticker_pill", "marker_swipe"}:
                        if anim == "marker_swipe":
                            px0, py0 = wx0 - pad_x * 0.9, top_y + fs * 0.22
                            px1, py1 = wx1 + pad_x * 0.9, top_y + fs + pad_y * 0.9
                            badge_path = _ass_rounded_rect_path(px0, py0, px1, py1, pill_radius * 0.55)
                            badge_alpha = "18"
                        else:
                            px0, py0 = wx0 - pad_x, top_y - pad_y
                            px1, py1 = wx1 + pad_x, top_y + fs + pad_y
                            badge_path = _ass_rounded_rect_path(px0, py0, px1, py1, pill_radius)
                            badge_alpha = pill_alpha
                        ass_lines.append(
                            f"Dialogue: 1,{w_start},{w_end},Default,,0,0,0,,"
                            f"{{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H00{pill_fill_bgr}&\\1a&H{badge_alpha}&\\p1}}{badge_path}{{\\p0}}"
                        )
                    elif anim == "kinetic_bar":
                        bar_y0 = top_y + fs + pad_y * 0.45
                        bar_y1 = bar_y0 + max(4, round(fs * 0.085))
                        bar_path = _ass_rounded_rect_path(wx0 - 2, bar_y0, wx1 + 2, bar_y1, 3)
                        ass_lines.append(
                            f"Dialogue: 1,{w_start},{w_end},Default,,0,0,0,,"
                            f"{{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H00{accent_bgr}&\\1a&H00&\\p1}}{bar_path}{{\\p0}}"
                        )

                    clean_ink_inside_pill = anim in {"active_pill", "sticker_pill"} and style_name != "newsroom"
                    ink_open = "\\bord0\\shad0" if clean_ink_inside_pill else ""
                    ink_close = f"\\bord{style['outline']}\\shad{style['shadow']}" if clean_ink_inside_pill else ""
                    parts = []
                    for j, w in enumerate(group):
                        wt = caption_word(w.get("word", ""))
                        if not wt:
                            continue
                        if j == i:
                            scale_tag = "\\fscx106\\fscy106\\t(55,170,\\fscx100\\fscy100)" if anim in {"active_pill", "sticker_pill"} else ""
                            parts.append(
                                f"{{\\c{active_text_color}{bold_override}{ink_open}{scale_tag}}}"
                                f"{wt}{{\\c{style['primary_color']}{bold_override}{ink_close}\\fscx100\\fscy100}}"
                            )
                        else:
                            parts.append(wt)
                    ass_lines.append(
                        f"Dialogue: 2,{w_start},{w_end},Default,,0,0,0,,"
                        f"{placement_override}{design_override}{icon_prefix}{word_sep.join(parts)}"
                    )

            elif anim == "vertical_bounce":
                boxes, _bx, top_y, _tw = _measure_group_word_boxes(
                    raw_tokens,
                    icon_char,
                    style["fontname"],
                    fs,
                    bool(style.get("bold")),
                    float(style.get("spacing", 0) or 0),
                    align,
                    pos_x,
                    pos_y,
                    separator=word_sep,
                )
                hop_px = max(8, round(fs * 0.24))
                for i, word in enumerate(group):
                    w_start = seconds_to_ass_time(word["start"])
                    w_end = seconds_to_ass_time(word["end"])
                    parts = []
                    for j, w in enumerate(group):
                        wt = caption_word(w.get("word", ""))
                        if not wt:
                            continue
                        if j == i:
                            # Keep exact horizontal footprint invisible on Layer 0 so word spacing matches 1:1
                            parts.append(f"{{\\alpha&HFF&\\3a&HFF&\\4a&HFF&}}{wt}{{\\alpha&H00&\\3a&H00&\\4a&H00&}}")
                        else:
                            parts.append(wt)
                    ass_lines.append(
                        f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,"
                        f"{placement_override}{design_override}{icon_prefix}{word_sep.join(parts)}"
                    )
                    active_wt = caption_word(word.get("word", ""))
                    if active_wt:
                        wx0, wx1 = boxes[i]
                        cx, ry = round((wx0 + wx1) / 2.0), round(top_y)
                        ass_lines.append(
                            f"Dialogue: 2,{w_start},{w_end},Default,,0,0,0,,"
                            f"{{\\an8\\move({cx},{ry + 2},{cx},{ry - hop_px},0,110)\\q0\\c{emphasis_accent}{bold_override}"
                            f"\\fscx108\\fscy112\\t(90,200,\\fscx102\\fscy102)}}{active_wt}"
                        )

            elif anim == "true_typewriter":
                # Dark badge card under typed monospace line
                _, block_x0, top_y, total_w = _measure_group_word_boxes(
                    raw_tokens,
                    icon_char,
                    style["fontname"],
                    fs,
                    bool(style.get("bold")),
                    float(style.get("spacing", 0) or 0),
                    align,
                    pos_x,
                    pos_y,
                )
                card_path = _ass_rounded_rect_path(
                    max(2.0, block_x0 - pad_x * 1.4),
                    max(2.0, top_y - pad_y),
                    min(float(video_width - 2), block_x0 + total_w + pad_x * 1.4),
                    min(float(video_height - 2), top_y + fs + pad_y),
                    max(6, round(fs * 0.16)),
                )
                ass_lines.append(
                    f"Dialogue: 0,{start_ass},{end_ass},Default,,0,0,0,,"
                    f"{{\\an7\\pos(0,0)\\bord2\\shad0\\1c&H0018110B&\\1a&H28&\\3c&H00{accent_bgr}&\\3a&H90&\\p1}}{card_path}{{\\p0}}"
                )
                typed_prefix = ""
                for idx, word in enumerate(group):
                    raw_w = caption_word_raw(word.get("word", ""))
                    if not raw_w:
                        continue
                    w_s = float(word["start"])
                    w_e = max(w_s + 0.04, float(word["end"]))
                    step = (w_e - w_s) / max(1, len(raw_w))
                    sep = " " if typed_prefix else ""
                    for ch_idx in range(1, len(raw_w) + 1):
                        sub_s = seconds_to_ass_time(w_s + (ch_idx - 1) * step)
                        is_last_overall = idx == len(group) - 1 and ch_idx == len(raw_w)
                        sub_e = end_ass if is_last_overall else seconds_to_ass_time(w_s + ch_idx * step)
                        partial = escape_ass(f"{typed_prefix}{sep}{raw_w[:ch_idx]}")
                        cursor_tag = "" if is_last_overall else f"{{\\c{emphasis_accent}}}|{{\\c{style['primary_color']}}}"
                        ass_lines.append(
                            f"Dialogue: 2,{sub_s},{sub_e},Default,,0,0,0,,"
                            f"{placement_override}{design_override}{icon_prefix}{partial}{cursor_tag}"
                        )
                    typed_prefix = f"{typed_prefix}{sep}{raw_w}"

            elif anim == "editorial_duo":
                for i, word in enumerate(group):
                    w_start = seconds_to_ass_time(word["start"])
                    w_end = seconds_to_ass_time(word["end"])
                    parts = []
                    for j, w in enumerate(group):
                        raw_w = str(w.get("word", "")).strip()
                        if not raw_w:
                            continue
                        if j == i:
                            serif_text = escape_ass(raw_w.lower() if style.get("uppercase") else raw_w)
                            parts.append(
                                f"{{\\fnDejaVu Serif\\i1\\b1\\c{emphasis_accent}\\fscx114\\fscy114}}"
                                f"{serif_text}"
                                f"{{\\fn{style['fontname']}\\i0{bold_override}\\c{style['primary_color']}\\fscx100\\fscy100}}"
                            )
                        else:
                            parts.append(caption_word(raw_w))
                    if parts:
                        ass_lines.append(
                            f"Dialogue: 2,{w_start},{w_end},Default,,0,0,0,,"
                            f"{placement_override}{design_override}{icon_prefix}{' '.join(parts)}"
                        )

            elif anim == "bounce_word":
                for i, word in enumerate(group):
                    w_start = seconds_to_ass_time(word["start"])
                    w_end = seconds_to_ass_time(word["end"])
                    if not caption_word(word.get("word", "")):
                        continue
                    parts = []
                    for j, w in enumerate(group):
                        wt = caption_word(w.get("word", ""))
                        if not wt:
                            continue
                        if j == i:
                            parts.append(f"{{\\fscy116\\t(80,190,\\fscy100)\\c{emphasis_accent}\\b1}}{wt}{{\\fscy100\\c{style['primary_color']}\\b0}}")
                        else:
                            parts.append(wt)
                    ass_lines.append(
                        f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,"
                        f"{placement_override}{design_override}{icon_prefix}{' '.join(parts)}"
                    )

            elif anim == "glow_pulse":
                for i, word in enumerate(group):
                    w_start = seconds_to_ass_time(word["start"])
                    w_end = seconds_to_ass_time(word["end"])
                    if not caption_word(word.get("word", "")):
                        continue
                    parts = []
                    for j, w in enumerate(group):
                        wt = caption_word(w.get("word", ""))
                        if not wt:
                            continue
                        if j == i:
                            parts.append(f"{{\\bord{style['outline'] + 3}\\3c{emphasis_accent}\\c{emphasis_accent}}}{wt}{{\\bord{style['outline']}\\3c{style['outline_color']}\\c{style['primary_color']}}}")
                        else:
                            parts.append(wt)
                    ass_lines.append(
                        f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,"
                        f"{placement_override}{design_override}{icon_prefix}{' '.join(parts)}"
                    )

            else:
                clean_text = " ".join(caption_word(w.get("word", "")) for w in group if str(w.get("word", "")).strip())
                if clean_text:
                    ass_lines.append(
                        f"Dialogue: 0,{start_ass},{end_ass},Default,,0,0,0,,"
                        f"{placement_override}{design_override}"
                        f"{{\\fad(100,150)\\c{emphasis_accent}}}"
                        f"{icon_prefix}{clean_text}"
                    )

    return "\n".join(ass_lines)
