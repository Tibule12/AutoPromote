from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Union, Dict, Any
import sys
import time
import subprocess
import asyncio
import os
import shutil
import uuid
import logging
import base64
import mimetypes
import re  # Added for parsing silence output
import cv2  # OpenCV (Phase 1)
import numpy as np
import ffmpeg  # FFmpeg (Phase 1)
import firebase_admin
from firebase_admin import credentials, storage, firestore
from scenedetect import VideoManager, SceneManager
from scenedetect.detectors import ContentDetector
from dotenv import load_dotenv

# Fix asyncio event loop policy for Windows (Enable Proactor for Subprocesses)
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# Load env vars from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

try:
    # Initialize Firebase Admin
    if not firebase_admin._apps:
        # Check for service account key in standard locations
        key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if not key_path:
             # Check for service account key (look in CWD and parent)
             possible_keys = ["serviceAccountKey.json", "service-account-key.json", "firebase-admin.json", "autopromote-firebase-adminsdk.json"]
             
             search_paths = [
                 # Direct file check in CWD
                 "service-account-key.json", "serviceAccountKey.json",
                 # Parent directory check (if running from subdir)
                 "../service-account-key.json", "../serviceAccountKey.json",
                 # Script directory check
                 os.path.join(os.path.dirname(__file__), "service-account-key.json"),
                 os.path.join(os.path.dirname(__file__), "../service-account-key.json")
             ]
             
             for path in search_paths:
                 full_path = os.path.abspath(path)
                 if os.path.exists(full_path):
                     key_path = full_path
                     break
                     
             # Fallback to recursively searching if not found directly
             if not key_path:
                 start_dirs = [".", os.path.dirname(__file__), os.path.join(os.path.dirname(__file__), "..")]
                 for search_dir in start_dirs:
                     if not os.path.exists(search_dir): continue
                     for root, dirs, files in os.walk(search_dir):
                         for name in files:
                             if name in possible_keys:
                                 key_path = os.path.abspath(os.path.join(root, name))
                                 break
                         if key_path: break
                     if key_path: break
        
        if key_path and os.path.exists(key_path):
            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred, {
                'storageBucket': os.getenv("FIREBASE_STORAGE_BUCKET", "autopromote-cc6d3.firebasestorage.app")
            })
            logging.info(f"Firebase Admin initialized with key: {key_path}")
        else:
            # Try default (if running on GCloud/Render with env vars)
            firebase_admin.initialize_app(options={
                'storageBucket': os.getenv("FIREBASE_STORAGE_BUCKET", "autopromote-cc6d3.firebasestorage.app")
            })
            logging.info("Firebase Admin initialized with default credentials")

except Exception as e:
    logging.warning(f"Firebase Init Warning: {e}. Uploads may fail.")

try:
    import whisper
except ImportError:
    import logging
    logging.getLogger("MediaWorker").warning("Whisper module not found. Installing...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "openai-whisper"])
        import whisper
    except:
        whisper = None

try:
    import yt_dlp
except ImportError:
    import logging
    logging.getLogger("MediaWorker").warning("yt_dlp module not found. Installing...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "yt-dlp"])
        import yt_dlp
    except:
        yt_dlp = None

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MediaWorker")
FIREBASE_STATUS_UPDATES_ENABLED = bool(firebase_admin._apps)
MEDIA_WORKER_TASK_SECRET = os.getenv("MEDIA_WORKER_TASK_SECRET", "")

# Initialize Whisper model (lazy load or global)
# 'tiny' is fast but less accurate. 'base' or 'small' are better for production.
# We will load it on first request to avoid slow startup.
model_whisper = None

def get_whisper_model():
    global model_whisper
    if model_whisper is None and whisper is not None:
        # UPGRADE: 'small' model is required for decent performance on African languages (Zulu, Xhosa, Afrikaans).
        # 'base' often fails to detect them or hallucinates English. 
        # RAM Usage: 'small' requires ~2GB, which fits within our 4GB instance.
        logger.info("Loading Whisper model (small) for South African language support...")
        model_whisper = whisper.load_model("small")
    return model_whisper

def normalize_transcription_language(language):
    value = str(language or "auto").strip().lower()
    if value in {"", "auto", "detect", "unknown"}:
        return None
    return value

def clamp_float(value, minimum, maximum):
    try:
        numeric_value = float(value)
    except Exception:
        numeric_value = minimum
    return max(minimum, min(maximum, numeric_value))

def get_media_duration(input_path):
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                input_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        )
        return max(0.0, float(result.stdout.strip()))
    except Exception:
        return 0.0

def get_video_dimensions(input_path):
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=s=x:p=0",
                input_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        )
        width_text, height_text = result.stdout.strip().split("x") if "x" in result.stdout else (1080, 1920)
        return max(320, int(width_text)), max(320, int(height_text))
    except Exception:
        return 1080, 1920

def has_audio_stream(input_path):
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "csv=p=0",
                input_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        )
        return bool(result.stdout.strip())
    except Exception:
        return False

async def materialize_video_input(video_url, local_path):
    source = str(video_url or "").strip()
    if not source:
        raise HTTPException(status_code=400, detail="video_url is required")

    if source.startswith("http://") or source.startswith("https://"):
        await run_subprocess_async(
            ["ffmpeg", "-user_agent", "Mozilla/5.0", "-i", source, "-c", "copy", "-y", local_path],
            check=True,
        )
        return local_path

    absolute_source = os.path.abspath(source)
    if not os.path.exists(absolute_source):
        raise HTTPException(status_code=404, detail=f"Input video not found: {absolute_source}")

    if absolute_source != os.path.abspath(local_path):
        shutil.copy2(absolute_source, local_path)
    return local_path

def build_transcription_prompt(extra_hint=""):
    base = (
        "Transcribe spoken dialogue accurately. Prefer South African English spellings and names "
        "when the accent suggests it. Handle South African English, Afrikaans, isiZulu, isiXhosa, "
        "Sesotho, and Tswana carefully. Ignore background music, filler noise, and invented narration."
    )
    hint = str(extra_hint or "").strip()
    return f"{base} {hint}".strip()

def transcribe_with_hints(file_path, *, word_timestamps=False, language=None, prompt_hint="", task=None):
    model = get_whisper_model()
    if not model:
        raise HTTPException(status_code=500, detail="Whisper model not allocated")

    transcription_options = {
        "fp16": False,
        "word_timestamps": word_timestamps,
        "temperature": 0,
        "condition_on_previous_text": False,
        "compression_ratio_threshold": 2.2,
        "logprob_threshold": -0.8,
        "no_speech_threshold": 0.45,
        "initial_prompt": build_transcription_prompt(prompt_hint),
    }
    normalized_language = normalize_transcription_language(language)
    if normalized_language:
        transcription_options["language"] = normalized_language
    if task:
        transcription_options["task"] = task

    return model.transcribe(file_path, **transcription_options)

def score_text_for_virality(text, keyword_weights):
    normalized = str(text or "").strip().lower()
    if not normalized:
        return 0, []

    boost = 0
    found = []
    for keyword, weight in keyword_weights.items():
        if keyword in normalized:
            boost += weight
            if len(found) < 4:
                found.append(keyword)

    if "?" in normalized:
        boost += 6
    if any(token in normalized for token in ["wait", "watch", "look", "listen", "stop"]):
        boost += 5
    if len(normalized.split()) >= 10:
        boost += 4

    return boost, found

