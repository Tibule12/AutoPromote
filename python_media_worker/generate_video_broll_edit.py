#!/usr/bin/env python3
"""
Video-first AI B-roll edit MVP.

This script replaces the source visuals with cinematic vertical B-roll while
keeping the input video's original audio as the master track. User-selected
clips can be supplied and will be auto-placed across the planned B-roll beats
before any AI/stock/fallback source is used.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}
TARGET_WIDTH = 1080
TARGET_HEIGHT = 1920
USER_CLIP_PICK_MODES = {"match", "sequence"}


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str


@dataclass
class BrollSegment:
    start: float
    end: float
    emotion: str
    visual_idea: str
    video_prompt: str
    fallback_image_prompt: str
    motion_style: str
    transcript: str = ""
    search_query: str = ""
    provider: str = ""
    source_path: str = ""
    clip_path: str = ""
    source_reason: str = ""
    notes: list[str] = field(default_factory=list)


def run(cmd: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        cmd,
        check=False,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )
    if proc.returncode != 0:
        detail = ""
        if capture:
            detail = f"\nSTDOUT:\n{proc.stdout[-2000:]}\nSTDERR:\n{proc.stderr[-4000:]}"
        raise RuntimeError(f"Command failed ({proc.returncode}): {' '.join(cmd)}{detail}")
    return proc


def require_tools() -> None:
    missing = [name for name in ("ffmpeg", "ffprobe") if not shutil.which(name)]
    if missing:
        raise RuntimeError(f"Missing required tool(s): {', '.join(missing)}")


def slugify(value: str, fallback: str = "clip") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return cleaned[:80] or fallback


def stable_hash(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]


def ffprobe_duration(path: str | Path) -> float:
    proc = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            str(path),
        ],
        capture=True,
    )
    return max(0.0, float((proc.stdout or "0").strip() or 0))


def extract_audio(input_video_path: str | Path, audio_path: str | Path) -> None:
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(input_video_path),
            "-vn",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(audio_path),
        ]
    )


def transcribe_audio(audio_path: str | Path) -> dict[str, Any]:
    model_name = os.getenv("AUTOPROMOTE_BROLL_WHISPER_MODEL", os.getenv("WHISPER_MODEL", "base"))
    try:
        from faster_whisper import WhisperModel

        device = os.getenv("FASTER_WHISPER_DEVICE", os.getenv("WHISPER_DEVICE", "cpu"))
        compute_type = os.getenv("FASTER_WHISPER_COMPUTE_TYPE", "int8" if device == "cpu" else "float16")
        model = WhisperModel(model_name, device=device, compute_type=compute_type)
        segments, info = model.transcribe(
            str(audio_path),
            beam_size=5,
            vad_filter=True,
            word_timestamps=False,
            condition_on_previous_text=False,
        )
        items = [
            {"start": float(seg.start), "end": float(seg.end), "text": str(seg.text or "").strip()}
            for seg in segments
            if str(seg.text or "").strip()
        ]
        return {"segments": items, "language": getattr(info, "language", None), "engine": "faster-whisper"}
    except Exception as faster_error:
        try:
            import whisper

            model = whisper.load_model(model_name)
            result = model.transcribe(str(audio_path), fp16=False, word_timestamps=False)
            result["engine"] = "openai-whisper"
            return result
        except Exception as whisper_error:
            raise RuntimeError(
                "Transcription failed. Install faster-whisper/openai-whisper or set the worker Python env correctly. "
                f"faster-whisper: {faster_error}; whisper: {whisper_error}"
            ) from whisper_error


def normalize_transcript_segments(raw_segments: list[dict[str, Any]], total_duration: float) -> list[TranscriptSegment]:
    segments: list[TranscriptSegment] = []
    for raw in raw_segments:
        text = re.sub(r"\s+", " ", str(raw.get("text", "") or "")).strip()
        if not text:
            continue
        start = max(0.0, float(raw.get("start", 0.0) or 0.0))
        end = max(start + 0.25, float(raw.get("end", start + 0.25) or start + 0.25))
        segments.append(TranscriptSegment(start=start, end=min(end, total_duration), text=text))
    if not segments and total_duration > 0:
        segments.append(TranscriptSegment(start=0.0, end=total_duration, text=""))
    return segments


def split_meaning_segments(transcript_segments: list[TranscriptSegment], total_duration: float) -> list[TranscriptSegment]:
    if not transcript_segments:
        return [TranscriptSegment(start=0.0, end=total_duration, text="")]

    target_min = 3.0
    target_max = 6.0
    grouped: list[TranscriptSegment] = []
    current: list[TranscriptSegment] = []
    current_start = transcript_segments[0].start

    for segment in transcript_segments:
        if not current:
            current_start = segment.start
        current.append(segment)
        text = " ".join(item.text for item in current).strip()
        duration = segment.end - current_start
        sentence_end = bool(re.search(r"[.!?]\s*$", segment.text))
        strong_pause = len(current) > 1 and segment.start - current[-2].end > 0.7
        if duration >= target_max or (duration >= target_min and (sentence_end or strong_pause)):
            grouped.append(TranscriptSegment(current_start, segment.end, text))
            current = []

    if current:
        text = " ".join(item.text for item in current).strip()
        grouped.append(TranscriptSegment(current_start, current[-1].end, text))

    # Fill quiet gaps and clamp final edge to the audio duration.
    cleaned: list[TranscriptSegment] = []
    cursor = 0.0
    for segment in grouped:
        # B-roll must cover the full audio timeline, including pauses before
        # the next spoken phrase. Anchor each planned segment to the previous
        # segment's end instead of leaving transcript gaps uncovered.
        start = min(cursor, total_duration)
        end = max(start + 0.5, min(segment.end, total_duration))
        cleaned.append(TranscriptSegment(start=start, end=end, text=segment.text))
        cursor = end
    if cleaned and cleaned[-1].end < total_duration - 0.2:
        cleaned[-1].end = total_duration
    return cleaned


def classify_emotion(text: str) -> str:
    lower = text.lower()
    checks = [
        (("lonely", "alone", "stood up", "misunderstood", "disappointed"), "lonely but hopeful"),
        (("trying", "wake up", "believing", "hope"), "resilient and hopeful"),
        (("dream", "ideas", "future", "vision"), "visionary and determined"),
        (("late", "long road", "patience"), "patient and reflective"),
        (("growth", "regret", "bitterness"), "healing and mature"),
        (("quit", "refusing", "becoming"), "triumphant perseverance"),
        (("love",), "tender and searching"),
    ]
    for needles, emotion in checks:
        if any(needle in lower for needle in needles):
            return emotion
    if any(word in lower for word in ("not", "never", "can't", "wont", "won't")):
        return "conflicted but determined"
    return "cinematic reflective"


def visual_idea_for(text: str, emotion: str) -> str:
    lower = text.lower()
    if "stood up" in lower or "misunderstood" in lower or "disappointed" in lower:
        return "young man walking alone through a quiet city at sunrise"
    if "wake up" in lower or "tomorrow" in lower:
        return "sunrise over a city with a person looking forward from a balcony"
    if "ideas" in lower or "dream" in lower or "future" in lower:
        return "creative founder writing plans in a notebook near a window with morning light"
    if "nobody else can see" in lower or "vision" in lower:
        return "person standing on a rooftop looking over a wide city skyline"
    if "love" in lower or "success" in lower or "long road" in lower:
        return "person walking down a long open road during golden hour"
    if "patience" in lower or "bitterness" in lower:
        return "calm close-up of hands, breath, and sunlight through a window"
    if "growth" in lower or "regret" in lower:
        return "person training outside, slow determined movement, urban background"
    if "hope" in lower or "giving up" in lower or "quit" in lower:
        return "person walking forward on an empty road toward warm sunrise"
    return f"human cinematic scene expressing {emotion}"


def motion_style_for(emotion: str) -> str:
    if any(word in emotion for word in ("lonely", "reflective", "patient")):
        return "slow push-in"
    if any(word in emotion for word in ("determined", "perseverance", "triumphant")):
        return "slow tracking shot"
    if "visionary" in emotion:
        return "gentle crane up"
    return "soft handheld drift"


def search_query_for(visual_idea: str, emotion: str) -> str:
    tokens = re.sub(r"[^a-zA-Z0-9 ]+", " ", f"{visual_idea} {emotion}").lower().split()
    stop = {"a", "the", "of", "and", "with", "at", "to", "through", "during", "near", "over"}
    return " ".join(token for token in tokens if token not in stop)[:120]


def build_broll_plan(segments: list[TranscriptSegment], style_preset: str) -> list[BrollSegment]:
    plan = []
    for segment in segments:
        emotion = classify_emotion(segment.text)
        idea = visual_idea_for(segment.text, emotion)
        motion = motion_style_for(emotion)
        style = style_preset.strip() or "cinematic emotional"
        video_prompt = (
            f"{style} vertical video of {idea}, emotional tone: {emotion}, "
            f"{motion}, soft natural light, human, cinematic, no text, no logos"
        )
        fallback_image_prompt = (
            f"{style} cinematic still image of {idea}, emotional tone: {emotion}, "
            "soft natural light, human, no text, no logos"
        )
        plan.append(
            BrollSegment(
                start=round(segment.start, 3),
                end=round(segment.end, 3),
                emotion=emotion,
                visual_idea=idea,
                video_prompt=video_prompt,
                fallback_image_prompt=fallback_image_prompt,
                motion_style=motion,
                transcript=segment.text,
                search_query=search_query_for(idea, emotion),
            )
        )
    return plan


def maybe_run_ai_video_command(segment: BrollSegment, output_path: Path, duration: float) -> bool:
    template = os.getenv("AUTOPROMOTE_AI_BROLL_COMMAND", "").strip()
    if not template:
        return False
    mapping = {
        "prompt": segment.video_prompt,
        "output": str(output_path),
        "duration": f"{duration:.2f}",
        "style": segment.motion_style,
        "emotion": segment.emotion,
    }
    cmd = shlex.split(template.format(**mapping))
    run(cmd, capture=True)
    return output_path.exists() and output_path.stat().st_size > 0


def iter_local_stock_files() -> list[Path]:
    stock_dir = os.getenv("AUTOPROMOTE_BROLL_STOCK_DIR", "").strip()
    if not stock_dir:
        return []
    root = Path(stock_dir).expanduser()
    if not root.exists():
        return []
    return [path for path in root.rglob("*") if path.suffix.lower() in VIDEO_EXTENSIONS and path.is_file()]


def normalize_clip_inputs(raw_inputs: list[str] | None) -> list[str]:
    values: list[str] = []
    env_dir = os.getenv("AUTOPROMOTE_BROLL_USER_CLIPS_DIR", "").strip()
    env_files = os.getenv("AUTOPROMOTE_BROLL_USER_CLIPS", "").strip()
    if env_dir:
        values.append(env_dir)
    if env_files:
        values.extend(item.strip() for item in env_files.split(os.pathsep) if item.strip())
    for raw in raw_inputs or []:
        values.extend(item.strip() for item in str(raw).split(os.pathsep) if item.strip())
    return values


def iter_user_clip_files(raw_inputs: list[str] | None) -> list[Path]:
    clips: list[Path] = []
    seen: set[str] = set()
    for value in normalize_clip_inputs(raw_inputs):
        path = Path(value).expanduser()
        if path.is_dir():
            candidates = sorted(
                item for item in path.rglob("*") if item.suffix.lower() in VIDEO_EXTENSIONS and item.is_file()
            )
        elif path.suffix.lower() in VIDEO_EXTENSIONS and path.is_file():
            candidates = [path]
        else:
            continue
        for candidate in candidates:
            resolved = candidate.resolve()
            key = str(resolved)
            if key not in seen:
                seen.add(key)
                clips.append(resolved)
    return clips


def score_stock_file(path: Path, query: str, emotion: str) -> int:
    haystack = re.sub(r"[^a-zA-Z0-9 ]+", " ", f"{path.stem} {path.parent.name}").lower()
    terms = set(query.lower().split()) | set(emotion.lower().split())
    return sum(1 for term in terms if len(term) > 3 and term in haystack)


def score_user_clip_file(path: Path, segment: BrollSegment) -> int:
    haystack = re.sub(r"[^a-zA-Z0-9 ]+", " ", f"{path.stem} {path.parent.name}").lower()
    terms = set(segment.search_query.lower().split())
    terms.update(segment.emotion.lower().split())
    terms.update(re.sub(r"[^a-zA-Z0-9 ]+", " ", segment.transcript.lower()).split())
    return sum(1 for term in terms if len(term) > 3 and term in haystack)


def choose_user_clip(
    segment: BrollSegment,
    user_clips: list[Path],
    index: int,
    pick_mode: str,
) -> tuple[Path | None, str]:
    if not user_clips:
        return None, ""

    mode = pick_mode if pick_mode in USER_CLIP_PICK_MODES else "match"
    if mode == "sequence":
        clip = user_clips[index % len(user_clips)]
        return clip, "user sequence order"

    scored = sorted(
        ((score_user_clip_file(path, segment), path) for path in user_clips),
        key=lambda item: (item[0], -user_clips.index(item[1])),
        reverse=True,
    )
    best_score, best_clip = scored[0]
    if best_score > 0:
        return best_clip, f"filename matched this beat ({best_score} term match{'es' if best_score != 1 else ''})"

    clip = user_clips[index % len(user_clips)]
    return clip, "no filename match; placed by user clip order"


def choose_local_stock_clip(segment: BrollSegment) -> Path | None:
    candidates = iter_local_stock_files()
    if not candidates:
        return None
    ranked = sorted(
        candidates,
        key=lambda path: (score_stock_file(path, segment.search_query, segment.emotion), -len(str(path))),
        reverse=True,
    )
    return ranked[0] if ranked else None


def download_url(url: str, output_path: Path) -> bool:
    import requests

    with requests.get(url, stream=True, timeout=45) as response:
        response.raise_for_status()
        with output_path.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 256):
                if chunk:
                    handle.write(chunk)
    return output_path.exists() and output_path.stat().st_size > 0


def fetch_pexels_clip(segment: BrollSegment, output_path: Path) -> bool:
    key = os.getenv("PEXELS_API_KEY", "").strip()
    if not key:
        return False
    import requests

    response = requests.get(
        "https://api.pexels.com/videos/search",
        headers={"Authorization": key},
        params={"query": segment.search_query, "orientation": "portrait", "per_page": 8},
        timeout=30,
    )
    response.raise_for_status()
    videos = response.json().get("videos", [])
    best_url = ""
    best_score = -1
    for video in videos:
        for file_info in video.get("video_files", []):
            width = int(file_info.get("width") or 0)
            height = int(file_info.get("height") or 0)
            link = str(file_info.get("link") or "")
            if not link:
                continue
            score = (height > width) * 20 + min(height, 1920) // 100 + min(width, 1080) // 100
            if score > best_score:
                best_score = score
                best_url = link
    return download_url(best_url, output_path) if best_url else False


def fetch_pixabay_clip(segment: BrollSegment, output_path: Path) -> bool:
    key = os.getenv("PIXABAY_API_KEY", "").strip()
    if not key:
        return False
    import requests

    response = requests.get(
        "https://pixabay.com/api/videos/",
        params={"key": key, "q": segment.search_query, "orientation": "vertical", "per_page": 8, "safesearch": "true"},
        timeout=30,
    )
    response.raise_for_status()
    hits = response.json().get("hits", [])
    best_url = ""
    best_score = -1
    for hit in hits:
        for file_info in hit.get("videos", {}).values():
            width = int(file_info.get("width") or 0)
            height = int(file_info.get("height") or 0)
            link = str(file_info.get("url") or "")
            if not link:
                continue
            score = (height > width) * 20 + min(height, 1920) // 100 + min(width, 1080) // 100
            if score > best_score:
                best_score = score
                best_url = link
    return download_url(best_url, output_path) if best_url else False


def create_procedural_fallback(segment: BrollSegment, output_path: Path, duration: float, index: int) -> None:
    palettes = {
        "lonely": ("0x0F172A", "0xF59E0B"),
        "hopeful": ("0x164E63", "0xFDE68A"),
        "determined": ("0x111827", "0x38BDF8"),
        "visionary": ("0x312E81", "0xF8FAFC"),
        "reflective": ("0x1F2937", "0xA7F3D0"),
    }
    key = next((name for name in palettes if name in segment.emotion), "reflective")
    base, accent = palettes[key]
    vf = (
        f"color={base}:s={TARGET_WIDTH}x{TARGET_HEIGHT}:d={duration:.3f},format=yuv420p,"
        "noise=alls=18:allf=t+u,"
        f"eq=brightness=-0.03:contrast=1.10:saturation=1.08,"
        f"drawbox=x=130:y=345:w=820:h=805:color={accent}@0.10:t=fill,"
        f"gblur=sigma=18"
    )
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            vf,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            str(output_path),
        ]
    )


def acquire_source_clip(
    segment: BrollSegment,
    clips_dir: Path,
    duration: float,
    index: int,
    user_clips: list[Path] | None = None,
    user_clip_pick_mode: str = "match",
) -> Path:
    user_clip, reason = choose_user_clip(segment, user_clips or [], index, user_clip_pick_mode)
    if user_clip:
        segment.provider = "user_clip_library"
        segment.source_path = str(user_clip)
        segment.source_reason = reason
        return user_clip

    base_name = f"{index:03d}-{slugify(segment.visual_idea)}-{stable_hash(segment.video_prompt)}"
    ai_path = clips_dir / f"{base_name}-ai.mp4"
    if maybe_run_ai_video_command(segment, ai_path, duration):
        segment.provider = "ai_video_command"
        segment.source_path = str(ai_path)
        segment.source_reason = "generated by AUTOPROMOTE_AI_BROLL_COMMAND"
        return ai_path

    stock_path = choose_local_stock_clip(segment)
    if stock_path:
        segment.provider = "local_stock_library"
        segment.source_path = str(stock_path)
        segment.source_reason = "matched local stock library"
        return stock_path

    pexels_path = clips_dir / f"{base_name}-pexels.mp4"
    try:
        if fetch_pexels_clip(segment, pexels_path):
            segment.provider = "pexels_api"
            segment.source_path = str(pexels_path)
            segment.source_reason = "matched Pexels search"
            return pexels_path
    except Exception as exc:
        segment.notes.append(f"pexels skipped: {str(exc)[-220:]}")

    pixabay_path = clips_dir / f"{base_name}-pixabay.mp4"
    try:
        if fetch_pixabay_clip(segment, pixabay_path):
            segment.provider = "pixabay_api"
            segment.source_path = str(pixabay_path)
            segment.source_reason = "matched Pixabay search"
            return pixabay_path
    except Exception as exc:
        segment.notes.append(f"pixabay skipped: {str(exc)[-220:]}")

    fallback_path = clips_dir / f"{base_name}-animated-fallback.mp4"
    create_procedural_fallback(segment, fallback_path, duration, index)
    segment.provider = "procedural_animated_fallback"
    segment.source_path = str(fallback_path)
    segment.source_reason = "no user, AI, stock, or API clip available"
    return fallback_path


def motion_filter(motion_style: str) -> str:
    # Use a slightly oversized canvas and animated crop expressions. This gives
    # motion without zoompan multiplying frames per input frame.
    base = f"scale={int(TARGET_WIDTH * 1.13)}:{int(TARGET_HEIGHT * 1.13)}:force_original_aspect_ratio=increase,"
    if "tracking" in motion_style:
        return (
            f"{base}crop={TARGET_WIDTH}:{TARGET_HEIGHT}:"
            "x='(iw-ow)/2+sin(t*0.45)*34':y='(ih-oh)/2+cos(t*0.25)*18'"
        )
    if "crane" in motion_style:
        return (
            f"{base}crop={TARGET_WIDTH}:{TARGET_HEIGHT}:"
            "x='(iw-ow)/2':y='(ih-oh)/2-(t*10)'"
        )
    if "push" in motion_style:
        return (
            f"{base}crop={TARGET_WIDTH}:{TARGET_HEIGHT}:"
            "x='(iw-ow)/2+sin(t*0.20)*10':y='(ih-oh)/2+sin(t*0.28)*10'"
        )
    return (
        f"{base}crop={TARGET_WIDTH}:{TARGET_HEIGHT}:"
        "x='(iw-ow)/2+sin(t*0.34)*20':y='(ih-oh)/2+cos(t*0.27)*16'"
    )


def prepare_vertical_clip(
    source_path: Path,
    output_path: Path,
    segment: BrollSegment,
    duration: float,
) -> None:
    vf = (
        f"{motion_filter(segment.motion_style)},"
        "setsar=1,"
        "format=yuv420p"
    )
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-stream_loop",
            "-1",
            "-i",
            str(source_path),
            "-t",
            f"{duration:.3f}",
            "-vf",
            vf,
            "-an",
            "-r",
            "30",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            str(output_path),
        ]
    )


def build_xfade_video(prepared_clips: list[Path], durations: list[float], output_path: Path, transition: float) -> None:
    if len(prepared_clips) == 1:
        shutil.copyfile(prepared_clips[0], output_path)
        return

    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    for path in prepared_clips:
        cmd.extend(["-i", str(path)])

    filters: list[str] = []
    current_label = "0:v"
    current_duration = durations[0]
    transitions = ["fade", "smoothleft", "smoothup", "dissolve"]
    for index in range(1, len(prepared_clips)):
        next_label = f"{index}:v"
        out_label = "vxf" if index == len(prepared_clips) - 1 else f"v{index}"
        offset = max(0.0, current_duration - transition)
        effect = transitions[(index - 1) % len(transitions)]
        filters.append(
            f"[{current_label}][{next_label}]xfade=transition={effect}:duration={transition:.3f}:offset={offset:.3f}[{out_label}]"
        )
        current_label = out_label
        current_duration = current_duration + durations[index] - transition

    cmd.extend(
        [
            "-filter_complex",
            ";".join(filters),
            "-map",
            f"[{current_label}]",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            str(output_path),
        ]
    )
    run(cmd)


def mux_master_audio(video_path: Path, audio_path: Path, output_path: str | Path, duration: float) -> None:
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(video_path),
            "-i",
            str(audio_path),
            "-t",
            f"{duration:.3f}",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-shortest",
            str(output_path),
        ]
    )


def sidecar_dir_for(output_video_path: str | Path) -> Path:
    output = Path(output_video_path)
    return output.with_suffix("").parent / f"{output.with_suffix('').name}_assets"


def generate_video_broll_edit(
    input_video_path: str,
    output_video_path: str,
    style_preset: str = "cinematic emotional",
    user_clip_inputs: list[str] | None = None,
    user_clip_pick_mode: str = "match",
) -> dict[str, Any]:
    require_tools()
    input_path = Path(input_video_path).expanduser().resolve()
    output_path = Path(output_video_path).expanduser().resolve()
    if not input_path.exists():
        raise FileNotFoundError(f"Input video not found: {input_path}")

    work_dir = sidecar_dir_for(output_path)
    clips_dir = work_dir / "clips"
    prepared_dir = work_dir / "prepared"
    work_dir.mkdir(parents=True, exist_ok=True)
    clips_dir.mkdir(parents=True, exist_ok=True)
    prepared_dir.mkdir(parents=True, exist_ok=True)

    total_duration = ffprobe_duration(input_path)
    audio_path = work_dir / "original_audio.m4a"
    extract_audio(input_path, audio_path)

    transcript = transcribe_audio(audio_path)
    transcript_path = work_dir / "transcript.json"
    transcript_path.write_text(json.dumps(transcript, indent=2), encoding="utf-8")

    transcript_segments = normalize_transcript_segments(transcript.get("segments", []), total_duration)
    meaning_segments = split_meaning_segments(transcript_segments, total_duration)
    plan = build_broll_plan(meaning_segments, style_preset)
    user_clips = iter_user_clip_files(user_clip_inputs)

    transition = min(0.35, max(0.0, float(os.getenv("AUTOPROMOTE_BROLL_TRANSITION_SECONDS", "0.35"))))
    prepared_clips: list[Path] = []
    prepared_durations: list[float] = []

    for index, segment in enumerate(plan):
        base_duration = max(0.75, segment.end - segment.start)
        clip_duration = base_duration + (transition if index < len(plan) - 1 else 0.0)
        source = acquire_source_clip(segment, clips_dir, clip_duration, index, user_clips, user_clip_pick_mode)
        prepared = prepared_dir / f"{index:03d}-{slugify(segment.emotion)}.mp4"
        prepare_vertical_clip(source, prepared, segment, clip_duration)
        segment.clip_path = str(prepared)
        prepared_clips.append(prepared)
        prepared_durations.append(clip_duration)

    plan_path = work_dir / "broll_plan.json"
    plan_path.write_text(json.dumps([asdict(item) for item in plan], indent=2), encoding="utf-8")

    silent_broll = work_dir / "broll_video_silent.mp4"
    build_xfade_video(prepared_clips, prepared_durations, silent_broll, transition)
    mux_master_audio(silent_broll, audio_path, output_path, total_duration)

    manifest = {
        "input_video_path": str(input_path),
        "output_video_path": str(output_path),
        "style_preset": style_preset,
        "duration": total_duration,
        "asset_dir": str(work_dir),
        "audio_path": str(audio_path),
        "transcript_path": str(transcript_path),
        "broll_plan_path": str(plan_path),
        "silent_broll_path": str(silent_broll),
        "segment_count": len(plan),
        "providers_used": sorted({segment.provider for segment in plan}),
        "user_clip_count": len(user_clips),
        "user_clip_pick_mode": user_clip_pick_mode if user_clip_pick_mode in USER_CLIP_PICK_MODES else "match",
        "user_clips": [str(path) for path in user_clips],
        "created_at": int(time.time()),
    }
    (work_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a video-first emotional B-roll edit.")
    parser.add_argument("--input", required=True, help="Input talking-head video path")
    parser.add_argument("--output", required=True, help="Output vertical B-roll video path")
    parser.add_argument("--style", default="cinematic emotional", help="Style preset for prompts and planning")
    parser.add_argument(
        "--user-clips",
        action="append",
        default=[],
        help=(
            "User-selected B-roll clip file or folder. Can be passed multiple times. "
            f"Multiple values may also be separated with os.pathsep ({os.pathsep!r})."
        ),
    )
    parser.add_argument(
        "--user-clip-mode",
        choices=sorted(USER_CLIP_PICK_MODES),
        default="match",
        help="How to auto-place supplied user clips: match filenames to beats, or place in sequence.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = generate_video_broll_edit(args.input, args.output, args.style, args.user_clips, args.user_clip_mode)
    print(json.dumps(manifest, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