def build_transcript_windows(transcription_segments, keyword_weights):
    if not transcription_segments:
        return []

    windows = []
    current = None
    for segment in transcription_segments:
        start = float(segment.get("start", 0) or 0)
        end = float(segment.get("end", 0) or 0)
        text = str(segment.get("text", "") or "").strip()
        if end <= start or not text:
            continue

        if not current:
            current = {
                "start": start,
                "end": end,
                "texts": [text],
                "segments": [segment],
            }
            continue

        gap = start - current["end"]
        proposed_duration = end - current["start"]
        if gap <= 1.2 and proposed_duration <= 36:
            current["end"] = end
            current["texts"].append(text)
            current["segments"].append(segment)
        else:
            windows.append(current)
            current = {
                "start": start,
                "end": end,
                "texts": [text],
                "segments": [segment],
            }

    if current:
        windows.append(current)

    ranked = []
    for index, window in enumerate(windows):
        duration = window["end"] - window["start"]
        if duration < 6:
            continue
        text = " ".join(window["texts"]).strip()
        keyword_boost, found_keywords = score_text_for_virality(text, keyword_weights)
        word_count = len(text.split())
        density_boost = min(12, max(0, word_count // 6))
        duration_penalty = 0 if duration <= 28 else min(12, int(duration - 28))
        score = min(99, 64 + keyword_boost + density_boost - duration_penalty)
        ranked.append({
            "id": f"speech_{index}",
            "start": window["start"],
            "end": window["end"],
            "duration": duration,
            "viralScore": score,
            "reason": " + ".join(
                [part for part in [
                    "Dense spoken segment",
                    f"Keywords: {', '.join(found_keywords)}" if found_keywords else "",
                    "Strong question/command phrasing" if keyword_boost >= 10 else "",
                ] if part]
            ),
            "text": text[:220] + ("..." if len(text) > 220 else ""),
            "source": "speech_window",
        })
    return ranked

def align_clip_to_scenes(candidate, scene_list):
    if not scene_list:
        return candidate

    start = float(candidate.get("start", 0) or 0)
    end = float(candidate.get("end", 0) or 0)
    aligned_start = start
    aligned_end = end

    for scene in scene_list:
        scene_start = scene[0].get_seconds()
        scene_end = scene[1].get_seconds()
        if scene_start <= start <= scene_end:
            aligned_start = scene_start
        if scene_start <= end <= scene_end:
            aligned_end = scene_end
            break

    if aligned_end - aligned_start > 45:
        aligned_end = aligned_start + 45
    if aligned_end - aligned_start < 6:
        aligned_end = max(aligned_end, aligned_start + 6)

    updated = dict(candidate)
    updated["start"] = round(aligned_start, 2)
    updated["end"] = round(aligned_end, 2)
    updated["duration"] = round(aligned_end - aligned_start, 2)
    return updated

def dedupe_ranked_candidates(candidates, max_results=15):
    ordered = sorted(candidates, key=lambda item: item.get("viralScore", 0), reverse=True)
    selected = []
    for candidate in ordered:
        overlap_found = False
        for existing in selected:
            latest_start = max(candidate["start"], existing["start"])
            earliest_end = min(candidate["end"], existing["end"])
            overlap = max(0.0, earliest_end - latest_start)
            smaller = max(1.0, min(candidate["duration"], existing["duration"]))
            if overlap / smaller >= 0.6:
                overlap_found = True
                break
        if not overlap_found:
            selected.append(candidate)
        if len(selected) >= max_results:
            break
    return selected

def escape_drawtext_text(text):
    return (
        str(text or "")
        .replace("\\", "\\\\")
        .replace("'", "")
        .replace(":", "\\:")
        .replace("%", "\\%")
        .replace(",", "\\,")
        .replace("[", "\\[")
        .replace("]", "\\]")
        .replace("\n", "\\n")
    )

def wrap_hook_text(text, max_chars=18, max_lines=3):
    words = [word for word in re.split(r"\s+", str(text or "").strip()) if word]
    if not words:
        return ""

    lines = []
    current = ""
    consumed = 0
    for word in words:
        proposal = f"{current} {word}".strip()
        if current and len(proposal) > max_chars:
            lines.append(current)
            current = word
            if len(lines) >= max_lines - 1:
                break
        else:
            current = proposal
        consumed += 1

    if current and len(lines) < max_lines:
        lines.append(current)

    if consumed < len(words) and lines:
        lines[-1] = re.sub(r"[. ]+$", "", lines[-1]) + "..."

    return "\n".join(lines)

def build_hook_filter_chain(
    hook_text,
    intro_seconds,
    width_val=1080,
    height_val=1920,
    template="blur_reveal",
    hook_start_time=0.0,
    blur_background=True,
    dark_overlay=True,
    freeze_frame=False,
    zoom_scale=1.08,
    text_animation="slide_up",
):
    wrapped = wrap_hook_text(hook_text, max_chars=18, max_lines=3)
    if not wrapped:
        return ""

    safe_text = escape_drawtext_text(wrapped)
    intro = max(0.8, min(float(intro_seconds or 3.0), 5.0))
    hook_start = max(0.0, min(float(hook_start_time or 0.0), 1.5))
    hook_end = hook_start + intro
    outro_end = hook_end + 0.45
    normalized_template = str(template or "blur_reveal").strip().lower()
    normalized_animation = str(text_animation or "slide_up").strip().lower().replace("-", "_")
    zoom_delta = max(0.0, min(float(zoom_scale or 1.08), 1.14) - 1.0)
    progress_expr = f"max(0\\,min(1\\,(t-{hook_start:.2f})/{max(intro, 0.01):.2f}))"
    intro_text_expr = f"max(0\\,min(1\\,(t-{hook_start:.2f})/0.35))"
    fade_expr = f"if(lte(t\\,{hook_end:.2f})\\,1\\,max(0\\,1-((t-{hook_end:.2f})/0.45)))"
    font_size = "if(gt(text_h\\,h*0.22)\\,h*0.05\\,h*0.068)"

    filters = []

    if zoom_delta > 0.001:
        zoom_expr = f"(1+{zoom_delta:.4f}*{progress_expr})"
        filters.append(
            f"scale=w={width_val}*{zoom_expr}:h={height_val}*{zoom_expr}:eval=frame,crop={width_val}:{height_val}:(iw-{width_val})/2:(ih-{height_val})/2"
        )

    if blur_background and normalized_template == "blur_reveal":
        filters.append(
            f"gblur=sigma=12:steps=1:enable='between(t,{hook_start:.2f},{outro_end:.2f})'"
        )

    if dark_overlay:
        overlay_alpha = 0.26 if normalized_template == "zoom_focus" else 0.36
        filters.append(
            f"drawbox=x=0:y=0:w=iw:h=ih:color=black@{overlay_alpha:.2f}:t=fill:enable='between(t,{hook_start:.2f},{outro_end:.2f})'"
        )

    if normalized_template in {"blur_reveal", "freeze_text"}:
        filters.append(
            f"drawbox=x=iw*0.08:y=ih*0.15:w=iw*0.84:h=ih*0.012:color=0xF97316@0.96:t=fill:enable='between(t,{hook_start:.2f},{hook_end:.2f})'"
        )

    if normalized_animation == "fade_in":
        text_y = "(h-text_h)/2-h*0.03"
    else:
        text_y = f"(h-text_h)/2-h*0.03+((1-{intro_text_expr})*40)"

    filters.append(
        f"drawtext=text='{safe_text}':font='DejaVu Sans':fontcolor=white:alpha={fade_expr}*{intro_text_expr}:fontsize={font_size}:line_spacing=18:x=(w-text_w)/2:y={text_y}:borderw=5:bordercolor=black@0.94:shadowx=4:shadowy=4:enable='between(t,{hook_start:.2f},{outro_end:.2f})'"
    )

    filters.append(
        f"drawtext=text='HOOK':font='DejaVu Sans':fontcolor=white:alpha={fade_expr}:fontsize=h*0.028:x=(w-text_w)/2:y=h*0.21:borderw=2:bordercolor=black@0.88:enable='between(t,{hook_start:.2f},{outro_end:.2f})'"
    )

    return ",".join(filters)

def build_quality_enhancement_filter_chain(profile="safe_clean"):
    normalized_profile = str(profile or "safe_clean").strip().lower()

    if normalized_profile == "safe_clean":
        return ",".join([
            "hqdn3d=1.1:1.1:5.5:5.5",
            "eq=brightness=0.01:contrast=1.04:saturation=1.03",
            "unsharp=5:5:0.42:5:5:0.0",
        ])

    return ""

def build_watermark_regions(width, height):
    width = max(int(width or 1080), 320)
    height = max(int(height or 1920), 320)

    margin_x = max(18, int(width * 0.018))
    top_margin = max(18, int(height * 0.018))
    bottom_margin = max(68, int(height * 0.052))
    logo_w = max(88, int(width * 0.16))
    logo_h = max(54, int(height * 0.06))
    username_w = max(124, int(width * 0.22))
    username_h = max(44, int(height * 0.046))
    username_gap = max(8, int(width * 0.012))
    bottom_y = max(top_margin, height - username_h - bottom_margin)
    bottom_right_x = max(margin_x, width - username_w - margin_x)
    icon_bottom_y = max(top_margin, bottom_y - max(10, int(height * 0.01)))
    icon_right_x = max(margin_x, width - logo_w - margin_x)

    return {
        "top_left": [
            (margin_x, top_margin, logo_w, logo_h),
        ],
        "top_right": [
            (max(margin_x, width - logo_w - margin_x), top_margin, logo_w, logo_h),
        ],
        "bottom_left": [
            (margin_x, icon_bottom_y, logo_w, logo_h),
            (margin_x + logo_w - max(4, int(width * 0.006)), bottom_y, username_w, username_h),
        ],
        "bottom_right": [
            (icon_right_x, icon_bottom_y, logo_w, logo_h),
            (bottom_right_x - logo_w - username_gap + max(4, int(width * 0.006)), bottom_y, username_w, username_h),
        ],
    }

def score_watermark_region(frame, region):
    x, y, region_w, region_h = region
    roi = frame[y:y + region_h, x:x + region_w]
    if roi is None or roi.size == 0:
        return 0.0

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blurred, 80, 160)
    _, bright_mask = cv2.threshold(gray, 208, 255, cv2.THRESH_BINARY)

    edge_density = cv2.countNonZero(edges) / float(edges.size or 1)
    bright_density = cv2.countNonZero(bright_mask) / float(bright_mask.size or 1)
    contrast_score = float(gray.std()) / 255.0
    return (edge_density * 0.55) + (bright_density * 0.30) + (contrast_score * 0.15)

def build_alternating_watermark_schedule(duration, window_seconds=3.5):
    schedule = []
    position_pairs = [
        ("top_left", "bottom_right"),
        ("top_right", "bottom_left"),
    ]

    safe_duration = max(0.0, float(duration or 0.0))
    current_start = 0.0
    window_index = 0
    while current_start < safe_duration:
        current_end = min(safe_duration, current_start + window_seconds)
        schedule.append((current_start, current_end, position_pairs[window_index % len(position_pairs)]))
        current_start = current_end
        window_index += 1

    if not schedule:
        schedule.append((0.0, max(window_seconds, safe_duration), position_pairs[0]))
    return schedule

def get_default_watermark_keys(sample_index):
    return ("top_left", "bottom_right") if sample_index % 2 == 0 else ("top_right", "bottom_left")

def build_window_sample_times(start_time, end_time, samples_per_window):
    sample_count = max(1, int(samples_per_window or 1))
    duration = max(0.05, float(end_time) - float(start_time))
    if sample_count == 1:
        return [start_time + (duration / 2.0)]

    step = duration / float(sample_count + 1)
    return [start_time + (step * (index + 1)) for index in range(sample_count)]

def choose_watermark_keys(scores, sample_index, previous_keys=None):
    default_keys = get_default_watermark_keys(sample_index)
    top_left_score = scores.get("top_left", 0.0)
    top_right_score = scores.get("top_right", 0.0)
    bottom_left_score = scores.get("bottom_left", 0.0)
    bottom_right_score = scores.get("bottom_right", 0.0)

    top_choice = "top_left" if top_left_score >= top_right_score else "top_right"
    bottom_choice = "bottom_left" if bottom_left_score >= bottom_right_score else "bottom_right"

    selected_keys = []
    top_gap = abs(top_left_score - top_right_score)
    bottom_gap = abs(bottom_left_score - bottom_right_score)
    top_gate = max(0.022, ((top_left_score + top_right_score) / 2.0) + 0.008)
    bottom_gate = max(0.022, ((bottom_left_score + bottom_right_score) / 2.0) + 0.008)

    if top_gap < 0.012 and previous_keys:
        previous_top = next((key for key in previous_keys if key.startswith("top_")), None)
        if previous_top:
            top_choice = previous_top
    if bottom_gap < 0.012 and previous_keys:
        previous_bottom = next((key for key in previous_keys if key.startswith("bottom_")), None)
        if previous_bottom:
            bottom_choice = previous_bottom

    if scores.get(top_choice, 0.0) >= top_gate:
        selected_keys.append(top_choice)
    if scores.get(bottom_choice, 0.0) >= bottom_gate:
        selected_keys.append(bottom_choice)

    if not selected_keys:
        selected_keys = list(default_keys)

    return tuple(dict.fromkeys(selected_keys))

def collapse_watermark_windows(windows):
    collapsed = []
    for window in windows:
        if collapsed and collapsed[-1]["keys"] == window["keys"]:
            previous = collapsed[-1]
            collapsed[-1] = {
                **window,
                "start": previous["start"],
                "sample_times": previous.get("sample_times", []) + window.get("sample_times", []),
            }
        else:
            collapsed.append(window)
    return collapsed

def analyze_dynamic_watermark_schedule(video_path, width, height, duration, mode, window_seconds=2.4, samples_per_window=3):
    safe_duration = max(0.0, float(duration or 0.0))
    if safe_duration <= 0:
        return []

    regions = build_watermark_regions(width, height)
    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        return []

    windows = []
    current_start = 0.0
    sample_index = 0
    previous_keys = None
    clamped_window = clamp_float(window_seconds, 1.2, 5.0)
    clamped_samples = max(1, min(5, int(samples_per_window or 3)))

    try:
        while current_start < safe_duration:
            current_end = min(safe_duration, current_start + clamped_window)
            sample_times = build_window_sample_times(current_start, current_end, clamped_samples)
            aggregated_scores = {key: 0.0 for key in regions.keys()}
            captured_samples = 0

            for sample_time in sample_times:
                capture.set(cv2.CAP_PROP_POS_MSEC, sample_time * 1000.0)
                success, frame = capture.read()
                if not success or frame is None:
                    continue
                captured_samples += 1
                for key, rects in regions.items():
                    if rects:
                        aggregated_scores[key] += score_watermark_region(frame, rects[0])

            if captured_samples > 0:
                averaged_scores = {
                    key: aggregated_scores[key] / float(captured_samples)
                    for key in aggregated_scores.keys()
                }
                selected_keys = choose_watermark_keys(averaged_scores, sample_index, previous_keys)
            else:
                averaged_scores = {key: 0.0 for key in regions.keys()}
                selected_keys = get_default_watermark_keys(sample_index)

            sorted_scores = sorted(averaged_scores.values(), reverse=True)
            confidence = round((sorted_scores[0] - sorted_scores[2]) if len(sorted_scores) >= 3 else sorted_scores[0], 4)
            windows.append(
                {
                    "start": round(current_start, 3),
                    "end": round(current_end, 3),
                    "keys": tuple(selected_keys),
                    "scores": {key: round(value, 4) for key, value in averaged_scores.items()},
                    "sample_times": [round(value, 3) for value in sample_times],
                    "captured_samples": captured_samples,
                    "confidence": confidence,
                }
            )
            previous_keys = tuple(selected_keys)
            current_start = current_end
            sample_index += 1
    finally:
        capture.release()

    return windows

def detect_dynamic_watermark_schedule(video_path, width, height, duration, mode, window_seconds=3.5):
    analyzed = analyze_dynamic_watermark_schedule(video_path, width, height, duration, mode, window_seconds=window_seconds)
    if not analyzed:
        safe_duration = max(0.0, float(duration or 0.0))
        return build_alternating_watermark_schedule(safe_duration or window_seconds, window_seconds)
    analyzed = collapse_watermark_windows(analyzed)
    return [(window["start"], window["end"], window["keys"]) for window in analyzed]

def create_watermark_preview_sheet(video_path, width, height, analyzed_windows, max_preview_frames=6):
    if not analyzed_windows:
        return None

    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        return None

    regions = build_watermark_regions(width, height)
    preview_tiles = []
    target_count = max(1, min(int(max_preview_frames or 6), len(analyzed_windows)))
    if len(analyzed_windows) <= target_count:
        target_windows = analyzed_windows
    else:
        step = max(1, len(analyzed_windows) // target_count)
        target_windows = [analyzed_windows[index] for index in range(0, len(analyzed_windows), step)][:target_count]

    try:
        for index, window in enumerate(target_windows):
            sample_time = window.get("sample_times", [window["start"]])[0]
            capture.set(cv2.CAP_PROP_POS_MSEC, float(sample_time) * 1000.0)
            success, frame = capture.read()
            if not success or frame is None:
                continue

            annotated = frame.copy()
            for key, rects in regions.items():
                color = (64, 64, 64)
                thickness = 1
                if key in window["keys"]:
                    color = (0, 220, 255) if key.startswith("top_") else (0, 255, 120)
                    thickness = 3
                for x, y, region_w, region_h in rects:
                    cv2.rectangle(annotated, (x, y), (x + region_w, y + region_h), color, thickness)

            cv2.putText(
                annotated,
                f"{window['start']:.1f}s-{window['end']:.1f}s | {', '.join(window['keys'])}",
                (24, 36),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.82,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )
            cv2.putText(
                annotated,
                f"confidence={window.get('confidence', 0):.3f}",
                (24, 68),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.68,
                (240, 240, 240),
                2,
                cv2.LINE_AA,
            )

            preview_tiles.append(cv2.resize(annotated, (480, 270)))
    finally:
        capture.release()

    if not preview_tiles:
        return None

    while len(preview_tiles) % 2 != 0:
        preview_tiles.append(np.zeros_like(preview_tiles[0]))

    rows = []
    for index in range(0, len(preview_tiles), 2):
        rows.append(cv2.hconcat(preview_tiles[index:index + 2]))

    return cv2.vconcat(rows) if len(rows) > 1 else rows[0]

def clamp_delogo_region(width, height, x, y, region_w, region_h):
    safe_width = max(int(width or 1080), 32)
    safe_height = max(int(height or 1920), 32)

    x = int(x)
    y = int(y)
    region_w = int(region_w)
    region_h = int(region_h)

    x = max(1, min(safe_width - 2, x))
    y = max(1, min(safe_height - 2, y))
    region_w = max(1, min(safe_width - x - 1, region_w))
    region_h = max(1, min(safe_height - y - 1, region_h))
    return x, y, region_w, region_h

def read_video_frame_at_time(capture, time_seconds):
    capture.set(cv2.CAP_PROP_POS_MSEC, max(0.0, float(time_seconds or 0.0)) * 1000.0)
    success, frame = capture.read()
    if not success or frame is None:
        return None
    return frame

def build_tracking_candidate_windows(width, height, region_w, region_h, previous_box=None, seed_box=None):
    windows = []

    def add_window(x, y, window_w, window_h):
        x = max(0, min(width - 2, int(x)))
        y = max(0, min(height - 2, int(y)))
        window_w = max(region_w + 2, min(width - x, int(window_w)))
        window_h = max(region_h + 2, min(height - y, int(window_h)))
        key = (x, y, window_w, window_h)
        if window_w > region_w and window_h > region_h and key not in windows:
            windows.append(key)

    def add_local_windows(box, padding_scale_x=2.6, padding_scale_y=2.4):
        if not box:
            return
        box_x, box_y, box_w, box_h = box
        pad_x = max(40, int(box_w * padding_scale_x), int(width * 0.08))
        pad_y = max(32, int(box_h * padding_scale_y), int(height * 0.07))
        add_window(box_x - pad_x, box_y - pad_y, box_w + (pad_x * 2), box_h + (pad_y * 2))

        mirrored_x = max(0, width - box_x - box_w)
        add_window(mirrored_x - pad_x, box_y - pad_y, box_w + (pad_x * 2), box_h + (pad_y * 2))

    add_local_windows(previous_box)
    add_local_windows(seed_box, padding_scale_x=3.0, padding_scale_y=2.8)

    corner_w = max(region_w + max(72, int(width * 0.18)), int(width * 0.34))
    corner_h = max(region_h + max(60, int(height * 0.12)), int(height * 0.24))
    add_window(0, 0, corner_w, corner_h)
    add_window(width - corner_w, 0, corner_w, corner_h)
    add_window(0, height - corner_h, corner_w, corner_h)
    add_window(width - corner_w, height - corner_h, corner_w, corner_h)
    add_window(0, max(0, int(height * 0.42)), max(region_w + 80, int(width * 0.42)), max(region_h + 80, int(height * 0.24)))
    add_window(max(0, int(width * 0.58)), max(0, int(height * 0.42)), max(region_w + 80, int(width * 0.42)), max(region_h + 80, int(height * 0.24)))
    return windows

def locate_template_in_frame(frame, template_gray, width, height, region_w, region_h, previous_box=None, seed_box=None):
    if frame is None or template_gray is None or template_gray.size == 0:
        return None

    frame_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    candidate_windows = build_tracking_candidate_windows(width, height, region_w, region_h, previous_box, seed_box)
    best_match = None

    for window_x, window_y, window_w, window_h in candidate_windows:
        roi = frame_gray[window_y:window_y + window_h, window_x:window_x + window_w]
        if roi is None or roi.size == 0:
            continue
        if roi.shape[0] <= template_gray.shape[0] or roi.shape[1] <= template_gray.shape[1]:
            continue

        result = cv2.matchTemplate(roi, template_gray, cv2.TM_CCOEFF_NORMED)
        _, score, _, max_loc = cv2.minMaxLoc(result)
        candidate = (
            window_x + int(max_loc[0]),
            window_y + int(max_loc[1]),
            region_w,
            region_h,
            float(score),
        )
        if best_match is None or candidate[4] > best_match[4]:
            best_match = candidate

    return best_match

def build_manual_tracking_times(seed_time, duration, sample_interval, target_time=None):
    safe_duration = max(0.0, float(duration or 0.0))
    safe_seed = clamp_float(seed_time, 0.0, safe_duration if safe_duration > 0 else 0.0)
    safe_interval = clamp_float(sample_interval, 0.35, 2.0)

    if target_time is not None:
        safe_target = clamp_float(target_time, 0.0, safe_duration if safe_duration > 0 else 0.0)
        times = {round(safe_seed, 3), round(safe_target, 3)}
        if safe_target >= safe_seed:
            current_time = safe_seed
            while current_time < safe_target:
                times.add(round(current_time, 3))
                current_time += safe_interval
        else:
            current_time = safe_seed
            while current_time > safe_target:
                times.add(round(current_time, 3))
                current_time -= safe_interval
        return sorted(times)

    times = {0.0, round(safe_seed, 3), round(safe_duration, 3)}
    current_time = 0.0
    while current_time < safe_duration:
        times.add(round(current_time, 3))
        current_time += safe_interval
    times.add(round(safe_duration, 3))
    return sorted(times)

def track_manual_region_positions(video_path, width, height, duration, region, target_time=None, sample_interval=0.9):
    safe_duration = max(0.0, float(duration or 0.0))
    seed_time = clamp_float(region.get("seed_time", 0.0), 0.0, safe_duration if safe_duration > 0 else 0.0)

    left = max(0.0, min(100.0, float(region.get("left", 0.0))))
    top = max(0.0, min(100.0, float(region.get("top", 0.0))))
    region_w_pct = max(1.0, min(100.0, float(region.get("width", 0.0))))
    region_h_pct = max(1.0, min(100.0, float(region.get("height", 0.0))))
    seed_x = int((left / 100.0) * width)
    seed_y = int((top / 100.0) * height)
    seed_w = max(32, int((region_w_pct / 100.0) * width))
    seed_h = max(24, int((region_h_pct / 100.0) * height))
    seed_box = clamp_delogo_region(width, height, seed_x, seed_y, seed_w, seed_h)

    times = build_manual_tracking_times(seed_time, safe_duration, sample_interval, target_time)
    if len(times) <= 1 or not video_path:
        return {times[0] if times else round(seed_time, 3): seed_box}

    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        return {time_value: seed_box for time_value in times}

    positions = {round(seed_time, 3): seed_box}

    try:
        seed_frame = read_video_frame_at_time(capture, seed_time)
        if seed_frame is None:
            return {time_value: seed_box for time_value in times}

        box_x, box_y, box_w, box_h = seed_box
        template = seed_frame[box_y:box_y + box_h, box_x:box_x + box_w]
        if template is None or template.size == 0:
            return {time_value: seed_box for time_value in times}

        template_gray = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)
        times_sorted = sorted(times)
        seed_key = round(seed_time, 3)
        if seed_key not in times_sorted:
            times_sorted.append(seed_key)
            times_sorted.sort()

        seed_index = times_sorted.index(seed_key)

        previous_box = seed_box
        for time_value in times_sorted[seed_index + 1:]:
            frame = read_video_frame_at_time(capture, time_value)
            best_match = locate_template_in_frame(
                frame,
                template_gray,
                width,
                height,
                box_w,
                box_h,
                previous_box=previous_box,
                seed_box=seed_box,
            )
            if best_match and best_match[4] >= 0.18:
                previous_box = clamp_delogo_region(width, height, best_match[0], best_match[1], box_w, box_h)
            positions[time_value] = previous_box

        previous_box = seed_box
        for time_value in reversed(times_sorted[:seed_index]):
            frame = read_video_frame_at_time(capture, time_value)
            best_match = locate_template_in_frame(
                frame,
                template_gray,
                width,
                height,
                box_w,
                box_h,
                previous_box=previous_box,
                seed_box=seed_box,
            )
            if best_match and best_match[4] >= 0.18:
                previous_box = clamp_delogo_region(width, height, best_match[0], best_match[1], box_w, box_h)
            positions[time_value] = previous_box
    finally:
        capture.release()

    return positions

def build_tracked_manual_filters(width, height, duration, video_path, manual_regions, target_time=None):
    filters = []
    safe_duration = max(0.0, float(duration or 0.0))

    for region in manual_regions:
        tracking_enabled = bool(region.get("track", True))
        if not tracking_enabled or not video_path:
            left = max(0.0, min(100.0, float(region.get("left", 0.0))))
            top = max(0.0, min(100.0, float(region.get("top", 0.0))))
            region_w_pct = max(1.0, min(100.0, float(region.get("width", 0.0))))
            region_h_pct = max(1.0, min(100.0, float(region.get("height", 0.0))))
            region_x = int((left / 100.0) * width)
            region_y = int((top / 100.0) * height)
            region_w = max(32, int((region_w_pct / 100.0) * width))
            region_h = max(24, int((region_h_pct / 100.0) * height))
            region_x, region_y, region_w, region_h = clamp_delogo_region(width, height, region_x, region_y, region_w, region_h)
            filters.append(f"delogo=x={region_x}:y={region_y}:w={region_w}:h={region_h}:show=0")
            continue

        tracked_positions = track_manual_region_positions(
            video_path,
            width,
            height,
            safe_duration,
            region,
            target_time=target_time,
            sample_interval=0.9,
        )
        if target_time is not None:
            target_key = sorted(tracked_positions.keys(), key=lambda value: abs(value - float(target_time)))[0]
            region_x, region_y, region_w, region_h = tracked_positions[target_key]
            filters.append(f"delogo=x={region_x}:y={region_y}:w={region_w}:h={region_h}:show=0")
            continue

        ordered_times = sorted(tracked_positions.keys())
        if not ordered_times:
            continue

        merged_windows = []
        for index, start_time in enumerate(ordered_times):
            end_time = safe_duration if index == len(ordered_times) - 1 else ordered_times[index + 1]
            box = tracked_positions[start_time]
            if merged_windows and merged_windows[-1]["box"] == box:
                merged_windows[-1]["end"] = end_time
            else:
                merged_windows.append({"start": start_time, "end": end_time, "box": box})

        for window in merged_windows:
            region_x, region_y, region_w, region_h = window["box"]
            enable_expr = f"between(t\\,{window['start']:.3f}\\,{window['end']:.3f})"
            filters.append(
                f"delogo=x={region_x}:y={region_y}:w={region_w}:h={region_h}:show=0:enable='{enable_expr}'"
            )

    return filters

def resolve_schedule_keys_at_time(schedule, target_time):
    if not schedule:
        return ()

    safe_target = float(target_time or 0.0)
    for start_time, end_time, keys in schedule:
        if safe_target >= float(start_time) and safe_target <= float(end_time):
            return tuple(keys)

    nearest_window = min(
        schedule,
        key=lambda window: min(abs(safe_target - float(window[0])), abs(safe_target - float(window[1]))),
    )
    return tuple(nearest_window[2])

def build_delogo_filters(width, height, mode, duration=None, video_path=None, manual_regions=None, target_time=None):
    width = max(int(width or 1080), 320)
    height = max(int(height or 1920), 320)
    mode = str(mode or "adaptive").strip().lower()
    regions = build_watermark_regions(width, height)

    if mode == "manual" and manual_regions:
        filters = build_tracked_manual_filters(width, height, duration, video_path, manual_regions, target_time)
        if filters:
            return filters

    if mode in {"adaptive", "tracked", "moving", "tiktok"} and video_path:
        if target_time is not None:
            filters = []
            active_keys = resolve_schedule_keys_at_time(
                detect_dynamic_watermark_schedule(video_path, width, height, duration, mode),
                target_time,
            )
            for key in active_keys:
                for x, y, region_w, region_h in regions.get(key, []):
                    x, y, region_w, region_h = clamp_delogo_region(width, height, x, y, region_w, region_h)
                    filters.append(f"delogo=x={x}:y={y}:w={region_w}:h={region_h}:show=0")
            return filters

        filters = []
        for start_time, end_time, keys in detect_dynamic_watermark_schedule(video_path, width, height, duration, mode):
            enable_expr = f"between(t\\,{start_time:.3f}\\,{end_time:.3f})"
            for key in keys:
                for x, y, region_w, region_h in regions.get(key, []):
                    x, y, region_w, region_h = clamp_delogo_region(width, height, x, y, region_w, region_h)
                    filters.append(
                        f"delogo=x={x}:y={y}:w={region_w}:h={region_h}:show=0:enable='{enable_expr}'"
                    )
        return filters

    selected_regions = []
    if mode in {"corners", "standard"}:
        selected_regions.extend(regions["top_left"])
        selected_regions.extend(regions["bottom_right"])
    elif mode in regions:
        selected_regions.extend(regions[mode])
    elif mode == "all":
        for key in ("top_left", "top_right", "bottom_left", "bottom_right"):
            selected_regions.extend(regions[key])
    else:
        selected_regions.extend(regions["top_left"])
        selected_regions.extend(regions["bottom_left"])
        selected_regions.extend(regions["bottom_right"])

    filters = []
    for x, y, region_w, region_h in selected_regions:
        x, y, region_w, region_h = clamp_delogo_region(width, height, x, y, region_w, region_h)
        filters.append(f"delogo=x={x}:y={y}:w={region_w}:h={region_h}:show=0")
    return filters

def upload_file_to_firebase(local_path, destination_path=None):
    """
    Uploads file to Firebase (Signed URL + Fallback).
    """
    try:
        bucket = storage.bucket()
        if not destination_path:
            destination_path = f"processed/{os.path.basename(local_path)}"
        
        blob = bucket.blob(destination_path)
        blob.upload_from_filename(local_path)

        # 1. Try Signed URL (Best for uniform buckets)
        try:
            import datetime
            url = blob.generate_signed_url(
                version="v4",
                expiration=datetime.timedelta(days=7),
                method="GET"
            )
            logger.info(f"Generated Signed URL: {url}")
            return url
        except Exception as e:
            logger.warning(f"Signed URL failed: {e}")

        # 2. Try make_public (Legacy)
        try:
            blob.make_public()
            return blob.public_url
        except Exception as e:
            logger.warning(f"make_public failed: {e}")
            
        # 3. Fallback (Maybe bucket is public via policy)
        return blob.public_url or f"https://storage.googleapis.com/{bucket.name}/{destination_path}"

    except Exception as e:
        logger.error(f"Firebase Upload CRITICAL: {e}")
        return None

def encode_file_as_data_url(local_path):
    try:
        mime_type, _ = mimetypes.guess_type(local_path)
        safe_mime = mime_type or "application/octet-stream"
        with open(local_path, "rb") as source_file:
            encoded = base64.b64encode(source_file.read()).decode("ascii")
        return f"data:{safe_mime};base64,{encoded}"
    except Exception as e:
        logger.error(f"Failed to encode preview asset as data URL: {e}")
        return None

def update_firestore_job(job_id, data):
    """
    Update Firestore job status (for async processing).
    """
    global FIREBASE_STATUS_UPDATES_ENABLED
    if not job_id or not FIREBASE_STATUS_UPDATES_ENABLED:
        return
    try:
        db = firestore.client()
        # Ensure timestamp is set properly if needed, but 'merge=True' handles partial updates
        # Add timestamp for traceability
        data['updated_at'] = firestore.SERVER_TIMESTAMP
        
        doc_ref = db.collection("video_edits").document(job_id)
        doc_ref.set(data, merge=True)
        logger.info(f"Firestore updated for job {job_id}: {data.get('status')}")
    except Exception as e:
        FIREBASE_STATUS_UPDATES_ENABLED = False
        logger.error(f"Failed to update Firestore for job {job_id}: {e}")


def build_safe_music_query(query):
    safe_query = str(query or "").strip() or "upbeat background music"
    lowered = safe_query.lower()
    required_terms = ["royalty free", "no copyright", "background music"]
    for term in required_terms:
        if term not in lowered:
            safe_query = f"{safe_query} {term}"
    return safe_query.strip()

def score_safe_music_candidate(entry):
    haystack = " ".join(
        str(entry.get(field, ""))
        for field in ("title", "uploader", "channel", "description")
    ).lower()

    score = 0
    for term in (
        "royalty free",
        "copyright free",
        "no copyright",
        "ncs",
        "audio library",
        "creator safe",
        "free to use",
        "background music",
    ):
        if term in haystack:
            score += 3

    for term in (
        "official audio",
        "official video",
        "lyrics",
        "vevo",
        "records",
        "album",
        "topic",
        "feat.",
        " ft ",
    ):
        if term in haystack:
            score -= 4

    duration = entry.get("duration") or 0
    if 45 <= duration <= 1800:
        score += 1
    if entry.get("availability") in {None, "public"}:
        score += 1
    return score

def pick_safe_music_result(query):
    search_opts = {
        'skip_download': True,
        'quiet': True,
        'extract_flat': True,
        'noplaylist': True,
    }
    with yt_dlp.YoutubeDL(search_opts) as ydl:
        info = ydl.extract_info(f"ytsearch8:{build_safe_music_query(query)}", download=False)

    entries = info.get("entries") or []
    best_entry = None
    best_score = float("-inf")
    for entry in entries:
        entry_score = score_safe_music_candidate(entry)
        if entry_score > best_score:
            best_score = entry_score
            best_entry = entry

    if not best_entry or best_score < 2:
        return None

    webpage_url = best_entry.get("webpage_url")
    if webpage_url:
        return webpage_url

    video_id = best_entry.get("id")
    if video_id:
        return f"https://www.youtube.com/watch?v={video_id}"
    return None



def download_youtube_audio(query, output_path, safe_search=True):
    """
    Searches YouTube and downloads audio.
    Returns the path to the downloaded file.
    """
    if yt_dlp is None:
        raise HTTPException(status_code=500, detail="yt-dlp not installed on server")
    
    # We strip any extension if provided, as yt-dlp appends it
    base_output = os.path.splitext(output_path)[0]

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': base_output, # Force filename without extension
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'noplaylist': True,
        'quiet': True
    }

    try:
        requested_query = str(query or "").strip()
        if safe_search and requested_query.startswith("http"):
            logger.warning("Safe music mode rejected a direct music URL")
            return None

        if safe_search:
            requested_query = pick_safe_music_result(requested_query)
            if not requested_query:
                logger.warning("No royalty-free search result matched the music request")
                return None

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            if not requested_query.startswith("http"):
                requested_query = f"ytsearch1:{requested_query}" # Search logic
            
            logger.info(f"Searching/Downloading song: {requested_query}")
            ydl.download([requested_query])
            
            # yt-dlp appends extension, so check file
            final_path = base_output + ".mp3"
            if os.path.exists(final_path):
                return final_path
            return None
    except Exception as e:
        logger.error(f"yt-dlp error: {e}")
        return None

def resolve_music_input(music_file, output_path, *, is_search=False, safe_search=True):
    raw_value = str(music_file or "").strip()
    if not raw_value:
        raise HTTPException(status_code=400, detail="Music selection is empty")

    if not is_search and raw_value.startswith("http"):
        if safe_search:
            raise HTTPException(status_code=400, detail="Direct music URLs are blocked while copyright protection is enabled")
        return download_youtube_audio(raw_value, output_path, safe_search=False)

    if not is_search and os.path.exists(raw_value):
        return raw_value

    for candidate in (
        os.path.join("assets/music", raw_value),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "music", raw_value),
        os.path.join(os.getcwd(), "assets", "music", raw_value),
    ):
        if os.path.exists(candidate):
            return candidate

    return download_youtube_audio(raw_value, output_path, safe_search=safe_search)

app = FastAPI(title="AutoPromote Media Worker (Python)")

# --- Job Management (Concurrency Control) ---
import threading
import signal

# Track the current heavy process (FFmpeg)
current_process_lock = threading.Lock()
current_process = None
current_job_info = {"status": "idle", "job_id": None, "type": None}

def set_current_process(proc, job_id, type_):
    global current_process, current_job_info
    with current_process_lock:
        current_process = proc
        current_job_info = {"status": "busy", "job_id": job_id, "type": type_}

def clear_current_process():
    global current_process, current_job_info
    with current_process_lock:
        current_process = None
        current_job_info = {"status": "idle", "job_id": None, "type": None}

async def run_subprocess_async(cmd, check=True, stdout=None, stderr=None, text=False, job_context=None):
    """
    Async wrapper for subprocess runs to allow cancellation.
    Updates global 'current_process'.
    """
    global current_process
    
    # Ensure all args are strings
    cmd = [str(arg) for arg in cmd]
    logger.info(f"Running async command: {' '.join(cmd)}")
    
    # Map subprocess.PIPE to asyncio.subprocess.PIPE
    async_stdout = asyncio.subprocess.PIPE if stdout == subprocess.PIPE else stdout
    async_stderr = asyncio.subprocess.PIPE if stderr == subprocess.PIPE else stderr
    
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=async_stdout,
        stderr=async_stderr
    )
    
    # Store process instance so /reset can find it
    # We use a dummy job_id for internal spawning if not provided
    set_current_process(process, job_context or "internal_subprocess", cmd[0])
    
    try:
        stdout_data, stderr_data = await process.communicate()
        
        if text:
            if stdout_data: stdout_data = stdout_data.decode()
            if stderr_data: stderr_data = stderr_data.decode()
        
        if check and process.returncode != 0:
            error_msg = f"Command '{' '.join(cmd)}' failed with return code {process.returncode}"
            if stderr_data and text:
                error_msg += f"\nStderr: {stderr_data}"
            logger.error(error_msg)
            raise subprocess.CalledProcessError(process.returncode, cmd, output=stdout_data, stderr=stderr_data)
            
        return subprocess.CompletedProcess(cmd, process.returncode, stdout=stdout_data, stderr=stderr_data)
        
    except asyncio.CancelledError:
        logger.warning(f"Process {process.pid} cancelled.")
        try:
            process.terminate()
            await process.wait() 
        except:
            pass
        raise
    finally:
        # Crucial: Only clear if WE set it.
        # But for now, we just clear current_process object, not necessarily the job status if controlled externally?
        # The existing clear_current_process clears EVERYTHING.
        # Given the architecture, we rely on ONE active subprocess at a time.
        clear_current_process()

@app.get("/status")
def get_status():
    """Check if worker is busy"""
    return current_job_info

@app.post("/reset")
def reset_worker():
    """Force kill current job (Emergency Stop)"""
    global current_process, current_job_info
    killed = False
    with current_process_lock:
        if current_process:
            try:
                # Terminate FFmpeg immediately
                current_process.terminate()
                killed = True
                logger.warning("Force killed process by request /reset")
            except Exception as e:
                logger.error(f"Failed to kill process: {e}")
        
        current_process = None
        current_job_info = {"status": "idle", "job_id": None, "type": None}
    
    return {"status": "reset", "executed_kill": killed}

# Health Check
@app.get("/")
def read_root():
    return {"status": "online", "worker_state": current_job_info, "service": "python_media_worker", "phase": 2, "whisper_ready": whisper is not None}


# --- Phase 1: Smart Cropping (OpenCV + FFmpeg) ---

class CropRequest(BaseModel):
    video_url: str
    target_aspect_ratio: str = "9:16"
    crop_style: str = "blur"

class SilenceRemovalRequest(BaseModel):
    video_url: str
    silence_threshold_db: float = -35.0
    min_silence_duration: float = 0.75

class SilencePreviewRequest(BaseModel):
    video_url: str
    silence_threshold_db: float = -35.0
    min_silence_duration: float = 0.75

class MusicPreviewRequest(BaseModel):
    music_file: str
    is_search: bool = False
    safe_search: bool = True
    preview_duration: float = 20.0

class WatermarkPreviewRequest(BaseModel):
    video_url: str
    watermark_mode: str = "adaptive"
    watermark_regions: Optional[List[dict]] = None
    preview_time: float = 0.0
    window_seconds: float = 2.4
    max_preview_frames: int = 6

class VideoProcessRequest(BaseModel):
    video_url: str
    smart_crop: bool = False
    quality_enhancement: bool = False
    quality_enhancement_profile: str = "safe_clean"
    crop_style: str = "blur"
    silence_removal: bool = False
    remove_watermark: bool = False
    watermark_mode: str = "adaptive" # adaptive, corners, top_right, bottom_left, all
    watermark_regions: Optional[List[dict]] = None
    montage_segments: Optional[List[dict]] = None
    captions: bool = False  # NEW: For concatenating clips
    captions: bool = False
    add_music: bool = False
    music_file: str = "upbeat.mp3"  # Fixed default
    mute_audio: bool = False
    music_ducking: bool = True
    music_ducking_strength: float = 0.35
    add_hook: bool = False
    hook_text: str = ""
    hook_intro_seconds: float = 3.4
    hook_template: str = "blur_reveal"
    hook_start_time: float = 0.0
    hook_blur_background: bool = True
    hook_dark_overlay: bool = True
    hook_freeze_frame: bool = False
    hook_zoom_scale: float = 1.08
    hook_text_animation: str = "slide_up"
    volume: float = 0.15
    is_search: bool = False
    safe_search: bool = True
    silence_threshold_db: float = -35.0
    min_silence_duration: float = 0.75
    transcription_language: str = "auto"
    transcription_hint: str = ""
    job_id: Optional[str] = None
    async_mode: bool = True  # DEFAULT TO TRUE to avoid 504 timeouts

class ExtractAudioRequest(BaseModel):
    video_url: str
    output_format: str = "mp3"
    job_id: Optional[str] = None
    async_mode: bool = True

def authorize_worker_task(request: Request):
    if not MEDIA_WORKER_TASK_SECRET:
        return

    provided_secret = request.headers.get("x-worker-task-secret", "")
    if provided_secret != MEDIA_WORKER_TASK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid worker task secret")

async def detect_silence_intervals(input_path, threshold="-30dB", duration=0.5):
    """
    Returns list of (start, end) tuples for SILENCE.
    """
    cmd = [
        "ffmpeg", "-i", input_path, 
        "-af", f"silencedetect=noise={threshold}:d={duration}", 
        "-f", "null", "-"
    ]
    
    # We need to capture stderr
    result = await run_subprocess_async(cmd, check=False, stderr=subprocess.PIPE, text=True)
    output = result.stderr
    
    silence_starts = []
    silence_ends = []
    
    for line in output.split('\n'):
        if "silence_start" in line:
            try:
                silence_starts.append(float(re.search(r"silence_start:\s*([0-9\.]+)", line).group(1)))
            except: pass
        elif "silence_end" in line:
             try:
                silence_ends.append(float(re.search(r"silence_end:\s*([0-9\.]+)", line).group(1)))
             except: pass
             
    # Pair them
    intervals = []
    if len(silence_starts) > len(silence_ends):
        # Silence at end of video might typically not have an end timestamp if using -f null?
        # Actually usually it does. But let's trim.
        silence_starts = silence_starts[:len(silence_ends)]
        
    for s, e in zip(silence_starts, silence_ends):
        intervals.append((s, e))
        
    return intervals

@app.post("/extract-audio")
async def extract_audio(request: ExtractAudioRequest, background_tasks: BackgroundTasks):
    if request.async_mode:
        job_id = request.job_id or str(uuid.uuid4())
        logger.info(f"Queuing audio extraction job {job_id}")
        background_tasks.add_task(extract_audio_impl, request, job_id)
        return {"status": "processing", "job_id": job_id, "mode": "async"}

    return await extract_audio_impl(request)

@app.post("/extract-audio-task")
async def extract_audio_task(request: Request, payload: ExtractAudioRequest):
    authorize_worker_task(request)
    return await extract_audio_impl(payload, payload.job_id)

async def extract_audio_impl(request: ExtractAudioRequest, provided_job_id: str = None):
    job_id = provided_job_id or request.job_id or str(uuid.uuid4())
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR):
        os.makedirs(SHARED_TMP_DIR)

    output_format = "wav" if str(request.output_format or "").lower() == "wav" else "mp3"
    input_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_audio_source.mp4")
    output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_audio_extract.{output_format}")

    try:
        update_firestore_job(job_id, {
            "status": "processing",
            "progress": 10,
            "type": "audio_extraction",
            "stage": "downloading_source",
        })

        if str(request.video_url).startswith("http"):
            await run_subprocess_async(
                [
                    "ffmpeg",
                    "-user_agent",
                    "Mozilla/5.0",
                    "-i",
                    request.video_url,
                    "-c",
                    "copy",
                    "-y",
                    input_path,
                ],
                check=True,
                job_context=job_id,
            )
        else:
            shutil.copy(request.video_url, input_path)

        if not has_audio_stream(input_path):
            raise HTTPException(status_code=400, detail="The uploaded video does not contain an audio track")

        update_firestore_job(job_id, {
            "progress": 55,
            "detail": "Extracting audio",
            "stage": "extracting_audio",
        })

        ffmpeg_cmd = [
            "ffmpeg",
            "-i",
            input_path,
            "-vn",
            "-ac",
            "2",
            "-ar",
            "44100",
            "-y",
        ]

        if output_format == "wav":
            ffmpeg_cmd.extend(["-c:a", "pcm_s16le", output_path])
        else:
            ffmpeg_cmd.extend(["-c:a", "libmp3lame", "-b:a", "192k", output_path])

        await run_subprocess_async(ffmpeg_cmd, check=True, job_context=job_id)

        extracted_duration = get_media_duration(output_path)
        update_firestore_job(job_id, {
            "progress": 90,
            "detail": "Uploading extracted audio",
            "stage": "uploading_audio",
        })
        public_url = upload_file_to_firebase(output_path, f"editor_audio/{job_id}.{output_format}")
        if not public_url:
            raise HTTPException(status_code=500, detail="Failed to upload extracted audio")

        result_data = {
            "status": "completed",
            "job_id": job_id,
            "audio_url": public_url,
            "stage": "completed",
            "progress": 100,
            "result": {
                "audioUrl": public_url,
                "audioDuration": extracted_duration,
                "format": output_format,
                "sourceVideoUrl": request.video_url,
                "sourceAsset": {
                    "kind": "audio_donor_video",
                    "videoUrl": request.video_url,
                },
            },
        }

        update_firestore_job(job_id, result_data)

        return result_data
    except HTTPException as e:
        logger.error(f"Audio extraction failed for job {job_id}: {e.detail}")
        update_firestore_job(job_id, {"status": "failed", "error": str(e.detail), "progress": 0, "stage": "failed"})
        raise
    except Exception as e:
        logger.error(f"Audio extraction failed for job {job_id}: {e}")
        update_firestore_job(job_id, {"status": "failed", "error": str(e), "progress": 0, "stage": "failed"})
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(input_path):
            os.remove(input_path)
        if os.path.exists(output_path):
            os.remove(output_path)

@app.post("/process-video")
async def process_video_endpoint(request: VideoProcessRequest, background_tasks: BackgroundTasks):
    """
    Endpoint for video processing (Sync or Async).
    """
    if request.async_mode:
        job_id = request.job_id or str(uuid.uuid4())
        logger.info(f"Queuing ASYNC job {job_id}")
        
        # Mark initial status
        update_firestore_job(job_id, {"status": "processing", "progress": 0, "mode": "async-python"})
        
        # Add to background tasks
        background_tasks.add_task(run_pipeline_impl, request, provided_job_id=job_id)
        
        return {"status": "processing", "job_id": job_id, "mode": "async"}
    else:
        # Sync mode (blocking)
        return await run_pipeline_impl(request)

@app.post("/preview-watermark-regions")
async def preview_watermark_regions(request: WatermarkPreviewRequest):
    job_id = str(uuid.uuid4())
    shared_tmp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(shared_tmp_dir):
        os.makedirs(shared_tmp_dir)

    local_input_path = os.path.join(shared_tmp_dir, f"{job_id}_watermark_input.mp4")
    preview_image_path = os.path.join(shared_tmp_dir, f"{job_id}_watermark_preview.jpg")

    try:
        await materialize_video_input(request.video_url, local_input_path)
        width_val, height_val = get_video_dimensions(local_input_path)
        video_duration = get_media_duration(local_input_path)
        analyzed_windows = analyze_dynamic_watermark_schedule(
            local_input_path,
            width_val,
            height_val,
            video_duration,
            request.watermark_mode,
            window_seconds=request.window_seconds,
        )
        preview_sheet = create_watermark_preview_sheet(
            local_input_path,
            width_val,
            height_val,
            analyzed_windows,
            max_preview_frames=request.max_preview_frames,
        )

        preview_url = None
        if preview_sheet is not None:
            cv2.imwrite(preview_image_path, preview_sheet)
            preview_url = upload_file_to_firebase(preview_image_path, destination_path=f"processed/{os.path.basename(preview_image_path)}")

        return {
            "status": "completed",
            "job_id": job_id,
            "duration": video_duration,
            "dimensions": {"width": width_val, "height": height_val},
            "windows": analyzed_windows,
            "filters": build_delogo_filters(
                width_val,
                height_val,
                request.watermark_mode,
                duration=video_duration,
                video_path=local_input_path,
            ),
            "preview_image_path": preview_image_path if os.path.exists(preview_image_path) else None,
            "preview_image_url": preview_url,
        }
    finally:
        if os.path.exists(local_input_path):
            try:
                os.remove(local_input_path)
            except Exception:
                pass

@app.post("/preview-watermark-cleanup")
async def preview_watermark_cleanup(request: WatermarkPreviewRequest):
    job_id = str(uuid.uuid4())
    shared_tmp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(shared_tmp_dir):
        os.makedirs(shared_tmp_dir)

    local_input_path = os.path.join(shared_tmp_dir, f"{job_id}_watermark_cleanup_input.mp4")
    original_frame_path = os.path.join(shared_tmp_dir, f"{job_id}_watermark_original.png")
    cleaned_frame_path = os.path.join(shared_tmp_dir, f"{job_id}_watermark_cleaned.png")

    try:
        await materialize_video_input(request.video_url, local_input_path)
        width_val, height_val = get_video_dimensions(local_input_path)
        video_duration = get_media_duration(local_input_path)
        safe_preview_time = clamp_float(
            request.preview_time,
            0.0,
            max(0.0, video_duration - 0.05) if video_duration > 0 else 0.0,
        )

        filters = build_delogo_filters(
            width_val,
            height_val,
            request.watermark_mode,
            duration=video_duration,
            video_path=local_input_path,
            manual_regions=request.watermark_regions,
            target_time=safe_preview_time,
        )
        if not filters:
            raise HTTPException(status_code=400, detail="No watermark cleanup filters could be generated")

        capture = cv2.VideoCapture(local_input_path)
        try:
            original_frame = read_video_frame_at_time(capture, safe_preview_time)
        finally:
            capture.release()

        if original_frame is None:
            raise HTTPException(status_code=500, detail="Failed to capture preview frame")

        cv2.imwrite(original_frame_path, original_frame)

        await run_subprocess_async(
            [
                "ffmpeg",
                "-i",
                original_frame_path,
                "-vf",
                ",".join(filters),
                "-update",
                "1",
                "-frames:v",
                "1",
                "-y",
                cleaned_frame_path,
            ],
            check=True,
        )

        original_frame_url = upload_file_to_firebase(
            original_frame_path,
            destination_path=f"processed/{os.path.basename(original_frame_path)}",
        )
        cleaned_frame_url = upload_file_to_firebase(
            cleaned_frame_path,
            destination_path=f"processed/{os.path.basename(cleaned_frame_path)}",
        )
        if not original_frame_url and os.path.exists(original_frame_path):
            original_frame_url = encode_file_as_data_url(original_frame_path)
        if not cleaned_frame_url and os.path.exists(cleaned_frame_path):
            cleaned_frame_url = encode_file_as_data_url(cleaned_frame_path)

        return {
            "status": "completed",
            "job_id": job_id,
            "preview_time": round(safe_preview_time, 3),
            "duration": video_duration,
            "dimensions": {"width": width_val, "height": height_val},
            "filters": filters,
            "original_image_url": original_frame_url,
            "cleaned_image_url": cleaned_frame_url,
        }
    finally:
        for path in (local_input_path, original_frame_path, cleaned_frame_path):
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

@app.post("/preview-silence")
async def preview_silence(request: SilencePreviewRequest):
    job_id = str(uuid.uuid4())
    shared_tmp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(shared_tmp_dir):
        os.makedirs(shared_tmp_dir)

    local_input_path = os.path.join(shared_tmp_dir, f"{job_id}_silence_preview_input.mp4")

    try:
        await materialize_video_input(request.video_url, local_input_path)
        duration = get_media_duration(local_input_path)
        silence_threshold = clamp_float(request.silence_threshold_db, -60.0, -10.0)
        min_pause_length = clamp_float(request.min_silence_duration, 0.2, 3.0)
        silences = await detect_silence_intervals(
            local_input_path,
            threshold=f"{silence_threshold:.1f}dB",
            duration=min_pause_length,
        )

        keep_segments = []
        cursor = 0.0
        for silence_start, silence_end in silences:
            safe_start = max(0.0, float(silence_start))
            safe_end = max(safe_start, float(silence_end))
            if safe_start > cursor:
                keep_segments.append({
                    "start": round(cursor, 3),
                    "end": round(safe_start, 3),
                    "duration": round(max(0.0, safe_start - cursor), 3),
                })
            cursor = max(cursor, safe_end)

        if duration > cursor:
            keep_segments.append({
                "start": round(cursor, 3),
                "end": round(duration, 3),
                "duration": round(max(0.0, duration - cursor), 3),
            })

        return {
            "status": "completed",
            "job_id": job_id,
            "duration": duration,
            "silence_segments": [
                {
                    "start": round(float(start), 3),
                    "end": round(float(end), 3),
                    "duration": round(max(0.0, float(end) - float(start)), 3),
                }
                for start, end in silences
            ],
            "keep_segments": keep_segments,
        }
    finally:
        if os.path.exists(local_input_path):
            try:
                os.remove(local_input_path)
            except Exception:
                pass

@app.post("/preview-music")
async def preview_music(request: MusicPreviewRequest):
    job_id = str(uuid.uuid4())
    shared_tmp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(shared_tmp_dir):
        os.makedirs(shared_tmp_dir)

    resolved_output_path = os.path.join(shared_tmp_dir, f"{job_id}_music_source.mp3")
    preview_output_path = os.path.join(shared_tmp_dir, f"{job_id}_music_preview.mp3")

    try:
        resolved_path = resolve_music_input(
            request.music_file,
            resolved_output_path,
            is_search=bool(request.is_search),
            safe_search=bool(request.safe_search),
        )
        if not resolved_path or not os.path.exists(resolved_path):
            raise HTTPException(status_code=404, detail="Music preview source could not be resolved")

        preview_duration = clamp_float(request.preview_duration, 5.0, 30.0)
        await run_subprocess_async(
            [
                "ffmpeg",
                "-y",
                "-ss",
                "0",
                "-t",
                f"{preview_duration:.2f}",
                "-i",
                resolved_path,
                "-vn",
                "-acodec",
                "libmp3lame",
                "-b:a",
                "192k",
                preview_output_path,
            ],
            check=True,
            stderr=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            job_context=job_id,
        )

        preview_url = upload_file_to_firebase(preview_output_path, f"preview_audio/{job_id}.mp3")
        if not preview_url:
            preview_url = encode_file_as_data_url(preview_output_path)
        return {
            "status": "completed",
            "job_id": job_id,
            "preview_url": preview_url,
            "resolved_source": os.path.basename(resolved_path),
            "preview_duration": preview_duration,
        }
    finally:
        if os.path.exists(preview_output_path):
            try:
                os.remove(preview_output_path)
            except Exception:
                pass
        if os.path.exists(resolved_output_path):
            try:
                os.remove(resolved_output_path)
            except Exception:
                pass

async def run_pipeline_impl(request: VideoProcessRequest, provided_job_id: str = None):
    """
    Internal implementation of the video pipeline.
    """
    request_job_id = provided_job_id or request.job_id
    logger.info(f"Running pipeline implementation for Job {request_job_id} (Async: {request.async_mode})")
    
    # If async mode, update status to processing immediately in Firestore?
    # No, caller handles that. We handle completion/failure.

    if not request_job_id:
        job_id = str(uuid.uuid4())
    else:
        job_id = request_job_id

    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR):
        os.makedirs(SHARED_TMP_DIR)


    # Initial Download
    current_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_step0.mp4")
    
    # Auto-Kill existing job if busy (Last-Write-Wins for single user UX)
    # Note: Global variable usage here is tricky with async tasks. We depend on correct scoping.
    if current_job_info["status"] == "busy" and current_job_info.get("job_id") != job_id:
        logger.warning(f"Worker busy with {current_job_info['job_id']}. New request {job_id} effectively cancels it.")
        reset_worker()
        # clear_current_process() is called by reset_worker

    try:
        # Step 0: Download
        logger.info(f"Step 0: Downloading video from {request.video_url}")
        await materialize_video_input(request.video_url, current_path)

        # Notify progress: Download Complete
        if request.async_mode:
             update_firestore_job(job_id, {"status": "processing", "progress": 15, "detail": "Downloaded Source"})
        
        # OPTIMIZED PIPELINE: Combine multiple FFmpeg filters into fewer passes
        # Re-encoding repeatedly (Crop -> Silence -> Hook -> Music) is too slow for 10min videos.
        # We aim for 2 passes max:
        # Pass 1: Structural Changes (Montage Concatenation OR Silence Removal)
        # Pass 2: The "Grand Filter" (Crop + Hook + Music Mix + Captions Burn)
        
        step_count = 0
        
        # --- PHASE 1: Structural Changes (Montage OR Silence Removal) ---
        # Priority: If montage_segments are provided, user wants specific clips combined.
        # This overrides silence removal (which is auto-montage).
        
        if request.montage_segments and len(request.montage_segments) > 0:
           step_count += 1
           # Notify progress
           if request.async_mode: update_firestore_job(job_id, {"progress": 20, "detail": "Processing Montage"})

           logger.info(f"Step {step_count}: Creating Montage from {len(request.montage_segments)} segments")
           next_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_step{step_count}.mp4")
           
           # Build Filter Complex for Montage
           # Segments: [{start: 0, end: 10}, {start: 30, end: 40}]
           inputs = ""
           filter_parts = []
           valid_segment_count = 0
           
           for idx, seg in enumerate(request.montage_segments):
               start = float(seg.get("start", 0))
               end = float(seg.get("end", 0))
               # Valid check
               if end <= start: continue
               
               # Trimming logic:
               # 1. Video trim + setpts
               # 2. Audio trim + asetpts
               # NOTE: trim=start:end uses input PTS by default (unless start_time=0 or similar).
               # For robust montage from single file:
               inputs += f"[0:v]trim={start}:{end},setpts=PTS-STARTPTS[v{idx}];"
               inputs += f"[0:a]atrim={start}:{end},asetpts=PTS-STARTPTS[a{idx}];"
               valid_segment_count += 1
           
           if valid_segment_count > 0:
               # Construct the concat part strictly: [v0][a0][v1][a1]...concat=n=N:v=1:a=1[outv][outa]
               concat_inputs = ""
               for idx in range(valid_segment_count):
                   concat_inputs += f"[v{idx}][a{idx}]"
                   
               filter_complex = f"{inputs}{concat_inputs}concat=n={valid_segment_count}:v=1:a=1[outv][outa]"
               
               await run_subprocess_async([
                   "ffmpeg", "-i", current_path, 
                   "-filter_complex", filter_complex,
                   "-map", "[outv]", "-map", "[outa]",
                   "-c:v", "libx264", "-preset", "ultrafast", # Use ultrafast for intermediate steps
                   "-y", next_path
               ], check=True)
               
               if os.path.exists(current_path): os.remove(current_path)
               current_path = next_path
           
        elif request.silence_removal:
           step_count += 1
           if request.async_mode: update_firestore_job(job_id, {"progress": 25, "detail": "Removing Silence"})
           logger.info(f"Step {step_count}: Removing Silence (Structural Edit)")

           next_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_step{step_count}.mp4")
           silence_threshold = clamp_float(request.silence_threshold_db, -60.0, -10.0)
           min_pause_length = clamp_float(request.min_silence_duration, 0.2, 3.0)
           
           silences = await detect_silence_intervals(
               current_path,
               threshold=f"{silence_threshold:.1f}dB",
               duration=min_pause_length,
           )
           
           if silences:
               # ... [Keep existing silence logic] ...
               # Invert to Keep Segments
               total_duration = get_media_duration(current_path)
               
               keep_segments = []
               last_pos = 0.0
               speech_padding = 0.08
               for s_start, s_end in silences:
                   padded_start = max(0.0, s_start - speech_padding)
                   padded_end = min(total_duration, s_end + speech_padding)
                   if padded_start > last_pos:
                       keep_segments.append((last_pos, padded_start))
                   last_pos = max(last_pos, padded_end)
               if last_pos < total_duration:
                   keep_segments.append((last_pos, total_duration))
                   
                   
               # Build Filter Complex for Silence
               inputs_str = ""
               concat_part = ""
               segment_count = 0
               
               for idx, segment in enumerate(keep_segments):
                   # tuple (start, end)
                   s_start, s_end = segment
                   
                   # trimming needs to happen first
                   inputs_str += f"[0:v]trim={s_start}:{s_end},setpts=PTS-STARTPTS[v{idx}];"
                   inputs_str += f"[0:a]atrim={s_start}:{s_end},asetpts=PTS-STARTPTS[a{idx}];"
                   
                   # maintain strict [v0][a0][v1][a1] order for concat
                   concat_part += f"[v{idx}][a{idx}]"
                   segment_count += 1
               
               if segment_count > 0:
                   filter_complex = f"{inputs_str}{concat_part}concat=n={segment_count}:v=1:a=1[outv][outa]"
                   
                   # Execute Structural Edit
                   await run_subprocess_async([
                       "ffmpeg", "-i", current_path, 
                       "-filter_complex", filter_complex,
                       "-map", "[outv]", "-map", "[outa]",
                       "-c:v", "libx264", "-preset", "ultrafast", # Use ultrafast for intermediate steps
                       "-y", next_path
                   ], check=True)
                   
                   if os.path.exists(current_path): os.remove(current_path)
                   current_path = next_path
               else:
                   logger.warning("Silence removal resulted in 0 segments. Maintaining original.")
           else:
               logger.info("No silence found to remove.")

        # --- PHASE 2: The Grand Filter (Visual/Audio Effects) ---
        # We collect all filters independent of timeline structure
        
        step_count += 1
        logger.info(f"Step {step_count}: Applying Effects (Crop, Hook, Music, Captions) in ONE PASS")
        
        if request.async_mode: update_firestore_job(job_id, {"progress": 40, "detail": "Applying AI Effects"})

        final_pass_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_final_pass.mp4")
        
        main_filters = []     # List of filter strings
        input_args = ["-i", current_path] 
        input_map = 0            # Index of main video
        audio_map_idx = 0        # Index of audio stream
        
        next_input_idx = 1
        
        # 1. Prepare CAPTION file (if needed) - Must be done BEFORE ffmpeg call
        ass_path = None # initialize
        if request.captions:
             logger.info("Generating Captions for single-pass burn...")
             
             # PROGRESS UPDATE BEFORE WHISPER STARTS
             if request.async_mode: update_firestore_job(job_id, {"progress": 40, "detail": "Generating Smart Captions (AI)"})
             
             result = transcribe_with_hints(
                 current_path,
                 word_timestamps=True,
                 language=request.transcription_language,
                 prompt_hint=request.transcription_hint,
             )
             
             if request.async_mode: update_firestore_job(job_id, {"progress": 60, "detail": "Transcription Complete"})

             ass_path = os.path.join(SHARED_TMP_DIR, f"{job_id}.ass")
             # ... [Reuse ASS generation code] ...
             # For brevity, let's inject a helper function or simplified ASS generator here
             # "Rainbow" Palette
             header = """[Script Info]
Title: Rainbow Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1080
PlayResY: 1920
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,80,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,3,0,2,10,10,250,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
             palette = ["&HB469FF&", "&HFFFF00&", "&H32CD32&", "&H00FFFF&", "&H00A5FF&"]
             with open(ass_path, "w", encoding="utf-8") as f:
                 f.write(header)
                 for segment in result["segments"]:
                      words = segment.get("words", [])
                      if not words:
                          start = format_timestamp(segment["start"]).replace(",", ".")[:-1]
                          end = format_timestamp(segment["end"]).replace(",", ".")[:-1]
                          f.write(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{segment['text'].strip()}\n")
                          continue
                      for i, w in enumerate(words):
                           start = format_timestamp(w['start']).replace(",", ".")[:-1]
                           end = format_timestamp(w['end']).replace(",", ".")[:-1]
                           color = palette[i % 5]
                           # Single word event
                           f.write(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{{\\c{color}}}{w['word'].strip()}{{\\c&HFFFFFF&}}\n")
             
             safe_ass = ass_path.replace("\\", "/").replace(":", "\\:")
             pass

        # 2. Build Filter Chain
        current_v = f"[{input_map}:v]"
        current_a = f"[{audio_map_idx}:a]"

        # Hook intro should hold the content back until the intro finishes.
        if request.add_hook and request.hook_text and (
            request.hook_freeze_frame or str(request.hook_template or "").strip().lower() == "freeze_text"
        ):
             intro_seconds = max(0.8, min(float(request.hook_intro_seconds or 3.0), 5.0))
             intro_ms = int(intro_seconds * 1000)
             main_filters.append(
                 f"{current_v}tpad=start_duration={intro_seconds:.2f}:start_mode=clone[v_intro_padded]"
             )
             current_v = "[v_intro_padded]"
             main_filters.append(f"{current_a}adelay={intro_ms}:all=1[a_intro_padded]")
             current_a = "[a_intro_padded]"

        # Get dimensions for delogo calculation (since delogo doesn't always support expressions)
        width_val, height_val = 1080, 1920
        video_duration = get_media_duration(current_path)
        try:
             dim_cmd = ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", current_path]
             dim_res = await run_subprocess_async(dim_cmd, check=True, stdout=subprocess.PIPE, text=True)
             parts = dim_res.stdout.strip().split('x')
             if len(parts) >= 2:
                 width_val, height_val = int(parts[0]), int(parts[1])
        except Exception as e:
             logger.warning(f"Dimension probe failed: {e}")

        # A0. Remove Watermark (TikTok/Reels) - Prioritize this before scaling
        if request.remove_watermark:
             filters = build_delogo_filters(
                 width_val,
                 height_val,
                 request.watermark_mode,
                 duration=video_duration,
                 video_path=current_path,
                 manual_regions=request.watermark_regions,
             )
             if filters:
                 filter_str = ",".join(filters)
                 main_filters.append(f"{current_v}{filter_str}[v_clean]")
                 current_v = "[v_clean]"
        
        # A. Smart Crop / Scale
        if request.smart_crop:
             if request.crop_style == "zoom":
                 main_filters.append(f"{current_v}scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[v_cropped]")
             else:
                 # Blur box with SPLIT
                 # We must split current_v because it's used twice (bg and fg)
                 main_filters.append(f"{current_v}split[v_bg_in][v_fg_in]")
                 main_filters.append(f"[v_bg_in]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,scale=108:192,boxblur=2:1,scale=1080:1920[bg]")
                 main_filters.append(f"[v_fg_in]scale=1080:1920:force_original_aspect_ratio=decrease[fg]")
                 main_filters.append(f"[bg][fg]overlay=(W-w)/2:(H-h)/2[v_cropped]")
             current_v = "[v_cropped]"

        # A.1 Conservative quality cleanup for export footage only
        if request.quality_enhancement:
             enhancement_chain = build_quality_enhancement_filter_chain(
                 request.quality_enhancement_profile
             )
             if enhancement_chain:
                 main_filters.append(f"{current_v}{enhancement_chain}[v_enhanced]")
                 current_v = "[v_enhanced]"

        # B. Viral Hook (Drawtext)
        if request.add_hook and request.hook_text:
             hook_chain = build_hook_filter_chain(
                 request.hook_text,
                 request.hook_intro_seconds,
                 width_val=width_val,
                 height_val=height_val,
                 template=request.hook_template,
                 hook_start_time=request.hook_start_time,
                 blur_background=request.hook_blur_background,
                 dark_overlay=request.hook_dark_overlay,
                 freeze_frame=request.hook_freeze_frame,
                 zoom_scale=request.hook_zoom_scale,
                 text_animation=request.hook_text_animation,
             )
             if hook_chain:
                 main_filters.append(f"{current_v}{hook_chain}[v_hook]")
                 current_v = "[v_hook]"

        # C. Captions (subtitles filter)
        if request.captions and os.path.exists(ass_path):
             # ass filter
             main_filters.append(f"{current_v}ass='{safe_ass}'[v_captions]")
             current_v = "[v_captions]"

        # D. Music Mixing & Audio Control
        # Logic: 
        # 1. Try to add music if requested.
        # 2. If music added:
        #    - If mute_audio also requested: REPLACING audio (music only)
        #    - Else: MIXING audio (original + music)
        # 3. If music NOT added (or failed):
        #    - If mute_audio requested: MUTE original (silence)
        #    - Else: Keep original audio
        
        music_added_successfully = False

        if request.add_music:
             if request.async_mode: update_firestore_job(job_id, {"progress": 70, "detail": "Downloading Music"})
             # Download song logic...
             song_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_song.mp3")
             
             final_song_path = None
             try:
                 loop = asyncio.get_running_loop()
                 final_song_path = await loop.run_in_executor(
                     None,
                     lambda: resolve_music_input(
                         request.music_file,
                         song_path,
                         is_search=request.is_search,
                         safe_search=request.safe_search,
                     ),
                 )
             except Exception as e:
                 logger.warning(f"Music download failed: {e}")

             if final_song_path and os.path.exists(final_song_path):
                 input_args.extend(["-stream_loop", "-1", "-i", final_song_path])
                 music_idx = next_input_idx
                 next_input_idx += 1
                 
                 if request.mute_audio:
                      # Scenario: REPLACE audio (Muted orig + Music)
                      # Map ONLY the music stream as the output audio [a_out]
                      # We use 1.0 volume unless user specified otherwise? 
                      # Assuming "mute original" means "I want the music at full volume"
                      main_filters.append(f"[{music_idx}:a]volume=1.0[a_out]")
                 else:
                      # Scenario: MIX audio (Original + Music)
                      music_gain = clamp_float(request.volume, 0.03, 1.2)
                      ducking_strength = clamp_float(request.music_ducking_strength, 0.15, 0.95)
                      if request.music_ducking:
                          threshold_value = max(0.003, 0.055 - (ducking_strength * 0.04))
                          ratio_value = round(6.0 + (ducking_strength * 10.0), 2)
                          main_filters.append(f"{current_a}asplit=2[a_main][a_sidechain]")
                          main_filters.append(f"[{music_idx}:a]volume={music_gain},aresample=async=1[bgm_raw]")
                          main_filters.append(
                              f"[bgm_raw][a_sidechain]sidechaincompress=threshold={threshold_value:.4f}:ratio={ratio_value}:attack=15:release=280:makeup=1[bgm_ducked]"
                          )
                          main_filters.append(
                              f"[a_main][bgm_ducked]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[a_out]"
                          )
                      else:
                          main_filters.append(f"[{music_idx}:a]volume={music_gain}[bgm]")
                          main_filters.append(
                              f"{current_a}[bgm]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[a_out]"
                          )
                 
                 current_a = "[a_out]"
                 music_added_successfully = True
             else:
                 logger.warning(f"Music file not found/downloaded: {request.music_file}")
                 # Ensure we don't crash if music failed, just proceed without it.
                 music_added_successfully = False

        # Fallback: If music was NOT added (or not requested), check mute_audio
        if not music_added_successfully and request.mute_audio:
             # Scenario: MUTE ONLY (No Music)
             # Just set volume=0 on original
             main_filters.append(f"{current_a}volume=0[a_out]")
             current_a = "[a_out]"


        # E. EXECUTE GRAND FILTER
        # Determine final map
        if not main_filters:
             # No filters? Just Copy.
             shutil.copy(current_path, final_pass_path)
             if request.async_mode: update_firestore_job(job_id, {"progress": 90, "detail": "Finalizing (Copy)"})
        else:
             if request.async_mode: update_firestore_job(job_id, {"progress": 80, "detail": "Rendering Final Video (High CPU)"})
             filter_str = ";".join(main_filters)
             # Map the last labels
             cmd = ["ffmpeg"] + input_args
             
             cmd.extend(["-filter_complex", filter_str])
             
             # Map the latest video and audio labels so delayed hook audio and
             # any later audio transforms are actually connected.
             cmd.extend(["-map", current_v, "-map", current_a])

             cmd.extend(["-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac", "-y", final_pass_path])
             
             await run_subprocess_async(cmd, check=True)
        
        current_path = final_pass_path

        # Final Result
        final_output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_final.mp4")
        if os.path.exists(current_path):
            if request.async_mode: update_firestore_job(job_id, {"progress": 95, "detail": "Uploading Result"})
            os.rename(current_path, final_output_path)
            # Clean up temp ass file
            if 'ass_path' in locals() and ass_path and os.path.exists(ass_path):
                 try: os.remove(ass_path)
                 except: pass

            final_result = {
                "status": "completed", 
                "job_id": job_id, 
                "output_path": final_output_path,
                "output_url": upload_file_to_firebase(final_output_path)
            }
            
            # --- ASYNC FLUSH ---
            if request.async_mode:
                 update_firestore_job(job_id, final_result)

            return final_result
        else:
            raise HTTPException(status_code=500, detail="Pipeline failed to produce output")

    except Exception as e:
        logger.error(f"Pipeline Error: {e}")
        error_detail = str(e)
        if request.async_mode:
             update_firestore_job(job_id, {"status": "failed", "error": error_detail})
             
        # Re-raise unless async mode (since background task exception is swallowed otherwise)
        if not request.async_mode:
             raise HTTPException(status_code=500, detail=error_detail)
        else:
             logger.error(f"Async Job {job_id} failed silently (logged to Firestore).")
             return  # Should return specifically None or dict for cleanup, but task swallows it anyway

@app.post("/smart-crop")
async def smart_crop_video(request: CropRequest):
    """
    Detects faces/motion and dynamically crops landscape video to vertical.
    Phase 1: Robust Center Crop (9:16)
    """
    logger.info(f"Received smart-crop request. Style: '{request.crop_style}' for {request.video_url}")
    
    # Validation / Normalization
    if request.crop_style and "zoom" in request.crop_style.lower():
        request.crop_style = "zoom"
    else:
        # Default to blur if not explicitly zoom
        # This handles cases where frontend might send "Blur" or undefined
        request.crop_style = "blur"

    job_id = str(uuid.uuid4())
    
    # Use proper temp directory
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR):
        os.makedirs(SHARED_TMP_DIR)

    input_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_input.mp4")
    output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_output.mp4")

    try:
        # 1. Download Video
        try:
            logger.info(f"Downloading video from {request.video_url}")
            await run_subprocess_async([
                "ffmpeg", "-i", request.video_url, 
                "-c", "copy", "-y", input_path
            ], check=True, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
        except subprocess.CalledProcessError as e:
            logger.error(f"Download/Convert failed: {e.stderr.decode()}")
            raise HTTPException(status_code=400, detail=f"Failed to process input video: {e.stderr.decode()[:200]}")

        if request.crop_style == "zoom":
            # OPTION 2: Classic Center Crop (Zoom to Fill)
            # Scale to fill 1080x1920 and crop center.
            # Ensures output is strictly 1080x1920.
            logger.info(f"Applying ZOOM crop style (1080x1920) for {job_id}")
            
            # Simple approach: Scale height to 1920, then crop width to 1080
            # If input is portrait, scale width to 1080, crop height to 1920
            # Use 'force_original_aspect_ratio=increase' to cover the box, then crop.
            vf = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
            
            try:
                await run_subprocess_async([
                    "ffmpeg", "-i", input_path,
                    "-vf", vf,
                    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                    "-c:a", "copy",
                    "-y", output_path
                ], check=True, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
            except subprocess.CalledProcessError as e:
                 logger.error(f"FFmpeg ZOOM failed: {e.stderr.decode()}")
                 raise HTTPException(status_code=500, detail=f"Zoom crop failed: {e.stderr.decode()[:200]}")

        else:
            # OPTION 1 (DEFAULT): Safe Fit (Blur Background)
            # Scale to fit 1080 width, pad height with blurred copy
            logger.info(f"Applying BLUR background fit style (1080x1920) for {job_id}")
            
            # Complex filter:
            # 1. [bg] Scale to (low res) to make blur fast, Blur, Scale back to 1080x1920
            # 2. [fg] Scale to fit inside 1080x1920
            # 3. Overlay fg on bg
            # Optimization: Scale bg down to w/10, h/10 before blurring to save massive CPU. 
            # boxblur on 1920x1080 is expensive. boxblur on 192x108 is free.
            complex_filter = (
                "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,scale=108:192,boxblur=2:1,scale=1080:1920[bg];"
                "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];"
                "[bg][fg]overlay=(W-w)/2:(H-h)/2"
            )
            
            try:
                await run_subprocess_async([
                    "ffmpeg", "-i", input_path,
                    "-filter_complex", complex_filter,
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
                    "-c:a", "copy",
                    "-y", output_path
                ], check=True, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
            except subprocess.CalledProcessError as e:
                 logger.error(f"FFmpeg BLUR failed: {e.stderr.decode()}")
                 raise HTTPException(status_code=500, detail=f"Blur crop failed: {e.stderr.decode()[:200]}")
        
        # 4. Upload Result (Using shared volume strategy for Phase 1)
        if os.path.exists(output_path):
             return {
                 "status": "completed",
                 "job_id": job_id,
                 "output_path": output_path, # Return local path
                 "output_url": upload_file_to_firebase(output_path) or "https://placeholder-storage.com/error_uploading.mp4"
             }
        else:
            raise Exception("Output file not generated")

    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg failed: {e}")
        raise HTTPException(status_code=500, detail="Video processing failed")
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup input only, output is needed by next stage
        if os.path.exists(input_path): os.remove(input_path)

# --- Phase 1: Silence Removal (Simple FFmpeg Filter) ---

@app.post("/remove-silence")
async def remove_silence(request: SilenceRemovalRequest):
    """
    Remove silence using FFmpeg silencedetect + trim/concat.
    This is complex because we must remove segments from BOTH audio and video to keep sync.
    We detect silence timestamps, invert them to get speech segments, and concat those.
    """
    logger.info(f"Received robust silence removal request for {request.video_url}")
    
    job_id = str(uuid.uuid4())
    
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR):
        os.makedirs(SHARED_TMP_DIR)

    input_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_input.mp4")
    output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_output.mp4")
    
    try:
        # 1. Download Video
        subprocess.run(["ffmpeg", "-i", request.video_url, "-c", "copy", "-y", input_path], check=True, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
        
        # 2. Detect Silence
        # silencedetect output goes to stderr. We look for silence_start: X and silence_duration: Y
        silence_threshold = clamp_float(request.silence_threshold_db, -60.0, -10.0)
        min_pause_length = clamp_float(request.min_silence_duration, 0.2, 3.0)
        logger.info("Detecting silence segments...")
        detect_cmd = [
            "ffmpeg", "-i", input_path,
            "-af", f"silencedetect=noise={silence_threshold:.1f}dB:d={min_pause_length}", 
            "-f", "null", "-"
        ]
        result = subprocess.run(detect_cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        # Output contains lines like: 
        # [silencedetect @ 0x...] silence_start: 12.45
        # [silencedetect @ 0x...] silence_end: 14.22 | silence_duration: 1.77
        
        output = result.stderr
        silence_starts = []
        silence_ends = []
        
        for line in output.split('\n'):
            if "silence_start" in line:
                match = re.search(r"silence_start: (\d+(\.\d+)?)", line)
                if match:
                    silence_starts.append(float(match.group(1)))
            elif "silence_end" in line:
                match = re.search(r"silence_end: (\d+(\.\d+)?)", line)
                if match:
                    silence_ends.append(float(match.group(1)))
        
        # Handle case where silence detected at end but no end timestamp (unlikely with this filter but possible)
        if len(silence_starts) > len(silence_ends):
            # Assume silence goes to end of video? Or discard last start?
            # Usually silencedetect outputs end if stream ends.
            # We'll check video duration.
            pass

        # 3. Construct "Keep" Segments (Speech)
        # This is the inverse of silence segments.
        # Start at 0. If silence starts at S1, keep 0 to S1.
        # Next speech starts at E1 (end of first silence). Keep E1 to S2.
        # ...
        # Finally keep En to video_end.
        
        # Get video duration first
        total_duration = get_media_duration(input_path) or 3600.0

        segments = []
        current_pos = 0.0
        
        # Build segments (Speech = Non-Silence)
        # Logic: 
        # Speech 1: 0 to silence_start[0]
        # Speech 2: silence_end[0] to silence_start[1]
        # ...
        
        # Pre-check: Ensure equal starts/ends or handle mismatch
        # If stream starts with silence (not common with silencedetect unless noise), start > 0.
        
        for i in range(len(silence_starts)):
            start_silence = silence_starts[i]
            if start_silence > current_pos + 0.1: # Keep valid speech block
                segments.append((current_pos, start_silence))
            
            if i < len(silence_ends):
                current_pos = silence_ends[i]
            else:
                current_pos = total_duration # Assume silence till end if no end tag

        # Add final segment if speech exists after last silence
        if current_pos < total_duration - 0.1:
            segments.append((current_pos, total_duration))
            
        logger.info(f"Found {len(silence_starts)} silence blocks. Creating {len(segments)} speech segments.")
        
        if not silence_starts:
            logger.info("No silence detected. Returning original.")
            shutil.copy(input_path, output_path)
            # Must return success format
            return {"status": "completed", "job_id": job_id, "output_path": output_path, "output_url": upload_file_to_firebase(output_path)}

        if not segments:
             raise Exception("Entire video detected as silence!")

        # 4. Construct FFmpeg Filter Complex
        filter_complex = ""
        inputs_concat = ""
        
        for idx, (seg_start, seg_end) in enumerate(segments):
            filter_complex += f"[0:v]trim=start={seg_start}:end={seg_end},setpts=PTS-STARTPTS[v{idx}];"
            filter_complex += f"[0:a]atrim=start={seg_start}:end={seg_end},asetpts=PTS-STARTPTS[a{idx}];"
            inputs_concat += f"[v{idx}][a{idx}]"
            
        filter_complex += f"{inputs_concat}concat=n={len(segments)}:v=1:a=1[outv][outa]"
        
        cmd = [
            "ffmpeg", "-i", input_path,
            "-filter_complex", filter_complex,
            "-map", "[outv]", "-map", "[outa]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac",
            "-y", output_path
        ]
        
        logger.info("Running FFmpeg concat command...")
        # Use subprocess.run without check=True initially to catch stderr safely
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode != 0:
            raise subprocess.CalledProcessError(proc.returncode, cmd, output=proc.stdout, stderr=proc.stderr)
            
        return {
             "status": "completed", 
             "job_id": job_id, 
             "output_path": output_path,
             "output_url": upload_file_to_firebase(output_path)
        }
        
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg failed: {e.stderr.decode() if e.stderr else str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {e.stderr.decode()[:200] if e.stderr else 'Unknown error'}")
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(input_path): os.remove(input_path)


@app.post("/mute-audio")
async def mute_audio(request: CropRequest):
    """
    Remove audio track from video completely.
    """
    logger.info(f"Received mute request for {request.video_url}")
    job_id = str(uuid.uuid4())
    
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR):
        os.makedirs(SHARED_TMP_DIR)

    input_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_input.mp4")
    output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_output.mp4")
    
    try:
        # Download
        subprocess.run(["ffmpeg", "-i", request.video_url, "-c", "copy", "-y", input_path], check=True, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
        
        # Mute (Drop Audio Track)
        logger.info("Dropping audio track...")
        subprocess.run([
            "ffmpeg", "-i", input_path,
            "-c:v", "copy", "-an",
            "-y", output_path
        ], check=True, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
        
        return {
            "status": "completed", 
            "job_id": job_id, 
            "output_path": output_path,
            "output_url": "PLACEHOLDER"
        }
    except Exception as e:
        logger.error(f"Error muting: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(input_path): os.remove(input_path)


# --- Phase 2: AI Captions (Whisper) ---

def format_timestamp(seconds):
    # Convert seconds to SRT timestamp format (HH:MM:SS,mmm)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


@app.post("/add-captions")
async def add_captions(request: CropRequest):
    """
    Generate and burn-in captions using OpenAI Whisper.
    1. Extract Audio
    2. Transcribe with Whisper -> SRT/VTT
    3. Burn subtitles into video
    """
    if whisper is None:
         # Fallback mock for Phase 1 without whisper installed
         logger.warning("Whisper check failed. Returning mock.")
         # ... Mock logic ...
         # But to truly implement Phase 2, we need real whisper.
         raise HTTPException(status_code=501, detail="Whisper not installed on server")

    logger.info(f"Received caption request for {request.video_url}")
    
    job_id = str(uuid.uuid4())
    
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR): os.makedirs(SHARED_TMP_DIR)

    input_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_input.mp4")
    output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_captions.mp4")
    subtitle_path = os.path.join(SHARED_TMP_DIR, f"{job_id}.srt")

    try:
        # 1. Download Video
        subprocess.run(["ffmpeg", "-i", request.video_url, "-c", "copy", "-y", input_path], check=True)

        # 2. Transcribe with Whisper
        # Use more robust parameters for music/singing
        # condition_on_previous_text=False prevents "hallucination loops"
        # initial_prompt guides context (Singing, Lyrics)
        update_firestore_job(job_id, {"status": "generating_captions", "progress": 20})
        logger.info("Starting Whisper transcription (medium model)...")
        model = get_whisper_model()
        
        # We REMOVED the 'initial_prompt' and 'condition_on_previous_text=False'
        # Why? Because forcing "This is a music video" makes the AI hallucinate random lyrics if the audio is unclear.
        # The 'medium' model is smart enough to figure it out on its own.
        result = model.transcribe(input_path, fp16=False)

        # 3. Create SRT File
        # Robust Hallucination Filter - more aggressive
        BLACKLIST = ["Subtitle by", "Amara.org", "Thank you", "thumbs up", "subscribers", "lol", "fi", "music playing", "singing"]
        
        with open(subtitle_path, "w", encoding="utf-8") as srt_file:
            segment_id = 1
            for segment in result["segments"]:
                text = segment["text"].strip()
                
                # Filter out pure noise descriptions like "[Music]" or "(Singing)"
                clean_text = re.sub(r"\[.*?\]|\(.*?\)", "", text).strip()
                
                if not clean_text or len(clean_text) < 2: continue
                if any(bad.lower() in clean_text.lower() for bad in BLACKLIST): continue
                
                # Convert timestamps
                start = format_timestamp(segment["start"])
                end = format_timestamp(segment["end"])
                
                srt_file.write(f"{segment_id}\n")
                srt_file.write(f"{start} --> {end}\n")
                srt_file.write(f"{clean_text}\n\n")
                segment_id += 1
                
        logger.info(f"Generated subtitles with {segment_id-1} segments.")

        # 4. Burn Subtitles (Force Style for Visibility)
        # Fontsize 24, Yellow Primary, Black Outline
        # ForceStyle='Fontname=Arial,FontSize=20,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=20'
        # Windows path escaping for ffmpeg filter is tricky. We'll try simple relative path or escaped absolute.
        # Safest is to use forward slashes even on Windows for ffmpeg filter string.
        safe_srt_path = subtitle_path.replace("\\", "/").replace(":", "\\:")

        subprocess.run([
            "ffmpeg", "-i", input_path,
            "-vf", f"subtitles='{safe_srt_path}':force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFF00,OutlineColour=&H80000000,BorderStyle=1,Outline=1,Shadow=1,Alignment=2,MarginV=50'",
            "-c:a", "copy",
            "-y", output_path
        ], check=True, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
        
        if os.path.exists(output_path):
             return {
                 "status": "completed", 
                 "job_id": job_id, 
                 "output_path": output_path,
                 "output_url": "PLACEHOLDER"
             }
        else:
             raise Exception("Output file not generated")
        with open(subtitle_path, "w", encoding="utf-8") as srt:
             for i, segment in enumerate(result["segments"]):
                 start = format_timestamp(segment["start"])
                 end = format_timestamp(segment["end"])
                 text = segment["text"].strip()
                 srt.write(f"{i+1}\n{start} --> {end}\n{text}\n\n")

        # 4. Burn-In Subtitles (Hardsub)
        # Using subtitles filter. Requires path escaping sometimes on Windows.
        # Ideally using confusing escaping for windows paths in ffmpeg filters
        escaped_sub_path = subtitle_path.replace("\\", "/").replace(":", "\\:")
        
        # Note: Filter complex escaping is tricky. 
        # Using simplified approach: output srt, return srt path?
        # A safer way on Windows is to use relative path if CWD allows, or forward slashes.
        # Let's try basic forward slash replacement which usually works in FFmpeg windows builds.
        
        vf_string = f"subtitles='{escaped_sub_path}':force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0'"

        subprocess.run([
            "ffmpeg", "-i", input_path,
            "-vf", vf_string,
            "-c:a", "copy",
            "-y", output_path
        ], check=True)

        if os.path.exists(output_path):
             return {
                 "status": "completed",
                 "job_id": job_id,
                 "output_path": output_path,
                 "output_url": upload_file_to_firebase(output_path)
             }
        else:
             raise Exception("Output caption video not generated")

    except Exception as e:
        logger.error(f"Caption Error: {e}")
        # Cleanup
        if os.path.exists(input_path): os.remove(input_path)
        if os.path.exists(subtitle_path): os.remove(subtitle_path)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup input, keep output
        if os.path.exists(input_path): os.remove(input_path)
        if os.path.exists(subtitle_path): os.remove(subtitle_path)


@app.post("/analyze-clips")
async def analyze_clips(request: Dict[str, Any]):
    """
    Phase 2: Scene Detection + Viral Keyword Spotting (Opus Clip Style)
    Analyzes video content to find logical breakpoints/scenes AND scans audio for viral keywords.
    Fully Async & Production Ready.
    """
    start_time = time.time()
    video_url = request.get("video_url")
    if not video_url:
         raise HTTPException(status_code=400, detail="video_url is required")

    logger.info(f"Received clip analysis request for {video_url} at {start_time}")
    
    # Check Busy State
    if current_job_info["status"] == "busy":
         logger.warning("Worker busy, rejecting analyze request")
         raise HTTPException(status_code=503, detail="Worker is busy. Try again or call /reset")
    
    set_current_process(None, "analyze_clips", "analyze")
    
    job_id = str(uuid.uuid4())
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR):
        os.makedirs(SHARED_TMP_DIR)

    input_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_analyze_input.mp4")

    # Viral Keywords Dictionary (Token -> Boost)
    VIRAL_KEYWORDS = {
        "money": 15, "rich": 10, "secret": 20, "hack": 15, "trick": 10,
        "mistake": 15, "stop": 10, "wait": 10, "shocking": 15, "crazy": 10,
        "millions": 15, "dollars": 10, "profit": 10, "loss": 10,
        "tutorial": 10, "example": 5, "how to": 10, "why": 5,
        "essential": 10, "proven": 10, "guaranteed": 15,
        "love": 10, "hate": 10, "fail": 15, "win": 10
    }

    try:
        # 1. Download Video (Async)
        logger.info(f"Downloading video from {video_url}...")
        await run_subprocess_async([
            "ffmpeg", "-nostdin", "-user_agent", "Mozilla/5.0", "-i", video_url, 
            "-c", "copy", "-y", input_path
        ], check=True)

        # 2. Transcribe Audio (Whisper) & 3. Scene Detection (Visual) - PARALLEL EXECUTION
        # Running both sequentially on a 10-min video takes too long (2x duration).
        # We can run them concurrently since one is heavy CPU (Whisper) and other is I/O + CPU (SceneDetect).
        # Actually both are CPU heavy. But SceneDetect with downscale is fast.
        
        transcription_segments = []
        scenes = []

        logger.info("Starting Parallel Analysis: Whisper + SceneDetect")
        
        loop = asyncio.get_running_loop()
        
        # Define tasks
        def run_whisper():
            if get_whisper_model():
                logger.info("Task [Whisper]: Starting (Translating to English for Analysis)...")
                res = transcribe_with_hints(
                    input_path,
                    language=request.get("language") or "auto",
                    prompt_hint=request.get("hint") or "Translate to English for clip analysis while preserving meaning.",
                    task="translate",
                )
                logger.info("Task [Whisper]: Completed.")
                return res.get("segments", [])
            return []

        def run_scenedetect():
            logger.info("Task [SceneDetect]: Starting...")
            from scenedetect import VideoManager, SceneManager
            from scenedetect.detectors import ContentDetector
            
            # Extreme Downscale for Speed (ContentDetector is robust)
            # 8 is good, 10-12 is faster for HD content
            vm = VideoManager([input_path])
            vm.set_downscale_factor(8) 
            
            sm = SceneManager()
            sm.add_detector(ContentDetector(threshold=27.0)) # Slightly lower threshold for speed
            
            vm.start()
            sm.detect_scenes(frame_source=vm)
            return sm.get_scene_list()

        # Execute in ThreadPool to allow GIL release (Whisper releases GIL in C++ parts)
        # We use run_in_executor to run these blocking functions in threads
        
        # 3. Proper Exception Handling for Parallel Tasks
        try:
            future_whisper = loop.run_in_executor(None, run_whisper)
            future_scenes = loop.run_in_executor(None, run_scenedetect)
            
            # Wait for both and catch any exceptions
            results = await asyncio.gather(future_whisper, future_scenes, return_exceptions=True)
            
            # Check for exceptions
            transcription_segments = []
            scene_list = []
            
            if isinstance(results[0], Exception):
                logger.error(f"Whisper Transcription Failed: {results[0]}")
                # Don't fail the whole job, just proceed with visual scene detection
                transcription_segments = [] 
            else:
                transcription_segments = results[0]

            if isinstance(results[1], Exception):
                logger.error(f"Scene Detection Failed: {results[1]}")
                raise results[1] # Visual detection is critical, so we re-raise
            else:
                scene_list = results[1]
                
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logger.error(f"Parallel Analysis Job Error Type: {type(e).__name__}, Msg: {e}\nTraceback: {tb}")
            raise HTTPException(status_code=500, detail=f"Analysis engine failed: {repr(e)}")

        logger.info(f"Parallel Analysis Complete. Scenes: {len(scene_list)}, Segments: {len(transcription_segments)}")

        # Map visual scenes to data structure
        scenes = []
        for i, scene in enumerate(scene_list):
            start_time_sec = scene[0].get_seconds()
            end_time_sec = scene[1].get_seconds()
            duration_sec = end_time_sec - start_time_sec
            
            # Filter out tiny blips (< 2s)
            if duration_sec < 2.0: continue

            # Default Score
            score = 60 # Base score for visual interest
            reason_parts = ["Visual change detected"]
            scene_text = ""

            # 4. Integrate Transcription (Keyword Spotting)
            # Find segments that overlap with this scene
            scene_segments_txt = [
                seg for seg in transcription_segments 
                if (seg["start"] < end_time_sec and seg["end"] > start_time_sec)
            ]
            
            if scene_segments_txt:
                # Combine text for this scene
                full_text = " ".join([s["text"].strip() for s in scene_segments_txt]).lower()
                scene_text = full_text[:150] + "..." if len(full_text) > 150 else full_text
                
                keyword_boost, found_keywords = score_text_for_virality(full_text, VIRAL_KEYWORDS)
                
                if keyword_boost > 0:
                    score += keyword_boost
                    reason_parts.append(f"Keywords: {', '.join(found_keywords)}")
                    # Cap score at 99
                    score = min(99, score)
                
                # Boost for high-energy words (rudimentary sentiment)
                if "!" in full_text: 
                    score += 5
            
            scenes.append({
                "id": f"scene_{i}",
                "start": round(start_time_sec, 2),
                "end": round(end_time_sec, 2),
                "duration": round(duration_sec, 2),
                "viralScore": min(99, score),
                "reason": " + ".join(reason_parts),
                "text": scene_text or f"Scene {i+1} (No speech detected)",
                "source": "scene_detect"
            })

        transcript_windows = build_transcript_windows(transcription_segments, VIRAL_KEYWORDS)
        aligned_windows = [align_clip_to_scenes(candidate, scene_list) for candidate in transcript_windows]
        ranked_candidates = dedupe_ranked_candidates(scenes + aligned_windows, max_results=15)

        return {
            "status": "completed",
            "job_id": job_id,
            "scenes": ranked_candidates,
            "clipSuggestions": ranked_candidates
        }

    except HTTPException as he:
        # Re-raise HTTP exceptions directly
        raise he
    except Exception as e:
        import traceback
        error_stack = traceback.format_exc()
        logger.error(f"Analysis Error: {e}\nStack: {error_stack}")
        raise HTTPException(status_code=500, detail=f"Internal Analysis Error: {str(e)}")
    finally:
        clear_current_process()
        if os.path.exists(input_path):
            try: os.remove(input_path)
            except: pass


class RenderClipRequest(BaseModel):
    video_url: str
    start_time: float
    end_time: float
    target_aspect_ratio: str = "9:16"


@app.post("/render-clip")
async def render_clip(request: RenderClipRequest):
    """
    Render a specific clip from a video based on start/end times.
    Phase 1: Basic Cutting & Cropping (9:16)
    """
    logger.info(f"Received render-clip request for {request.video_url} ({request.start_time}-{request.end_time}s)")

    if current_job_info["status"] == "busy":
         raise HTTPException(status_code=503, detail="Worker is busy")

    job_id = str(uuid.uuid4())
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR):
        os.makedirs(SHARED_TMP_DIR)

    output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_clip.mp4")

    try:
        # Build FFmpeg command
        # Use ih (input height) and iw (input width) for expressions
        # Explicitly use in_w and in_h to avoid ambiguity with output w/h
        if request.target_aspect_ratio == "9:16":
             # Force scale first to ensure we have enough height, then crop
             # But if vertical crop is needed from landscape:
             # Scale height to 1920 (if needed) or keep as is?
             # Safer: crop=in_h*9/16:in_h:x=(in_w-out_w)/2:y=0
             vf = "crop=in_h*9/16:in_h:x=(in_w-out_w)/2:y=0"
        else:
             vf = "scale=1920:-1"
        
        input_arg = request.video_url
        ss_arg = str(request.start_time)
        to_arg = str(request.start_time + (request.end_time - request.start_time)) # Convert duration to end timestamp if needed, or use -to as end timestamp
        # Actually -to is end timestamp. request.end_time IS end timestamp.
        to_arg = str(request.end_time)

        cmd = [
            "ffmpeg", 
            "-ss", ss_arg,
            "-to", to_arg,
            "-i", input_arg,
            "-vf", vf,
            "-c:v", "libx264", 
            "-c:a", "aac",
            "-y", 
            output_path
        ]
        
        # 403 Forbidden Fix: Add user agent headers if http/https
        if request.video_url.startswith("http"):
             cmd = [
                "ffmpeg", 
                "-user_agent", "Mozilla/5.0",
                "-ss", ss_arg,
                "-to", to_arg,
                "-i", input_arg,
                "-vf", vf,
                "-c:v", "libx264", 
                "-c:a", "aac",
                "-y", 
                output_path
            ]
        
        await run_subprocess_async(cmd, check=True)

        if os.path.exists(output_path):
             # Ensure the path is absolute for Node.js to pick up
             abs_path = os.path.abspath(output_path)
             return {
                 "status": "completed",
                 "job_id": job_id,
                 "output_path": abs_path, 
                 "output_url": upload_file_to_firebase(output_path),
                 "duration": request.end_time - request.start_time
             }
        else:
            raise Exception("Output file not generated")

    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg render failed: {e}")
        raise HTTPException(status_code=500, detail="Clip rendering failed")
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        clear_current_process()


def get_video_duration(filename):
    import subprocess, json
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filename],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT
    )
    return float(result.stdout)


class MusicRequest(BaseModel):
    video_url: str
    music_file: str = "upbeat_pop.mp3"
    volume: float = 0.15  # 0.0 to 1.0 (15% by default)
    is_search: bool = False # NEW: If true, treat music_file as search query
    safe_search: bool = True  # Default to safety
    music_ducking: bool = True
    music_ducking_strength: float = 0.35

@app.post("/add-music")
async def add_music(request: MusicRequest):
    """
    Overlays background music onto the video.
    Handles YouTube search or Preset files.
    """
    logger.info(f"Adding music request: {request.music_file} (Search={request.is_search}, Safe={request.safe_search})")
    
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    temp_dir = os.path.join(BASE_DIR, "../tmp")
    if not os.path.exists(temp_dir):
        try: os.makedirs(temp_dir)
        except: pass

    music_path = ""
    downloaded_song = None
    song_output_path = os.path.join(temp_dir, f"song_search_{uuid.uuid4().hex[:8]}")

    try:
        music_path = resolve_music_input(
            request.music_file,
            song_output_path,
            is_search=request.is_search,
            safe_search=request.safe_search,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Music search failed: {str(e)}")

    if not music_path or not os.path.exists(music_path):
        raise HTTPException(status_code=404, detail=f"Could not resolve music source: {request.music_file}")

    if os.path.abspath(music_path).startswith(os.path.abspath(temp_dir)):
        downloaded_song = music_path

    # Setup paths
    job_id = str(uuid.uuid4())


    # Determine if input is URL or local path
    input_path = request.video_url
    if not (input_path.startswith("http://") or input_path.startswith("https://")):
         input_path = os.path.abspath(request.video_url)
         if not os.path.exists(input_path):
             raise HTTPException(status_code=404, detail=f"Input video not found: {input_path}")
    
    output_path = os.path.join(temp_dir, f"music_{job_id}.mp4")

    try:
        # Check for audio stream in input
        has_audio = False
        try:
            # Probe input for audio streams
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", input_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            if probe.stdout.strip():
                has_audio = True
        except Exception as e:
            logger.warning(f"Could not probe audio: {e}")

        # Construct FFmpeg command
        # We start by inputs: 0 is video, 1 is music (looped)
        cmd_inputs = ["ffmpeg", "-i", input_path, "-stream_loop", "-1", "-i", music_path]
        
        # Determine filter complex
        # We need to ensure we map video and the new mixed audio
        if has_audio:
            # Mix existing audio with music
            # [0:a] is original, [1:a] is music
            music_gain = clamp_float(request.volume, 0.03, 1.2)
            ducking_strength = clamp_float(request.music_ducking_strength, 0.15, 0.95)
            if request.music_ducking:
                threshold_value = max(0.003, 0.055 - (ducking_strength * 0.04))
                ratio_value = round(6.0 + (ducking_strength * 10.0), 2)
                filter_complex = (
                    f"[0:a]asplit=2[a_main][a_sidechain];"
                    f"[1:a]volume={music_gain}[music];"
                    f"[music][a_sidechain]sidechaincompress=threshold={threshold_value:.4f}:ratio={ratio_value}:attack=15:release=280:makeup=1[music_ducked];"
                    f"[a_main][music_ducked]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[aout]"
                )
            else:
                filter_complex = f"[1:a]volume={music_gain}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[aout]"
            cmd_map = ["-filter_complex", filter_complex, "-map", "0:v", "-map", "[aout]", "-shortest"]
        else:
            # No original audio, just use music (looped)
            # Reduce volume of music
            filter_complex = f"[1:a]volume={clamp_float(request.volume, 0.03, 1.2)}[aout]"
            cmd_map = ["-filter_complex", filter_complex, "-map", "0:v", "-map", "[aout]", "-shortest"]

        # Final command
        cmd = cmd_inputs + cmd_map + ["-c:v", "copy", "-c:a", "aac", "-y", output_path]
        
        logger.info(f"Running ffmpeg: {' '.join(cmd)}")
        subprocess.run(cmd, check=True)

        if os.path.exists(output_path):
             # Cleanup downloaded song if temp
             if downloaded_song and os.path.exists(downloaded_song):
                 try: os.remove(downloaded_song)
                 except: pass

             return {
                 "status": "completed",
                 "output_path": os.path.abspath(output_path),
                 "output_url": upload_file_to_firebase(output_path),
                 "job_id": job_id
             }
        else:
            raise Exception("Output file not generated")

    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg music add failed: {e}")
        raise HTTPException(status_code=500, detail="Adding music failed")
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Montage Generation ---

class MontageSegment(BaseModel):
    start: float
    end: float

class RenderMontageRequest(BaseModel):
    video_url: str
    segments: List[MontageSegment]
    target_aspect_ratio: str = "9:16"
    add_hook: bool = False

@app.post("/render-montage")
async def render_montage(request: RenderMontageRequest):
    """
    Stitches multiple segments into a single montage.
    """
    logger.info(f"Rendering montage with {len(request.segments)} segments")
    
    job_id = str(uuid.uuid4())
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR): os.makedirs(SHARED_TMP_DIR)

    input_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_montage_src.mp4")
    output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_montage.mp4")

    try:
        # 1. Download Source
        if request.video_url.startswith("http"):
             await run_subprocess_async(["ffmpeg", "-user_agent", "Mozilla/5.0", "-i", request.video_url, "-c", "copy", "-y", input_path], check=True)
        else:
             shutil.copy(request.video_url, input_path)

        # 2. Build Filter Complex
        # We need to trim each segment and then concat
        # We also need to apply the crop to each segment BEFORE concat to ensure consistent resolution
        
        filter_parts = []
        concat_inputs = []
        
        vf_base = "crop=in_h*9/16:in_h:x=(in_w-out_w)/2:y=0,scale=1080:1920"
        if request.target_aspect_ratio != "9:16":
            vf_base = "scale=1920:1080" # Default landscape

        for i, seg in enumerate(request.segments):
            # Video Trim & Crop
            v_trim = f"[0:v]trim=start={seg.start}:end={seg.end},setpts=PTS-STARTPTS,{vf_base}[v{i}];"
            # Audio Trim
            a_trim = f"[0:a]atrim=start={seg.start}:end={seg.end},asetpts=PTS-STARTPTS[a{i}];"
            
            filter_parts.append(v_trim)
            filter_parts.append(a_trim)
            concat_inputs.extend([f"[v{i}]", f"[a{i}]"])

        # Concat part
        concat_filter = "".join(concat_inputs) + f"concat=n={len(request.segments)}:v=1:a=1[outv][outa]"
        
        full_filter = "".join(filter_parts) + concat_filter
        
        cmd = [
            "ffmpeg", "-i", input_path,
            "-filter_complex", full_filter,
            "-map", "[outv]", "-map", "[outa]",
            "-c:v", "libx264", "-c:a", "aac",
            "-y", output_path
        ]
        
        logger.info(f"Running montage ffmpeg command...")
        await run_subprocess_async(cmd, check=True)

        if os.path.exists(output_path):
             return {
                 "status": "completed",
                 "job_id": job_id,
                 "output_path": os.path.abspath(output_path),
                 "output_url": upload_file_to_firebase(output_path)
             }
        else:
            raise Exception("Output montage file not generated")

    except Exception as e:
        logger.error(f"Montage Error: {e}")
        try: os.remove(input_path) 
        except: pass
        
# --- Idea-to-Video Generation (Text + Stock + TTS) ---
try:
    import edge_tts
    # Safer import for moviepy 1.x
    from moviepy.editor import VideoFileClip, AudioFileClip, concatenate_videoclips, CompositeAudioClip, CompositeVideoClip
    
    MOVIEPY_AVAILABLE = True
except ImportError as e:
    MOVIEPY_AVAILABLE = False
    logger.warning(f"MoviePy or Edge-TTS import failed: {e}")
except Exception as e:
    MOVIEPY_AVAILABLE = False
    logger.error(f"MoviePy init error: {e}")

class IdeaScene(BaseModel):
    text: str
    video_url: str
    keywords: Optional[str] = None

class RenderIdeaRequest(BaseModel):
    scenes: List[IdeaScene]
    music_file: Optional[str] = None # Local file name in assets or URL
    voice: str = "en-US-GuyNeural" 
    aspect_ratio: str = "9:16"
    subtitles: bool = True

@app.post("/render-idea-video")
async def render_idea_video(request: RenderIdeaRequest, background_tasks: BackgroundTasks):
    if not MOVIEPY_AVAILABLE:
        raise HTTPException(status_code=500, detail="Text-to-Video dependencies (moviepy, edge-tts) missing on server")

    job_id = str(uuid.uuid4())
    logger.info(f"Starting Idea Video Job {job_id} with {len(request.scenes)} scenes")
    
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR): os.makedirs(SHARED_TMP_DIR)
    
    final_output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_idea_final.mp4")
    temp_files = [] # Track for cleanup

    try:
        clips = []
        
        # 1. Process Each Scene
        for i, scene in enumerate(request.scenes):
            # A. Generate TTS Audio
            # edge-tts --text "Hello" --write-media out.mp3
            tts_filename = os.path.join(SHARED_TMP_DIR, f"{job_id}_scene_{i}.mp3")
            temp_files.append(tts_filename)
            
            communicate = edge_tts.Communicate(scene.text, request.voice)
            await communicate.save(tts_filename)
            
            # Load Audio Duration
            audio_clip = AudioFileClip(tts_filename)
            scene_duration = audio_clip.duration + 0.5 # Add small pause
            
            # B. Download & Process Video
            video_filename = os.path.join(SHARED_TMP_DIR, f"{job_id}_scene_{i}_src.mp4")
            if scene.video_url.startswith("http"):
                  # Use existing run_subprocess_async or direct request
                  # Simple retrieval via requests with retry logic for stability
                  import requests
                  headers = {"User-Agent": "Mozilla/5.0"}
                  download_success = False
                  max_retries = 3
                  
                  for attempt in range(max_retries):
                      try:
                          with requests.get(scene.video_url, stream=True, headers=headers, timeout=30) as r:
                              r.raise_for_status()
                              with open(video_filename, 'wb') as f:
                                  for chunk in r.iter_content(chunk_size=8192): 
                                      f.write(chunk)
                          download_success = True
                          break
                      except Exception as e:
                          print(f"Download attempt {attempt+1} failed ({scene.video_url}): {e}")
                          time.sleep(1) # Wait before retry
                  
                  if not download_success:
                      raise Exception(f"Failed to download video from {scene.video_url} after {max_retries} attempts")
            else:
                  # Ensure safe path if local
                  pass 
            temp_files.append(video_filename)
            
            video_clip = VideoFileClip(video_filename)
            
            # Resize/Crop to aspect ratio
            # Target 1080x1920 (9:16)
            W, H = video_clip.size
            TARGET_W, TARGET_H = 1080, 1920
            
            # Crop to aspect ratio first
            # If landscape (16:9) -> Crop center 9:16
            if W/H > TARGET_W/TARGET_H:
                 video_clip = video_clip.crop(x1=(W/2 - (H*TARGET_W/TARGET_H)/2), width=H*TARGET_W/TARGET_H, height=H)
            else:
                 pass # Already narrow or fits
            
            video_clip = video_clip.resize(height=TARGET_H)
            # Center crop strictly to 1080 width if needed
            if video_clip.w > TARGET_W:
                video_clip = video_clip.crop(x1=video_clip.w/2 - TARGET_W/2, width=TARGET_W)
                
            # Loop video if shorter than audio
            if video_clip.duration < scene_duration:
                video_clip = video_clip.loop(duration=scene_duration)
            else:
                video_clip = video_clip.subclip(0, scene_duration)
                
            # Set Audio
            video_clip = video_clip.set_audio(audio_clip)
            clips.append(video_clip)

        # 2. Concatenate
        final_clip = concatenate_videoclips(clips, method="compose") # compose handles different sizes safer
        
        # 3. Add Background Music (Optional)
        # Assuming asset path logic similar to main server
        # For now, skip music to ensure stability first
        
        # 4. Write Output
        final_clip.write_videofile(final_output_path, codec="libx264", audio_codec="aac", fps=24, logger=None)
        
        # Close clips to release file handles
        for c in clips: c.close()
        final_clip.close()

        if os.path.exists(final_output_path):
             # Return file directly instead of uploading
             # BackgroundTasks handles cleanup after response is sent? 
             # No, standard BackgroundTasks in FastAPI run AFTER response. file handle might be open.
             # FileResponse keeps it open. We can't easily auto-delete immediately unless we use a cleanup task.
             background_tasks.add_task(cleanup_file, final_output_path, temp_files)
             return FileResponse(final_output_path, media_type="video/mp4", filename="generated_video.mp4")
        else:
            raise Exception("Output file not generated")

    except Exception as e:
        logger.error(f"Idea Video Error: {e}")
        # Clean up temps on error
        for f in temp_files:
            try: os.remove(f)
            except: pass
        raise HTTPException(status_code=500, detail=str(e))
    # finally block removed because we need the file to persist for the return

def cleanup_file(path: str, temp_files: list):
    # Wait a bit or Just delete? 
    # With FileResponse, we should be careful. 
    # But usually the response construction opens the file.
    # Safe approach: Delete temp files now. Keep output for a short while or rely on OS temp cleanup.
    # Actually, let's just clean temp source files immediately here.
    for f in temp_files:
        if os.path.exists(f):
            try: os.remove(f)
            except: pass
    
    # We cannot delete 'path' (the video) immediately if it's being streamed.
    # A robust solution needs a periodic cleanup task or a custom iterator.
    # For now, let's leave the final output file in tmp. It will be cleaned up eventually or we can add a cron job.
    pass

# --- Viral Clip Rendering ---

class ViralOverlay(BaseModel):
    id: Union[str, int]
    type: str 
    text: Optional[str] = None
    src: Optional[str] = None
    x: float
    y: float
    width: Optional[float] = None 
    height: Optional[float] = None
    bg: Optional[str] = None 
    color: Optional[str] = None
    start_time: Optional[float] = None
    duration: Optional[float] = None

class ViralTimelineSegment(BaseModel):
    id: Optional[Union[str, int]] = None
    url: str
    start_time: float = 0.0
    end_time: float
    duration: Optional[float] = None

class BackgroundAudioTrack(BaseModel):
    url: str
    trim_start: float = 0.0
    volume: float = 0.7
    mode: str = "mix"
    ducking_strength: float = 0.45
    enabled: bool = True

class HookFocusPoint(BaseModel):
    x: float = 50.0
    y: float = 42.0

class CoverFrameRequest(BaseModel):
    timelineTime: float = 0.0
    sourceTime: Optional[float] = None
    clipId: Optional[Union[str, int]] = None
    focusPoint: Optional[HookFocusPoint] = None
    template: Optional[str] = None
    freezeFrame: bool = False
    strategy: Optional[str] = None
    purpose: Optional[str] = None

class RenderViralRequest(BaseModel):
    video_url: str
    start_time: float
    end_time: float
    overlays: List[ViralOverlay] = []
    auto_captions: bool = False
    smart_crop: bool = False
    add_hook: bool = False
    hook_text: str = ""
    hook_intro_seconds: float = 3.0
    hook_template: str = "blur_reveal"
    hook_start_time: float = 0.0
    hook_blur_background: bool = True
    hook_dark_overlay: bool = True
    hook_freeze_frame: bool = False
    hook_zoom_scale: float = 1.08
    hook_text_animation: str = "slide_up"
    hook_focus_point: Optional[HookFocusPoint] = None
    cover_frame: Optional[CoverFrameRequest] = None
    thumbnail_frame: Optional[CoverFrameRequest] = None
    timeline_segments: Optional[List[ViralTimelineSegment]] = None
    background_audio: Optional[BackgroundAudioTrack] = None
    job_id: Optional[str] = None
    async_mode: bool = False

@app.post("/render-viral-clip")
async def render_viral_clip(request: RenderViralRequest, background_tasks: BackgroundTasks):
    """
    Renders a clip with overlays (PiP, Text) and cuts it to specific time.
    Supports basic Smart Crop (Center Focus) and Auto-Captions.
    """
    if request.async_mode:
        job_id = request.job_id or str(uuid.uuid4())
        logger.info(f"Queuing ASYNC viral render job {job_id}")
        background_tasks.add_task(render_viral_clip_impl, request, job_id)
        return {"status": "processing", "job_id": job_id, "mode": "async"}

    return await render_viral_clip_impl(request)

async def render_viral_clip_impl(request: RenderViralRequest, provided_job_id: str = None):
    logger.info(f"Rendering viral clip for {request.video_url} with {len(request.overlays)} overlays (SmartCrop={request.smart_crop}, AutoCaptions={request.auto_captions})")

    job_id = provided_job_id or str(uuid.uuid4())
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR): os.makedirs(SHARED_TMP_DIR)

    input_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_input.mp4")
    trimmed_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_trimmed.mp4")
    output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_viral.mp4")
    thumbnail_output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_thumbnail.jpg")
    downloaded_background_audio_path = None

    # Initial async update
    if request.async_mode:
         try: update_firestore_job(job_id, {"status": "processing", "progress": 0})
         except: pass

    try:
        # 1. Download/Prepare Main Video (Async)
        try:
            if request.video_url.startswith("http"):
                 await run_subprocess_async(["ffmpeg", "-user_agent", "Mozilla/5.0", "-i", request.video_url, "-c", "copy", "-y", input_path], check=True)
            else:
                 shutil.copy(request.video_url, input_path)
        except Exception as e:
             err_msg = f"Failed to load video: {str(e)}"
             logger.error(err_msg)
             if request.async_mode:
                  update_firestore_job(job_id, {"status": "failed", "error": err_msg})
                  return
             raise HTTPException(status_code=400, detail=err_msg)

        # 2. Pre-trim to duration or assemble timeline sequence
        timeline_segments = request.timeline_segments or []
        if timeline_segments:
            normalized_segments = [segment for segment in timeline_segments if segment.end_time > segment.start_time]
        else:
            normalized_segments = []

        if normalized_segments:
            segment_paths = []
            concat_list_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_concat.txt")
            for index, segment in enumerate(normalized_segments):
                segment_source_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_segment_src_{index}.mp4")
                segment_output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_segment_{index}.mp4")
                segment_duration = float(segment.end_time) - float(segment.start_time)

                if segment.url == request.video_url:
                    segment_source_path = input_path
                elif str(segment.url).startswith("http"):
                    await run_subprocess_async(
                        [
                            "ffmpeg",
                            "-user_agent",
                            "Mozilla/5.0",
                            "-i",
                            segment.url,
                            "-c",
                            "copy",
                            "-y",
                            segment_source_path,
                        ],
                        check=True,
                    )
                else:
                    shutil.copy(segment.url, segment_source_path)

                normalize_vf = (
                    "scale=1080:1920:force_original_aspect_ratio=decrease,"
                    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2"
                )
                await run_subprocess_async(
                    [
                        "ffmpeg",
                        "-ss",
                        str(segment.start_time),
                        "-i",
                        segment_source_path,
                        "-t",
                        str(segment_duration),
                        "-vf",
                        normalize_vf,
                        "-map",
                        "0:v:0",
                        "-map",
                        "0:a?",
                        "-c:v",
                        "libx264",
                        "-preset",
                        "ultrafast",
                        "-c:a",
                        "aac",
                        "-pix_fmt",
                        "yuv420p",
                        "-movflags",
                        "+faststart",
                        "-y",
                        segment_output_path,
                    ],
                    check=True,
                )
                segment_paths.append(segment_output_path)

            if not segment_paths:
                raise HTTPException(status_code=400, detail="No valid timeline segments supplied")

            if len(segment_paths) == 1:
                shutil.copy(segment_paths[0], trimmed_path)
            else:
                with open(concat_list_path, "w", encoding="utf-8") as concat_file:
                    for segment_path in segment_paths:
                        concat_file.write(f"file '{segment_path}'\n")
                try:
                    await run_subprocess_async(
                        [
                            "ffmpeg",
                            "-f",
                            "concat",
                            "-safe",
                            "0",
                            "-i",
                            concat_list_path,
                            "-c",
                            "copy",
                            "-y",
                            trimmed_path,
                        ],
                        check=True,
                    )
                except Exception:
                    await run_subprocess_async(
                        [
                            "ffmpeg",
                            "-f",
                            "concat",
                            "-safe",
                            "0",
                            "-i",
                            concat_list_path,
                            "-c:v",
                            "libx264",
                            "-c:a",
                            "aac",
                            "-pix_fmt",
                            "yuv420p",
                            "-y",
                            trimmed_path,
                        ],
                        check=True,
                    )
        else:
            duration = request.end_time - request.start_time
            try:
                await run_subprocess_async([
                    "ffmpeg", "-ss", str(request.start_time), "-i", input_path,
                    "-t", str(duration), "-c", "copy", "-y", trimmed_path
                ], check=True)
            except:
                await run_subprocess_async([
                    "ffmpeg", "-ss", str(request.start_time), "-i", input_path,
                    "-t", str(duration), "-c:v", "libx264", "-y", trimmed_path
                ], check=True)
        
        # 2.5. Smart Crop (Vertical 9:16) - OPTIONAL
        working_path = trimmed_path
        if request.smart_crop:
            cropped_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_cropped.mp4")
            try:
                logger.info("Applying Smart Crop (Center Focus 9:16)...")
                # Scale height to 1920 (or width to 1080) ensuring coverage, then crop center
                # This focuses on the center of the frame (usually the speaker)
                vf_crop = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
                
                await run_subprocess_async([
                    "ffmpeg", "-i", trimmed_path, 
                    "-vf", vf_crop, 
                    "-c:v", "libx264", "-c:a", "copy", "-y", cropped_path
                ], check=True)
                working_path = cropped_path # Update reference for further steps
            except Exception as e:
                logger.error(f"Smart Crop failed: {e}. Proceeding with original aspect ratio.")
                # Fallback to trimmed_path

        # 3. Auto-Captions (Optional)
        if request.auto_captions:
            try:
                logger.info("Generating auto-captions...")
                loop = asyncio.get_running_loop()
                model = get_whisper_model()
                if model:
                    # Run CPU-bound task in thread pool
                    # For singing/music videos, we relax the no_speech_threshold slightly
                    # but keep hallucinaton filters.
                    result = await loop.run_in_executor(None, lambda: model.transcribe(
                        working_path, 
                        fp16=False,
                        condition_on_previous_text=False, 
                        # no_speech_threshold=0.6  <-- Removed to allow singing/lyrics detection
                        # logprob_threshold=-1.0   <-- Removed to catch sung words which might have lower confidence
                    ))
                    segments = result.get("segments", [])
                    logger.info(f"Generated {len(segments)} caption segments")
                    
                    # Common Whisper hallucinations during instrumental breaks
                    hallucinations = ["Thank you.", "Thanks.", "Bye.", "Music.", "Watching.", "MBC", "LBC", "You", "Silence"]

                    for seg in segments:
                        txt = seg.get('text', '').strip()
                        
                        # simple clean up of [Music] or (Music) tags if they exist
                        txt = txt.replace("[Music]", "").replace("(Music)", "").strip()

                        # Basic filtering of empty or known hallucination strings
                        if not txt or txt in hallucinations: 
                            continue
                        
                        # Only filter if HIGHLY likely to be non-speech (instrumental)
                        # Standard singing usually has no_speech_prob < 0.8
                        if seg.get('no_speech_prob', 0) > 0.85:
                            continue

                        start = float(seg['start'])
                        end = float(seg['end'])
                        
                        # Create Caption Overlay (Yellow text on semi-transparent black box, bottom center)
                        ov = ViralOverlay(
                            id=f"auto_{seg['id']}",
                            type='text',
                            text=txt,
                            x=50, y=85,      # Bottom Center
                            bg="black@0.5",  # Semi-transparent background
                            color="yellow",  # High contrast
                            start_time=start,
                            duration=(end - start)
                        )
                        request.overlays.append(ov)
            except Exception as e:
                logger.error(f"Auto-caption generation failed: {e}")
                # Continue without captions
        
        # Use working_path (either original trimmed or cropped version) as base for overlays
        base_width, base_height = get_video_dimensions(working_path)
        inputs = ["-i", working_path]
        filter_chain = []
        current_v_label = "0:v"
        input_idx = 1

        if request.add_hook and request.hook_text:
            hook_chain = build_hook_filter_chain(
                request.hook_text,
                request.hook_intro_seconds,
                width_val=base_width,
                height_val=base_height,
                template=request.hook_template,
                hook_start_time=request.hook_start_time,
                blur_background=request.hook_blur_background,
                dark_overlay=request.hook_dark_overlay,
                freeze_frame=request.hook_freeze_frame,
                zoom_scale=request.hook_zoom_scale,
                text_animation=request.hook_text_animation,
            )
            if hook_chain:
                filter_chain.append(f"[{current_v_label}]{hook_chain}[v_hook];")
                current_v_label = "v_hook"

        def build_overlay_scale_filter(input_label, output_label, overlay):
            width_percent = float(overlay.width) if overlay.width is not None else None
            height_percent = float(overlay.height) if overlay.height is not None else None

            target_width = max(2, int(base_width * width_percent / 100.0)) if width_percent else -1
            target_height = max(2, int(base_height * height_percent / 100.0)) if height_percent else -1

            if target_width > 0 and target_height > 0:
                return (
                    f"[{input_label}]scale=w={target_width}:h={target_height}:"
                    f"force_original_aspect_ratio=decrease[{output_label}];"
                )
            if target_width > 0:
                return f"[{input_label}]scale=w={target_width}:h=-1[{output_label}];"
            if target_height > 0:
                return f"[{input_label}]scale=w=-1:h={target_height}[{output_label}];"
            return f"[{input_label}]scale=w=iw*0.3:h=-1[{output_label}];"

        # Process Video Overlays
        video_overlays = [o for o in request.overlays if o.type == 'video' and o.src]
        
        for ov in video_overlays: 
            ov_path = ""
            if ov.src.startswith("http"):
                 ov_dl_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_ov_{input_idx}.mp4")
                 # Async download
                 # Force re-encode to ensure compatibility (copy might fail for webm -> mp4 container)
                 # Use fast preset for speed
                 await run_subprocess_async([
                     "ffmpeg", "-i", ov.src, 
                     "-c:v", "libx264", "-preset", "ultrafast",     # Re-encode video
                     "-c:a", "aac",                                 # Re-encode audio
                     "-y", ov_dl_path
                 ], check=True)
                 ov_path = ov_dl_path
            
            if ov_path:
                # Add -stream_loop -1 to loop the overlay video indefinitely
                inputs.extend(["-stream_loop", "-1", "-i", ov_path])
                scale_filter = build_overlay_scale_filter(f"{input_idx}:v", f"ov{input_idx}", ov)
                
                x_expr = f"(W*{ov.x/100})-(w/2)"
                y_expr = f"(H*{ov.y/100})-(h/2)"
                
                enable_expr = ""
                if ov.start_time is not None and ov.duration is not None:
                     rel_start = ov.start_time
                     rel_end = ov.start_time + ov.duration
                     enable_expr = f":enable='between(t,{rel_start},{rel_end})'"

                overlay_filter = f"[{current_v_label}][ov{input_idx}]overlay=x={x_expr}:y={y_expr}:eof_action=pass{enable_expr}[v{input_idx}];"
                
                filter_chain.append(scale_filter)
                filter_chain.append(overlay_filter)
                current_v_label = f"v{input_idx}"
                input_idx += 1

        # Process Image Overlays (e.g. Cute Captions)
        image_overlays = [o for o in request.overlays if o.type == 'image' and o.src]
        
        for ov in image_overlays:
            ov_path = ""
            if ov.src.startswith("http"):
                 ext = ov.src.split('?')[0].split('.')[-1]
                 if len(ext) > 4: ext = "png"
                 ov_dl_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_img_{input_idx}.{ext}")
                 
                 # Async download via executor
                 import urllib.request
                 loop = asyncio.get_running_loop()
                 try:
                     await loop.run_in_executor(None, lambda: urllib.request.urlretrieve(ov.src, ov_dl_path))
                     ov_path = ov_dl_path
                 except Exception as e:
                     logger.error(f"Failed to download image overlay: {e}")
            
            if ov_path:
                # Loop 1 ensures image is available as a stream
                inputs.extend(["-loop", "1", "-i", ov_path])
                
                scale_filter = build_overlay_scale_filter(f"{input_idx}:v", f"img{input_idx}", ov)
                
                x_expr = f"(W*{ov.x/100})-(w/2)"
                y_expr = f"(H*{ov.y/100})-(h/2)"
                
                enable_expr = ""
                if ov.start_time is not None and ov.duration is not None:
                     rel_start = ov.start_time
                     rel_end = ov.start_time + ov.duration
                     enable_expr = f":enable='between(t,{rel_start},{rel_end})'"

                overlay_filter = f"[{current_v_label}][img{input_idx}]overlay=x={x_expr}:y={y_expr}:shortest=1{enable_expr}[v{input_idx}];"
                
                filter_chain.append(scale_filter)
                filter_chain.append(overlay_filter)
                current_v_label = f"v{input_idx}"
                input_idx += 1


        # Process Text Overlays
        text_overlays = [o for o in request.overlays if o.type == 'text']
        
        # Robust Font Selection
        font_path = "Arial" # Default to system font name if file not found
        possible_fonts = ["C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"]
        for f in possible_fonts:
            if os.path.exists(f):
                font_path = f.replace("\\", "/").replace(":", "\\:") # Escaping for filter
                break

        for idx, txt in enumerate(text_overlays):
            # 1. Escape Special Characters for FFmpeg Filter Chain
            # - Colons need escaping because they delimit filter options (: -> \\:)
            # - Single quotes need escaping inside ' ' strings (' -> \')
            # - Commas need escaping if they appear in parameter values (, -> \\,)
            # - Brackets need escaping if they are part of filter text ([ -> \[, ] -> \])
            
            clean_text = txt.text.replace(":", "\\:").replace("'", "\\'").replace(",", "\\,").replace("[", "\\[").replace("]", "\\]")
            
            # 2. X/Y Positions (Percentage to Pixels)
            # Ensure these are simple numbers or expressions without dangerous chars
            x_val = txt.x / 100.0
            y_val = txt.y / 100.0
            
            # 3. Colors
            # boxcolor/fontcolor often use hex (#ffffff) or rgba(0,0,0,0.5).
            # Comma in rgba(...) MUST be escaped for filter syntax: rgba(0\,0\,0\,0.5)
            # Use 'bg' from Pydantic model
            bg_val = txt.bg or "black@0.5" 
            bg_color = str(bg_val).replace(",", "\\,")
            
            font_color_str = (str(txt.color) if txt.color else "white").replace(",", "\\,")
            
            # 4. Timing (Enable expression)
            enable_expr = ""
            if txt.start_time is not None:
                 rel_start = float(txt.start_time)
                 # Default duration if missing
                 rel_end = rel_start + (float(txt.duration) if txt.duration else 5.0)
                 # enable='between(t,0,5)' -> The comma inside between(...) is parsed by the enable expression logic, 
                 # usually safe, but let's be careful. Actually, inside '...' it might be safe from filter-split,
                 # but let's test. The error was likely the rgba() commas which were NOT quoted.
                 enable_expr = f":enable='between(t,{rel_start},{rel_end})'"
            
            # 5. Font Path Logic
            # Windows paths with backslashes need escaping (C:\Windows -> C\:/Windows) or force forward slash
            # We already did replace("\\", "/") above.
            # But the drive letter colon needs escaping C: -> C\:
            safe_font_path = font_path.replace(":", "\\\\:") 
            
            # 6. Construct Filter String
            # box=1 means a bounding box. 
            # boxborderw=5 padding.
            font_arg = f"fontfile='{safe_font_path}'" 
            
            # Critical: Ensure every parameter value with special chars is wrapped or escaped
            drawtext_cmd = (
                f"drawtext="
                f"{font_arg}:"
                f"text='{clean_text}':"
                f"fontcolor={font_color_str}:"
                f"fontsize=h/20:"
                f"x=(w*{x_val})-(tw/2):"
                f"y=(h*{y_val})-(th/2):"  # Use Y from prop
                f"box=1:"
                f"boxcolor={bg_color}:"
                f"boxborderw=20"          # Increased padding for modern look
                f"{enable_expr}"
            )
            
            if input_idx == 1:
                 # Applying to raw input
                 filter_chain.append(f"[0:v]{drawtext_cmd}[output]")
                 current_v_label = "output"
            else:
                 # Chaining
                 filter_chain.append(f"[{current_v_label}]{drawtext_cmd}[output]")
                 current_v_label = "output"

        # Make sure we have an output label
        if current_v_label != "output":
             # We should probably assign the last label to [output] for simplicity
             # But if filter chain is empty (no overlays), we just copy
             pass 

        background_audio = request.background_audio if request.background_audio and request.background_audio.enabled else None
        audio_filter_chain = []
        has_main_audio = has_audio_stream(working_path)

        if background_audio and background_audio.url:
            background_audio_source = str(background_audio.url).strip()
            if background_audio_source:
                if background_audio_source.startswith("http"):
                    downloaded_background_audio_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_bg_audio.mp3")
                    await run_subprocess_async(
                        [
                            "ffmpeg",
                            "-user_agent",
                            "Mozilla/5.0",
                            "-i",
                            background_audio_source,
                            "-vn",
                            "-c:a",
                            "libmp3lame",
                            "-b:a",
                            "192k",
                            "-y",
                            downloaded_background_audio_path,
                        ],
                        check=True,
                        job_context=job_id,
                    )
                    background_audio_source = downloaded_background_audio_path

                trim_start = max(0.0, float(background_audio.trim_start or 0.0))
                input_args = ["-stream_loop", "-1"]
                if trim_start > 0:
                    input_args.extend(["-ss", str(trim_start)])
                input_args.extend(["-i", background_audio_source])
                inputs.extend(input_args)
                background_audio_idx = input_idx
                input_idx += 1

                bg_volume = clamp_float(background_audio.volume, 0.0, 1.5)
                background_audio_mode = str(background_audio.mode or "mix").strip().lower()
                if background_audio_mode not in {"mix", "replace", "duck_original"}:
                    background_audio_mode = "mix"
                ducking_strength = clamp_float(background_audio.ducking_strength, 0.15, 0.95)
                audio_filter_chain.append(f"[{background_audio_idx}:a]volume={bg_volume}[bg_track]")
                if has_main_audio:
                    if background_audio_mode == "replace":
                        audio_filter_chain.append("[bg_track]anull[a_mix]")
                    elif background_audio_mode == "duck_original":
                        main_gain = max(0.05, 1.0 - ducking_strength)
                        audio_filter_chain.append(f"[0:a]volume={main_gain:.2f}[main_ducked]")
                        audio_filter_chain.append(
                            f"[main_ducked][bg_track]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[a_mix]"
                        )
                    else:
                        audio_filter_chain.append(
                            f"[0:a][bg_track]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[a_mix]"
                        )
                else:
                    audio_filter_chain.append("[bg_track]anull[a_mix]")

        # Build Command
        cmd = ["ffmpeg"]
        cmd.extend(inputs)

        if not filter_chain and not audio_filter_chain:
             # Just Trim? We already trimmed. So this is a no-op / copy.
             cmd.extend(["-c", "copy", "-y", output_path])
        else:
             # Handle case where output label was not set (e.g., intermediate filters)
             if current_v_label != "output":
                 # Alias the last label to [output]
                 filter_chain.append(f"[{current_v_label}]null[output]")

             # Join filter chain with semicolons
             complex_filter = ";".join(filter_chain + audio_filter_chain)
             if complex_filter:
                 cmd.extend(["-filter_complex", complex_filter])

             if filter_chain:
                 cmd.extend(["-map", "[output]"])
             else:
                 cmd.extend(["-map", "0:v:0"])

             if audio_filter_chain:
                 cmd.extend(["-map", "[a_mix]", "-c:a", "aac"])
             else:
                 cmd.extend(["-map", "0:a?", "-c:a", "copy"])

             cmd.extend(["-shortest", "-c:v", "libx264", "-y", output_path])
        
        logger.info(f"Running FFmpeg: {' '.join(cmd)}")
        await run_subprocess_async(cmd, check=True)

        if os.path.exists(output_path):
            public_url = upload_file_to_firebase(output_path)
            cover_frame_request = request.thumbnail_frame or request.cover_frame
            thumbnail_url = None
            cover_frame_result = None
            thumbnail_frame_result = None

            if cover_frame_request:
                requested_timeline_time = clamp_float(
                    float(cover_frame_request.timelineTime or 0.0),
                    0.0,
                    max(0.0, float(request.end_time or 0.0) - float(request.start_time or 0.0)),
                )
                thumbnail_seek_time = round(max(0.0, requested_timeline_time), 3)
                try:
                    await run_subprocess_async(
                        [
                            "ffmpeg",
                            "-ss",
                            str(thumbnail_seek_time),
                            "-i",
                            output_path,
                            "-frames:v",
                            "1",
                            "-q:v",
                            "2",
                            "-y",
                            thumbnail_output_path,
                        ],
                        check=True,
                    )
                    if os.path.exists(thumbnail_output_path):
                        thumbnail_destination = f"processed/thumbnails/{job_id}_cover.jpg"
                        thumbnail_url = upload_file_to_firebase(
                            thumbnail_output_path,
                            destination_path=thumbnail_destination,
                        )
                except Exception as thumbnail_error:
                    logger.error(f"Thumbnail extraction failed: {thumbnail_error}")

                cover_frame_result = {
                    "timeline_time": requested_timeline_time,
                    "source_time": float(cover_frame_request.sourceTime or 0.0),
                    "clip_id": str(cover_frame_request.clipId) if cover_frame_request.clipId is not None else None,
                    "focus_point": (
                        {
                            "x": clamp_float(float(cover_frame_request.focusPoint.x), 0.0, 100.0),
                            "y": clamp_float(float(cover_frame_request.focusPoint.y), 0.0, 100.0),
                        }
                        if cover_frame_request.focusPoint
                        else None
                    ),
                    "template": cover_frame_request.template,
                    "freeze_frame": bool(cover_frame_request.freezeFrame),
                    "strategy": cover_frame_request.strategy,
                    "thumbnail_url": thumbnail_url,
                }
                thumbnail_frame_result = {
                    **cover_frame_result,
                    "purpose": cover_frame_request.purpose or "thumbnail",
                }
            
            result_data = {
                "status": "completed", 
                "job_id": job_id, 
                "output_path": output_path,
                "output_url": public_url,
                "thumbnail_url": thumbnail_url,
                "cover_frame": cover_frame_result,
                "thumbnail_frame": thumbnail_frame_result,
            }
            
            if request.async_mode:
                 update_firestore_job(job_id, result_data)

            return result_data
        else:
             err_msg = "Output viral video not generated"
             if request.async_mode:
                  update_firestore_job(job_id, {"status": "failed", "error": err_msg})
             raise Exception(err_msg)

    except Exception as e:
        logger.error(f"Render Viral Error: {e}")
        if request.async_mode:
             update_firestore_job(job_id, {"status": "failed", "error": str(e)})

        # Cleanup
        if os.path.exists(trimmed_path): os.remove(trimmed_path)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup inputs
        if os.path.exists(input_path): os.remove(input_path)
        if downloaded_background_audio_path and os.path.exists(downloaded_background_audio_path):
            os.remove(downloaded_background_audio_path)
        if os.path.exists(thumbnail_output_path):
            os.remove(thumbnail_output_path)

@app.post("/transcribe")
async def transcribe_video(request: Dict[str, str]):
    """
    Stand-alone endpoint to transcribe a video URL using Whisper.
    Returns JSON with segments: [{start, end, text}, ...]
    """
    video_url = request.get("video_url")
    if not video_url:
        raise HTTPException(status_code=400, detail="video_url is required")
        
    logger.info(f"Transcribing video: {video_url}")
    
    job_id = str(uuid.uuid4())
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR):
        os.makedirs(SHARED_TMP_DIR)

    input_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_input.mp4")

    try:
        # 1. Download Video
        if video_url.startswith("http"):
            subprocess.run(["ffmpeg", "-i", video_url, "-c", "copy", "-y", input_path], check=True)
        else:
            # If local path?
            if os.path.exists(video_url):
                 input_path = video_url
            else:
                 raise HTTPException(status_code=404, detail="File not found")

        # 2. Transcribe
        result = transcribe_with_hints(
            input_path,
            word_timestamps=True,
            language=request.get("language"),
            prompt_hint=request.get("hint") or request.get("prompt_hint") or "",
        )
        segments = result.get("segments", [])
        
        # Cleanup
        if input_path != video_url and os.path.exists(input_path):
            try: os.remove(input_path) 
            except: pass
            
        return {"status": "completed", "segments": segments}

    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    # Use PORT env var for Render/Heroku support, default to 8000 for localhost
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
