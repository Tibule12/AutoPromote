from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks, Request, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
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
import json
import re  # Added for parsing silence output
import hashlib
import urllib.request
import warnings
import cv2  # OpenCV (Phase 1)
import numpy as np
import ffmpeg  # FFmpeg (Phase 1)
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import firebase_admin
from firebase_admin import credentials, storage, firestore
from scenedetect import SceneManager, open_video
from scenedetect.detectors import ContentDetector
from dotenv import load_dotenv

# Fix asyncio event loop policy for Windows (Enable Proactor for Subprocesses)
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# Load env vars from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

# Torch may probe CUDA even when we intentionally run Whisper on CPU.
# Ignore the stale-driver warning so local logs stay focused on real failures.
warnings.filterwarnings(
    "ignore",
    message=r"CUDA initialization: The NVIDIA driver on your system is too old.*",
    category=UserWarning,
)


def _build_firebase_cert_from_env():
    raw_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    raw_b64 = os.getenv("FIREBASE_SERVICE_ACCOUNT_BASE64")
    if raw_json:
        try:
            parsed = json.loads(raw_json)
            if parsed.get("private_key"):
                parsed["private_key"] = parsed["private_key"].replace("\\n", "\n")
            return parsed
        except Exception:
            pass
    if raw_b64:
        try:
            parsed = json.loads(base64.b64decode(raw_b64).decode("utf-8"))
            if parsed.get("private_key"):
                parsed["private_key"] = parsed["private_key"].replace("\\n", "\n")
            return parsed
        except Exception:
            pass

    project_id = os.getenv("FIREBASE_PROJECT_ID")
    private_key = os.getenv("FIREBASE_PRIVATE_KEY")
    client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
    if project_id and private_key and client_email:
        return {
            "type": "service_account",
            "project_id": project_id,
            "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID", ""),
            "private_key": private_key.replace("\\n", "\n").strip('"'),
            "client_email": client_email,
            "client_id": os.getenv("FIREBASE_CLIENT_ID", ""),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": os.getenv("FIREBASE_CLIENT_X509_CERT_URL", ""),
        }
    return None


try:
    if not firebase_admin._apps:
        key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if key_path and not os.path.exists(key_path):
            key_path = None

        if not key_path:
            possible_keys = [
                "serviceAccountKey.json",
                "service-account-key.json",
                "firebase-admin.json",
                "autopromote-firebase-adminsdk.json",
            ]

            search_paths = [
                "service-account-key.json",
                "serviceAccountKey.json",
                "../service-account-key.json",
                "../serviceAccountKey.json",
                os.path.join(os.path.dirname(__file__), "service-account-key.json"),
                os.path.join(os.path.dirname(__file__), "../service-account-key.json"),
            ]

            for path in search_paths:
                full_path = os.path.abspath(path)
                if os.path.exists(full_path):
                    key_path = full_path
                    break

            if not key_path:
                start_dirs = [".", os.path.dirname(__file__), os.path.join(os.path.dirname(__file__), "..")]
                for search_dir in start_dirs:
                    if not os.path.exists(search_dir):
                        continue
                    for root, dirs, files in os.walk(search_dir):
                        for name in files:
                            if name in possible_keys:
                                key_path = os.path.abspath(os.path.join(root, name))
                                break
                        if key_path:
                            break
                    if key_path:
                        break

        firebase_options = {
            "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", "autopromote-cc6d3.firebasestorage.app")
        }

        if key_path and os.path.exists(key_path):
            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred, firebase_options)
            logging.info(f"Firebase Admin initialized with key: {key_path}")
        else:
            env_cert = _build_firebase_cert_from_env()
            if env_cert:
                cred = credentials.Certificate(env_cert)
                firebase_admin.initialize_app(cred, firebase_options)
                logging.info("Firebase Admin initialized with env credentials")
            else:
                firebase_admin.initialize_app(options=firebase_options)
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


def env_flag(name, default=False):
    raw_value = str(os.getenv(name, "true" if default else "false")).strip().lower()
    return raw_value in {"1", "true", "yes", "on"}


IS_PRODUCTION_ENV = str(os.getenv("NODE_ENV") or os.getenv("ENVIRONMENT") or "").strip().lower() == "production"
LOCAL_MEDIA_OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp/worker_outputs"))
LOCAL_MEDIA_OUTPUT_BASE_URL = str(os.getenv("LOCAL_MEDIA_OUTPUT_BASE_URL", "http://127.0.0.1:8000")).rstrip("/")
ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK = env_flag(
    "ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK",
    default=not IS_PRODUCTION_ENV,
)

FIREBASE_STATUS_UPDATES_ENABLED = bool(firebase_admin._apps)
MEDIA_WORKER_TASK_SECRET = os.getenv("MEDIA_WORKER_TASK_SECRET", "")
if IS_PRODUCTION_ENV and not MEDIA_WORKER_TASK_SECRET:
    logger.warning("MEDIA_WORKER_TASK_SECRET is not set in production — task endpoints are unprotected!")

# Initialize Whisper model cache (lazy load)
# 'tiny' is fast but less accurate. 'base' or 'small' are better for production.
# We will load it on first request to avoid slow startup.
model_whisper = {}
AI_RERANK_BACKOFF_UNTIL = 0.0


def get_whisper_device():
    configured = str(os.getenv("WHISPER_DEVICE", "cpu")).strip().lower()
    return configured or "cpu"

def get_whisper_model(model_name=None):
    global model_whisper
    if whisper is None:
        return None

    resolved_model_name = str(model_name or os.getenv("WHISPER_MODEL", "small")).strip().lower() or "small"
    cache_key = f"{get_whisper_device()}::{resolved_model_name}"
    cached = model_whisper.get(cache_key)
    if cached is not None:
        return cached

    device = get_whisper_device()
    logger.info(f"Loading Whisper model ({resolved_model_name}) on {device}...")
    loaded = whisper.load_model(resolved_model_name, device=device)
    model_whisper[cache_key] = loaded
    return loaded


def get_promo_whisper_model_name():
    configured = str(os.getenv("PROMO_WHISPER_MODEL", "base")).strip().lower()
    return configured or "base"

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

def _detect_gpu_encoder():
    """Check if NVIDIA NVENC is available for GPU-accelerated encoding."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True, text=True, timeout=10,
        )
        if "h264_nvenc" in result.stdout:
            return "h264_nvenc"
    except Exception:
        pass
    return "libx264"

GPU_VIDEO_ENCODER = _detect_gpu_encoder()
GPU_PRESET = "p4" if GPU_VIDEO_ENCODER == "h264_nvenc" else "fast"
GPU_CQ = "23"  # Constant quality for NVENC

logger.info(f"Video encoder: {GPU_VIDEO_ENCODER} (preset={GPU_PRESET})")

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


def media_has_audio_stream(input_path):
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
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
        return "audio" in result.stdout.lower()
    except Exception:
        return False

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


def detect_content_type(input_path, audio_energy=None):
    """Classify content: choir, podcast, music, speech, performance, demo, etc."""
    content_type = "general"
    confidence = 0.5
    hints = []

    # 1. Check for singing/music via ffprobe audio analysis
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries",
             "format=duration:format_tags=title",
             "-of", "json", input_path],
            capture_output=True, text=True, timeout=15,
        )
        meta = json.loads(result.stdout).get("format", {})
        duration = float(meta.get("duration", 0))
        title = str(meta.get("tags", {}).get("title", "")).lower()
        if any(word in title for word in ["choir", "worship", "praise", "hymn", "gospel"]):
            content_type = "choir_performance"
            confidence = 0.7
            hints.append("title_keywords")
    except Exception:
        pass

    # 2. Audio energy pattern analysis
    if audio_energy and isinstance(audio_energy, list) and len(audio_energy) > 10:
        import numpy as np
        energy_arr = np.array(audio_energy, dtype=np.float64)
        mean_e = float(np.mean(energy_arr))
        std_e = float(np.std(energy_arr))
        high_energy_ratio = float(np.sum(energy_arr > mean_e + std_e) / max(1, len(energy_arr)))

        # High sustained energy + variation → music/performance
        if mean_e > 0.5 and std_e < 0.2 and high_energy_ratio > 0.6:
            if content_type == "general":
                content_type = "music_performance"
                confidence = 0.65
                hints.append("sustained_energy")
        # Medium energy with high variation → speech/conversation
        elif 0.2 < mean_e < 0.7 and std_e > 0.15:
            if content_type == "general":
                content_type = "podcast_conversation"
                confidence = 0.6
                hints.append("speech_pattern")
        # Very low energy → tutorial/demo
        elif mean_e < 0.2:
            if content_type == "general":
                content_type = "tutorial_demo"
                confidence = 0.55
                hints.append("low_energy")
        # High peaks → motivational/performance
        if high_energy_ratio < 0.3 and mean_e > 0.3:
            hints.append("peak_moments")

    return {"contentType": content_type, "confidence": round(confidence, 3), "hints": hints}


# Caption style by content type
CONTENT_CAPTION_STYLES = {
    "choir_performance": {"mode": "performance_vibe", "tone": "uplifting", "emoji": "🎵✨🙌"},
    "music_performance": {"mode": "performance_vibe", "tone": "energetic", "emoji": "🔥🎶💫"},
    "podcast_conversation": {"mode": "accurate_subtitles", "tone": "conversational", "emoji": "💬🎙️"},
    "tutorial_demo": {"mode": "educational_hook", "tone": "helpful", "emoji": "📚💡"},
    "motivational_speech": {"mode": "creative_social", "tone": "inspiring", "emoji": "💪🔥"},
    "general": {"mode": "creative_social", "tone": "engaging", "emoji": "✨"},
}

async def materialize_video_input(video_url, local_path):
    source = str(video_url or "").strip()
    if not source:
        raise HTTPException(status_code=400, detail="video_url is required")

    resolved_local_path = local_path

    async def probe_duration_async(target):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, get_media_duration, target)

    async def validate_materialized_file(candidate_path, expected_duration, stage_label, transfer_log=""):
        if not os.path.exists(candidate_path) or os.path.getsize(candidate_path) < 1024:
            raise ValueError(f"{stage_label} produced an empty or tiny file")

        materialized_duration = await probe_duration_async(candidate_path)
        if materialized_duration <= 0.0:
            raise ValueError(f"{stage_label} produced an unreadable or zero-duration file")

        log_text = str(transfer_log or "").lower()
        partial_transfer_markers = (
            "partial file",
            "error in the pull function",
            "io error: end of file",
            "end of file",
        )
        if any(marker in log_text for marker in partial_transfer_markers):
            raise ValueError(f"{stage_label} reported a partial transfer while downloading the source")

        if expected_duration > 0.0:
            tolerance_seconds = max(2.0, expected_duration * 0.03)
            if materialized_duration + tolerance_seconds < expected_duration:
                raise ValueError(
                    f"{stage_label} truncated the source "
                    f"({materialized_duration:.2f}s vs expected {expected_duration:.2f}s)"
                )

        return materialized_duration

    # Only infer an extension when the caller gave us an extensionless temp path.
    source_ext = os.path.splitext(source.split("?")[0])[1].lower()
    local_ext = os.path.splitext(local_path)[1].lower()
    if (
        not local_ext
        and source_ext in {".wav", ".mp3", ".aac", ".mp4", ".mov", ".mkv", ".webm", ".m4v", ".flac", ".ogg", ".m4a"}
    ):
        resolved_local_path = local_path + source_ext

    # Security: only allow http/https URLs — reject local file paths and file:// URIs
    if source.startswith("http://") or source.startswith("https://"):
        expected_source_duration = await probe_duration_async(source)
        try:
            ffmpeg_result = await run_subprocess_async(
                [
                    "ffmpeg",
                    "-nostdin",
                    "-user_agent",
                    "Mozilla/5.0",
                    "-i",
                    source,
                    "-c",
                    "copy",
                    "-y",
                    resolved_local_path,
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            await validate_materialized_file(
                resolved_local_path,
                expected_source_duration,
                "ffmpeg URL ingest",
                ffmpeg_result.stderr,
            )
        except Exception as ffmpeg_error:
            logger.warning(f"ffmpeg URL ingest failed, falling back to HTTP download: {ffmpeg_error}")
            try:
                if os.path.exists(resolved_local_path):
                    os.remove(resolved_local_path)
            except OSError:
                pass

            def download_http_source():
                partial_path = resolved_local_path + ".part"
                if os.path.exists(partial_path):
                    os.remove(partial_path)
                request = urllib.request.Request(
                    source,
                    headers={
                        "User-Agent": "Mozilla/5.0",
                        "Accept": "video/*,application/octet-stream,*/*",
                    },
                )
                try:
                    with urllib.request.urlopen(request, timeout=90) as response:
                        with open(partial_path, "wb") as output:
                            shutil.copyfileobj(response, output)
                    os.replace(partial_path, resolved_local_path)
                finally:
                    if os.path.exists(partial_path):
                        try:
                            os.remove(partial_path)
                        except OSError:
                            pass

            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, download_http_source)
                await validate_materialized_file(
                    resolved_local_path,
                    expected_source_duration,
                    "HTTP download fallback",
                )
            except Exception as download_error:
                raise HTTPException(
                    status_code=422,
                    detail=f"Could not download source video for analysis: {download_error}",
                )
        return resolved_local_path

    # In production, never accept local paths
    if IS_PRODUCTION_ENV:
        raise HTTPException(status_code=400, detail="Only http/https URLs are accepted for video_url")

    # Development only: allow local paths within the tmp directory
    absolute_source = os.path.abspath(source)
    allowed_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tmp"))
    if not absolute_source.startswith(allowed_dir + os.sep):
        raise HTTPException(status_code=400, detail="Local paths must be within the tmp directory")
    if not os.path.exists(absolute_source):
        raise HTTPException(status_code=404, detail=f"Input video not found: {absolute_source}")

    if absolute_source != os.path.abspath(resolved_local_path):
        shutil.copy2(absolute_source, resolved_local_path)
    return resolved_local_path


def get_local_media_cache_dir():
    cache_dir = os.getenv(
        "LOCAL_MEDIA_JOB_CACHE_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp/media-job-cache")),
    )
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir


def build_media_cache_key(source_url, cache_key=None):
    raw_key = str(cache_key or source_url or "").strip()
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:32]


async def materialize_cached_media_input(source_url, local_path, cache_key=None):
    source = str(source_url or "").strip()
    if not source:
        raise HTTPException(status_code=400, detail="source_url is required")

    extension = os.path.splitext(str(cache_key or source).split("?")[0])[1] or os.path.splitext(local_path)[1] or ".bin"
    cache_path = os.path.join(get_local_media_cache_dir(), f"{build_media_cache_key(source, cache_key)}{extension}")

    if not IS_PRODUCTION_ENV and os.path.exists(cache_path) and os.path.getsize(cache_path) > 1024:
        logger.info(f"Using cached local media for clean-audio sync: {cache_path}")
        shutil.copy2(cache_path, local_path)
        return local_path

    resolved_local_path = await materialize_video_input(source, local_path)

    if not IS_PRODUCTION_ENV and os.path.exists(resolved_local_path) and os.path.getsize(resolved_local_path) > 1024:
        try:
            shutil.copy2(resolved_local_path, cache_path)
            logger.info(f"Cached local media for repeat dev sync tests: {cache_path}")
        except Exception as cache_error:
            logger.warning(f"Could not cache local media input: {cache_error}")

    return resolved_local_path

    return local_path


async def create_promo_analysis_copy(input_path, output_path):
    """
    Normalize promo-analysis sources to a sane frame rate and size before
    Whisper, scene detection, and motion scoring. This protects the analysis
    path from pathological uploads while leaving final renders on the original.
    """
    await run_subprocess_async(
        [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-vf",
            "fps=30,scale='min(1280,iw)':-2:flags=lanczos",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "29",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-ac",
            "1",
            "-ar",
            "44100",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            output_path,
        ],
        check=True,
    )
    return output_path

def build_transcription_prompt(extra_hint=""):
    base = (
        "Transcribe spoken dialogue accurately. Prefer South African English spellings and names "
        "when the accent suggests it. Handle South African English, Afrikaans, isiZulu, isiXhosa, "
        "Sesotho, and Tswana carefully. Ignore background music, filler noise, and invented narration."
    )
    hint = str(extra_hint or "").strip()
    return f"{base} {hint}".strip()

def transcribe_with_hints(file_path, *, word_timestamps=False, language=None, prompt_hint="", task=None, model_name=None):
    model = get_whisper_model(model_name=model_name)
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


LOW_SIGNAL_TRANSCRIPT_TOKENS = {
    "yeah", "oh", "ah", "uh", "um", "la", "na", "hey", "woo", "ooh", "mmm",
}


def normalize_transcript_text(value):
    return re.sub(r"\s+", " ", str(value or "").strip())


def estimate_transcript_segment_confidence(segment):
    text = normalize_transcript_text(segment.get("text"))
    if not text:
        return 0.0

    words = re.findall(r"[a-zA-Z']+", text.lower())
    word_count = len(words)
    unique_ratio = (len(set(words)) / word_count) if word_count else 0.0
    filler_ratio = (
        sum(1 for word in words if word in LOW_SIGNAL_TRANSCRIPT_TOKENS) / word_count
        if word_count
        else 1.0
    )

    try:
        avg_logprob = float(segment.get("avg_logprob", -1.1) or -1.1)
    except Exception:
        avg_logprob = -1.1
    try:
        no_speech_prob = float(segment.get("no_speech_prob", 0.0) or 0.0)
    except Exception:
        no_speech_prob = 0.0
    try:
        compression_ratio = float(segment.get("compression_ratio", 1.0) or 1.0)
    except Exception:
        compression_ratio = 1.0

    confidence = 0.52
    if avg_logprob >= -0.45:
        confidence += 0.22
    elif avg_logprob >= -0.8:
        confidence += 0.08
    else:
        confidence -= 0.14

    if no_speech_prob <= 0.18:
        confidence += 0.1
    elif no_speech_prob >= 0.55:
        confidence -= 0.18

    if compression_ratio >= 2.5:
        confidence -= 0.12
    elif compression_ratio <= 1.75:
        confidence += 0.04

    if word_count < 3:
        confidence -= 0.12
    elif word_count >= 7:
        confidence += 0.05

    if unique_ratio < 0.45 and word_count >= 5:
        confidence -= 0.14
    elif unique_ratio >= 0.72 and word_count >= 5:
        confidence += 0.06

    if filler_ratio >= 0.45:
        confidence -= 0.2
    elif filler_ratio <= 0.1 and word_count >= 4:
        confidence += 0.04

    if re.search(r"(.)\1{5,}", text):
        confidence -= 0.12

    return round(max(0.0, min(1.0, confidence)), 3)


def annotate_transcription_segments(transcription_segments):
    annotated = []
    for segment in transcription_segments or []:
        updated = dict(segment)
        updated["text"] = normalize_transcript_text(updated.get("text"))
        updated["transcriptConfidence"] = estimate_transcript_segment_confidence(updated)
        annotated.append(updated)
    return annotated


def summarize_transcript_quality(transcription_segments, content_type="general"):
    segments = list(transcription_segments or [])
    if not segments:
        return {
            "averageConfidence": 0.0,
            "reliableSegmentRatio": 0.0,
            "reliableSegmentCount": 0,
            "coverageSeconds": 0.0,
            "allowTranscriptWindows": False,
            "speechEvidenceThreshold": 0.62,
            "analysisMode": "no_transcript",
        }

    music_like = content_type in {"choir_performance", "music_performance"}
    reliable_threshold = 0.72 if music_like else 0.58
    speech_threshold = 0.76 if music_like else 0.62

    weighted_total = 0.0
    duration_total = 0.0
    reliable_count = 0
    reliable_duration = 0.0

    for segment in segments:
        start = float(segment.get("start", 0) or 0)
        end = float(segment.get("end", 0) or 0)
        duration = max(0.0, end - start)
        confidence = float(segment.get("transcriptConfidence", 0.0) or 0.0)
        weighted_total += confidence * max(duration, 0.25)
        duration_total += max(duration, 0.25)
        if confidence >= reliable_threshold:
            reliable_count += 1
            reliable_duration += duration

    average_confidence = weighted_total / max(duration_total, 0.25)
    reliable_ratio = reliable_duration / max(duration_total, 0.25)
    allow_transcript_windows = reliable_count >= (2 if music_like else 1) and reliable_ratio >= (0.22 if music_like else 0.12)

    if average_confidence >= speech_threshold and allow_transcript_windows:
        analysis_mode = "speech_trusted"
    elif allow_transcript_windows:
        analysis_mode = "speech_limited"
    else:
        analysis_mode = "visual_priority"

    return {
        "averageConfidence": round(average_confidence, 3),
        "reliableSegmentRatio": round(reliable_ratio, 3),
        "reliableSegmentCount": reliable_count,
        "coverageSeconds": round(duration_total, 2),
        "allowTranscriptWindows": allow_transcript_windows,
        "speechEvidenceThreshold": speech_threshold,
        "analysisMode": analysis_mode,
    }

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

def build_transcript_windows(
    transcription_segments,
    keyword_weights,
    *,
    min_segment_confidence=0.42,
    min_window_confidence=0.52,
):
    if not transcription_segments:
        return []

    windows = []
    current = None
    for segment in transcription_segments:
        start = float(segment.get("start", 0) or 0)
        end = float(segment.get("end", 0) or 0)
        text = str(segment.get("text", "") or "").strip()
        confidence = float(segment.get("transcriptConfidence", 0.0) or 0.0)
        if end <= start or not text or confidence < min_segment_confidence:
            continue

        if not current:
            current = {
                "start": start,
                "end": end,
                "texts": [text],
                "segments": [segment],
                "confidenceSamples": [confidence],
            }
            continue

        gap = start - current["end"]
        proposed_duration = end - current["start"]
        if gap <= 1.2 and proposed_duration <= 36:
            current["end"] = end
            current["texts"].append(text)
            current["segments"].append(segment)
            current["confidenceSamples"].append(confidence)
        else:
            windows.append(current)
            current = {
                "start": start,
                "end": end,
                "texts": [text],
                "segments": [segment],
                "confidenceSamples": [confidence],
            }

    if current:
        windows.append(current)

    ranked = []
    for index, window in enumerate(windows):
        duration = window["end"] - window["start"]
        if duration < 6:
            continue
        window_confidence = sum(window["confidenceSamples"]) / max(1, len(window["confidenceSamples"]))
        if window_confidence < min_window_confidence:
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
            "transcriptConfidence": round(window_confidence, 3),
        })
    return ranked


def build_podcast_candidate_pool(
    transcription_segments,
    keyword_weights,
    *,
    audio_energy=None,
    target_duration=60,
    source_duration=None,
    min_segment_confidence=0.5,
):
    segments = [dict(segment) for segment in (transcription_segments or [])]
    if not segments:
        return [], {
            "averageConfidence": 0.0,
            "reliableSegmentRatio": 0.0,
            "reliableSegmentCount": 0,
            "coverageSeconds": 0.0,
            "allowTranscriptWindows": False,
            "speechEvidenceThreshold": 0.62,
            "analysisMode": "no_transcript",
        }

    annotated_segments = annotate_transcription_segments(segments)
    transcript_quality = summarize_transcript_quality(
        annotated_segments,
        content_type="podcast_conversation",
    )

    sentence_break = re.compile(r"[.!?…:]\s*$")

    def local_audio_energy(start, end):
        if not audio_energy:
            return 0.0, -99.0
        values = [float(value) for timestamp, value in audio_energy if float(timestamp) >= start and float(timestamp) <= end]
        if not values:
            return 0.0, -99.0
        return sum(values) / len(values), max(values)

    windows = []
    current = None
    max_window_duration = max(18.0, min(42.0, float(target_duration or 60.0) * 0.42))

    for index, segment in enumerate(annotated_segments):
        start = float(segment.get("start", 0.0) or 0.0)
        end = float(segment.get("end", 0.0) or 0.0)
        text = normalize_transcript_text(segment.get("text"))
        confidence = float(segment.get("transcriptConfidence", 0.0) or 0.0)
        if end <= start or not text or confidence < min_segment_confidence:
            continue

        next_segment = annotated_segments[index + 1] if index + 1 < len(annotated_segments) else None
        next_gap = (
            max(0.0, float(next_segment.get("start", end) or end) - end)
            if next_segment
            else 9.0
        )

        if not current:
            current = {
                "start": start,
                "end": end,
                "texts": [text],
                "segments": [segment],
                "confidenceSamples": [confidence],
                "closingPause": next_gap,
            }
        else:
            gap = max(0.0, start - float(current["end"]))
            proposed_duration = end - float(current["start"])
            current_text = " ".join(current["texts"]).strip()
            natural_break = (
                gap >= 0.95
                or (gap >= 0.45 and sentence_break.search(current_text))
                or proposed_duration >= max_window_duration
            )
            if natural_break:
                windows.append(current)
                current = {
                    "start": start,
                    "end": end,
                    "texts": [text],
                    "segments": [segment],
                    "confidenceSamples": [confidence],
                    "closingPause": next_gap,
                }
            else:
                current["end"] = end
                current["texts"].append(text)
                current["segments"].append(segment)
                current["confidenceSamples"].append(confidence)
                current["closingPause"] = next_gap

        if current:
            current_duration = float(current["end"]) - float(current["start"])
            current_text = " ".join(current["texts"]).strip()
            if current_duration >= 12.0 and current["closingPause"] >= 0.75 and sentence_break.search(current_text):
                windows.append(current)
                current = None

    if current:
        windows.append(current)

    candidates = []
    for index, window in enumerate(windows):
        duration = float(window["end"]) - float(window["start"])
        if duration < 8.0:
            continue

        text = " ".join(window["texts"]).strip()
        if len(text.split()) < 6:
            continue

        window_confidence = sum(window["confidenceSamples"]) / max(1, len(window["confidenceSamples"]))
        if window_confidence < max(0.56, float(transcript_quality.get("speechEvidenceThreshold", 0.62) or 0.62) - 0.08):
            continue

        keyword_boost, found_keywords = score_text_for_virality(text, keyword_weights)
        avg_energy, peak_energy = local_audio_energy(float(window["start"]), float(window["end"]))

        score = 62.0
        score += min(18.0, window_confidence * 18.0)
        score += min(16.0, keyword_boost * 0.45)
        score += 6.0 if 12.0 <= duration <= 28.0 else 2.0 if duration <= 36.0 else -4.0
        score += 5.0 if window["closingPause"] >= 0.75 else 2.0 if window["closingPause"] >= 0.4 else 0.0
        score += 4.0 if re.search(r"\?", text) else 0.0
        score += 4.0 if re.search(r"\b(but|however|then|so|because|instead|actually)\b", text.lower()) else 0.0
        score += min(7.0, max(0.0, (avg_energy + 32.0) * 0.45)) if peak_energy > -99 else 0.0

        reason_bits = ["Podcast speech window"]
        if found_keywords:
            reason_bits.append(f"Keywords: {', '.join(found_keywords[:3])}")
        if window["closingPause"] >= 0.75:
            reason_bits.append("clean pause landing")
        if re.search(r"\?", text):
            reason_bits.append("question tension")
        if peak_energy > -18:
            reason_bits.append("audio emphasis")

        candidates.append(
            {
                "id": f"podcast_speech_{index}",
                "start": round(float(window["start"]), 2),
                "end": round(float(window["end"]), 2),
                "duration": round(duration, 2),
                "viralScore": round(min(99.0, score), 2),
                "reason": " + ".join(reason_bits),
                "text": text[:280] + ("..." if len(text) > 280 else ""),
                "source": "podcast_transcript_window",
                "transcriptConfidence": round(window_confidence, 3),
                "speechTrusted": window_confidence >= float(transcript_quality.get("speechEvidenceThreshold", 0.62) or 0.62),
                "contentType": "podcast_conversation",
            }
        )

    deduped = dedupe_ranked_candidates(
        candidates,
        max_results=max(18, min(36, len(candidates) or 18)),
        source_duration=source_duration,
    )
    return deduped, transcript_quality

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

def dedupe_ranked_candidates(candidates, max_results=15, source_duration=None):
    # Add position diversity: clips from later in the video get a stronger bonus
    # so Smart Promo doesn't only pick from the first minute
    if source_duration and source_duration > 30:
        for c in candidates:
            pos = float(c.get("start", 0))
            dur = float(source_duration)
            # Stronger bonus: +1 at start, up to +18 at the very end
            position_bonus = 1.0 + (pos / max(dur, 1)) * 17.0
            # Extra penalty for clips in the first 5% of video
            if pos < dur * 0.05 and float(c.get("viralScore", 0)) < 80:
                position_bonus = -5.0
            c["viralScore"] = float(c.get("viralScore", 0)) + position_bonus
            c["positionBonus"] = round(position_bonus, 1)
    ordered = sorted(candidates, key=lambda item: item.get("viralScore", 0), reverse=True)
    selected = []
    min_gap = max(25.0, min(90.0, (source_duration or 120) * 0.025)) if source_duration else 30.0
    for candidate in ordered:
        too_close = False
        for existing in selected:
            latest_start = max(candidate["start"], existing["start"])
            earliest_end = min(candidate["end"], existing["end"])
            overlap = max(0.0, earliest_end - latest_start)
            smaller = max(1.0, min(candidate["duration"], existing["duration"]))
            if overlap / smaller >= 0.6:
                too_close = True
                break
            # Also check minimum gap between clips
            gap_before = abs(candidate["start"] - existing["end"])
            gap_after = abs(existing["start"] - candidate["end"])
            if min(gap_before, gap_after) < min_gap:
                too_close = True
                break
        # Penalize clips starting too close to 0:00 unless they're exceptional
        if float(candidate.get("start", 0)) < 3.0 and float(candidate.get("viralScore", 0)) < 75:
            too_close = True
        if not too_close:
            selected.append(candidate)
        if len(selected) >= max_results:
            break
    return selected

def apply_fresh_scan_variation(candidates, scan_nonce=""):
    if not candidates:
        return []
    refreshed = []
    for candidate in candidates:
        updated = dict(candidate)
        if scan_nonce:
            updated["freshScanVariant"] = str(scan_nonce)[-8:]
        updated["freshScanMode"] = "deterministic_refresh"
        refreshed.append(updated)
    return refreshed

def build_short_hook_from_text(text, fallback="Watch This"):
    cleaned = re.sub(r"\s+", " ", str(text or "").strip())
    if not cleaned:
        return fallback
    cleaned = re.sub(r"^[,.;:!?\\-\\s]+", "", cleaned)
    words = cleaned.split()
    hook = " ".join(words[:7]).strip(" ,.;:")
    if len(hook) > 54:
        hook = hook[:54].rsplit(" ", 1)[0]
    return hook.upper() if hook else fallback

def classify_clip_candidate(candidate, audio_energy=None, motion_scores=None):
    text = str(candidate.get("text") or candidate.get("transcript") or "").strip()
    reason = str(candidate.get("reason") or "").strip()
    combined = f"{text} {reason}".lower()
    start = float(candidate.get("start", 0) or 0)
    end = float(candidate.get("end", start) or start)
    duration = max(0.1, end - start)
    score = float(candidate.get("viralScore", 0) or 0)
    has_audio = bool(candidate.get("hasAudio", True))
    content_type = str(candidate.get("contentType") or "general").strip()
    transcript_confidence = float(candidate.get("transcriptConfidence", 0.0) or 0.0)
    music_like = content_type in {"choir_performance", "music_performance"}

    segment_energy = [e for t, e in (audio_energy or []) if start <= t <= end]
    segment_motion = [m for t, m in (motion_scores or []) if start <= t <= end]
    peak_energy = max(segment_energy) if segment_energy else -99
    avg_motion = sum(segment_motion) / len(segment_motion) if segment_motion else 0
    peak_motion = max(segment_motion) if segment_motion else 0
    word_count = len(text.split())
    speech_trusted = transcript_confidence >= (0.74 if music_like else 0.58) and word_count >= 4

    proof_markers = ["proof", "result", "works", "feature", "demo", "show", "after", "before", "money", "growth", "revenue", "save"]
    emotion_markers = ["feel", "love", "hate", "shock", "surprise", "pain", "laugh", "cry", "story", "moment", "heart"]
    teach_markers = ["how", "why", "tip", "step", "learn", "mistake", "secret", "tutorial", "explain", "because"]
    authority_markers = ["must", "need", "never", "always", "truth", "system", "strategy", "important", "listen"]

    if not has_audio:
        if peak_motion > 0.12 or score >= 70:
            label = "Visual Hook"
            intent = "Use this as a visual-first clip because the movement or scene change carries the attention."
            hook = "WATCH THIS MOMENT"
            best_for = "Silent scroll, thumbnails, visual promos"
        elif duration > 38:
            label = "Visual Trim"
            intent = "This visual window is usable, but it should be tightened in Studio before publishing."
            hook = "BEST VISUAL MOMENT"
            best_for = "Studio refinement"
        else:
            label = "Visual Beat"
            intent = "A clean visual-only moment that can be packaged with hook text, captions, and a thumbnail."
            hook = "FULL CLIP INSIDE"
            best_for = "Silent video promos"
    elif music_like and (score >= 86 or peak_energy > -13 or peak_motion > 0.18):
        label = "Choir Hero" if content_type == "choir_performance" else "Performance Hero"
        intent = "Lead with this because the performance energy and visual payoff are already doing the hook work."
        hook = build_short_hook_from_text(
            text,
            "POWER IN PRAISE" if content_type == "choir_performance" else "LIVE PERFORMANCE",
        )
        best_for = "TikTok, Reels, live-performance promos"
    elif score >= 88 or peak_energy > -13 or peak_motion > 0.2:
        label = "Hero Clip"
        intent = "Open a campaign with this because it has the strongest attention pressure."
        hook = build_short_hook_from_text(text, "WAIT FOR THIS")
        best_for = "TikTok, Reels, Shorts"
    elif speech_trusted and any(marker in combined for marker in proof_markers):
        label = "Proof Clip"
        intent = "Use this to make the promise believable with a visible or spoken receipt."
        hook = build_short_hook_from_text(text, "HERE IS THE PROOF")
        best_for = "Product promos, LinkedIn, Shorts"
    elif any(marker in combined for marker in emotion_markers):
        label = "Emotional Clip"
        intent = "Let this moment breathe because the human feeling is the hook."
        hook = build_short_hook_from_text(text, "FEEL THIS MOMENT")
        best_for = "Reels, community posts, story promos"
    elif speech_trusted and any(marker in combined for marker in teach_markers):
        label = "Teach Clip"
        intent = "Use this as a value-first short with a clear lesson in the first seconds."
        hook = build_short_hook_from_text(text, "HERE IS THE LESSON")
        best_for = "YouTube Shorts, tutorials, carousels"
    elif speech_trusted and any(marker in combined for marker in authority_markers):
        label = "Authority Clip"
        intent = "Package this as a confident point of view that makes the creator feel trusted."
        hook = build_short_hook_from_text(text, "LISTEN TO THIS")
        best_for = "LinkedIn, YouTube Shorts, expert reels"
    elif music_like:
        label = "Performance Clip"
        intent = "Use this as a performance-first social clip where the energy, crowd, and visuals carry the retention."
        hook = build_short_hook_from_text(
            text,
            "LIVE CHOIR MOMENT" if content_type == "choir_performance" else "FEEL THIS PERFORMANCE",
        )
        best_for = "Reels, Shorts, live-event promos"
    elif duration > 38:
        label = "Trim Candidate"
        intent = "The moment has signal, but it needs tighter edges before publishing."
        hook = build_short_hook_from_text(text, "CUT TO THE POINT")
        best_for = "Studio refinement"
    else:
        label = "Support Clip"
        intent = "Useful as a supporting post after the hero or proof clip."
        hook = build_short_hook_from_text(text, "WATCH THIS PART")
        best_for = "Follow-up posts"

    retention_notes = []
    if speech_trusted and word_count >= 10:
        retention_notes.append("clear speech payload")
    if has_audio and peak_energy > -18:
        retention_notes.append("performance energy" if music_like else "audio emphasis")
    if avg_motion > 0.08:
        retention_notes.append("visual movement")
    if music_like and not speech_trusted:
        retention_notes.append("visual-led performance hook")
    if 12 <= duration <= 35:
        retention_notes.append("shorts-friendly length")
    if not retention_notes:
        retention_notes.append("balanced timing fallback")

    score_breakdown = {
        "speech": int(round(max(0.0, min(100.0, transcript_confidence * 100)))),
        "energy": int(max(0, min(100, (peak_energy + 45) * 3))) if segment_energy else 35,
        "motion": int(max(0, min(100, peak_motion * 420))) if segment_motion else 35,
        "durationFit": 92 if 12 <= duration <= 35 else 72 if duration <= 45 else 54,
    }

    return {
        "strategyLabel": label,
        "strategyIntent": intent,
        "hookText": hook,
        "captionSuggestion": hook.title(),
        "bestFor": best_for,
        "retentionNotes": retention_notes[:4],
        "scoreBreakdown": score_breakdown,
        "speechTrusted": speech_trusted,
        "transcriptConfidence": round(transcript_confidence, 3),
        "studioMove": (
            "Open in Studio, apply a hook treatment, then render the strongest version."
            if label in {"Hero Clip", "Proof Clip", "Authority Clip", "Choir Hero", "Performance Hero"}
            else "Open in Studio if you want to tighten the edges or test a new hook."
        ),
    }

def enrich_clip_candidates(candidates, audio_energy=None, motion_scores=None):
    if not candidates:
        return []
    enriched = []
    campaign_roles = ["Lead Hook", "Proof Beat", "Replay Beat", "Trust Close", "Support Cut"]
    for index, candidate in enumerate(candidates):
        strategy = classify_clip_candidate(candidate, audio_energy, motion_scores)
        updated = dict(candidate)
        updated.update(strategy)
        updated["campaignRole"] = campaign_roles[min(index, len(campaign_roles) - 1)]
        updated["campaignOrder"] = index + 1
        updated["reason"] = " + ".join(
            part for part in [
                updated.get("reason"),
                strategy["strategyLabel"],
                ", ".join(strategy["retentionNotes"]),
            ]
            if part
        )
        enriched.append(updated)
    return enriched


PROMO_VISUAL_STYLES = {
    "clean": {"accent": (96, 165, 250), "accent2": (20, 184, 166), "ink": (248, 250, 252), "tag": "PROMO"},
    "hype": {"accent": (255, 45, 85), "accent2": (250, 204, 21), "ink": (255, 255, 255), "tag": "VIRAL"},
    "cinematic": {"accent": (251, 191, 36), "accent2": (148, 163, 184), "ink": (255, 248, 236), "tag": "STORY"},
    "podcast": {"accent": (56, 189, 248), "accent2": (168, 85, 247), "ink": (240, 249, 255), "tag": "CLIP"},
    "event_choir": {"accent": (244, 114, 182), "accent2": (251, 191, 36), "ink": (255, 247, 237), "tag": "LIVE"},
    "cute_pastel": {"accent": (251, 182, 206), "accent2": (196, 181, 253), "ink": (255, 255, 255), "tag": "NEW"},
    "youtube_bold": {"accent": (239, 68, 68), "accent2": (250, 204, 21), "ink": (255, 255, 255), "tag": "WATCH"},
    "fitness_motivation": {"accent": (250, 204, 21), "accent2": (239, 68, 68), "ink": (255, 255, 255), "tag": "PUSH"},
    "tech_review": {"accent": (59, 130, 246), "accent2": (34, 211, 238), "ink": (248, 250, 252), "tag": "REVIEW"},
    "finance_business": {"accent": (34, 197, 94), "accent2": (250, 204, 21), "ink": (255, 255, 255), "tag": "GROWTH"},
    "travel_vlog": {"accent": (14, 165, 233), "accent2": (251, 191, 36), "ink": (255, 255, 255), "tag": "TRAVEL"},
    "food_cooking": {"accent": (249, 115, 22), "accent2": (250, 204, 21), "ink": (255, 247, 237), "tag": "TASTE"},
    "gaming_highlight": {"accent": (168, 85, 247), "accent2": (236, 72, 153), "ink": (255, 255, 255), "tag": "CLUTCH"},
    "education_tutorial": {"accent": (250, 204, 21), "accent2": (56, 189, 248), "ink": (248, 250, 252), "tag": "LEARN"},
    "lifestyle_productivity": {"accent": (251, 146, 60), "accent2": (190, 242, 100), "ink": (255, 251, 235), "tag": "ROUTINE"},
}

PROMO_SAFE_HOOKS = ["Watch This Moment", "Full Clip Inside", "Best Moment", "Don't Miss This"]

THUMBNAIL_TEXT_REJECTORS = [
    re.compile(pattern, re.I)
    for pattern in [
        r"\btranslate\b",
        r"\benglish\b",
        r"\bclip analysis\b",
        r"\bvisual moment\b",
        r"\bthe world is a mess\b",
        r"\bi'?m flying\b",
        r"\byeah(?:,\s*yeah){1,}\b",
        r"\bno speech detected\b",
        r"\bscene\s+\d+\b",
        r"\btimed product story beat\b",
        r"\btiktok\b.*\breels\b.*\bshorts\b",
        r"\breels\b.*\bshorts\b",
        r"\bshorts-friendly\b",
    ]
]

VISUAL_PROFILE_FALLBACKS = {
    "event_choir": {
        "hooks": ["POWER IN PRAISE", "LIVE CHOIR MOMENT", "FEEL THE HARMONY", "A MOMENT OF WORSHIP"],
        "subtitle": "Live performance highlight",
        "badge": "LIVE",
    },
    "youtube_bold": {
        "hooks": ["WATCH THIS MOMENT", "THE BEST PART", "DON'T MISS THIS", "THIS PART HITS"],
        "subtitle": "Best moment from the clip",
        "badge": "WATCH",
    },
    "hype": {
        "hooks": ["THIS PART HITS", "WATCH THE TURN", "BEST MOMENT", "DON'T MISS THIS"],
        "subtitle": "High-energy clip highlight",
        "badge": "VIRAL",
    },
    "cinematic": {
        "hooks": ["THE MOMENT CHANGES", "WATCH THE STORY", "THE TURNING POINT", "THIS SCENE HITS"],
        "subtitle": "Cinematic story beat",
        "badge": "STORY",
    },
}

PROMO_CONTENT_PACKAGING = [
    (
        "fitness_motivation",
        re.compile(r"\b(fitness|workout|gym|train|training|muscle|push|limits|discipline|body|run|exercise)\b", re.I),
        ["Push Your Limits", "Discipline Builds", "No Excuses"],
    ),
    (
        "tech_review",
        re.compile(r"\b(tech|review|iphone|android|ios|app|software|camera|laptop|feature|device|gadget|setup)\b", re.I),
        ["Is It Worth It?", "This Feature Wins", "Tech Breakdown"],
    ),
    (
        "finance_business",
        re.compile(r"\b(money|finance|business|sales|profit|revenue|growth|client|startup|market|invest|cash|income)\b", re.I),
        ["From Zero To Growth", "The Money Move", "Business Breakdown"],
    ),
    (
        "travel_vlog",
        re.compile(r"\b(travel|trip|vlog|beach|hotel|city|country|guide|tour|adventure|places|flight)\b", re.I),
        ["Worth The Trip", "Travel Guide", "Hidden Moment"],
    ),
    (
        "food_cooking",
        re.compile(r"\b(food|cook|cooking|recipe|burger|taste|flavor|kitchen|meal|chef|eat|restaurant)\b", re.I),
        ["Full Of Flavor", "Make This", "Taste Test"],
    ),
    (
        "gaming_highlight",
        re.compile(r"\b(game|gaming|clutch|kill|comeback|rank|level|boss|win|stream|play|highlight)\b", re.I),
        ["Insane Comeback", "Clutch Moment", "Watch This Play"],
    ),
    (
        "education_tutorial",
        re.compile(r"\b(how to|tutorial|learn|study|lesson|explain|education|teach|tips|step|guide|mistake)\b", re.I),
        ["How To Do This", "Learn Faster", "Stop Making This Mistake"],
    ),
    (
        "event_choir",
        re.compile(r"\b(choir|gospel|praise|worship|song|sing|singer|harmony|church|vocal|performance|live)\b", re.I),
        ["Power In Praise", "A Moment Of Worship", "This Harmony Hits"],
    ),
    (
        "lifestyle_productivity",
        re.compile(r"\b(routine|lifestyle|morning|habit|productivity|home|life|focus|planner|daily|small habits)\b", re.I),
        ["Small Habits Win", "Better Routine", "Change Your Day"],
    ),
]


def promo_font(size, bold=True):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def clean_promo_text(text, fallback="Watch This Moment", max_words=7):
    cleaned = re.sub(r"\s+", " ", str(text or "").strip())
    cleaned = re.sub(r"^[,.;:!?\\-\\s]+", "", cleaned)
    if not cleaned:
        cleaned = fallback
    words = cleaned.split()
    if len(words) > max_words:
        cleaned = " ".join(words[:max_words])
    return cleaned.strip(" ,.;:") or fallback


def is_bad_thumbnail_text(text):
    cleaned = re.sub(r"\s+", " ", str(text or "").strip())
    if not cleaned:
        return True
    if len(cleaned) < 3:
        return True
    lower = cleaned.lower()
    if any(rejector.search(lower) for rejector in THUMBNAIL_TEXT_REJECTORS):
        return True
    words = re.findall(r"[a-zA-Z']+", lower)
    if not words:
        return True
    unique_ratio = len(set(words)) / max(1, len(words))
    if len(words) >= 5 and unique_ratio < 0.45:
        return True
    if sum(1 for word in words if word in {"yeah", "oh", "ah", "uh", "um", "la"}) >= max(2, len(words) // 2):
        return True
    return False


def choose_thumbnail_text(candidates, fallback="Watch This Moment", max_words=7):
    for candidate in candidates:
        cleaned = clean_promo_text(candidate, fallback="", max_words=max_words)
        if cleaned and not is_bad_thumbnail_text(cleaned):
            return cleaned
    return clean_promo_text(fallback, PROMO_SAFE_HOOKS[0], max_words=max_words)


def analyze_frame_for_packaging(frame):
    try:
        rgb = frame.convert("RGB")
        sample = rgb.resize((180, 120), Image.LANCZOS)
        arr = np.array(sample)
        hsv = cv2.cvtColor(arr, cv2.COLOR_RGB2HSV)
        hue = hsv[:, :, 0]
        sat = hsv[:, :, 1]
        val = hsv[:, :, 2]

        pink_mask = ((hue >= 135) & (hue <= 178) & (sat > 65) & (val > 80))
        warm_stage_mask = ((hue <= 28) & (sat > 45) & (val > 85))
        bright_clothes_mask = ((sat > 65) & (val > 115))
        edge_density = float(np.mean(cv2.Canny(cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY), 60, 150) > 0))
        pink_ratio = float(np.mean(pink_mask))
        warm_ratio = float(np.mean(warm_stage_mask))
        bright_ratio = float(np.mean(bright_clothes_mask))

        height, width = arr.shape[:2]
        center_band = arr[int(height * 0.2): int(height * 0.72), int(width * 0.08): int(width * 0.92)]
        center_hsv = cv2.cvtColor(center_band, cv2.COLOR_RGB2HSV)
        center_pink = float(np.mean((center_hsv[:, :, 0] >= 135) & (center_hsv[:, :, 0] <= 178) & (center_hsv[:, :, 1] > 65)))

        if (pink_ratio > 0.045 or center_pink > 0.06) and (warm_ratio > 0.08 or edge_density > 0.08):
            return {
                "style": "event_choir",
                "confidence": min(0.96, 0.62 + pink_ratio + warm_ratio + edge_density),
                "reason": "group performance colors and stage-like visual pattern",
            }
        if bright_ratio > 0.22 and edge_density > 0.11:
            return {
                "style": "event_choir",
                "confidence": 0.58,
                "reason": "live event/performance visual density",
            }
    except Exception as exc:
        logger.debug(f"Frame packaging analysis skipped: {exc}")
    return {"style": None, "confidence": 0.0, "reason": ""}


def enhance_promo_frame(frame):
    enhanced = frame.convert("RGB")
    enhanced = ImageEnhance.Color(enhanced).enhance(1.18)
    enhanced = ImageEnhance.Contrast(enhanced).enhance(1.16)
    enhanced = ImageEnhance.Sharpness(enhanced).enhance(1.22)
    return enhanced


def infer_promo_content_profile(clip, style_key="clean", frame=None, visual_note=None):
    source_text = " ".join(
        str(value or "")
        for value in [
            clip.get("hookText"),
            clip.get("promoCaption"),
            clip.get("captionSuggestion"),
            clip.get("campaignRoleLabel"),
            clip.get("bestFor"),
            clip.get("reason"),
            clip.get("text"),
            clip.get("strategyLabel"),
            (visual_note or {}).get("caption"),
            (visual_note or {}).get("label"),
        ]
    )
    frame_profile = analyze_frame_for_packaging(frame) if frame is not None else {"style": None, "confidence": 0.0}
    if frame_profile.get("style") and frame_profile.get("confidence", 0.0) >= 0.58:
        profile_key = frame_profile["style"]
        fallback = VISUAL_PROFILE_FALLBACKS.get(profile_key, {})
        return {
            "style": profile_key,
            "fallbackHook": (fallback.get("hooks") or PROMO_SAFE_HOOKS)[0],
            "hookOptions": fallback.get("hooks") or PROMO_SAFE_HOOKS,
            "badge": fallback.get("badge") or PROMO_VISUAL_STYLES[profile_key]["tag"],
            "visualReason": frame_profile.get("reason", ""),
        }

    for profile_key, matcher, hook_options in PROMO_CONTENT_PACKAGING:
        if matcher.search(source_text):
            return {
                "style": profile_key,
                "fallbackHook": hook_options[0],
                "hookOptions": hook_options,
                "badge": PROMO_VISUAL_STYLES[profile_key]["tag"],
                "visualReason": "",
            }

    safe_style = style_key if style_key in PROMO_VISUAL_STYLES else "clean"
    fallback = VISUAL_PROFILE_FALLBACKS.get(safe_style, {})
    return {
        "style": safe_style,
        "fallbackHook": (fallback.get("hooks") or PROMO_SAFE_HOOKS)[0],
        "hookOptions": fallback.get("hooks") or PROMO_SAFE_HOOKS,
        "badge": fallback.get("badge") or PROMO_VISUAL_STYLES.get(safe_style, PROMO_VISUAL_STYLES["clean"])["tag"],
        "visualReason": "",
    }


def wrap_text_to_width(draw, text, font, max_width, max_lines=3):
    words = str(text or "").split()
    lines = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width or not current:
            current = test
        else:
            lines.append(current)
            current = word
        if len(lines) >= max_lines:
            break
    if current and len(lines) < max_lines:
        lines.append(current)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
    return lines


def extract_best_frame_image(video_path, fallback_size=(1080, 1920), start_time=None, end_time=None):
    cap = None
    try:
        cap = cv2.VideoCapture(video_path)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 24.0)
        duration = frame_count / fps if frame_count and fps else 0
        if start_time is not None or end_time is not None:
            window_start = max(0.0, float(start_time or 0.0))
            window_end = max(window_start + 0.2, float(end_time or duration or window_start + 1.0))
            if duration > 0:
                window_end = min(duration, window_end)
                window_start = min(window_start, max(0.0, window_end - 0.2))
            span = max(0.2, window_end - window_start)
            candidate_times = [
                window_start + span * 0.12,
                window_start + span * 0.34,
                window_start + span * 0.58,
                window_start + span * 0.82,
            ]
        else:
            candidate_times = [
                duration * 0.18,
                duration * 0.38,
                duration * 0.58,
                duration * 0.78,
            ] if duration > 0 else [0]
        best_frame = None
        best_score = -1
        for timestamp in candidate_times:
            cap.set(cv2.CAP_PROP_POS_MSEC, max(0, timestamp) * 1000)
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            sharpness = cv2.Laplacian(gray, cv2.CV_64F).var()
            brightness = float(np.mean(gray))
            brightness_score = 100 - abs(brightness - 130)
            score = sharpness * 0.7 + brightness_score * 3
            if score > best_score:
                best_score = score
                best_frame = frame
        if best_frame is not None:
            rgb = cv2.cvtColor(best_frame, cv2.COLOR_BGR2RGB)
            return Image.fromarray(rgb)
    except Exception as exc:
        logger.warning(f"Best-frame extraction failed: {exc}")
    finally:
        if cap is not None:
            cap.release()
    return Image.new("RGB", fallback_size, (10, 14, 28))


def cover_image(image, size):
    image = image.convert("RGB")
    target_w, target_h = size
    src_w, src_h = image.size
    scale = max(target_w / max(1, src_w), target_h / max(1, src_h))
    resized = image.resize((int(src_w * scale), int(src_h * scale)), Image.LANCZOS)
    left = max(0, (resized.width - target_w) // 2)
    top = max(0, (resized.height - target_h) // 2)
    return resized.crop((left, top, left + target_w, top + target_h))


def contain_image(image, max_size):
    image = image.convert("RGB")
    max_w, max_h = max_size
    src_w, src_h = image.size
    scale = min(max_w / max(1, src_w), max_h / max(1, src_h))
    return image.resize((max(1, int(src_w * scale)), max(1, int(src_h * scale))), Image.LANCZOS)


def draw_gradient_overlay(base, top_alpha=40, bottom_alpha=190):
    width, height = base.size
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for y in range(height):
        alpha = int(top_alpha + (bottom_alpha - top_alpha) * (y / max(1, height - 1)))
        draw.line([(0, y), (width, y)], fill=(2, 6, 23, alpha))
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def render_promo_visual_asset(frame, output_path, *, size, style_key, hook, subtitle, badge, layout_variant=0):
    palette = PROMO_VISUAL_STYLES.get(style_key) or PROMO_VISUAL_STYLES["clean"]
    width, height = size
    frame = enhance_promo_frame(frame)
    accent = palette["accent"]
    accent2 = palette["accent2"]
    margin = int(width * 0.06)
    is_story = height > width * 1.4
    is_poster = height > width and not is_story
    is_choir = style_key == "event_choir"
    title_font = promo_font(max(46, int(width * (0.072 if width >= height else 0.084))), True)
    subtitle_font = promo_font(max(24, int(width * 0.032)), False)
    badge_font = promo_font(max(20, int(width * 0.024)), True)

    if is_choir:
        canvas = cover_image(frame, size).filter(ImageFilter.UnsharpMask(radius=1.2, percent=145, threshold=3)).convert("RGBA")
        wash = Image.new("RGBA", size, (0, 0, 0, 0))
        wash_draw = ImageDraw.Draw(wash)
        for y in range(height):
            alpha = int(28 + 188 * (y / max(1, height - 1)))
            wash_draw.line([(0, y), (width, y)], fill=(0, 0, 0, alpha))
        wash_draw.rectangle((0, 0, width, int(height * 0.09)), fill=(*accent, 205))
        wash_draw.rectangle((0, int(height * 0.09), width, int(height * 0.105)), fill=(*accent2, 230))
        wash_draw.polygon(
            [(int(width * 0.62), 0), (width, 0), (width, int(height * 0.72)), (int(width * 0.76), int(height * 0.58))],
            fill=(*accent2, 52),
        )
        canvas = Image.alpha_composite(canvas, wash)
        draw = ImageDraw.Draw(canvas)

        badge_text = choose_thumbnail_text([badge, "LIVE"], "LIVE", max_words=2).upper()
        badge_w = draw.textbbox((0, 0), badge_text, font=badge_font)[2] + 42
        badge_h = int(height * (0.07 if width >= height else 0.048))
        draw.rounded_rectangle(
            (margin, int(height * 0.045), margin + badge_w, int(height * 0.045) + badge_h),
            radius=badge_h // 2,
            fill=(*accent, 245),
            outline=(*accent2, 220),
            width=max(3, int(width * 0.003)),
        )
        draw.text((margin + 20, int(height * 0.045) + int(badge_h * 0.28)), badge_text, font=badge_font, fill=(255, 255, 255, 255))

        title = choose_thumbnail_text([hook], "POWER IN PRAISE", max_words=5).upper()
        text_y = int(height * (0.62 if width >= height else 0.66))
        title_lines = wrap_text_to_width(draw, title, title_font, int(width * 0.82), max_lines=2 if width >= height else 3)
        for line in title_lines:
            bbox = draw.textbbox((0, 0), line, font=title_font, stroke_width=4)
            line_w = bbox[2] - bbox[0]
            line_h = bbox[3] - bbox[1]
            draw.rounded_rectangle(
                (margin - 14, text_y - 12, margin + line_w + 18, text_y + line_h + 16),
                radius=max(16, int(width * 0.012)),
                fill=(0, 0, 0, 178),
            )
            draw.text((margin, text_y), line, font=title_font, fill=(255, 255, 255, 255), stroke_width=4, stroke_fill=(0, 0, 0, 235))
            draw.line((margin, text_y + line_h + 12, margin + min(line_w, int(width * 0.42)), text_y + line_h + 12), fill=(*accent2, 245), width=max(5, int(height * 0.008)))
            text_y += int(line_h * 1.16)

        sub = choose_thumbnail_text([subtitle], "Live performance highlight", max_words=7)
        sub_lines = wrap_text_to_width(draw, sub, subtitle_font, int(width * 0.78), max_lines=2)
        text_y += int(height * 0.02)
        for line in sub_lines:
            draw.text((margin, text_y), line, font=subtitle_font, fill=(255, 247, 237, 238), stroke_width=2, stroke_fill=(0, 0, 0, 210))
            text_y += int(subtitle_font.size * 1.22)

        logo_text = "AutoPromote"
        logo_font = promo_font(max(18, int(width * 0.019)), True)
        logo_box = draw.textbbox((0, 0), logo_text, font=logo_font)
        logo_w = logo_box[2] - logo_box[0] + 34
        logo_h = logo_box[3] - logo_box[1] + 22
        logo_x = width - margin - logo_w
        logo_y = height - margin - logo_h
        draw.rounded_rectangle((logo_x, logo_y, logo_x + logo_w, logo_y + logo_h), radius=logo_h // 2, fill=(*accent2, 245))
        draw.text((logo_x + 17, logo_y + 10), logo_text, font=logo_font, fill=(5, 7, 18, 255))
        canvas.convert("RGB").save(output_path, "JPEG", quality=96, optimize=True, progressive=True)
        return

    background = cover_image(frame, size).filter(ImageFilter.GaussianBlur(radius=max(18, int(width * 0.022))))
    background = ImageEnhance.Contrast(background).enhance(1.14)
    background = Image.blend(background, Image.new("RGB", size, (3, 7, 20)), 0.34)
    canvas = draw_gradient_overlay(background, top_alpha=44, bottom_alpha=220)
    draw = ImageDraw.Draw(canvas)

    margin = int(width * 0.065)
    title_font = promo_font(max(42, int(width * (0.065 if width >= height else 0.074))), True)

    light_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    light_draw = ImageDraw.Draw(light_layer)
    light_draw.polygon(
        [(int(width * 0.58), 0), (width, 0), (width, int(height * 0.56)), (int(width * 0.72), int(height * 0.42))],
        fill=(*accent, 42),
    )
    light_draw.polygon(
        [(0, int(height * 0.18)), (int(width * 0.36), 0), (int(width * 0.18), height), (0, height)],
        fill=(*accent2, 30),
    )
    canvas = Image.alpha_composite(canvas, light_layer)
    draw = ImageDraw.Draw(canvas)

    if width >= height:
        visual_box = (margin, int(height * 0.09), width - margin, int(height * (0.74 if is_choir else 0.70)))
    elif is_story:
        visual_box = (margin, int(height * 0.08), width - margin, int(height * 0.58))
    else:
        visual_box = (margin, int(height * 0.08), width - margin, int(height * 0.60))

    visual_w = max(1, visual_box[2] - visual_box[0])
    visual_h = max(1, visual_box[3] - visual_box[1])
    foreground = cover_image(frame, (visual_w, visual_h)) if width >= height or is_choir else contain_image(frame, (visual_w, visual_h))
    if foreground.size != (visual_w, visual_h):
        fg_canvas = Image.new("RGB", (visual_w, visual_h), (4, 7, 18))
        fg_canvas.paste(foreground, ((visual_w - foreground.width) // 2, (visual_h - foreground.height) // 2))
        foreground = fg_canvas
    foreground = foreground.filter(ImageFilter.UnsharpMask(radius=1.15, percent=135, threshold=3))
    draw.rounded_rectangle(
        visual_box,
        radius=max(24, int(width * 0.026)),
        fill=(255, 255, 255, 18),
        outline=(*accent2, 210),
        width=max(4, int(width * 0.005)),
    )
    mask = Image.new("L", (visual_w, visual_h), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((0, 0, visual_w, visual_h), radius=max(24, int(width * 0.026)), fill=255)
    canvas.paste(foreground.convert("RGBA"), (visual_box[0], visual_box[1]), mask)

    vignette = Image.new("RGBA", size, (0, 0, 0, 0))
    vignette_draw = ImageDraw.Draw(vignette)
    vignette_draw.rectangle((0, int(height * 0.55), width, height), fill=(0, 0, 0, 120 if width >= height else 155))
    canvas = Image.alpha_composite(canvas, vignette)
    draw = ImageDraw.Draw(canvas)
    title_y = int(height * (0.68 if width >= height else 0.64 if is_poster else 0.63))

    if is_choir:
        draw.rectangle((0, 0, width, int(height * 0.035)), fill=(*accent, 235))
        draw.rectangle((0, int(height * 0.035), width, int(height * 0.045)), fill=(*accent2, 235))
    elif style_key in {"youtube_bold", "hype"}:
        draw.rectangle((0, 0, width, int(height * 0.04)), fill=(*accent, 225))

    badge_text = clean_promo_text(badge or palette["tag"], palette["tag"], max_words=3).upper()
    badge_box = draw.textbbox((0, 0), badge_text, font=badge_font)
    badge_w = badge_box[2] - badge_box[0] + 34
    badge_h = badge_box[3] - badge_box[1] + 22
    badge_x = margin
    badge_y = int(height * 0.055)
    draw.rounded_rectangle((badge_x, badge_y, badge_x + badge_w, badge_y + badge_h), radius=badge_h // 2, fill=(*accent, 238))
    draw.text((badge_x + 17, badge_y + 10), badge_text, font=badge_font, fill=(255, 255, 255, 255))

    title = clean_promo_text(hook, PROMO_SAFE_HOOKS[layout_variant % len(PROMO_SAFE_HOOKS)], max_words=7).upper()
    max_title_lines = 2 if width >= height else 3
    lines = wrap_text_to_width(draw, title, title_font, width - margin * 2, max_lines=max_title_lines)
    cursor_y = title_y
    text_bottom_limit = height - margin - int(height * 0.08)
    for line in lines:
        line_bbox = draw.textbbox((0, 0), line, font=title_font, stroke_width=2)
        line_w = line_bbox[2] - line_bbox[0]
        line_h = line_bbox[3] - line_bbox[1]
        if cursor_y + line_h > text_bottom_limit:
            break
        x = margin if width < height else max(margin, int(width * 0.06))
        panel_pad_x = int(width * 0.018)
        panel_pad_y = int(height * 0.012)
        if layout_variant != 2:
            draw.rounded_rectangle(
                (x - panel_pad_x, cursor_y - panel_pad_y, x + line_w + panel_pad_x, cursor_y + line_h + panel_pad_y),
                radius=max(12, int(width * 0.012)),
                fill=(0, 0, 0, 150),
            )
        draw.text((x, cursor_y), line, font=title_font, fill=palette["ink"], stroke_width=4, stroke_fill=(0, 0, 0, 230))
        cursor_y += int(line_h * 1.08)

    sub = clean_promo_text(subtitle, "Full clip inside", max_words=10)
    sub_lines = wrap_text_to_width(draw, sub, subtitle_font, width - margin * 2, max_lines=2)
    cursor_y += 10
    for line in sub_lines:
        if cursor_y + subtitle_font.size > text_bottom_limit:
            break
        draw.text((margin, cursor_y), line, font=subtitle_font, fill=(226, 232, 240, 235))
        cursor_y += int(subtitle_font.size * 1.22)

    logo_w = int(width * (0.17 if width >= height else 0.20))
    logo_h = int(height * (0.062 if height >= width else 0.075))
    draw.rounded_rectangle(
        (width - margin - logo_w, height - margin - logo_h, width - margin, height - margin),
        radius=max(18, int(logo_h * 0.35)),
        fill=(*accent2, 230),
    )
    draw.text(
        (width - margin - logo_w + int(logo_w * 0.09), height - margin - logo_h + int(logo_h * 0.28)),
        "AutoPromote",
        font=promo_font(max(16, int(width * 0.018)), True),
        fill=(3, 7, 18, 255),
    )
    canvas.convert("RGB").save(output_path, "JPEG", quality=91, optimize=True)


def build_promo_visual_assets(clip_video_path, clip, job_id, clip_index, style_key="clean", visual_note=None):
    frame = extract_best_frame_image(
        clip_video_path,
        start_time=clip.get("start"),
        end_time=clip.get("end"),
    )
    content_profile = infer_promo_content_profile(clip, style_key, frame=frame, visual_note=visual_note)
    fallback_hook = content_profile["hookOptions"][clip_index % len(content_profile["hookOptions"])]
    visual_caption = (visual_note or {}).get("caption") or (visual_note or {}).get("label")
    hook = choose_thumbnail_text(
        [
            clip.get("hookText"),
            clip.get("promoCaption"),
            visual_caption,
            clip.get("captionSuggestion"),
            clip.get("text"),
        ],
        fallback=fallback_hook,
        max_words=7,
    )
    fallback_pack = VISUAL_PROFILE_FALLBACKS.get(content_profile["style"], {})
    subtitle_candidates = (
        [
            visual_caption,
            clip.get("captionSuggestion"),
            fallback_pack.get("subtitle"),
            clip.get("campaignRoleLabel"),
            clip.get("reason"),
        ]
        if content_profile["style"] == "event_choir"
        else [
            visual_caption,
            clip.get("captionSuggestion"),
            clip.get("campaignRoleLabel"),
            clip.get("bestFor"),
            clip.get("reason"),
            fallback_pack.get("subtitle"),
        ]
    )
    subtitle = choose_thumbnail_text(
        subtitle_candidates,
        fallback=fallback_pack.get("subtitle") or "Full clip inside",
        max_words=10,
    )
    badge_candidates = (
        [content_profile["badge"], clip.get("campaignRoleLabel"), clip.get("strategyLabel")]
        if content_profile["style"] == "event_choir"
        else [clip.get("campaignRoleLabel"), clip.get("strategyLabel"), content_profile["badge"]]
    )
    badge = choose_thumbnail_text(
        badge_candidates,
        fallback=content_profile["badge"],
        max_words=3,
    )
    ai_thumbnail_package = clip.get("aiThumbnailPackage") if isinstance(clip, dict) else None
    if not ai_thumbnail_package:
        ai_thumbnail_package = generate_thumbnail_copy_with_ai(
            clip,
            content_type=clip.get("contentType"),
            visual_note=visual_note,
            fallback_hook=hook,
            fallback_subtitle=subtitle,
            fallback_badge=badge,
        )
        if isinstance(clip, dict) and ai_thumbnail_package:
            clip["aiThumbnailPackage"] = ai_thumbnail_package

    if ai_thumbnail_package:
        ai_hook = choose_thumbnail_text(
            [ai_thumbnail_package.get("hook"), hook],
            fallback=hook,
            max_words=7,
        )
        ai_subtitle = choose_thumbnail_text(
            [ai_thumbnail_package.get("subtitle"), subtitle],
            fallback=subtitle,
            max_words=10,
        )
        ai_badge = choose_thumbnail_text(
            [ai_thumbnail_package.get("badge"), badge],
            fallback=badge,
            max_words=3,
        )
        hook, subtitle, badge = ai_hook, ai_subtitle, ai_badge

    specs = [
        ("thumbnail", "Creator thumbnail", (1280, 720), content_profile["style"], 0),
        ("poster", "Social poster", (1080, 1350), content_profile["style"], 1),
        (
            "story",
            "Story cover",
            (1080, 1920),
            "hype" if content_profile["style"] not in {"event_choir", "cute_pastel", "lifestyle_productivity"} else content_profile["style"],
            2,
        ),
    ]
    assets = []
    for asset_type, label, size, visual_style, variant in specs:
        local_path = os.path.join(
            os.path.dirname(clip_video_path),
            f"{job_id}_clip_{clip_index}_{asset_type}_{uuid.uuid4().hex[:6]}.jpg",
        )
        render_promo_visual_asset(
            frame,
            local_path,
            size=size,
            style_key=visual_style,
            hook=hook,
            subtitle=subtitle,
            badge=badge,
            layout_variant=variant,
        )
        storage_path = f"generated_clips/{job_id}/visuals/clip_{clip_index}_{asset_type}_{uuid.uuid4().hex[:8]}.jpg"
        url = upload_file_to_firebase(local_path, storage_path)
        try:
            os.remove(local_path)
        except Exception:
            pass
        assets.append({
            "id": f"{clip.get('id', f'clip-{clip_index}')}-{asset_type}",
            "type": asset_type,
            "label": label,
            "style": visual_style,
            "url": url,
            "storagePath": storage_path,
            "width": size[0],
            "height": size[1],
            "hookText": clean_promo_text(hook, max_words=7),
            "subtitle": clean_promo_text(subtitle, max_words=10),
            "contentProfile": content_profile["style"],
            "copySource": "ai_refined" if ai_thumbnail_package else "heuristic",
            "aiWhy": str((ai_thumbnail_package or {}).get("why") or "").strip(),
            "expiresWithClip": True,
        })
    return assets

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


def build_promo_video_filter(target_aspect="9:16", mode="promo_fit"):
    normalized_aspect = str(target_aspect or "9:16").strip()
    normalized_mode = str(mode or "promo_fit").strip()

    if normalized_aspect == "9:16":
        if normalized_mode == "crop":
            return "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"
        return (
            "split=2[bg][fg];"
            "[bg]scale=1080:1920:force_original_aspect_ratio=increase,"
            "crop=1080:1920,gblur=sigma=22:steps=1,"
            "eq=brightness=-0.09:contrast=1.05:saturation=1.14[bg];"
            "[fg]scale=1000:1760:force_original_aspect_ratio=decrease[fg];"
            "[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1"
        )

    if normalized_aspect == "1:1":
        return (
            "split=2[bg][fg];"
            "[bg]scale=1080:1080:force_original_aspect_ratio=increase,"
            "crop=1080:1080,gblur=sigma=18:steps=1,"
            "eq=brightness=-0.08:contrast=1.04:saturation=1.10[bg];"
            "[fg]scale=1010:1010:force_original_aspect_ratio=decrease[fg];"
            "[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1"
        )

    return "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1"


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

# ============================================================
# ANIMATED WORD-LEVEL CAPTIONS (5 STYLES) — OpusClip Competitor
# ============================================================

CAPTION_STYLES = {
    "bold_pop": {
        "label": "Bold Pop",
        "fontname": "DejaVu Sans",
        "primary_color": "&H00FFFFFF",  # White (ASS BGR)
        "outline_color": "&H00000000",  # Black
        "highlight_color": "&H0000D4FF",  # Orange highlight (BGR)
        "fontsize": 52,
        "bold": True,
        "outline": 4,
        "shadow": 2,
        "alignment": 2,  # Bottom center
        "margin_v": 120,
        "animation": "scale_pop",
    },
    "karaoke": {
        "label": "Karaoke Highlight",
        "fontname": "DejaVu Sans",
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H00000000",
        "highlight_color": "&H0042F5F5",  # Yellow highlight
        "fontsize": 48,
        "bold": True,
        "outline": 3,
        "shadow": 1,
        "alignment": 2,
        "margin_v": 110,
        "animation": "karaoke_fill",
    },
    "glow": {
        "label": "Neon Glow",
        "fontname": "DejaVu Sans",
        "primary_color": "&H00FFAA00",  # Cyan-ish (BGR)
        "outline_color": "&H00FF6600",  # Blue glow
        "highlight_color": "&H0000FFFF",  # Yellow highlight
        "fontsize": 50,
        "bold": True,
        "outline": 6,
        "shadow": 4,
        "alignment": 2,
        "margin_v": 115,
        "animation": "glow_pulse",
    },
    "bounce": {
        "label": "Bounce",
        "fontname": "DejaVu Sans",
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H00222222",
        "highlight_color": "&H005050FF",  # Red highlight (BGR)
        "fontsize": 54,
        "bold": True,
        "outline": 4,
        "shadow": 3,
        "alignment": 2,
        "margin_v": 125,
        "animation": "bounce_word",
    },
    "minimal": {
        "label": "Minimal Clean",
        "fontname": "DejaVu Sans",
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H80000000",  # Semi-transparent black
        "highlight_color": "&H00FFFFFF",
        "fontsize": 42,
        "bold": False,
        "outline": 2,
        "shadow": 0,
        "alignment": 2,
        "margin_v": 100,
        "animation": "fade_word",
    },
}


def generate_ass_captions(whisper_result, style_name="bold_pop", video_width=1080, video_height=1920):
    """
    Generate ASS (Advanced SubStation Alpha) subtitle file content
    with word-level animated captions from Whisper's word_timestamps output.
    """
    style = CAPTION_STYLES.get(style_name, CAPTION_STYLES["bold_pop"])
    segments = whisper_result.get("segments", [])

    # ASS header
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
        f"{style['highlight_color']},{style['outline_color']},&H80000000,"
        f"{'-1' if style['bold'] else '0'},0,0,0,100,100,0,0,1,{style['outline']},"
        f"{style['shadow']},{style['alignment']},40,40,{style['margin_v']},1",
        f"Style: Active,{style['fontname']},{style['fontsize']},{style['highlight_color']},"
        f"{style['primary_color']},{style['outline_color']},&H80000000,"
        f"-1,0,0,0,100,100,0,0,1,{style['outline'] + 1},"
        f"{style['shadow']},{style['alignment']},40,40,{style['margin_v']},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    hallucinations = {"thank you.", "thanks.", "bye.", "music.", "watching.", "mbc", "lbc", "you", "silence"}

    for segment in segments:
        words = segment.get("words", [])
        seg_text = str(segment.get("text", "")).strip()

        # Filter hallucinations
        if seg_text.lower().strip(". ") in hallucinations:
            continue
        if segment.get("no_speech_prob", 0) > 0.8:
            continue

        if not words:
            # Fallback: show full segment text without word-level animation
            start_ass = _seconds_to_ass_time(segment["start"])
            end_ass = _seconds_to_ass_time(segment["end"])
            clean = re.sub(r"\[.*?\]|\(.*?\)", "", seg_text).strip()
            if clean and len(clean) >= 2:
                ass_lines.append(f"Dialogue: 0,{start_ass},{end_ass},Default,,0,0,0,,{_escape_ass(clean)}")
            continue

        # Build word groups (3-5 words per line for readability)
        groups = _chunk_words(words, max_words=5)

        for group in groups:
            if not group:
                continue
            group_start = group[0]["start"]
            group_end = group[-1]["end"]
            start_ass = _seconds_to_ass_time(group_start)
            end_ass = _seconds_to_ass_time(group_end)

            # Build the animated text line
            if style["animation"] == "karaoke_fill":
                # Karaoke: words fill with color as they're spoken
                text_parts = []
                for word in group:
                    w_dur_cs = max(1, int((word["end"] - word["start"]) * 100))
                    word_text = _escape_ass(word.get("word", "").strip())
                    if word_text:
                        text_parts.append(f"{{\\kf{w_dur_cs}}}{word_text}")
                if text_parts:
                    line = "".join(text_parts)
                    ass_lines.append(f"Dialogue: 0,{start_ass},{end_ass},Default,,0,0,0,,{line}")

            elif style["animation"] == "scale_pop":
                # Bold Pop: active word scales up briefly
                for i, word in enumerate(group):
                    w_start = _seconds_to_ass_time(word["start"])
                    w_end = _seconds_to_ass_time(word["end"])
                    word_text = _escape_ass(word.get("word", "").strip())
                    if not word_text:
                        continue
                    # Build line: all words shown, active word is highlighted + scaled
                    parts = []
                    for j, w in enumerate(group):
                        wt = _escape_ass(w.get("word", "").strip())
                        if not wt:
                            continue
                        if j == i:
                            parts.append(f"{{\\fscx115\\fscy115\\c{style['highlight_color']}\\b1}}{wt}{{\\fscx100\\fscy100\\c{style['primary_color']}\\b1}}")
                        else:
                            parts.append(wt)
                    line = " ".join(parts)
                    ass_lines.append(f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,{line}")

            elif style["animation"] == "bounce_word":
                # Bounce: active word moves up slightly
                for i, word in enumerate(group):
                    w_start = _seconds_to_ass_time(word["start"])
                    w_end = _seconds_to_ass_time(word["end"])
                    word_text = _escape_ass(word.get("word", "").strip())
                    if not word_text:
                        continue
                    parts = []
                    for j, w in enumerate(group):
                        wt = _escape_ass(w.get("word", "").strip())
                        if not wt:
                            continue
                        if j == i:
                            parts.append(f"{{\\move(0,0,0,-12)\\c{style['highlight_color']}\\b1}}{wt}{{\\c{style['primary_color']}\\b0}}")
                        else:
                            parts.append(wt)
                    line = " ".join(parts)
                    ass_lines.append(f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,{line}")

            elif style["animation"] == "glow_pulse":
                # Glow: active word gets extra outline glow
                for i, word in enumerate(group):
                    w_start = _seconds_to_ass_time(word["start"])
                    w_end = _seconds_to_ass_time(word["end"])
                    word_text = _escape_ass(word.get("word", "").strip())
                    if not word_text:
                        continue
                    parts = []
                    for j, w in enumerate(group):
                        wt = _escape_ass(w.get("word", "").strip())
                        if not wt:
                            continue
                        if j == i:
                            parts.append(f"{{\\bord{style['outline'] + 3}\\3c{style['highlight_color']}\\c{style['highlight_color']}}}{wt}{{\\bord{style['outline']}\\3c{style['outline_color']}\\c{style['primary_color']}}}")
                        else:
                            parts.append(wt)
                    line = " ".join(parts)
                    ass_lines.append(f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,{line}")

            else:
                # fade_word (minimal): simple fade per word group
                clean_text = " ".join(_escape_ass(w.get("word", "").strip()) for w in group if w.get("word", "").strip())
                if clean_text:
                    fade_in_ms = 100
                    fade_out_ms = 150
                    ass_lines.append(
                        f"Dialogue: 0,{start_ass},{end_ass},Default,,0,0,0,,"
                        f"{{\\fad({fade_in_ms},{fade_out_ms})}}{clean_text}"
                    )

    return "\n".join(ass_lines)


def _seconds_to_ass_time(seconds):
    """Convert seconds to ASS time format: H:MM:SS.CC"""
    s = max(0.0, float(seconds))
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    cs = int(round((s % 1) * 100))
    return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"


def _escape_ass(text):
    """Escape special ASS characters in dialogue text."""
    return str(text or "").replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


PROMO_SIGNATURE_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
    "i", "in", "is", "it", "its", "me", "my", "of", "on", "or", "our", "so",
    "that", "the", "their", "there", "these", "this", "to", "we", "what",
    "when", "where", "with", "you", "your",
}


def build_promo_semantic_key(*values, max_words=6):
    tokens = []
    for value in values:
        cleaned = re.sub(r"[^a-z0-9\s]+", " ", str(value or "").lower())
        for token in cleaned.split():
            if len(token) <= 1:
                continue
            if token in PROMO_SIGNATURE_STOPWORDS:
                continue
            if token not in tokens:
                tokens.append(token)
            if len(tokens) >= max_words:
                return " ".join(tokens)
    return " ".join(tokens)


def generate_promo_story_captions(clip, video_width=1080, video_height=1920, continuous_timeline=False):
    width = max(320, int(video_width or 1080))
    height = max(320, int(video_height or 1920))
    font_size = max(44, min(78, int(height * 0.038)))
    side_margin = max(42, int(width * 0.055))
    bottom_margin = max(185, int(height * 0.105))

    ass_lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: {}".format(width),
        "PlayResY: {}".format(height),
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Promo,DejaVu Sans,{font},&H00FFFFFF,&H000000FF,&HAA000000,&H8A000000,-1,0,0,0,100,100,0,0,3,3,2,2,{margin},{margin},{bottom},1".format(
            font=font_size,
            margin=side_margin,
            bottom=bottom_margin,
        ),
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    cursor = 0.0
    segments = clip.get("segments") or []
    if not segments:
        segments = [
            {
                "duration": max(2.5, float(clip.get("duration", 8.0) or 8.0)),
                "caption": clip.get("text") or "Watch This",
            }
        ]

    base_clip_start = float(clip.get("start", 0.0) or 0.0)
    recent_caption_keys = []

    for index, segment in enumerate(segments):
        duration = max(1.0, float(segment.get("duration", 2.5) or 2.5))
        if continuous_timeline:
            start = max(0.0, float(segment.get("start", base_clip_start) or base_clip_start) - base_clip_start)
            end = max(start + 0.8, float(segment.get("end", segment.get("start", base_clip_start)) or base_clip_start) - base_clip_start)
            cursor = max(cursor, end)
        else:
            start = cursor
            end = cursor + duration
            cursor = end
        caption = str(segment.get("caption") or clip.get("text") or "Watch This").strip()
        caption_key = build_promo_semantic_key(caption)
        if caption_key and caption_key in recent_caption_keys:
            fallback_caption = str(segment.get("visualLabel") or "").strip()
            if fallback_caption:
                caption = fallback_caption
                caption_key = build_promo_semantic_key(caption)
        if caption_key and caption_key in recent_caption_keys:
            caption = f"Moment {index + 1}"
            caption_key = build_promo_semantic_key(caption)
        if caption_key:
            recent_caption_keys.append(caption_key)
            recent_caption_keys = recent_caption_keys[-4:]
        caption = wrap_hook_text(caption, max_chars=18, max_lines=2) or "Watch This"
        caption = _escape_ass(caption.upper())
        fade_in_ms = 140 if index == 0 else 90
        fade_out_ms = 120
        ass_lines.append(
            "Dialogue: 0,{start},{end},Promo,,0,0,0,,{{\\fad({fade_in},{fade_out})}}{caption}".format(
                start=_seconds_to_ass_time(start),
                end=_seconds_to_ass_time(end),
                fade_in=fade_in_ms,
                fade_out=fade_out_ms,
                caption=caption,
            )
        )

    return "\n".join(ass_lines)


def generate_creative_social_captions(clip, content_type=None):
    """Use GPT-4o-mini to generate emotionally intelligent social captions."""
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY")
    if not api_key:
        return None

    content_type = str(content_type or clip.get("contentType") or "general").strip()
    transcript_confidence = float(clip.get("transcriptConfidence", 0.0) or 0.0)
    music_like = content_type in {"choir_performance", "music_performance"}
    speech_trusted = transcript_confidence >= (0.74 if music_like else 0.58)

    transcript = str(clip.get("text") or clip.get("caption") or "").strip()
    if len(transcript) < 10 or not speech_trusted:
        transcript = str(
            clip.get("visualLabel")
            or clip.get("captionSuggestion")
            or clip.get("reason")
            or clip.get("summary")
            or ""
        ).strip()
    if not transcript:
        return None

    content_hint = CONTENT_CAPTION_STYLES.get(
        content_type,
        CONTENT_CAPTION_STYLES["general"]
    )
    tone = content_hint["tone"]
    source_mode = (
        "Use visual/performance cues only. Do not invent lyrics, translations, or exact spoken quotes."
        if music_like or not speech_trusted
        else "You may use the spoken meaning, but keep it social-native and not overly literal."
    )

    prompt = (
        f"You are a social media editor creating captions for short-form video clips.\n"
        f"Content type: {content_type or 'general'} | Tone: {tone}\n"
        f"Transcript confidence: {transcript_confidence:.2f}\n"
        f"{source_mode}\n\n"
        f"Clip transcript/vibe: \"{transcript[:500]}\"\n\n"
        f"Generate 3 creative captions. Each must be:\n"
        f"- Short (1-8 words)\n"
        f"- Emotionally compelling\n"
        f"- Social-media native (TikTok/Instagram style)\n"
        f"- Not literal transcript copying\n"
        f"- Designed to make viewers FEEL something\n\n"
        f"Return strict JSON: {{\"captions\": [\"caption 1\", \"caption 2\", \"caption 3\"], \"hook\": \"hook text\", \"vibe\": \"one word vibe\"}}"
    )

    try:
        import requests
        response = requests.post(
            (os.getenv("OPENAI_API_BASE") or "https://api.openai.com") + "/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": os.getenv("OPENAI_MODEL_GPT4O_MINI") or "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.8,
                "max_tokens": 300,
            },
            timeout=20,
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"]
        raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"Creative caption generation failed: {e}")
        return None


def generate_thumbnail_copy_with_ai(clip, content_type=None, visual_note=None, fallback_hook="Watch This Moment", fallback_subtitle="Full clip inside", fallback_badge="WATCH"):
    """Use GPT to refine thumbnail hook/subtitle/badge copy when available."""
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY")
    if not api_key:
        return None

    content_type = str(content_type or clip.get("contentType") or "general").strip()
    transcript_confidence = float(clip.get("transcriptConfidence", 0.0) or 0.0)
    music_like = content_type in {"choir_performance", "music_performance"}
    speech_trusted = transcript_confidence >= (0.74 if music_like else 0.58)

    visual_caption = str((visual_note or {}).get("caption") or (visual_note or {}).get("label") or "").strip()
    evidence = {
        "contentType": content_type,
        "strategyLabel": str(clip.get("strategyLabel") or "").strip(),
        "reason": str(clip.get("reason") or "").strip()[:220],
        "visualLabel": str(clip.get("visualLabel") or "").strip(),
        "visualNote": visual_caption[:120],
        "captionSuggestion": str(clip.get("captionSuggestion") or "").strip()[:80],
        "hookText": str(clip.get("hookText") or "").strip()[:80],
        "bestFor": str(clip.get("bestFor") or "").strip()[:80],
        "text": (
            str(clip.get("text") or "").strip()[:220]
            if speech_trusted and not music_like
            else ""
        ),
        "transcriptConfidence": round(transcript_confidence, 3),
    }

    source_rule = (
        "This is likely choir/music/performance content or low-confidence speech. Do not invent spoken quotes, lyrics, or translations. Use visual/performance framing only."
        if music_like or not speech_trusted
        else "Use the clip meaning, but do not copy long transcript text. Make it sharper and more clickable."
    )

    prompt = (
        "You are a YouTube thumbnail and social-poster copy editor.\n"
        "Create ultra-short text for a thumbnail package.\n"
        "Rules:\n"
        "- hook: 2-5 words, all-caps friendly, emotionally clickable, no punctuation spam\n"
        "- subtitle: 3-8 words, supports the hook, clean and readable\n"
        "- badge: 1-2 words only\n"
        "- avoid generic filler like VISUAL MOMENT, WATCH THIS, FULL CLIP INSIDE unless truly unavoidable\n"
        "- avoid hallucinating names, translations, lyrics, or exact speech\n"
        f"- {source_rule}\n\n"
        f"Fallback hook: {fallback_hook}\n"
        f"Fallback subtitle: {fallback_subtitle}\n"
        f"Fallback badge: {fallback_badge}\n\n"
        f"Evidence:\n{json.dumps(evidence, ensure_ascii=True)}\n\n"
        "Return strict JSON only: {\"hook\": \"...\", \"subtitle\": \"...\", \"badge\": \"...\", \"why\": \"...\"}"
    )

    try:
        import requests

        response = requests.post(
            (os.getenv("OPENAI_API_BASE") or "https://api.openai.com") + "/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": os.getenv("OPENAI_MODEL_GPT4O_MINI") or os.getenv("OPENAI_MODEL_GPT4O") or "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.35,
                "max_tokens": 220,
            },
            timeout=20,
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"]
        raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return None
        return {
            "hook": " ".join(str(parsed.get("hook") or "").split()[:7]).strip(),
            "subtitle": " ".join(str(parsed.get("subtitle") or "").split()[:12]).strip(),
            "badge": " ".join(str(parsed.get("badge") or "").split()[:2]).strip(),
            "why": " ".join(str(parsed.get("why") or "").split())[:140],
        }
    except Exception as exc:
        logger.warning(f"AI thumbnail copy generation failed: {exc}")
        return None


def rerank_clip_candidates_with_ai(
    candidates,
    *,
    objective_label="find_viral_clips",
    output_mode="campaign_set",
    promo_angle=None,
    visual_notes=None,
    max_candidates=10,
):
    """
    Lightweight LLM reranker to improve the top clip ordering without replacing
    the existing heuristic pipeline. Falls back instantly when no OpenAI key is set.
    """
    global AI_RERANK_BACKOFF_UNTIL

    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY")
    if not api_key or not candidates:
        return candidates
    if AI_RERANK_BACKOFF_UNTIL and time.time() < AI_RERANK_BACKOFF_UNTIL:
        return candidates

    shortlist = [dict(candidate) for candidate in list(candidates)[: max(2, int(max_candidates or 10))]]
    if len(shortlist) < 2:
        return candidates

    objective = (
        "Choose the strongest moments for a full story edit that keeps the creator's original audio intact. "
        "Prefer clips that advance the narrative clearly, feel complete, and help cover beginning, middle, and payoff."
        if str(output_mode or "").strip().lower() == "story_edit"
        else "Choose the strongest standalone short-form promo or viral clip moments. Prefer clips with a fast hook, clear payoff, and high replay potential."
    )

    packaged_candidates = []
    candidate_ids = {}
    generic_caption_suggestions = {
        "visual moment",
        "watch this",
        "timed highlight",
        "hero clip",
        "proof clip",
        "support clip",
        "trim candidate",
    }

    for index, candidate in enumerate(shortlist):
        candidate_id = str(candidate.get("id") or f"candidate_{index}")
        candidate_ids[candidate_id] = index
        midpoint = (
            float(candidate.get("start", 0.0) or 0.0)
            + float(candidate.get("end", candidate.get("start", 0.0)) or 0.0)
        ) / 2.0
        visual_note = nearest_visual_note(visual_notes, midpoint) if visual_notes else None
        packaged_candidates.append(
            {
                "id": candidate_id,
                "start": round(float(candidate.get("start", 0.0) or 0.0), 2),
                "end": round(float(candidate.get("end", candidate.get("start", 0.0)) or 0.0), 2),
                "duration": round(float(candidate.get("duration", 0.0) or 0.0), 2),
                "heuristicScore": round(float(candidate.get("viralScore", 0.0) or 0.0), 2),
                "text": str(candidate.get("text") or "").strip()[:280],
                "reason": str(candidate.get("reason") or "").strip()[:220],
                "captionSuggestion": str(candidate.get("captionSuggestion") or "").strip()[:80],
                "contentType": str(candidate.get("contentType") or "general").strip(),
                "visualNote": str((visual_note or {}).get("caption") or (visual_note or {}).get("label") or "").strip()[:80],
            }
        )

    prompt = (
        "You are an expert short-form editor and clip strategist.\n"
        f"Objective: {objective}\n"
        f"Mode: {output_mode or 'campaign_set'}\n"
        f"Promo angle: {promo_angle or 'general'}\n\n"
        "Score each candidate from 0-100 using editorial judgment, then rank them best to worst.\n"
        "Look for: immediate clarity, memorable tension/payoff, emotional energy, clean standalone context, and usefulness for packaging.\n"
        "For story_edit mode, prefer chronology-friendly beats and coherent narrative progression.\n"
        "Return strict JSON only in this format:\n"
        "{\"ranking\": [{\"id\": \"candidate_id\", \"score\": 87, \"why\": \"short reason\", \"hook\": \"2-6 word hook\"}]}\n\n"
        f"Candidates:\n{json.dumps(packaged_candidates, ensure_ascii=True)}"
    )

    try:
        import requests

        response = requests.post(
            (os.getenv("OPENAI_API_BASE") or "https://api.openai.com") + "/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": os.getenv("OPENAI_MODEL_GPT4O_MINI") or os.getenv("OPENAI_MODEL_GPT4O") or "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.15,
                "max_tokens": 900,
            },
            timeout=25,
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"]
        raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        parsed = json.loads(raw)
        ranking = parsed.get("ranking") if isinstance(parsed, dict) else None
        if not isinstance(ranking, list):
            return candidates

        ranking_map = {}
        ranked_ids = []
        for item in ranking:
            if not isinstance(item, dict):
                continue
            candidate_id = str(item.get("id") or "").strip()
            if not candidate_id or candidate_id not in candidate_ids or candidate_id in ranking_map:
                continue
            try:
                ai_score = max(0.0, min(100.0, float(item.get("score", 0.0) or 0.0)))
            except Exception:
                ai_score = 0.0
            why = " ".join(str(item.get("why") or "").split())[:140]
            hook = " ".join(str(item.get("hook") or "").split()[:7]).strip()
            ranking_map[candidate_id] = {"score": ai_score, "why": why, "hook": hook}
            ranked_ids.append(candidate_id)

        if not ranking_map:
            return candidates

        enriched_candidates = []
        for index, candidate in enumerate(candidates):
            updated = dict(candidate)
            candidate_id = str(updated.get("id") or f"candidate_{index}")
            if not updated.get("id"):
                updated["id"] = candidate_id
            rerank = ranking_map.get(candidate_id)
            if rerank:
                heuristic_score = float(updated.get("viralScore", 0.0) or 0.0)
                blend_ratio = 0.48 if str(output_mode or "").strip().lower() == "story_edit" else 0.38
                blended_score = (heuristic_score * (1.0 - blend_ratio)) + (rerank["score"] * blend_ratio)
                updated["viralScore"] = round(max(10.0, min(99.0, blended_score)), 2)
                updated["aiRankScore"] = round(rerank["score"], 2)
                if rerank["why"]:
                    updated["aiReason"] = rerank["why"]
                    current_reason = str(updated.get("reason") or "").strip()
                    if rerank["why"].lower() not in current_reason.lower():
                        updated["reason"] = f"{current_reason} + {rerank['why']}" if current_reason else rerank["why"]
                if rerank["hook"]:
                    current_caption = str(updated.get("captionSuggestion") or "").strip()
                    if not current_caption or current_caption.lower() in generic_caption_suggestions:
                        updated["captionSuggestion"] = rerank["hook"]
                    if not str(updated.get("hookText") or "").strip():
                        updated["hookText"] = rerank["hook"]
            enriched_candidates.append(updated)

        top_ranked = []
        used_ids = set()
        for candidate_id in ranked_ids:
            for candidate in enriched_candidates:
                resolved_id = str(candidate.get("id") or "")
                if resolved_id == candidate_id and candidate_id not in used_ids:
                    top_ranked.append(candidate)
                    used_ids.add(candidate_id)
                    break

        remaining_candidates = [
            candidate
            for candidate in enriched_candidates
            if str(candidate.get("id") or "") not in used_ids
        ]
        return top_ranked + remaining_candidates
    except Exception as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code == 429:
            AI_RERANK_BACKOFF_UNTIL = time.time() + 180
            logger.info("AI clip reranking is cooling down for 3 minutes after rate limiting.")
        else:
            logger.warning(f"AI clip reranking skipped: {exc}")
        return candidates


def _chunk_words(words, max_words=5):
    """Split words into display groups of max_words."""
    groups = []
    current = []
    for w in words:
        word_text = str(w.get("word", "")).strip()
        if not word_text:
            continue
        clean = re.sub(r"\[.*?\]|\(.*?\)", "", word_text).strip()
        if not clean:
            continue
        current.append(w)
        if len(current) >= max_words:
            groups.append(current)
            current = []
    if current:
        groups.append(current)
    return groups


# ============================================================
# SPEAKER TRACKING AUTO-REFRAME (Face detection + dynamic crop)
# ============================================================

def detect_speaker_positions(video_path, sample_interval=0.5):
    """
    Use OpenCV Haar cascade face detection to track speaker positions
    throughout the video. Returns a list of (timestamp, center_x_ratio, center_y_ratio) tuples.
    """
    face_cascade_paths = [
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml",
        cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml",
    ]

    face_cascade = None
    for cascade_path in face_cascade_paths:
        if os.path.exists(cascade_path):
            face_cascade = cv2.CascadeClassifier(cascade_path)
            break

    if face_cascade is None or face_cascade.empty():
        logger.warning("No Haar cascade found for face detection")
        return []

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1080)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1920)
    duration = total_frames / fps if fps > 0 else 0

    positions = []
    sample_times = [t for t in _frange(0, duration, sample_interval)]

    for t in sample_times:
        frame_no = int(t * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
        ret, frame = cap.read()
        if not ret:
            continue

        # Downscale for speed
        scale = min(1.0, 480.0 / max(frame.shape[1], 1))
        small = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=4, minSize=(30, 30))

        if len(faces) > 0:
            # Pick the largest face
            areas = [w * h for (x, y, w, h) in faces]
            best_idx = areas.index(max(areas))
            fx, fy, fw, fh = faces[best_idx]
            # Convert back to original scale
            cx = (fx + fw / 2) / scale / width
            cy = (fy + fh / 2) / scale / height
            positions.append((t, cx, cy))
        else:
            # No face detected — use center
            positions.append((t, 0.5, 0.5))

    cap.release()
    return positions


def _frange(start, stop, step):
    """Float range generator."""
    val = start
    while val < stop:
        yield round(val, 3)
        val += step


def smooth_positions(positions, window=5):
    """Apply rolling average to smooth face tracking path."""
    if len(positions) <= window:
        return positions

    smoothed = []
    for i in range(len(positions)):
        start = max(0, i - window // 2)
        end = min(len(positions), i + window // 2 + 1)
        window_slice = positions[start:end]
        avg_x = sum(p[1] for p in window_slice) / len(window_slice)
        avg_y = sum(p[2] for p in window_slice) / len(window_slice)
        smoothed.append((positions[i][0], avg_x, avg_y))
    return smoothed


def build_speaker_track_crop_filter(positions, src_width, src_height, target_aspect="9:16"):
    """
    Build FFmpeg sendcmd filter for dynamic cropping that follows the speaker.
    """
    if not positions:
        # Fallback to center crop
        return "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"

    aspect_map = {"9:16": (9, 16), "1:1": (1, 1), "16:9": (16, 9)}
    aspect_w, aspect_h = aspect_map.get(target_aspect, (9, 16))

    # Calculate crop dimensions
    if src_width / src_height > aspect_w / aspect_h:
        # Source is wider — crop width
        crop_h = src_height
        crop_w = int(crop_h * aspect_w / aspect_h)
    else:
        # Source is taller — crop height
        crop_w = src_width
        crop_h = int(crop_w * aspect_h / aspect_w)

    crop_w = min(crop_w, src_width)
    crop_h = min(crop_h, src_height)

    # Build sendcmd keyframes for dynamic crop position
    smoothed = smooth_positions(positions, window=7)
    keyframes = []
    for t, cx, cy in smoothed:
        # Center crop on face position
        crop_x = int(cx * src_width - crop_w / 2)
        crop_y = int(cy * src_height - crop_h / 2)
        # Clamp to bounds
        crop_x = max(0, min(crop_x, src_width - crop_w))
        crop_y = max(0, min(crop_y, src_height - crop_h))
        keyframes.append(f"{t:.3f} crop x {crop_x};\n{t:.3f} crop y {crop_y};")

    return keyframes, crop_w, crop_h


# ============================================================
# ENHANCED VIRALITY SCORING — Audio energy + motion analysis
# ============================================================

def analyze_audio_energy(video_path, segment_duration=1.0):
    """
    Analyze audio energy levels throughout the video by decoding mono PCM and
    computing per-segment RMS levels in Python. This avoids FFmpeg astats
    hangs on unusual source files.
    """
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                video_path,
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-f",
                "s16le",
                "-",
            ],
            stderr=subprocess.PIPE,
            stdout=subprocess.PIPE,
            timeout=90,
        )

        audio_bytes = result.stdout or b""
        if not audio_bytes:
            return []

        samples = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
        if samples.size == 0:
            return []

        sample_rate = 16000
        segment_seconds = max(0.25, float(segment_duration or 1.0))
        chunk_size = max(1, int(sample_rate * segment_seconds))
        rms_values = []
        for index, start in enumerate(range(0, samples.size, chunk_size)):
            chunk = samples[start : start + chunk_size]
            if chunk.size == 0:
                continue
            normalized = chunk / 32768.0
            rms = float(np.sqrt(np.mean(np.square(normalized))))
            db = -80.0 if rms <= 1e-6 else float(20.0 * np.log10(rms))
            rms_values.append((round(index * segment_seconds, 2), db))
        return rms_values
    except Exception as e:
        logger.warning(f"Audio energy analysis failed: {e}")
        return []


def analyze_visual_motion(video_path, sample_interval=1.0):
    """
    Analyze visual motion intensity using frame differencing.
    Higher values = more action/movement.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = total_frames / fps if fps > 0 else 0
    motion_scores = []
    prev_gray = None

    for t in _frange(0, duration, sample_interval):
        frame_no = int(t * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
        ret, frame = cap.read()
        if not ret:
            continue

        # Downscale for speed
        small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

        if prev_gray is not None:
            diff = cv2.absdiff(gray, prev_gray)
            motion = float(np.mean(diff)) / 255.0  # Normalize 0-1
            motion_scores.append((t, motion))
        prev_gray = gray

    cap.release()
    return motion_scores


PROMO_ROLE_RECIPES = {
    "hook_slap": {"placements": ["start", "center", "end", "center"], "pace": "fast"},
    "proof_snap": {"placements": ["center", "start", "end", "center"], "pace": "steady"},
    "replay_angle": {"placements": ["end", "center", "start", "end"], "pace": "fast"},
    "last_hit": {"placements": ["start", "center", "center", "end"], "pace": "steady"},
    "receipt_open": {"placements": ["start", "center", "end"], "pace": "steady"},
    "proof_stack": {"placements": ["center", "center", "end", "start"], "pace": "steady"},
    "result_glimpse": {"placements": ["end", "center", "end"], "pace": "fast"},
    "trust_close": {"placements": ["start", "center", "end"], "pace": "slow"},
    "pain_first": {"placements": ["start", "center", "end"], "pace": "steady"},
    "turning_point": {"placements": ["center", "end", "center"], "pace": "fast"},
    "clean_fix": {"placements": ["start", "center", "end"], "pace": "steady"},
    "after_state": {"placements": ["center", "end", "end"], "pace": "slow"},
    "feel_this": {"placements": ["center", "center", "end"], "pace": "slow"},
    "breathing_space": {"placements": ["start", "center", "end"], "pace": "slow"},
    "crescendo_pull": {"placements": ["start", "center", "end", "end"], "pace": "steady"},
    "stay_close": {"placements": ["center", "end"], "pace": "slow"},
    "sharp_claim": {"placements": ["start", "center", "end"], "pace": "fast"},
}


def build_promo_segment_durations(total_duration, pace):
    total = max(6.0, float(total_duration or 30.0))
    base_segment = {
        "fast": 2.15,
        "steady": 2.75,
        "slow": 3.35,
    }.get(str(pace or "steady"), 2.75)

    segment_count = max(4, min(22, int(round(total / base_segment))))
    raw = []
    for index in range(segment_count):
        if index == 0:
            raw.append(max(1.8, base_segment * 0.82))
        elif index == segment_count - 1:
            raw.append(max(2.2, base_segment * 1.16))
        elif index % 4 == 0:
            raw.append(base_segment * 1.12)
        else:
            raw.append(base_segment)

    current_total = sum(raw)
    scale = total / current_total if current_total > 0 else 1.0
    scaled = [max(1.7, round(duration * scale, 2)) for duration in raw]
    scaled[-1] = round(max(1.7, total - sum(scaled[:-1])), 2)
    return scaled


def build_story_edit_segment_durations(total_duration, pace):
    total = max(12.0, min(300.0, float(total_duration or 120.0)))
    base_segment = {
        "fast": 4.2,
        "steady": 5.2,
        "slow": 6.4,
    }.get(str(pace or "steady"), 5.2)
    segment_count = max(8, min(34, int(round(total / base_segment))))
    raw = []
    for index in range(segment_count):
        if index == 0:
            raw.append(base_segment * 0.74)
        elif index == segment_count - 1:
            raw.append(base_segment * 1.28)
        elif index % 5 == 0:
            raw.append(base_segment * 1.18)
        elif index % 3 == 0:
            raw.append(base_segment * 0.86)
        else:
            raw.append(base_segment)

    current_total = sum(raw)
    scale = total / current_total if current_total > 0 else 1.0
    scaled = [max(2.4, round(duration * scale, 2)) for duration in raw]
    scaled[-1] = round(max(2.4, total - sum(scaled[:-1])), 2)
    return scaled


def select_segment_window(candidate, desired_duration, placement):
    start = float(candidate.get("start", 0.0))
    end = float(candidate.get("end", start))
    available = max(0.0, end - start)
    clip_duration = max(2.0, min(float(desired_duration or available or 2.0), available or desired_duration or 2.0))

    if available <= clip_duration + 0.15:
        return round(start, 2), round(start + clip_duration, 2)

    slack = max(0.0, available - clip_duration)
    if placement == "end":
        chosen_start = start + slack
    elif placement == "center":
        chosen_start = start + slack / 2.0
    else:
        chosen_start = start
    chosen_end = chosen_start + clip_duration
    return round(chosen_start, 2), round(chosen_end, 2)


def promo_candidate_overlap_ratio(left_candidate, right_candidate):
    left_start = float(left_candidate.get("start", 0.0))
    left_end = float(left_candidate.get("end", left_start))
    right_start = float(right_candidate.get("start", 0.0))
    right_end = float(right_candidate.get("end", right_start))
    overlap = max(0.0, min(left_end, right_end) - max(left_start, right_start))
    shorter = max(0.01, min(left_end - left_start, right_end - right_start))
    return overlap / shorter


def build_diverse_promo_candidate_pool(ranked_candidates, max_candidates=18):
    if not ranked_candidates:
        return []

    scored_candidates = sorted(
        [dict(candidate) for candidate in ranked_candidates if candidate.get("duration", 0) >= 1.5],
        key=lambda candidate: (
            float(candidate.get("viralScore", 0.0)),
            float(candidate.get("duration", 0.0)),
        ),
        reverse=True,
    )
    if not scored_candidates:
        scored_candidates = [dict(candidate) for candidate in ranked_candidates]

    selected = []
    for candidate in scored_candidates:
        candidate_text = str(candidate.get("text") or "").strip().lower()
        candidate_center = (
            float(candidate.get("start", 0.0)) + float(candidate.get("end", candidate.get("start", 0.0)))
        ) / 2.0
        candidate_key = build_promo_semantic_key(
            candidate.get("text"),
            candidate.get("captionSuggestion"),
            candidate.get("visualLabel"),
        )
        is_duplicate = False
        for existing in selected:
            existing_text = str(existing.get("text") or "").strip().lower()
            existing_center = (
                float(existing.get("start", 0.0)) + float(existing.get("end", existing.get("start", 0.0)))
            ) / 2.0
            existing_key = build_promo_semantic_key(
                existing.get("text"),
                existing.get("captionSuggestion"),
                existing.get("visualLabel"),
            )
            if promo_candidate_overlap_ratio(candidate, existing) >= 0.42:
                is_duplicate = True
                break
            if candidate_text and candidate_text == existing_text and abs(candidate_center - existing_center) < 8.0:
                is_duplicate = True
                break
            if candidate_key and candidate_key == existing_key and abs(candidate_center - existing_center) < 24.0:
                is_duplicate = True
                break
        if is_duplicate:
            continue
        selected.append(candidate)
        if len(selected) >= max_candidates:
            break

    return selected or [dict(scored_candidates[0])]


def build_timed_promo_candidates(source_duration, motion_scores=None, audio_energy=None, target_duration=30, max_candidates=32):
    duration = max(0.0, float(source_duration or 0.0))
    if duration < 2.0:
        return []

    window = max(3.0, min(7.0, float(target_duration or 30.0) / 5.0))
    step = max(2.5, window * 0.72)
    starts = []
    current = 0.0
    while current < max(0.1, duration - 1.5) and len(starts) < max_candidates * 2:
        starts.append(round(current, 2))
        current += step

    def local_signal(samples, start, end):
        if not samples:
            return 0.0
        values = [
            float(value)
            for timestamp, value in samples
            if float(timestamp) >= start and float(timestamp) <= end
        ]
        return sum(values) / len(values) if values else 0.0

    candidates = []
    for index, start in enumerate(starts):
        end = min(duration, start + window)
        if end - start < 1.7:
            continue
        motion = local_signal(motion_scores, start, end)
        energy = local_signal(audio_energy, start, end)
        score = 54 + min(28, motion * 220) + min(18, energy * 75)
        candidates.append(
            {
                "id": f"timed_{index}",
                "start": round(start, 2),
                "end": round(end, 2),
                "duration": round(end - start, 2),
                "viralScore": round(score),
                "reason": "Timed product story beat",
                "text": "",
            }
        )

    return sorted(candidates, key=lambda item: item.get("viralScore", 0), reverse=True)[:max_candidates]


def enrich_candidates_with_visual_notes(candidates, visual_notes=None):
    if not candidates or not visual_notes:
        return candidates

    enriched = []
    for candidate in candidates:
        updated = dict(candidate)
        midpoint = (
            float(updated.get("start", 0.0) or 0.0)
            + float(updated.get("end", updated.get("start", 0.0)) or 0.0)
        ) / 2.0
        visual_note = nearest_visual_note(visual_notes, midpoint)
        if visual_note:
            note_caption = str(visual_note.get("caption") or visual_note.get("label") or "").strip()
            if note_caption:
                if not str(updated.get("text") or "").strip():
                    updated["text"] = note_caption
                current_caption = str(updated.get("captionSuggestion") or "").strip().lower()
                if not current_caption or current_caption in {"visual moment", "watch this", "timed highlight"}:
                    updated["captionSuggestion"] = note_caption
                updated["visualLabel"] = str(visual_note.get("label") or note_caption).strip()
        enriched.append(updated)
    return enriched


def build_promo_segment_caption(role, segment_index, total_segments, source_text="", visual_note=None):
    role_caption = str((role or {}).get("captionFallback") or "").strip()
    source_words = [
        word
        for word in re.split(r"\s+", str(source_text or "").strip())
        if word and len(word) <= 18
    ]
    if len(source_words) >= 2:
        return " ".join(source_words[: min(6, max(2, len(source_words)))])

    if visual_note:
        note_caption = str(visual_note.get("caption") or visual_note.get("label") or "").strip()
        if note_caption:
            return " ".join(note_caption.split()[:6])

    opening = role_caption or "Watch This"
    sequence = [
        opening,
        "The Key Moment",
        "See The Shift",
        "Proof On Screen",
        "Why It Matters",
        "The Result",
        "Stay With It",
        "Now It Clicks",
    ]
    if segment_index >= total_segments - 1:
        return "The Final Payoff"
    return sequence[segment_index % len(sequence)]


def nearest_visual_note(visual_notes, time_seconds):
    if not visual_notes:
        return None
    target = float(time_seconds or 0.0)
    return min(
        visual_notes,
        key=lambda note: abs(float(note.get("time", 0.0) or 0.0) - target),
    )


def build_visual_chapter_notes(video_path, source_duration, max_frames=16):
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY")
    if not api_key:
        return []

    duration = max(0.0, float(source_duration or 0.0))
    if duration < 2.0:
        return []

    try:
        import requests
    except Exception:
        return []

    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        return []

    sample_count = max(4, min(int(max_frames or 16), 18))
    sample_times = [
        round(duration * ((index + 0.5) / sample_count), 2)
        for index in range(sample_count)
    ]

    frame_items = []
    for sample_time in sample_times:
        capture.set(cv2.CAP_PROP_POS_MSEC, sample_time * 1000.0)
        ok, frame = capture.read()
        if not ok or frame is None:
            continue
        height, width = frame.shape[:2]
        max_side = max(width, height)
        if max_side > 720:
            scale = 720.0 / max_side
            frame = cv2.resize(frame, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
        ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 72])
        if not ok:
            continue
        frame_items.append(
            {
                "time": sample_time,
                "image": base64.b64encode(encoded.tobytes()).decode("utf-8"),
            }
        )
    capture.release()

    if not frame_items:
        return []

    content = [
        {
            "type": "text",
            "text": (
                "You are labeling frames from a long video for short promotional edits. "
                "The content may be a product demo, podcast, choir/gospel performance, event, tutorial, vlog, gaming, food, travel, or business video. "
                "For each frame, return a concise 2-6 word caption describing only what is visibly happening: people, setting, action, emotion, product, screen, stage, performance, crowd, or result. "
                "Do not invent spoken words, translations, lyrics, or quotes. If language/audio is unclear, use visual labels such as Live Choir Moment, Crowd Reaction, Product Demo, Speaker Moment, or Tutorial Step. "
                "Avoid generic filler and avoid 'visual moment'. Use words a viewer can understand on screen. "
                "Return strict JSON only as an array: [{\"time\": number, \"label\": string, \"caption\": string}]."
            ),
        }
    ]
    for item in frame_items:
        content.append({"type": "text", "text": f"Frame time: {item['time']}s"})
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{item['image']}",
                    "detail": "low",
                },
            }
        )

    try:
        response = requests.post(
            (os.getenv("OPENAI_API_BASE") or "https://api.openai.com") + "/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": os.getenv("OPENAI_MODEL_GPT4O_MINI") or os.getenv("OPENAI_MODEL_GPT4O") or "gpt-4o-mini",
                "messages": [{"role": "user", "content": content}],
                "temperature": 0.2,
                "max_tokens": 900,
            },
            timeout=45,
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"]
        raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            return []
        notes = []
        for index, item in enumerate(parsed):
            if not isinstance(item, dict):
                continue
            time_value = item.get("time")
            if time_value is None and index < len(frame_items):
                time_value = frame_items[index]["time"]
            caption = str(item.get("caption") or item.get("label") or "").strip()
            if not caption:
                continue
            notes.append(
                {
                    "time": round(float(time_value or 0.0), 2),
                    "label": str(item.get("label") or caption).strip(),
                    "caption": " ".join(caption.split()[:6]),
                }
            )
        return notes
    except Exception as exc:
        logger.warning(f"Visual promo frame labeling failed; using structural captions only: {exc}")
        return []


def build_promo_montage_plans(ranked_candidates, target_duration, max_clips, campaign_roles, source_duration=None, visual_notes=None):
    if not ranked_candidates:
        return []

    role_list = list(campaign_roles or [])
    all_candidates = build_diverse_promo_candidate_pool(ranked_candidates, max_candidates=max(28, int(max_clips or 4) * 12))
    raw_candidates_by_time = sorted(
        [dict(candidate) for candidate in ranked_candidates if candidate.get("duration", 0) >= 1.5],
        key=lambda candidate: float(candidate.get("start", 0.0) or 0.0),
    )
    inferred_duration = max(
        [float(candidate.get("end", 0.0) or 0.0) for candidate in all_candidates] + [float(source_duration or 0.0), 1.0]
    )
    plan_count = max(1, int(max_clips or 1))

    plans = []
    for plan_index in range(plan_count):
        role = role_list[plan_index % len(role_list)] if role_list else {}
        recipe = PROMO_ROLE_RECIPES.get(str(role.get("id") or ""), {"placements": ["start", "center", "end"], "pace": "steady"})
        is_story_master = bool(role.get("storyMaster"))
        role_duration = float(role.get("preferredDurationSeconds") or target_duration or 30)
        segment_durations = (
            build_story_edit_segment_durations(role_duration, recipe.get("pace"))
            if is_story_master
            else build_promo_segment_durations(min(role_duration, target_duration), recipe.get("pace"))
        )
        placements = recipe.get("placements") or ["start", "center", "end"]
        chapter_start = 0.0 if is_story_master else inferred_duration * (plan_index / plan_count)
        chapter_end = inferred_duration if is_story_master else inferred_duration * ((plan_index + 1) / plan_count)
        chapter_center = (chapter_start + chapter_end) / 2.0
        candidate_source = raw_candidates_by_time if is_story_master and raw_candidates_by_time else all_candidates
        chapter_pool = [
            candidate
            for candidate in candidate_source
            if chapter_start <= (
                (float(candidate.get("start", 0.0)) + float(candidate.get("end", candidate.get("start", 0.0)))) / 2.0
            ) <= chapter_end
        ]
        if len(chapter_pool) < max(4, len(segment_durations) // 2):
            chapter_pool = sorted(
                candidate_source,
                key=lambda candidate: abs(
                    ((float(candidate.get("start", 0.0)) + float(candidate.get("end", candidate.get("start", 0.0)))) / 2.0)
                    - chapter_center
                ),
            )[: max(6, len(segment_durations))]
        if is_story_master:
            chapter_pool = sorted(
                chapter_pool,
                key=lambda candidate: (
                    float(candidate.get("start", 0.0) or 0.0),
                    -float(candidate.get("viralScore", 0.0) or 0.0),
                ),
            )
        else:
            chapter_pool = sorted(
                chapter_pool,
                key=lambda candidate: (
                    float(candidate.get("viralScore", 0.0)),
                    -abs(
                        ((float(candidate.get("start", 0.0)) + float(candidate.get("end", candidate.get("start", 0.0)))) / 2.0)
                        - chapter_center
                    ),
                ),
                reverse=True,
            )

        used = set()
        segments = []
        score_total = 0.0
        timeline_centers = []
        used_ranges = []
        used_caption_keys = set()
        used_semantic_keys = set()
        used_display_captions = set()
        story_cursor = float(chapter_start)

        for segment_index, desired_duration in enumerate(segment_durations):
            chosen_candidate = None
            for offset in range(len(chapter_pool)):
                if is_story_master:
                    target_progress = segment_index / max(1, len(segment_durations) - 1)
                    target_time = inferred_duration * target_progress
                    ordered_pool = [
                        item
                        for item in chapter_pool
                        if float(item.get("start", 0.0) or 0.0) >= max(chapter_start, story_cursor - 1.5)
                    ]
                    if not ordered_pool:
                        ordered_pool = list(chapter_pool)
                    ordered_pool = sorted(
                        ordered_pool,
                        key=lambda item: (
                            0 if float(item.get("start", 0.0) or 0.0) >= story_cursor - 1.5 else 1,
                            abs(
                                (
                                    float(item.get("start", 0.0))
                                    + float(item.get("end", item.get("start", 0.0)))
                                )
                                / 2.0
                                - target_time
                            ),
                            -min(12, len(str(item.get("text") or "").split())),
                            0 if str(item.get("visualLabel") or item.get("text") or "").strip() else 1,
                            -float(item.get("viralScore", 0.0)),
                        ),
                    )
                    candidate = ordered_pool[offset % len(ordered_pool)]
                else:
                    candidate = chapter_pool[(segment_index * 2 + offset) % len(chapter_pool)]
                candidate_id = candidate.get("id") or f"cand-{plan_index}-{segment_index}-{offset}"
                if candidate_id in used and len(chapter_pool) > len(segment_durations):
                    continue
                overlap_conflict = False
                candidate_start = float(candidate.get("start", 0.0) or 0.0)
                candidate_end = float(candidate.get("end", candidate.get("start", 0.0)) or candidate_start)
                for used_start, used_end in used_ranges:
                    overlap = max(0.0, min(candidate_end, used_end) - max(candidate_start, used_start))
                    smaller = max(0.01, min(candidate_end - candidate_start, used_end - used_start))
                    if overlap / smaller >= (0.18 if is_story_master else 0.38):
                        overlap_conflict = True
                        break
                if overlap_conflict:
                    continue
                candidate_center = (
                    candidate_start + candidate_end
                ) / 2.0
                semantic_key = build_promo_semantic_key(
                    candidate.get("text"),
                    candidate.get("captionSuggestion"),
                    candidate.get("visualLabel"),
                )
                min_center_spacing = max(3.0, float(desired_duration or 3.0) * (0.75 if is_story_master else 0.45))
                if any(abs(candidate_center - center) < min_center_spacing for center in timeline_centers) and len(chapter_pool) > 3:
                    continue
                if semantic_key and semantic_key in used_semantic_keys and len(chapter_pool) > len(segment_durations):
                    continue
                caption_seed = " ".join(
                    str(
                        candidate.get("text")
                        or candidate.get("captionSuggestion")
                        or candidate.get("visualLabel")
                        or ""
                    ).strip().lower().split()[:6]
                )
                if caption_seed and caption_seed in used_caption_keys and len(chapter_pool) > len(segment_durations):
                    continue
                chosen_candidate = candidate
                used.add(candidate_id)
                timeline_centers.append(candidate_center)
                if semantic_key:
                    used_semantic_keys.add(semantic_key)
                break

            if not chosen_candidate:
                if is_story_master:
                    break
                chosen_candidate = chapter_pool[segment_index % len(chapter_pool)]

            placement = placements[segment_index % len(placements)]
            seg_start, seg_end = select_segment_window(chosen_candidate, desired_duration, placement)
            if seg_end - seg_start < 1.5:
                continue

            score_total += float(chosen_candidate.get("viralScore", 0.0))
            segment_midpoint = (seg_start + seg_end) / 2.0
            visual_note = nearest_visual_note(visual_notes, segment_midpoint)
            used_ranges.append((seg_start, seg_end))
            story_cursor = max(story_cursor, seg_end + max(1.25, float(desired_duration or 0.0) * 0.18))
            caption_seed = " ".join(
                str(
                    chosen_candidate.get("text")
                    or chosen_candidate.get("captionSuggestion")
                    or (visual_note or {}).get("caption")
                    or (visual_note or {}).get("label")
                    or ""
                ).strip().lower().split()[:6]
            )
            if caption_seed:
                used_caption_keys.add(caption_seed)
            segment_caption = build_promo_segment_caption(
                role,
                segment_index,
                len(segment_durations),
                chosen_candidate.get("text"),
                visual_note,
            )
            caption_display_key = build_promo_semantic_key(segment_caption)
            if caption_display_key and caption_display_key in used_display_captions:
                segment_caption = build_promo_segment_caption(
                    role,
                    segment_index,
                    len(segment_durations),
                    "",
                    None,
                )
                caption_display_key = build_promo_semantic_key(segment_caption)
            if caption_display_key:
                used_display_captions.add(caption_display_key)
            segments.append(
                {
                    "start": seg_start,
                    "end": seg_end,
                    "duration": round(seg_end - seg_start, 2),
                    "sourceId": chosen_candidate.get("id"),
                    "placement": placement,
                    "captionSeed": caption_seed,
                    "sourceTextPreview": " ".join(
                        str(
                            chosen_candidate.get("text")
                            or chosen_candidate.get("captionSuggestion")
                            or chosen_candidate.get("visualLabel")
                            or ""
                        ).strip().split()[:12]
                    ),
                    "caption": segment_caption,
                    "visualLabel": visual_note.get("label") if visual_note else None,
                }
            )

        if not segments:
            continue

        montage_duration = round(sum(segment["duration"] for segment in segments), 2)
        continuous_story_duration = round(max(0.0, float(segments[-1]["end"]) - float(segments[0]["start"])), 2)
        unique_captions = []
        for segment in segments:
            caption = str(segment.get("caption") or "").strip()
            if caption and caption.lower() not in {item.lower() for item in unique_captions}:
                unique_captions.append(caption)
            if len(unique_captions) >= 2:
                break
        plan_text = " / ".join(unique_captions) if unique_captions else role.get("captionFallback") or "Promo montage"
        debug_windows = [
            f"{idx}:{float(segment['start']):.2f}-{float(segment['end']):.2f}:{(segment.get('captionSeed') or segment.get('sourceTextPreview') or 'no-seed')}"
            for idx, segment in enumerate(segments)
        ]
        plans.append(
            {
                "id": f"promo_plan_{plan_index}",
                "start": segments[0]["start"],
                "end": segments[-1]["end"],
                "duration": montage_duration,
                "montageDuration": montage_duration,
                "sourceSpanDuration": continuous_story_duration,
                "viralScore": round(score_total / max(1, len(segments))),
                "reason": "Full story promo edit" if is_story_master else "Promo montage edit",
                "text": plan_text,
                "segments": segments,
                "campaignRole": role.get("id") if role else None,
                "campaignRoleLabel": role.get("label") if role else None,
                "renderStrategy": "promo_montage",
                "storyMaster": is_story_master,
                "debugSummary": " | ".join(debug_windows),
            }
        )

    return plans or [dict(all_candidates[0])]


def _build_story_master_chapter_blueprint(target_total):
    if target_total <= 60:
        return [
            {"id": "hook", "label": "Hook", "progress": 0.08, "placement": "start"},
            {"id": "setup", "label": "Setup", "progress": 0.30, "placement": "center"},
            {"id": "proof", "label": "Proof", "progress": 0.58, "placement": "center"},
            {"id": "payoff", "label": "Payoff", "progress": 0.84, "placement": "end"},
        ]
    if target_total <= 75:
        return [
            {"id": "hook", "label": "Hook", "progress": 0.08, "placement": "start"},
            {"id": "setup", "label": "Setup", "progress": 0.24, "placement": "center"},
            {"id": "build", "label": "Build", "progress": 0.45, "placement": "center"},
            {"id": "proof", "label": "Proof", "progress": 0.66, "placement": "center"},
            {"id": "payoff", "label": "Payoff", "progress": 0.86, "placement": "end"},
        ]
    return [
        {"id": "hook", "label": "Hook", "progress": 0.08, "placement": "start"},
        {"id": "setup", "label": "Setup", "progress": 0.22, "placement": "center"},
        {"id": "tension", "label": "Tension", "progress": 0.38, "placement": "center"},
        {"id": "proof", "label": "Proof", "progress": 0.56, "placement": "center"},
        {"id": "reflection", "label": "Reflection", "progress": 0.72, "placement": "center"},
        {"id": "payoff", "label": "Payoff", "progress": 0.88, "placement": "end"},
    ]


def summarize_story_confidence(score):
    numeric_score = float(score or 0.0)
    if numeric_score >= 84:
        return "High confidence"
    if numeric_score >= 68:
        return "Medium confidence"
    return "Needs review"


def build_story_confidence_summary(
    story_master_plan,
    derived_short_plans=None,
    transcript_quality=None,
    *,
    analysis_reused=False,
):
    master = story_master_plan or {}
    transcript_stats = transcript_quality or {}
    segments = list(master.get("segments") or [])
    speech_confidence = round(
        sum(float(segment.get("transcriptConfidence", 0.0) or 0.0) for segment in segments) / max(1, len(segments)),
        3,
    ) if segments else round(float(transcript_stats.get("averageConfidence", 0.0) or 0.0), 3)
    confidence_score = round(float(master.get("confidenceScore", 0.0) or 0.0), 1)
    confidence_label = master.get("confidenceLabel") or summarize_story_confidence(confidence_score)
    chapter_count = len(segments)
    derived_count = len(list(derived_short_plans or []))
    reliable_segment_ratio = round(float(transcript_stats.get("reliableSegmentRatio", 0.0) or 0.0), 3)
    reused_prefix = "Reused saved analysis." if analysis_reused else "Fresh analysis."
    summary = (
        f"{reused_prefix} Story master uses {chapter_count} ordered chapters with preserved original audio flow. "
        f"Speech confidence {speech_confidence:.2f}; {derived_count} derived shorts share the same narrative source."
    )
    return {
        "confidenceScore": confidence_score,
        "confidenceLabel": confidence_label,
        "speechConfidence": speech_confidence,
        "chapterCount": chapter_count,
        "derivedShortCount": derived_count,
        "reliableSegmentRatio": reliable_segment_ratio,
        "analysisReused": bool(analysis_reused),
        "analysisFocus": "podcast_interview",
        "summary": summary,
    }


def build_podcast_story_master_plan(ranked_candidates, target_duration, source_duration=None, visual_notes=None):
    if not ranked_candidates:
        return None

    target_total = max(45.0, min(90.0, float(target_duration or 60.0)))
    source_total = max(1.0, float(source_duration or 0.0) or max(
        [float(candidate.get("end", 0.0) or 0.0) for candidate in ranked_candidates] + [1.0]
    ))
    blueprint = _build_story_master_chapter_blueprint(target_total)
    preferred_segment_duration = max(8.0, min(18.0, target_total / max(1, len(blueprint))))
    diverse_pool = build_diverse_promo_candidate_pool(ranked_candidates, max_candidates=28)
    if not diverse_pool:
        diverse_pool = [dict(candidate) for candidate in ranked_candidates]

    selected_segments = []
    used_ranges = []
    used_semantic_keys = set()
    story_cursor = 0.0

    for chapter_index, chapter in enumerate(blueprint):
        target_time = source_total * float(chapter.get("progress", 0.5) or 0.5)
        ordered_pool = sorted(
            diverse_pool,
            key=lambda candidate: (
                0 if float(candidate.get("start", 0.0) or 0.0) >= max(0.0, story_cursor - 1.5) else 1,
                abs(
                    (
                        float(candidate.get("start", 0.0) or 0.0)
                        + float(candidate.get("end", candidate.get("start", 0.0)) or 0.0)
                    ) / 2.0 - target_time
                ),
                -float(candidate.get("viralScore", 0.0) or 0.0),
                -float(candidate.get("transcriptConfidence", 0.0) or 0.0),
            ),
        )

        chosen_candidate = None
        for candidate in ordered_pool:
            candidate_start = float(candidate.get("start", 0.0) or 0.0)
            candidate_end = float(candidate.get("end", candidate.get("start", 0.0)) or candidate_start)
            candidate_duration = max(0.0, candidate_end - candidate_start)
            if candidate_duration < 5.0:
                continue
            overlap_conflict = False
            for used_start, used_end in used_ranges:
                overlap = max(0.0, min(candidate_end, used_end) - max(candidate_start, used_start))
                smaller = max(0.01, min(candidate_end - candidate_start, used_end - used_start))
                if overlap / smaller >= 0.28:
                    overlap_conflict = True
                    break
            if overlap_conflict:
                continue
            semantic_key = build_promo_semantic_key(
                candidate.get("text"),
                candidate.get("captionSuggestion"),
                candidate.get("visualLabel"),
            )
            if semantic_key and semantic_key in used_semantic_keys:
                continue
            chosen_candidate = dict(candidate)
            if semantic_key:
                used_semantic_keys.add(semantic_key)
            break

        if not chosen_candidate:
            continue

        desired_duration = min(
            max(6.0, preferred_segment_duration),
            max(6.0, float(chosen_candidate.get("duration", preferred_segment_duration) or preferred_segment_duration)),
        )
        seg_start, seg_end = select_segment_window(
            chosen_candidate,
            desired_duration,
            chapter.get("placement") or "center",
        )
        segment_midpoint = (seg_start + seg_end) / 2.0
        visual_note = nearest_visual_note(visual_notes, segment_midpoint)
        segment_caption = build_promo_segment_caption(
            {"captionFallback": chapter.get("label") or "Story Beat"},
            chapter_index,
            len(blueprint),
            chosen_candidate.get("text"),
            visual_note,
        )

        selected_segments.append(
            {
                "start": seg_start,
                "end": seg_end,
                "duration": round(seg_end - seg_start, 2),
                "sourceId": chosen_candidate.get("id"),
                "placement": chapter.get("placement") or "center",
                "chapterId": chapter.get("id"),
                "chapterLabel": chapter.get("label"),
                "caption": segment_caption,
                "captionSeed": " ".join(str(chosen_candidate.get("text") or "").strip().lower().split()[:6]),
                "sourceTextPreview": " ".join(
                    str(
                        chosen_candidate.get("text")
                        or chosen_candidate.get("captionSuggestion")
                        or chosen_candidate.get("visualLabel")
                        or ""
                    ).strip().split()[:14]
                ),
                "visualLabel": visual_note.get("label") if visual_note else chosen_candidate.get("visualLabel"),
                "viralScore": round(float(chosen_candidate.get("viralScore", 0.0) or 0.0), 2),
                "transcriptConfidence": round(float(chosen_candidate.get("transcriptConfidence", 0.0) or 0.0), 3),
            }
        )
        used_ranges.append((seg_start, seg_end))
        story_cursor = max(story_cursor, seg_end + 0.75)

    selected_segments = sorted(selected_segments, key=lambda segment: float(segment.get("start", 0.0) or 0.0))
    if len(selected_segments) < 3:
        return None

    montage_duration = round(sum(float(segment.get("duration", 0.0) or 0.0) for segment in selected_segments), 2)
    source_span_duration = round(
        max(0.0, float(selected_segments[-1]["end"]) - float(selected_segments[0]["start"])),
        2,
    )
    avg_score = round(
        sum(float(segment.get("viralScore", 0.0) or 0.0) for segment in selected_segments) / max(1, len(selected_segments)),
        2,
    )
    avg_transcript_confidence = round(
        sum(float(segment.get("transcriptConfidence", 0.0) or 0.0) for segment in selected_segments) / max(1, len(selected_segments)),
        3,
    )
    confidence_score = round((avg_score * 0.72) + (avg_transcript_confidence * 100 * 0.28), 1)
    confidence_label = summarize_story_confidence(confidence_score)

    unique_captions = []
    for segment in selected_segments:
        caption = str(segment.get("caption") or "").strip()
        if caption and caption.lower() not in {item.lower() for item in unique_captions}:
            unique_captions.append(caption)
        if len(unique_captions) >= 2:
            break

    return {
        "id": "story_master",
        "start": selected_segments[0]["start"],
        "end": selected_segments[-1]["end"],
        "duration": montage_duration,
        "montageDuration": montage_duration,
        "sourceSpanDuration": source_span_duration,
        "viralScore": avg_score,
        "reason": "Coherent podcast story master",
        "text": " / ".join(unique_captions) if unique_captions else "The Full Story",
        "segments": selected_segments,
        "campaignRole": "story_master",
        "campaignRoleLabel": "Story Master",
        "renderStrategy": "story_master_chapters",
        "storyMaster": True,
        "selectionWhy": (
            f"Built from {len(selected_segments)} chronological conversation chapters with preserved audio flow. "
            f"Average speech confidence: {avg_transcript_confidence:.2f}."
        ),
        "confidenceScore": confidence_score,
        "confidenceLabel": confidence_label,
        "analysisFocus": "podcast_interview",
        "debugSummary": " | ".join(
            f"{segment.get('chapterId')}:{float(segment['start']):.2f}-{float(segment['end']):.2f}:{segment.get('sourceTextPreview') or 'no-preview'}"
            for segment in selected_segments
        ),
    }


def derive_shorts_from_story_master(story_master_plan, max_shorts=3):
    if not story_master_plan or not story_master_plan.get("segments"):
        return []

    segments = list(story_master_plan.get("segments") or [])
    if not segments:
        return []

    middle_segments = segments[1:-1] if len(segments) > 2 else segments[1:]
    proof_segment = None
    if middle_segments:
        proof_segment = max(
            middle_segments,
            key=lambda segment: (
                float(segment.get("viralScore", 0.0) or 0.0),
                float(segment.get("transcriptConfidence", 0.0) or 0.0),
            ),
        )

    ordered_source_segments = []
    for candidate in [segments[0], proof_segment or segments[min(1, len(segments) - 1)], segments[-1]]:
        if not candidate:
            continue
        if any(existing.get("sourceId") == candidate.get("sourceId") and existing.get("start") == candidate.get("start") for existing in ordered_source_segments):
            continue
        ordered_source_segments.append(candidate)
        if len(ordered_source_segments) >= max(1, int(max_shorts or 3)):
            break

    derived_roles = [
        ("derived_hook", "Hook Cut", "Derived from the story master opening beat."),
        ("derived_proof", "Proof Cut", "Derived from the strongest middle chapter in the story master."),
        ("derived_close", "Close Cut", "Derived from the story master payoff and takeaway."),
    ]

    derived = []
    for index, segment in enumerate(ordered_source_segments[: max(1, int(max_shorts or 3))]):
        role_id, role_label, role_reason = derived_roles[min(index, len(derived_roles) - 1)]
        derived.append(
            {
                "id": f"{role_id}_{index}",
                "start": float(segment.get("start", 0.0) or 0.0),
                "end": float(segment.get("end", segment.get("start", 0.0)) or 0.0),
                "duration": round(float(segment.get("duration", 0.0) or 0.0), 2),
                "montageDuration": round(float(segment.get("duration", 0.0) or 0.0), 2),
                "sourceSpanDuration": round(float(segment.get("duration", 0.0) or 0.0), 2),
                "viralScore": round(float(segment.get("viralScore", 0.0) or 0.0), 2),
                "reason": role_reason,
                "text": str(segment.get("caption") or segment.get("sourceTextPreview") or role_label).strip(),
                "segments": [dict(segment)],
                "campaignRole": role_id,
                "campaignRoleLabel": role_label,
                "renderStrategy": "story_master_derived_short",
                "storyMaster": False,
                "derivedFromStoryMaster": True,
                "selectionWhy": "Derived directly from the approved story master so the campaign stays coherent and stable.",
                "confidenceScore": round(float(segment.get("viralScore", 0.0) or 0.0), 1),
                "confidenceLabel": summarize_story_confidence(float(segment.get("viralScore", 0.0) or 0.0)),
                "analysisFocus": "podcast_interview",
                "debugSummary": f"{segment.get('chapterId')}:{float(segment.get('start', 0.0) or 0.0):.2f}-{float(segment.get('end', 0.0) or 0.0):.2f}",
            }
        )

    return derived


def compute_enhanced_viral_score(
    base_score, start_time, end_time, text,
    keyword_weights, audio_energy=None, motion_scores=None,
    content_type="general", transcript_confidence=0.0, speech_trusted=False,
):
    """
    Enhanced viral scoring combining keyword matching, audio energy,
    visual motion, hook strength, and segment completeness.
    """
    score = base_score
    reasons = []
    music_like = content_type in {"choir_performance", "music_performance"}

    # 1. Keyword boost (already computed in base_score typically)
    keyword_boost, found_keywords = score_text_for_virality(text, keyword_weights)
    if keyword_boost > 0 and base_score < 90:
        # Only add if not already counted
        pass

    # 2. Audio energy boost — loud = engaging
    if audio_energy:
        segment_energy = [e for t, e in audio_energy if start_time <= t <= end_time]
        if segment_energy:
            avg_energy = sum(segment_energy) / len(segment_energy)
            peak_energy = max(segment_energy)
            # Energy spikes (laughter, emphasis, applause)
            if peak_energy > -15:
                score += 8
                reasons.append("High audio energy")
            elif avg_energy > -25:
                score += 4
                if speech_trusted and transcript_confidence >= 0.58:
                    reasons.append("Active speech")
                elif music_like:
                    reasons.append("Steady performance energy")
                else:
                    reasons.append("Active audio")
            # Volume contrast (quiet→loud transition)
            if len(segment_energy) >= 3:
                energy_change = max(segment_energy) - min(segment_energy)
                if energy_change > 15:
                    score += 5
                    reasons.append("Dynamic audio shift")

    # 3. Visual motion boost — action moments
    if motion_scores:
        segment_motion = [m for t, m in motion_scores if start_time <= t <= end_time]
        if segment_motion:
            avg_motion = sum(segment_motion) / len(segment_motion)
            peak_motion = max(segment_motion)
            if peak_motion > 0.15:
                score += 6
                reasons.append("High visual motion")
            elif avg_motion > 0.08:
                score += 3
                reasons.append("Active visuals")

    # 4. Hook strength — first 3 seconds matter most
    if audio_energy and start_time < 3:
        first_3s = [e for t, e in audio_energy if t <= 3]
        if first_3s and max(first_3s) > -20:
            score += 5
            reasons.append("Strong opening energy" if music_like and not speech_trusted else "Strong opening")

    # 5. Duration sweet spot — 15-45s is optimal for shorts
    duration = end_time - start_time
    if 15 <= duration <= 45:
        score += 4
        reasons.append("Optimal length")
    elif duration < 8:
        score -= 3
    elif duration > 60:
        score -= 5

    # 6. Question/command presence (engagement triggers)
    if text and speech_trusted:
        lower_text = text.lower()
        if "?" in lower_text:
            score += 4
            reasons.append("Question hook")
        if any(cmd in lower_text for cmd in ["you need to", "here's how", "don't", "stop", "watch"]):
            score += 3
            reasons.append("Direct address")

    return min(99, max(10, score)), reasons


def build_timed_viral_windows(
    source_duration,
    keyword_weights,
    audio_energy=None,
    motion_scores=None,
    max_candidates=10,
    reason_prefix="Smart timing fallback",
):
    """
    Always give Find Viral Clips something useful to show when a source has
    weak scene cuts, odd FPS metadata, no audio, or no transcript.
    """
    windows = []
    try:
        duration = float(source_duration or 0)
    except Exception:
        duration = 0
    if duration <= 2.0:
        return windows

    fallback_count = max(1, min(max_candidates, int(np.ceil(duration / 15.0))))
    fallback_duration = min(30.0, max(8.0, duration / max(1, fallback_count)))

    for index in range(fallback_count):
        start_time_sec = min(max(0.0, duration - fallback_duration), index * fallback_duration)
        end_time_sec = min(duration, start_time_sec + fallback_duration)
        if end_time_sec - start_time_sec < 2.0:
            continue
        enhanced_score, enhanced_reasons = compute_enhanced_viral_score(
            58,
            start_time_sec,
            end_time_sec,
            "",
            keyword_weights,
            audio_energy,
            motion_scores,
        )
        windows.append({
            "id": f"timed_{index}",
            "start": round(start_time_sec, 2),
            "end": round(end_time_sec, 2),
            "duration": round(end_time_sec - start_time_sec, 2),
            "viralScore": min(99, enhanced_score),
            "reason": reason_prefix + " + " + " + ".join(enhanced_reasons or ["balanced pacing"]),
            "text": f"Timed highlight window {index + 1}",
            "source": "timed_fallback",
        })

    return windows


# ============================================================
# CLIP TEMPLATES (server-side preset definitions)
# ============================================================

CLIP_TEMPLATES = {
    "podcast": {
        "label": "Podcast / Interview",
        "aspect_ratio": "9:16",
        "caption_style": "bold_pop",
        "smart_crop_mode": "speaker_track",
        "auto_captions": True,
        "hook_template": "freeze_text",
        "music": None,
        "target_duration": (30, 60),
        "description": "Speaker-tracking crop with bold captions. Perfect for talking-head clips.",
    },
    "gaming": {
        "label": "Gaming Highlights",
        "aspect_ratio": "9:16",
        "caption_style": "glow",
        "smart_crop_mode": "center",
        "auto_captions": True,
        "hook_template": "zoom_focus",
        "music": None,
        "target_duration": (15, 45),
        "description": "High-energy with neon glow captions and zoom focus hooks.",
    },
    "tutorial": {
        "label": "Tutorial / How-To",
        "aspect_ratio": "9:16",
        "caption_style": "minimal",
        "smart_crop_mode": "center",
        "auto_captions": True,
        "hook_template": "blur_reveal",
        "music": None,
        "target_duration": (30, 60),
        "description": "Clean minimal captions with blur reveal hooks. Great for educational content.",
    },
    "reaction": {
        "label": "Reaction / Commentary",
        "aspect_ratio": "9:16",
        "caption_style": "bounce",
        "smart_crop_mode": "speaker_track",
        "auto_captions": True,
        "hook_template": "zoom_focus",
        "music": None,
        "target_duration": (15, 30),
        "description": "Bouncy animated captions following the speaker. High energy.",
    },
    "story": {
        "label": "Story / Vlog",
        "aspect_ratio": "9:16",
        "caption_style": "karaoke",
        "smart_crop_mode": "speaker_track",
        "auto_captions": True,
        "hook_template": "blur_reveal",
        "music": None,
        "target_duration": (15, 60),
        "description": "Karaoke-style word-by-word captions. Perfect for vlogs and stories.",
    },
}

PLATFORM_PRESETS = {
    "tiktok": {"max_duration": 60, "aspect_ratio": "9:16", "hook_style": "fast", "cta": None},
    "youtube_shorts": {"max_duration": 58, "aspect_ratio": "9:16", "hook_style": "direct", "cta": "Subscribe for more!"},
    "instagram_reels": {"max_duration": 90, "aspect_ratio": "9:16", "hook_style": "visual", "cta": None},
    "instagram_feed": {"max_duration": 60, "aspect_ratio": "1:1", "hook_style": "clean", "cta": None},
    "youtube": {"max_duration": None, "aspect_ratio": "16:9", "hook_style": "intro", "cta": None},
    "facebook": {"max_duration": 60, "aspect_ratio": "9:16", "hook_style": "direct", "cta": None},
}


def upload_file_to_firebase(local_path, destination_path=None):
    """
    Uploads file to Firebase (Signed URL + Fallback).
    """
    def local_output_fallback():
        if not ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK:
            return None
        if not local_path or not os.path.exists(local_path):
            return None

        try:
            os.makedirs(LOCAL_MEDIA_OUTPUT_DIR, exist_ok=True)
            requested_name = os.path.basename(destination_path or local_path)
            safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", requested_name).strip("-.")
            stem, extension = os.path.splitext(safe_name or os.path.basename(local_path))
            final_extension = extension or os.path.splitext(local_path)[1] or ".bin"
            published_name = f"{stem or 'media-output'}-{uuid.uuid4().hex[:8]}{final_extension}"
            published_path = os.path.join(LOCAL_MEDIA_OUTPUT_DIR, published_name)
            shutil.copy2(local_path, published_path)
            fallback_url = f"{LOCAL_MEDIA_OUTPUT_BASE_URL}/local-output/{published_name}"
            logger.warning(f"Using local media output fallback: {fallback_url}")
            return fallback_url
        except Exception as fallback_error:
            logger.error(f"Local media output fallback failed: {fallback_error}")
            return None

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
        return local_output_fallback()


def resolve_local_output_path(file_name):
    safe_name = os.path.basename(str(file_name or "")).strip()
    if not safe_name or safe_name in {".", ".."}:
        return None
    resolved_path = os.path.abspath(os.path.join(LOCAL_MEDIA_OUTPUT_DIR, safe_name))
    if not resolved_path.startswith(os.path.abspath(LOCAL_MEDIA_OUTPUT_DIR) + os.sep):
        return None
    if not os.path.exists(resolved_path):
        return None
    return resolved_path

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

        target_collections = ["video_edits"]
        if str(job_id).startswith("promo-"):
            target_collections.insert(0, "clip_analyses")

        for collection_name in target_collections:
            db.collection(collection_name).document(job_id).set(data, merge=True)
        logger.info(f"Firestore updated for job {job_id}: {data.get('status')}")
    except Exception as e:
        FIREBASE_STATUS_UPDATES_ENABLED = False
        logger.error(f"Failed to update Firestore for job {job_id}: {e}")


SMART_PROMO_WORKFLOW_TYPE = "podcast_v1"
SMART_PROMO_PIPELINE_VERSION = "2026-05-podcast-v1"


def build_analysis_artifact_id(source_key, workflow_type=SMART_PROMO_WORKFLOW_TYPE, pipeline_version=SMART_PROMO_PIPELINE_VERSION):
    raw = f"{workflow_type}:{pipeline_version}:{str(source_key or '').strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]


def load_analysis_artifact(source_key, workflow_type=SMART_PROMO_WORKFLOW_TYPE, pipeline_version=SMART_PROMO_PIPELINE_VERSION):
    safe_source_key = str(source_key or "").strip()
    if not safe_source_key:
        return None
    try:
        db = firestore.client()
        artifact_id = build_analysis_artifact_id(safe_source_key, workflow_type, pipeline_version)
        snapshot = db.collection("analysis_artifacts").document(artifact_id).get()
        if not snapshot.exists:
            return None
        payload = snapshot.to_dict() or {}
        payload["artifactId"] = artifact_id
        return payload
    except Exception as exc:
        logger.warning(f"Could not load Smart Promo analysis artifact: {exc}")
        return None


def store_analysis_artifact(source_key, payload, workflow_type=SMART_PROMO_WORKFLOW_TYPE, pipeline_version=SMART_PROMO_PIPELINE_VERSION):
    safe_source_key = str(source_key or "").strip()
    if not safe_source_key or not isinstance(payload, dict):
        return None
    try:
        db = firestore.client()
        artifact_id = build_analysis_artifact_id(safe_source_key, workflow_type, pipeline_version)
        artifact_payload = {
            **payload,
            "sourceKey": safe_source_key,
            "workflowType": workflow_type,
            "pipelineVersion": pipeline_version,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        if not artifact_payload.get("createdAt"):
            artifact_payload["createdAt"] = firestore.SERVER_TIMESTAMP
        db.collection("analysis_artifacts").document(artifact_id).set(artifact_payload, merge=True)
        return artifact_id
    except Exception as exc:
        logger.warning(f"Could not store Smart Promo analysis artifact: {exc}")
        return None


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

# Allow local frontend to call worker directly for ingest
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MEDIA_WORKER_CONCURRENCY = max(1, int(os.getenv("MEDIA_WORKER_CONCURRENCY", "1")))
MEDIA_WORKER_MAX_VIDEO_SECONDS = max(30, int(os.getenv("MEDIA_WORKER_MAX_VIDEO_SECONDS", "1800")))
MEDIA_WORKER_MAX_FILE_MB = max(25, int(os.getenv("MEDIA_WORKER_MAX_FILE_MB", "750")))
MEDIA_WORKER_JOB_TIMEOUT_SECONDS = max(120, int(os.getenv("MEDIA_WORKER_JOB_TIMEOUT_SECONDS", "3600")))
MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS = max(
    30,
    int(os.getenv("MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS", "900")),
)
heavy_job_semaphore = asyncio.Semaphore(MEDIA_WORKER_CONCURRENCY)

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


async def run_queued_heavy_job(job_id, feature, coroutine_factory):
    queued_at = time.time()
    update_firestore_job(job_id, {
        "status": "queued",
        "progress": 1,
        "stage": "queued",
        "feature": feature,
        "workerConcurrency": MEDIA_WORKER_CONCURRENCY,
    })
    async with heavy_job_semaphore:
        processing_started = time.time()
        update_firestore_job(job_id, {
            "status": "processing",
            "progress": 5,
            "stage": "processing",
            "queuedMs": int((processing_started - queued_at) * 1000),
            "feature": feature,
        })
        try:
            return await asyncio.wait_for(coroutine_factory(), timeout=MEDIA_WORKER_JOB_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            logger.error(
                json.dumps({
                    "event": "job_timeout",
                    "jobId": job_id,
                    "feature": feature,
                    "timeoutSeconds": MEDIA_WORKER_JOB_TIMEOUT_SECONDS,
                })
            )
            update_firestore_job(job_id, {
                "status": "failed",
                "stage": "failed",
                "error": f"Processing exceeded safe timeout of {MEDIA_WORKER_JOB_TIMEOUT_SECONDS} seconds.",
            })

async def run_subprocess_async(
    cmd,
    check=True,
    stdout=None,
    stderr=None,
    text=False,
    job_context=None,
    timeout_seconds=None,
):
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
        try:
            stdout_data, stderr_data = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout_seconds,
            )
        except asyncio.TimeoutError as timeout_error:
            logger.error(
                "Command timed out after %ss for job %s: %s",
                timeout_seconds,
                job_context or "internal_subprocess",
                " ".join(cmd),
            )
            try:
                process.terminate()
                await asyncio.wait_for(process.wait(), timeout=8)
            except Exception:
                try:
                    process.kill()
                    await process.wait()
                except Exception:
                    pass
            raise subprocess.TimeoutExpired(cmd, timeout_seconds) from timeout_error
        
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


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "python_media_worker",
        "worker_state": current_job_info,
        "concurrency": MEDIA_WORKER_CONCURRENCY,
        "maxVideoSeconds": MEDIA_WORKER_MAX_VIDEO_SECONDS,
        "maxFileMb": MEDIA_WORKER_MAX_FILE_MB,
        "tmpDir": os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp")),
        "whisperReady": whisper is not None,
    }


@app.get("/local-output/{file_name}")
def get_local_output(file_name: str):
    output_path = resolve_local_output_path(file_name)
    if not output_path:
        raise HTTPException(status_code=404, detail="Local output not found")

    media_type, _ = mimetypes.guess_type(output_path)
    return FileResponse(
        output_path,
        media_type=media_type or "application/octet-stream",
        filename=os.path.basename(output_path),
    )


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

             cmd.extend(["-c:v", GPU_VIDEO_ENCODER, "-preset", GPU_PRESET, "-crf", "23", "-c:a", "aac", "-y", final_pass_path])
             
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
                    "-c:v", GPU_VIDEO_ENCODER, "-preset", GPU_PRESET, "-crf", "23",
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
            "-c:v", GPU_VIDEO_ENCODER, "-preset", GPU_PRESET, "-crf", "23",
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
        
        output_url = upload_file_to_firebase(output_path)
        return {
            "status": "completed", 
            "job_id": job_id, 
            "output_path": output_path,
            "output_url": output_url
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
             output_url = upload_file_to_firebase(output_path)
             return {
                 "status": "completed", 
                 "job_id": job_id, 
                 "output_path": output_path,
                 "output_url": output_url
             }
        else:
             raise Exception("Output file not generated")

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
    force_fresh = bool(request.get("force_fresh"))
    scan_nonce = str(request.get("scan_nonce") or "")
    if not video_url:
         raise HTTPException(status_code=400, detail="video_url is required")

    logger.info(
        f"Received clip analysis request at {start_time} force_fresh={force_fresh} nonce={'set' if scan_nonce else 'none'}"
    )
    
    # Check Busy State
    if current_job_info["status"] == "busy":
         logger.warning("Worker busy, rejecting analyze request")
         raise HTTPException(status_code=503, detail="Worker is busy. Try again or call /reset")
    
    set_current_process(None, "analyze_clips", "analyze")
    
    job_id = str(uuid.uuid4())
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR):
        os.makedirs(SHARED_TMP_DIR)

    raw_input_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_analyze_raw")
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
        # 1. Materialize the source video locally. This handles Firebase signed URLs
        # and falls back to direct HTTP download when ffmpeg cannot ingest a URL.
        logger.info(f"Materializing video source for analysis from {video_url}...")
        raw_input_path = await materialize_video_input(video_url, raw_input_path)
        try:
            logger.info("Normalizing clip analysis source for stable scene/motion detection...")
            await create_promo_analysis_copy(raw_input_path, input_path)
        except Exception as normalize_error:
            logger.warning(f"Analysis source normalization failed; using raw input. reason={normalize_error}")
            input_path = raw_input_path
        audio_present = media_has_audio_stream(input_path)

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
            if not audio_present:
                logger.info("Task [Whisper]: Skipped because source has no audio stream.")
                return []
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
            from scenedetect import SceneManager, open_video
            from scenedetect.detectors import ContentDetector
            
            # Extreme Downscale for Speed (ContentDetector is robust)
            # 8 is good, 10-12 is faster for HD content
            video = open_video(input_path)
            try:
                video.set_downscale_factor(8)
            except Exception:
                pass

            sm = SceneManager()
            sm.add_detector(ContentDetector(threshold=27.0)) # Slightly lower threshold for speed

            sm.detect_scenes(video=video)
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
                scene_list = []
            else:
                scene_list = results[1]
                
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logger.error(f"Parallel Analysis Job Error Type: {type(e).__name__}, Msg: {e}\nTraceback: {tb}")
            raise HTTPException(status_code=500, detail=f"Analysis engine failed: {repr(e)}")

        logger.info(f"Parallel Analysis Complete. Scenes: {len(scene_list)}, Segments: {len(transcription_segments)}")

        # 4.5. Enhanced scoring: audio energy + visual motion analysis (parallel)
        audio_energy = []
        motion_scores = []
        try:
            logger.info("Running enhanced scoring analysis (audio energy + motion)...")
            future_audio = loop.run_in_executor(None, analyze_audio_energy, input_path, 1.0)
            future_motion = loop.run_in_executor(None, analyze_visual_motion, input_path, 1.0)
            scoring_results = await asyncio.gather(future_audio, future_motion, return_exceptions=True)
            if not isinstance(scoring_results[0], Exception):
                audio_energy = scoring_results[0]
            if not isinstance(scoring_results[1], Exception):
                motion_scores = scoring_results[1]
            logger.info(f"Enhanced scoring data: {len(audio_energy)} audio samples, {len(motion_scores)} motion samples")
        except Exception as scoring_err:
            logger.warning(f"Enhanced scoring failed (non-fatal): {scoring_err}")

        scenes = []

        source_duration = get_media_duration(input_path)

        # Detect content type for caption intelligence
        content_type_info = detect_content_type(input_path, audio_energy)
        content_type_label = content_type_info.get("contentType", "general")
        logger.info(f"Content type: {content_type_label} (conf={content_type_info.get('confidence')})")
        transcription_segments = annotate_transcription_segments(transcription_segments)
        transcript_quality = summarize_transcript_quality(transcription_segments, content_type_label)
        logger.info(
            "Transcript quality: avg=%.2f reliable=%s ratio=%.2f mode=%s",
            transcript_quality.get("averageConfidence", 0.0),
            transcript_quality.get("reliableSegmentCount", 0),
            transcript_quality.get("reliableSegmentRatio", 0.0),
            transcript_quality.get("analysisMode"),
        )

        if not scene_list:
            logger.warning(f"SceneDetect returned no scenes. Using timed viral windows for {source_duration:.2f}s source.")
            scenes.extend(build_timed_viral_windows(
                source_duration,
                VIRAL_KEYWORDS,
                audio_energy,
                motion_scores,
                reason_prefix="Smart timing fallback",
            ))
            for scene in scenes:
                scene["hasAudio"] = audio_present
                scene["contentType"] = content_type_label
        else:
            # Map visual scenes to data structure
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
                scene_transcript_confidence = 0.0

                # 4. Integrate Transcription (Keyword Spotting)
                scene_segments_txt = [
                    seg for seg in transcription_segments 
                    if (
                        seg["start"] < end_time_sec
                        and seg["end"] > start_time_sec
                        and float(seg.get("transcriptConfidence", 0.0) or 0.0)
                        >= (0.72 if content_type_label in {"choir_performance", "music_performance"} else 0.34)
                    )
                ]
                
                if scene_segments_txt:
                    full_text = " ".join([s["text"].strip() for s in scene_segments_txt]).lower()
                    scene_text = full_text[:150] + "..." if len(full_text) > 150 else full_text
                    scene_transcript_confidence = round(
                        sum(float(s.get("transcriptConfidence", 0.0) or 0.0) for s in scene_segments_txt)
                        / max(1, len(scene_segments_txt)),
                        3,
                    )
                    
                    keyword_boost, found_keywords = score_text_for_virality(full_text, VIRAL_KEYWORDS)
                    
                    if keyword_boost > 0:
                        score += keyword_boost
                        reason_parts.append(f"Keywords: {', '.join(found_keywords)}")
                        score = min(99, score)
                    
                    if "!" in full_text: 
                        score += 5

                # Enhanced scoring with audio + motion
                enhanced_score, enhanced_reasons = compute_enhanced_viral_score(
                    score, start_time_sec, end_time_sec, scene_text,
                    VIRAL_KEYWORDS,
                    audio_energy,
                    motion_scores,
                    content_type=content_type_label,
                    transcript_confidence=scene_transcript_confidence,
                    speech_trusted=scene_transcript_confidence >= float(transcript_quality.get("speechEvidenceThreshold", 0.62) or 0.62),
                )
                reason_parts.extend(enhanced_reasons)

                scenes.append({
                    "id": f"scene_{i}",
                    "start": round(start_time_sec, 2),
                    "end": round(end_time_sec, 2),
                    "duration": round(duration_sec, 2),
                    "viralScore": min(99, enhanced_score),
                    "reason": " + ".join(reason_parts),
                    "text": scene_text or f"Visual moment {i+1}",
                    "source": "scene_detect",
                    "hasAudio": audio_present,
                    "contentType": content_type_label,
                    "transcriptConfidence": scene_transcript_confidence,
                })

        if not scenes:
            source_duration = get_media_duration(input_path)
            logger.warning(
                f"SceneDetect produced {len(scene_list)} raw scenes but no usable clip windows. "
                f"Using timed viral windows for {source_duration:.2f}s source."
            )
            scenes.extend(build_timed_viral_windows(
                source_duration,
                VIRAL_KEYWORDS,
                audio_energy,
                motion_scores,
                reason_prefix="Recovered from unusable scene cuts",
            ))
            for scene in scenes:
                scene["hasAudio"] = audio_present

        transcript_windows = build_transcript_windows(
            transcription_segments,
            VIRAL_KEYWORDS,
            min_segment_confidence=0.72 if content_type_label in {"choir_performance", "music_performance"} else 0.42,
            min_window_confidence=0.78 if content_type_label in {"choir_performance", "music_performance"} else 0.52,
        ) if transcript_quality.get("allowTranscriptWindows") else []
        aligned_windows = [align_clip_to_scenes(candidate, scene_list) for candidate in transcript_windows]
        for candidate in aligned_windows:
            candidate["contentType"] = content_type_label
        ranked_candidates = enrich_clip_candidates(
            dedupe_ranked_candidates(scenes + aligned_windows, max_results=15, source_duration=source_duration),
            audio_energy,
            motion_scores
        )
        if not ranked_candidates and scenes:
            ranked_candidates = enrich_clip_candidates(scenes[:15], audio_energy, motion_scores)
        ranked_candidates = rerank_clip_candidates_with_ai(
            ranked_candidates,
            objective_label="find_viral_clips",
            output_mode="campaign_set",
            promo_angle=str(request.get("promo_angle") or "").strip().lower(),
            max_candidates=10,
        )
        if force_fresh:
            ranked_candidates = apply_fresh_scan_variation(ranked_candidates, scan_nonce)
            campaign_roles = ["Lead Hook", "Proof Beat", "Replay Beat", "Trust Close", "Support Cut"]
            for fresh_index, candidate in enumerate(ranked_candidates):
                candidate["campaignOrder"] = fresh_index + 1
                candidate["campaignRole"] = campaign_roles[min(fresh_index, len(campaign_roles) - 1)]

        for candidate in ranked_candidates:
            candidate["hasAudio"] = audio_present
            if not audio_present:
                candidate["analysisMode"] = "visual_only"
                candidate["reason"] = str(candidate.get("reason") or "").replace("No speech detected", "visual-only scan")
                candidate["reasons"] = [
                    "Visual-only scan: no audio stream was detected",
                    "Scene changes and motion shaped this clip candidate",
                    "Use generated hook text and thumbnails to package the moment",
                ]
                candidate["captionSuggestion"] = candidate.get("captionSuggestion") or "Visual Moment"

        for index, candidate in enumerate(ranked_candidates[:8]):
            try:
                visual_assets = build_promo_visual_assets(
                    input_path,
                    candidate,
                    job_id,
                    index,
                    "youtube_bold" if index == 0 else "hype",
                )
                candidate["visualAssets"] = visual_assets
                candidate["thumbnailOptions"] = [
                    asset for asset in visual_assets if asset.get("type") == "thumbnail"
                ]
                candidate["posterOptions"] = [
                    asset for asset in visual_assets if asset.get("type") in {"poster", "story"}
                ]
                if visual_assets:
                    candidate["thumbnailUrl"] = visual_assets[0].get("url")
            except Exception as visual_error:
                logger.warning(f"Find Viral Clips visual packaging failed for candidate {index}: {visual_error}")

        return {
            "status": "completed",
            "job_id": job_id,
            "scenes": ranked_candidates,
            "clipSuggestions": ranked_candidates,
            "transcriptQuality": transcript_quality,
            "contentType": content_type_label,
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
        for cleanup_path in {raw_input_path, input_path}:
            if cleanup_path and os.path.exists(cleanup_path):
                try: os.remove(cleanup_path)
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

class MultiCamSource(BaseModel):
    id: str
    url: str
    label: str = ""
    offset_seconds: float = 0.0
    name: Optional[str] = None
    size: Optional[float] = None
    duration: Optional[float] = None
    cache_key: Optional[str] = None

class ExternalCleanAudioInput(BaseModel):
    url: str
    name: Optional[str] = None
    size: Optional[float] = None
    duration: Optional[float] = None
    offset_seconds: float = 0.0
    cache_key: Optional[str] = None

class CleanAudioSyncRequest(BaseModel):
    job_id: Optional[str] = None
    user_id: Optional[str] = None
    sources: List[MultiCamSource]
    external_audio: ExternalCleanAudioInput
    mix_mode: str = "external_only"
    output_aspect_ratio: str = "9:16"

class MultiCamSwitch(BaseModel):
    camera_id: str
    start_time: float = 0.0

class MultiCamSegment(BaseModel):
    camera_id: str
    timeline_start: float = 0.0
    timeline_end: float = 0.0
    source_start: float = 0.0
    source_end: float = 0.0

class RenderMultiCamRequest(BaseModel):
    sources: List[MultiCamSource]
    segments: Optional[List[MultiCamSegment]] = None
    switches: Optional[List[MultiCamSwitch]] = None
    auto_switch: bool = False
    audio_based_auto_switch: bool = True
    auto_switch_interval: float = 3.0
    auto_switch_aggressiveness: str = "balanced"
    primary_audio_camera_id: Optional[str] = None
    external_audio_url: Optional[str] = None
    external_audio_offset_seconds: float = 0.0
    external_audio_mix_mode: str = "external_only"
    external_audio_cache_key: Optional[str] = None
    overlap_start: float = 0.0
    overlap_duration: float = 0.0
    output_aspect_ratio: str = "9:16"
    job_id: Optional[str] = None
    async_mode: bool = False

multicam_face_detector = None

def get_multicam_face_detector():
    global multicam_face_detector
    if multicam_face_detector is not None:
        return multicam_face_detector

    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    if not os.path.exists(cascade_path):
        multicam_face_detector = None
        return None

    detector = cv2.CascadeClassifier(cascade_path)
    multicam_face_detector = detector if not detector.empty() else None
    return multicam_face_detector

def normalize_multicam_aggressiveness(value):
    normalized = str(value or "balanced").strip().lower()
    if normalized == "low":
        return "steady"
    if normalized == "high":
        return "dynamic"
    if normalized in {"steady", "balanced", "dynamic"}:
        return normalized
    return "balanced"

def get_multicam_switch_tuning(aggressiveness, interval_seconds):
    normalized = normalize_multicam_aggressiveness(aggressiveness)
    safe_interval = clamp_float(interval_seconds, 1.0, 10.0)

    tuning = {
        "steady": {
            "audio_bonus": 0.26,
            "continuity_bonus": 0.13,
            "primary_bonus": 0.07,
            "switch_threshold": 0.17,
            "low_confidence_threshold": 0.14,
            "low_confidence_hold": max(1.8, safe_interval * 1.15),
            "low_confidence_proximity": 0.04,
            "min_hold_factor": 1.2,
            "min_hold_floor": 1.8,
            "min_hold_cap": 4.4,
            "placeholder_penalty_weight": 0.62,
            "placeholder_source_penalty_weight": 0.38,
        },
        "dynamic": {
            "audio_bonus": 0.31,
            "continuity_bonus": 0.03,
            "primary_bonus": 0.03,
            "switch_threshold": 0.05,
            "low_confidence_threshold": 0.22,
            "low_confidence_hold": max(1.0, safe_interval * 0.62),
            "low_confidence_proximity": 0.12,
            "min_hold_factor": 0.62,
            "min_hold_floor": 0.95,
            "min_hold_cap": 2.6,
            "placeholder_penalty_weight": 0.52,
            "placeholder_source_penalty_weight": 0.26,
        },
        "balanced": {
            "audio_bonus": 0.28,
            "continuity_bonus": 0.07,
            "primary_bonus": 0.05,
            "switch_threshold": 0.12,
            "low_confidence_threshold": 0.18,
            "low_confidence_hold": max(1.5, safe_interval * 0.85),
            "low_confidence_proximity": 0.08,
            "min_hold_factor": 0.9,
            "min_hold_floor": 1.25,
            "min_hold_cap": 3.5,
            "placeholder_penalty_weight": 0.58,
            "placeholder_source_penalty_weight": 0.34,
        },
    }

    return tuning[normalized]

def estimate_multicam_placeholder_penalty(frame):
    if frame is None or getattr(frame, "size", 0) == 0:
        return 0.0

    try:
        preview = cv2.resize(frame, (96, 54), interpolation=cv2.INTER_AREA)
        preview_float = preview.astype(np.float32)
        hsv = cv2.cvtColor(preview, cv2.COLOR_BGR2HSV)

        column_texture = np.mean(np.std(preview_float, axis=0))
        column_means = np.mean(preview_float, axis=0)
        column_deltas = np.linalg.norm(np.diff(column_means, axis=0), axis=1)
        adjacent_delta = float(np.percentile(column_deltas, 88)) if column_deltas.size else 0.0
        low_texture_ratio = float(np.mean(np.std(preview_float, axis=0) < 14.0))
        saturation_mean = float(np.mean(hsv[:, :, 1]))
        gray = cv2.cvtColor(preview, cv2.COLOR_BGR2GRAY)
        vertical_edges = float(np.mean(np.abs(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3))))
        horizontal_edges = float(np.mean(np.abs(cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3))))
        vertical_dominance = vertical_edges / max(1.0, horizontal_edges)

        saturated_pixels = hsv[:, :, 1] > 92
        hue_bins = 0
        if np.any(saturated_pixels):
            hue_bins = len(np.unique((hsv[:, :, 0][saturated_pixels] / 15).astype(np.int32)))

        if saturation_mean > 140.0 and vertical_dominance > 1.8 and adjacent_delta > 20.0:
            return round(clamp_float(0.46 + ((vertical_dominance - 1.8) * 0.08), 0.0, 0.72), 4)

        if saturation_mean < 65.0 or low_texture_ratio < 0.58 or hue_bins < 4:
            return 0.0

        stripe_score = clamp_float(((16.0 - column_texture) / 16.0), 0.0, 1.0)
        band_transition_score = clamp_float((adjacent_delta - 18.0) / 44.0, 0.0, 1.0)
        palette_score = 1.0 if 5 <= hue_bins <= 10 else 0.35
        vertical_pattern_score = clamp_float((vertical_dominance - 1.4) / 1.3, 0.0, 1.0)

        return round(
            clamp_float(
                (stripe_score * 0.28)
                + (band_transition_score * 0.16)
                + (low_texture_ratio * 0.14)
                + (palette_score * 0.12)
                + (vertical_pattern_score * 0.3),
                0.0,
                0.72,
            ),
            4,
        )
    except Exception:
        return 0.0

def analyze_multicam_visual_windows(video_path, source_offset, overlap_start, overlap_duration, interval_seconds):
    safe_duration = max(0.0, float(overlap_duration or 0.0))
    if safe_duration <= 0.0:
        return []

    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        return []

    detector = get_multicam_face_detector()
    windows = []
    previous_gray = None
    current_start = 0.0
    step = clamp_float(interval_seconds, 0.75, 10.0)

    try:
        while current_start < safe_duration - 0.001:
            current_end = min(safe_duration, current_start + step)
            midpoint = current_start + ((current_end - current_start) / 2.0)
            relative_time = float(overlap_start or 0.0) + midpoint - float(source_offset or 0.0)
            capture.set(cv2.CAP_PROP_POS_MSEC, max(0.0, relative_time) * 1000.0)
            success, frame = capture.read()

            face_score = 0.0
            motion_score = 0.0
            face_count = 0
            placeholder_penalty = 0.0
            if success and frame is not None:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                placeholder_penalty = estimate_multicam_placeholder_penalty(frame)
                if detector is not None:
                    min_face = max(24, min(gray.shape[0], gray.shape[1]) // 7)
                    faces = detector.detectMultiScale(
                        gray,
                        scaleFactor=1.1,
                        minNeighbors=4,
                        minSize=(min_face, min_face),
                    )
                    face_count = len(faces)
                    if face_count:
                        frame_area = float(gray.shape[0] * gray.shape[1]) or 1.0
                        face_area = sum(w * h for (_, _, w, h) in faces)
                        face_score = min(1.0, (face_count * 0.22) + ((face_area / frame_area) * 8.0))

                if previous_gray is not None and previous_gray.shape == gray.shape:
                    motion_delta = cv2.absdiff(gray, previous_gray)
                    motion_score = min(1.0, float(np.mean(motion_delta)) / 28.0)
                previous_gray = gray

            windows.append(
                {
                    "start_time": round(current_start, 3),
                    "end_time": round(current_end, 3),
                    "sample_time": round(midpoint, 3),
                    "face_score": round(face_score, 4),
                    "motion_score": round(motion_score, 4),
                    "placeholder_penalty": placeholder_penalty,
                    "face_count": face_count,
                }
            )
            current_start = current_end
    finally:
        capture.release()

    return windows

def dedupe_multicam_switches(switches):
    ordered = sorted(switches, key=lambda item: float(item.get("start_time", 0.0)))
    deduped = []
    for item in ordered:
        if deduped and abs(float(deduped[-1]["start_time"]) - float(item["start_time"])) < 0.01:
            deduped[-1] = item
            continue
        if deduped and deduped[-1].get("camera_id") == item.get("camera_id"):
            continue
        deduped.append(item)
    return deduped

def smooth_multicam_switches(switches, overlap_duration, interval_seconds, aggressiveness="balanced"):
    safe_duration = max(0.0, float(overlap_duration or 0.0))
    if len(switches) < 2 or safe_duration <= 0.0:
        return switches

    tuning = get_multicam_switch_tuning(aggressiveness, interval_seconds)
    min_hold_seconds = min(
        max(clamp_float(interval_seconds, 1.0, 10.0) * tuning["min_hold_factor"], tuning["min_hold_floor"]),
        tuning["min_hold_cap"],
    )
    current = dedupe_multicam_switches(list(switches))
    changed = True

    while changed and len(current) > 1:
        changed = False
        for index in range(1, len(current)):
            segment_start = float(current[index]["start_time"])
            segment_end = (
                float(current[index + 1]["start_time"])
                if index + 1 < len(current)
                else safe_duration
            )
            segment_duration = max(0.0, segment_end - segment_start)
            if segment_duration >= min_hold_seconds:
                continue

            previous_item = current[index - 1] if index - 1 >= 0 else None
            next_item = current[index + 1] if index + 1 < len(current) else None
            current_score = float(current[index].get("score", 0.0))
            previous_score = float(previous_item.get("score", 0.0)) if previous_item else -1.0
            next_score = float(next_item.get("score", 0.0)) if next_item else -1.0

            if next_item and next_score > previous_score + 0.03:
                next_item["start_time"] = current[index]["start_time"]
                current.pop(index)
            elif previous_item:
                current[index]["camera_id"] = previous_item["camera_id"]
                current[index]["score"] = max(current_score, previous_score)
            else:
                current.pop(index)

            current = dedupe_multicam_switches(current)
            changed = True
            break

    return current

def is_time_in_silence(target_time, intervals):
    safe_time = float(target_time or 0.0)
    for start_time, end_time in intervals or []:
        if safe_time >= float(start_time) and safe_time < float(end_time):
            return True
    return False

def normalize_multicam_switches(request, prepared_sources, overlap_duration):
    safe_duration = max(0.0, float(overlap_duration or 0.0))
    source_ids = [source["id"] for source in prepared_sources]
    source_map = {source["id"]: source for source in prepared_sources}
    default_camera_id = request.primary_audio_camera_id or (source_ids[0] if source_ids else None)

    if not default_camera_id:
        return []

    interval = clamp_float(request.auto_switch_interval, 1.0, 10.0)
    tuning = get_multicam_switch_tuning(request.auto_switch_aggressiveness, interval)
    switches = []

    if request.auto_switch:
        current_time = 0.0
        current_camera_id = default_camera_id
        source_cursor = 0
        last_switch_time = 0.0

        while current_time < safe_duration - 0.01:
            if any(source.get("window_scores") for source in prepared_sources):
                ranked_sources = []
                for source in prepared_sources:
                    relative_time = float(request.overlap_start or 0.0) + current_time - source["offset_seconds"]
                    if relative_time < 0 or relative_time >= source["duration"]:
                        continue

                    window_scores = source.get("window_scores") or []
                    slot_index = min(
                        max(0, int(current_time / interval)),
                        max(0, len(window_scores) - 1),
                    )
                    slot = window_scores[slot_index] if window_scores else {}
                    raw_visual_score = (float(slot.get("face_score", 0.0)) * 0.65) + (
                        float(slot.get("motion_score", 0.0)) * 0.35
                    )
                    placeholder_penalty = float(slot.get("placeholder_penalty", 0.0))
                    source_placeholder_penalty = float(source.get("placeholder_score", 0.0))
                    visual_score = max(
                        0.0,
                        raw_visual_score
                        - (placeholder_penalty * tuning["placeholder_penalty_weight"])
                        - (source_placeholder_penalty * tuning["placeholder_source_penalty_weight"]),
                    )
                    speaking = source["has_audio"] and not is_time_in_silence(
                        relative_time, source.get("silence_intervals")
                    )
                    audio_bonus = tuning["audio_bonus"] if request.audio_based_auto_switch and speaking else 0.0
                    continuity_bonus = tuning["continuity_bonus"] if source["id"] == current_camera_id else 0.0
                    primary_bonus = tuning["primary_bonus"] if source["id"] == request.primary_audio_camera_id else 0.0

                    ranked_sources.append(
                        {
                            "camera_id": source["id"],
                            "score": visual_score + audio_bonus + continuity_bonus + primary_bonus,
                            "visual_score": visual_score,
                            "raw_visual_score": raw_visual_score,
                            "placeholder_penalty": placeholder_penalty,
                            "source_placeholder_penalty": source_placeholder_penalty,
                            "speaking": speaking,
                        }
                    )

                ranked_sources.sort(key=lambda item: item["score"], reverse=True)
                best_choice = ranked_sources[0]["camera_id"] if ranked_sources else current_camera_id
                current_choice = next(
                    (item for item in ranked_sources if item["camera_id"] == current_camera_id),
                    None,
                )
                low_confidence_mode = bool(ranked_sources) and max(
                    item["visual_score"] + (0.1 if item["speaking"] else 0.0) for item in ranked_sources
                ) < tuning["low_confidence_threshold"]
                time_since_last_switch = current_time - float(last_switch_time or 0.0)
                alternate_choice = next(
                    (item for item in ranked_sources if item["camera_id"] != current_camera_id),
                    None,
                )

                if current_choice and ranked_sources:
                    score_gap = ranked_sources[0]["score"] - current_choice["score"]
                    alternate_is_placeholder_regression = bool(alternate_choice and current_choice) and (
                        alternate_choice["source_placeholder_penalty"]
                        > current_choice["source_placeholder_penalty"] + 0.18
                    )
                    if (
                        low_confidence_mode
                        and alternate_choice
                        and not alternate_is_placeholder_regression
                        and time_since_last_switch >= tuning["low_confidence_hold"]
                        and not current_choice["speaking"]
                        and alternate_choice["visual_score"] >= current_choice["visual_score"] - tuning["low_confidence_proximity"]
                    ):
                        next_camera_id = alternate_choice["camera_id"]
                    else:
                        next_camera_id = current_camera_id if score_gap < tuning["switch_threshold"] else best_choice
                else:
                    next_camera_id = best_choice
                winning_score = float(ranked_sources[0]["score"]) if ranked_sources else 0.0
            else:
                next_camera_id = source_ids[source_cursor % len(source_ids)]
                source_cursor += 1
                winning_score = 0.0

            if not switches or switches[-1]["camera_id"] != next_camera_id:
                switches.append({
                    "camera_id": next_camera_id,
                    "start_time": round(current_time, 3),
                    "score": round(winning_score, 4),
                })
                last_switch_time = current_time
            current_camera_id = next_camera_id
            current_time += interval
    else:
        raw_switches = request.switches or []
        for switch in raw_switches:
            if switch.camera_id not in source_map:
                continue
            switches.append({
                "camera_id": switch.camera_id,
                "start_time": round(clamp_float(switch.start_time, 0.0, safe_duration), 3),
            })
        switches.sort(key=lambda item: item["start_time"])

    if not switches or switches[0]["start_time"] > 0.001:
        switches.insert(0, {"camera_id": default_camera_id, "start_time": 0.0})

    deduped = dedupe_multicam_switches(switches)
    if request.auto_switch:
        deduped = smooth_multicam_switches(
            deduped,
            safe_duration,
            interval,
            request.auto_switch_aggressiveness,
        )

    return [
        {"camera_id": item["camera_id"], "start_time": round(float(item["start_time"]), 3)}
        for item in deduped
    ]

def build_multicam_segments_from_switches(request, prepared_sources, overlap_start, overlap_duration):
    switches = normalize_multicam_switches(request, prepared_sources, overlap_duration)
    if not switches:
        return []

    source_map = {source["id"]: source for source in prepared_sources}
    segments = []
    for index, switch in enumerate(switches):
        next_switch = switches[index + 1] if index + 1 < len(switches) else None
        timeline_start = float(switch["start_time"])
        timeline_end = float(next_switch["start_time"]) if next_switch else float(overlap_duration)
        segment_duration = max(0.0, timeline_end - timeline_start)
        if segment_duration <= 0.02:
            continue

        source = source_map.get(switch["camera_id"])
        if not source:
            continue

        source_start = float(overlap_start) + timeline_start - float(source["offset_seconds"])
        source_end = source_start + segment_duration
        if source_start < -0.01 or source_end > float(source["duration"]) + 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"Switch segment exceeds source bounds for {source['label']}",
            )

        segments.append(
            {
                "camera_id": source["id"],
                "timeline_start": round(timeline_start, 3),
                "timeline_end": round(timeline_end, 3),
                "source_start": round(max(0.0, source_start), 3),
                "source_end": round(min(float(source["duration"]), source_end), 3),
            }
        )

    return segments

def normalize_multicam_segments(request, prepared_sources, overlap_start, overlap_duration):
    source_map = {source["id"]: source for source in prepared_sources}
    safe_duration = max(0.0, float(overlap_duration or 0.0))
    raw_segments = request.segments or []

    if not raw_segments:
        return build_multicam_segments_from_switches(
            request,
            prepared_sources,
            overlap_start,
            overlap_duration,
        )

    ordered_segments = sorted(raw_segments, key=lambda item: float(item.timeline_start or 0.0))
    normalized_segments = []
    timeline_cursor = 0.0

    for segment in ordered_segments:
        source = source_map.get(segment.camera_id)
        if not source:
            continue

        requested_duration = max(
            0.0,
            float(segment.timeline_end or 0.0) - float(segment.timeline_start or 0.0),
        )
        if requested_duration <= 0.02:
            continue

        requested_source_duration = max(
            0.0,
            float(segment.source_end or 0.0) - float(segment.source_start or 0.0),
        )
        segment_duration = requested_duration if requested_source_duration <= 0.0 else min(requested_duration, requested_source_duration)
        if segment_duration <= 0.02:
            continue

        source_start = clamp_float(
            float(segment.source_start or 0.0),
            0.0,
            max(0.0, float(source["duration"]) - segment_duration),
        )
        source_end = source_start + segment_duration
        timeline_start = timeline_cursor
        timeline_end = min(safe_duration, timeline_start + segment_duration) if safe_duration > 0.0 else timeline_start + segment_duration
        actual_duration = timeline_end - timeline_start
        if actual_duration <= 0.02:
            continue

        normalized_segments.append(
            {
                "camera_id": source["id"],
                "timeline_start": round(timeline_start, 3),
                "timeline_end": round(timeline_end, 3),
                "source_start": round(source_start, 3),
                "source_end": round(source_start + actual_duration, 3),
            }
        )
        timeline_cursor = timeline_end

        if safe_duration > 0.0 and timeline_cursor >= safe_duration - 0.001:
            break

    return normalized_segments

def build_multicam_switches_from_segments(segments):
    switches = []
    last_camera_id = None
    for segment in segments or []:
        camera_id = segment.get("camera_id")
        if not camera_id or camera_id == last_camera_id:
            continue
        switches.append(
            {
                "camera_id": camera_id,
                "start_time": round(float(segment.get("timeline_start", 0.0)), 3),
            }
        )
        last_camera_id = camera_id
    return switches


MULTICAM_SYNC_SAMPLE_RATE = max(4000, int(os.getenv("MULTICAM_SYNC_SAMPLE_RATE", "16000")))
MULTICAM_SYNC_ANALYSIS_SECONDS = max(60, int(os.getenv("MULTICAM_SYNC_ANALYSIS_SECONDS", "1800")))
MULTICAM_SYNC_MAX_SHIFT_SECONDS = max(5, int(os.getenv("MULTICAM_SYNC_MAX_SHIFT_SECONDS", "180")))
MULTICAM_SYNC_CLAP_WINDOW_SECONDS = max(10, int(os.getenv("MULTICAM_SYNC_CLAP_WINDOW_SECONDS", "60")))
MULTICAM_SYNC_CHUNK_SECONDS = max(30, int(os.getenv("MULTICAM_SYNC_CHUNK_SECONDS", "120")))


def _sync_wav_cache_path(source_key: str) -> str:
    cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp/sync-wav-cache"))
    os.makedirs(cache_dir, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", source_key).strip("_")[:80]
    return os.path.join(cache_dir, f"{safe}.wav")


async def extract_sync_audio_cached(input_path, cache_key, job_id, analysis_seconds=None, label="audio"):
    """Extract sync audio, reusing cached WAV if available."""
    cached_wav = _sync_wav_cache_path(cache_key)
    if os.path.exists(cached_wav) and os.path.getsize(cached_wav) > 1024:
        logger.info(f"Sync WAV cache HIT for {label} ({os.path.getsize(cached_wav) / 1024:.0f} KB)")
        return cached_wav

    duration_limit = analysis_seconds or MULTICAM_SYNC_ANALYSIS_SECONDS
    await run_subprocess_async(
        [
            "ffmpeg", "-nostdin", "-i", input_path,
            "-vn", "-ac", "1", "-ar", str(MULTICAM_SYNC_SAMPLE_RATE),
            "-t", str(duration_limit),
            "-acodec", "pcm_s16le",
            "-f", "wav", "-y",
            cached_wav,
        ],
        check=True,
        job_context=job_id,
        timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS,
    )
    return cached_wav


def read_wav_mono_float(wav_path):
    import wave
    with wave.open(wav_path, "rb") as wav_file:
        frames = wav_file.readframes(wav_file.getnframes())
        sample_width = wav_file.getsampwidth()
        sample_rate = wav_file.getframerate()
    if sample_width == 2:
        data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    elif sample_width == 4:
        data = np.frombuffer(frames, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        data = np.frombuffer(frames, dtype=np.uint8).astype(np.float32)
        data = (data - 128.0) / 128.0
    return data, sample_rate


def build_sync_envelope(wav_path, bins_per_second=20, start_seconds=0, duration_seconds=None):
    """Build RMS energy envelope from WAV. Optionally window to a time range."""
    samples, sample_rate = read_wav_mono_float(wav_path)
    if samples.size < sample_rate:
        return np.array([], dtype=np.float32), bins_per_second
    # Apply time window
    if start_seconds > 0 or duration_seconds is not None:
        start_sample = int(start_seconds * sample_rate)
        end_sample = samples.size if duration_seconds is None else start_sample + int(duration_seconds * sample_rate)
        samples = samples[start_sample:min(end_sample, samples.size)]
    if samples.size < sample_rate:
        return np.array([], dtype=np.float32), bins_per_second
    frame_size = max(1, int(sample_rate / bins_per_second))
    usable = samples[: (samples.size // frame_size) * frame_size]
    if usable.size <= 0:
        return np.array([], dtype=np.float32), bins_per_second
    envelope = np.sqrt(np.mean(np.reshape(usable, (-1, frame_size)) ** 2, axis=1))
    if envelope.size:
        envelope = envelope - np.percentile(envelope, 10)
        max_value = float(np.max(np.abs(envelope))) or 1.0
        envelope = envelope / max_value
    return envelope.astype(np.float32), bins_per_second


def detect_sync_peak(envelope, bins_per_second):
    """Find the strongest sharp transient (clap) in the first portion of the envelope."""
    if envelope.size < bins_per_second:
        return None
    search_limit = min(envelope.size, int(MULTICAM_SYNC_CLAP_WINDOW_SECONDS * bins_per_second))
    window = envelope[:search_limit]
    # Clap must be at least 2.5× mean energy — distinct from speech
    mean_e = float(np.mean(window))
    max_val = float(np.max(window))
    if max_val < mean_e * 2.5:
        logger.info(f"No clap candidate: max={max_val:.4f} < 2.5× mean={mean_e:.4f}")
        return None
    best_idx = int(np.argmax(window))
    peak_value = float(window[best_idx])
    runner_up = float(np.max(np.delete(window, best_idx))) if window.size > 1 else 0
    dominance = (peak_value - max(runner_up, 0.001)) / max(peak_value, 0.001)
    logger.info(
        f"Clap candidate: peak@{best_idx / bins_per_second:.2f}s val={peak_value:.4f} "
        f"mean={mean_e:.4f} ratio={peak_value / max(mean_e, 0.001):.1f}x dominance={dominance:.2f}"
    )
    if dominance < 0.2:
        logger.info(f"Clap rejected: dominance={dominance:.2f} < 0.2 (not distinct enough)")
        return None
    return {
        "seconds": round(best_idx / bins_per_second, 3),
        "strength": round(min(1.0, peak_value), 4),
        "threshold_used": round(mean_e * 4.0, 4),
    }


def vad_envelope(envelope, speech_threshold=0.15):
    """Convert energy envelope to binary voice activity (1=speech, 0=silence)."""
    if envelope.size < 3:
        return envelope
    # Smooth then threshold
    from scipy.ndimage import uniform_filter1d
    smoothed = uniform_filter1d(envelope.astype(np.float64), size=max(3, envelope.size // 200))
    vad = (smoothed > speech_threshold).astype(np.float32)
    return vad


def estimate_envelope_offset(clean_envelope, camera_envelope, bins_per_second):
    """
    Three-stage sync:
    1. Clap/spike detection
    2. Voice Activity Detection (VAD) binary pattern matching — works across different mics
    3. Waveform correlation fallback
    """
    if clean_envelope.size < bins_per_second or camera_envelope.size < bins_per_second:
        return 0.0, 0.0, "manual"

    method = "vad"
    best_offset = 0.0
    best_confidence = 0.0

    # === STAGE 1: Clap/spike ===
    clean_peak = detect_sync_peak(clean_envelope, bins_per_second)
    camera_peak = detect_sync_peak(camera_envelope, bins_per_second)
    if clean_peak and camera_peak:
        # Clap exists in both — align to it
        offset = camera_peak["seconds"] - clean_peak["seconds"]
        # Confidence based on both peaks being clear
        confidence = min(0.98, 0.55 + (clean_peak["strength"] + camera_peak["strength"]) / 4)
        logger.info(
            f"CLAP DETECTED: clean@{clean_peak['seconds']}s (str={clean_peak['strength']:.3f}), "
            f"camera@{camera_peak['seconds']}s (str={camera_peak['strength']:.3f}), "
            f"offset={offset:.3f}s, conf={confidence:.3f}"
        )
        return round(offset, 3), round(confidence, 3), "clap"
    else:
        if not clean_peak:
            logger.info("No clap found in clean audio envelope")
        if not camera_peak:
            logger.info("No clap found in camera audio envelope")

    # === STAGE 2: VAD binary pattern matching ===
    # Convert envelopes to speech/silence (1/0) — works even if iPhone and Behringer sound different
    try:
        clean_vad = vad_envelope(clean_envelope)
        camera_vad = vad_envelope(camera_envelope)
        if clean_vad.size >= bins_per_second * 2 and camera_vad.size >= bins_per_second * 2:
            # Downsample for speed
            ds = max(1, int(bins_per_second / 5))
            cv = clean_vad[::ds] - np.mean(clean_vad[::ds])
            camv = camera_vad[::ds] - np.mean(camera_vad[::ds])
            bins_vad = bins_per_second / ds
            max_shift = min(int(180 * bins_vad), max(cv.size, camv.size) - 1)
            if max_shift > 0:
                corr = np.correlate(camv, cv, mode="full")
                mid = corr.size // 2
                search = min(max_shift, mid - 1)
                region = corr[mid - search : mid + search + 1]
                vad_best = int(np.argmax(region)) - search
                vad_score = float(region[vad_best + search])
                # Normalize: how well do speech patterns align?
                speech_frames = max(1, np.sum(cv != 0) + np.sum(camv != 0))
                vad_confidence = min(0.85, vad_score / max(speech_frames, 1))
                if vad_confidence > 0.15:
                    method = "vad"
                    best_offset = vad_best / bins_vad
                    best_confidence = vad_confidence
    except Exception:
        pass

    # === STAGE 3: Waveform correlation (only if VAD failed) ===
    if best_confidence < 0.2:
        method = "waveform"
        downsample = max(1, int(bins_per_second / 4))
        if downsample > 1:
            clean_ds, camera_ds = clean_envelope[::downsample], camera_envelope[::downsample]
            bins_ds = bins_per_second / downsample
        else:
            clean_ds, camera_ds, bins_ds = clean_envelope, camera_envelope, float(bins_per_second)
        if clean_ds.size >= 4 and camera_ds.size >= 4:
            clean = clean_ds - np.mean(clean_ds)
            camera = camera_ds - np.mean(camera_ds)
            max_shift_bins = min(int(180 * bins_ds), max(clean.size, camera.size) - 1)
            correlation = np.correlate(camera, clean, mode="full")
            mid = correlation.size // 2
            search_bins = min(max_shift_bins, mid - 1)
            if search_bins > 0:
                search_region = correlation[mid - search_bins : mid + search_bins + 1]
                best_idx = int(np.argmax(search_region))
                best_offset = (best_idx - search_bins) / bins_ds
                best_score = float(search_region[best_idx])
                norm = float(np.linalg.norm(clean) * np.linalg.norm(camera)) or 1.0
                best_confidence = clamp_float((best_score / norm + 1) / 2, 0.05, 0.7)

    # === STAGE 4: Fine refinement ===
    if best_confidence < 0.12:
        return round(best_offset, 3), round(best_confidence, 3), "fallback"

    refine_window = 2.0
    coarse_bin = int(best_offset * bins_per_second)
    refine_bins = max(1, int(refine_window * bins_per_second))
    search_start = max(0, coarse_bin - refine_bins)
    search_end = min(clean_envelope.size, coarse_bin + refine_bins)

    if search_end - search_start >= 4:
        clean_seg = clean_envelope[search_start:min(search_end + refine_bins * 2, clean_envelope.size)]
        cam_seg = camera_envelope[search_start:min(search_end + refine_bins * 2, camera_envelope.size)]
        if clean_seg.size >= 4 and cam_seg.size >= 4:
            clean_n = clean_seg - np.mean(clean_seg)
            cam_n = cam_seg - np.mean(cam_seg)
            fine_corr = np.correlate(cam_n, clean_n, mode="full")
            mid_fine = fine_corr.size // 2
            fine_search = min(refine_bins * 2, mid_fine - 1)
            if fine_search > 0:
                region = fine_corr[mid_fine - fine_search : mid_fine + fine_search + 1]
                fine_best = int(np.argmax(region)) - fine_search
                fine_offset = best_offset + (fine_best / bins_per_second)
                fine_score = float(region[fine_best + fine_search])
                fine_norm = float(np.linalg.norm(cam_n) * np.linalg.norm(clean_n)) or 1.0
                fine_confidence = clamp_float((fine_score / fine_norm + 1) / 2, 0.1, 0.92)
                method = f"fine_{method}"
                return round(fine_offset, 3), round(fine_confidence, 3), method

    return round(best_offset, 3), round(best_confidence, 3), method


def detect_drift(clean_wav, camera_wav, bins_per_second=20):
    """Check if sync offset changes across the recording (possible drift)."""
    points = []
    for fraction, label in [(0.05, "start"), (0.50, "middle"), (0.90, "end")]:
        samples, sr = read_wav_mono_float(camera_wav)
        if samples.size < sr * 5:
            continue
        seg_start = int(samples.size * fraction)
        seg_end = min(samples.size, seg_start + int(sr * 60))  # 60s window
        # Build envelopes from these segments
        frame_size = max(1, int(sr / bins_per_second))
        cam_seg = samples[seg_start:seg_end]
        if cam_seg.size < frame_size * 4:
            continue
        usable = cam_seg[: (cam_seg.size // frame_size) * frame_size]
        cam_env = np.sqrt(np.mean(np.reshape(usable, (-1, frame_size)) ** 2, axis=1))
        if cam_env.size:
            cam_env = cam_env - np.percentile(cam_env, 10)
            cam_env = cam_env / (float(np.max(np.abs(cam_env))) or 1.0)

        # Build clean envelope for same region
        clean_samples, _ = read_wav_mono_float(clean_wav)
        cs_start = seg_start
        cs_end = min(clean_samples.size, seg_end)
        cs_seg = clean_samples[cs_start:cs_end]
        if cs_seg.size < frame_size * 4:
            continue
        clean_usable = cs_seg[: (cs_seg.size // frame_size) * frame_size]
        clean_env = np.sqrt(np.mean(np.reshape(clean_usable, (-1, frame_size)) ** 2, axis=1))
        if clean_env.size:
            clean_env = clean_env - np.percentile(clean_env, 10)
            clean_env = clean_env / (float(np.max(np.abs(clean_env))) or 1.0)

        if cam_env.size < 4 or clean_env.size < 4:
            continue

        # Quick correlation for this window
        c = cam_env - np.mean(cam_env)
        cl = clean_env - np.mean(clean_env)
        corr = np.correlate(c, cl, mode="full")
        mid_c = corr.size // 2
        search = min(int(5 * bins_per_second), mid_c - 1)
        if search > 0:
            region = corr[mid_c - search : mid_c + search + 1]
            idx = int(np.argmax(region)) - search
            offset = idx / bins_per_second
            points.append({"position": label, "offsetSeconds": round(offset, 3)})

    if len(points) < 2:
        return {"hasDrift": False, "maxDelta": 0.0, "points": points}

    offsets = [p["offsetSeconds"] for p in points]
    max_delta = max(offsets) - min(offsets)
    return {
        "hasDrift": max_delta > 0.5,
        "maxDelta": round(max_delta, 3),
        "points": points,
        "warning": f"Offset varies by {max_delta:.2f}s across the recording — possible audio drift" if max_delta > 0.5 else None,
    }


@app.post("/multicam/clean-audio-sync")
async def clean_audio_sync(request: CleanAudioSyncRequest, background_tasks: BackgroundTasks):
    job_id = request.job_id or f"clean-audio-sync-{uuid.uuid4().hex[:10]}"

    async def run_job():
        return await clean_audio_sync_impl(request, job_id)

    background_tasks.add_task(run_queued_heavy_job, job_id, "clean-audio-sync", run_job)
    return {"status": "queued", "job_id": job_id, "mode": "async"}


def build_speaker_timeline(voice_activity_by_camera, duration_seconds, window_seconds=1.0):
    """
    Given voice activity arrays per camera, determine which camera has
    the strongest voice at each time window. Returns a speaker timeline.
    """
    if not voice_activity_by_camera:
        return [], "no_data"

    # Normalize: find max duration across all cameras
    max_len = max(
        len(va) for va in voice_activity_by_camera.values()
        if isinstance(va, list)
    )
    if max_len == 0:
        return [], "no_data"

    timeline = []
    window_bins = max(1, int(window_seconds / 0.25))  # assuming 0.25s per bin
    current_speaker = None
    current_start = 0.0
    current_confidence = 0.0

    for i in range(0, max_len, window_bins):
        t = i * 0.25
        scores = {}
        for cam_id, va in voice_activity_by_camera.items():
            if not isinstance(va, list) or i >= len(va):
                continue
            chunk = va[i : min(len(va), i + window_bins)]
            if chunk:
                scores[cam_id] = sum(chunk) / len(chunk)

        if not scores:
            continue

        best_cam = max(scores, key=scores.get)
        best_score = scores[best_cam]

        # Determine confidence
        if best_score < 0.08:
            best_cam = None  # Silence
            conf = 0.0
        elif len(scores) > 1:
            runner_up = sorted(scores.values(), reverse=True)[1] if len(scores) > 1 else 0
            if best_score - runner_up < 0.05:
                best_cam = None  # Overlap / ambiguous
                conf = max(0.3, best_score)
            else:
                conf = min(0.95, best_score * 2)
        else:
            conf = min(0.85, best_score * 2)

        if best_cam != current_speaker:
            if current_speaker is not None or current_start > 0:
                timeline.append({
                    "startTime": round(current_start, 2),
                    "endTime": round(t, 2),
                    "cameraId": current_speaker,
                    "confidence": round(current_confidence, 3),
                })
            current_speaker = best_cam
            current_start = t
            current_confidence = conf
        else:
            current_confidence = max(current_confidence, conf)

    # Final segment
    if current_speaker is not None or current_start > 0:
        timeline.append({
            "startTime": round(current_start, 2),
            "endTime": round(max_len * 0.25, 2),
            "cameraId": current_speaker,
            "confidence": round(current_confidence, 3),
        })

    return timeline, "ok"


def generate_gpt_director_plan(speaker_timeline, offsets, algo_timeline, request):
    """
    Use GPT-4o-mini to generate emotionally intelligent director decisions.
    GPT understands reactions, tension, who to focus on, when to go wide, etc.
    """
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY")
    if not api_key or not speaker_timeline:
        return None

    # Build camera context
    cam_labels = []
    for o in offsets:
        cam_labels.append(f"{o.get('label', o.get('sourceId', 'cam'))} (id={o['sourceId']})")

    # Build speaker change summary (limit to 30 for prompt size)
    speaker_summary = []
    for s in speaker_timeline[:30]:
        cam = s.get("cameraId") or "both/wide"
        speaker_summary.append(
            f"{s['startTime']:.1f}s-{s['endTime']:.1f}s: {cam}"
        )

    prompt = (
        f"You are a podcast/video editor making camera switching decisions.\n"
        f"Cameras: {', '.join(cam_labels)}\n"
        f"Duration: ~{speaker_timeline[-1]['endTime']:.0f}s\n\n"
        f"Algorithmic speaker detection:\n"
        + "\n".join(speaker_summary) +
        f"\n\nYour job: refine this into an emotionally intelligent director plan.\n"
        f"Rules:\n"
        f"- Minimum shot duration 3-5 seconds\n"
        f"- If both speakers active or confidence low: use show_everyone (wide/split)\n"
        f"- Hold reaction shots when someone gasps/laughs/reacts\n"
        f"- Don't cut mid-word or mid-emotion\n"
        f"- Zoom/punch-in on emotional peaks\n"
        f"- Cut to listener for reactions\n\n"
        f"Return JSON array: [{{\"startTime\": 0, \"endTime\": 8.4, \"selectedCameraId\": \"cam-1\", \"layoutMode\": \"hero\", \"reason\": \"strongest_voice\", \"confidence\": 0.82}}, ...]"
    )

    try:
        import requests
        response = requests.post(
            (os.getenv("OPENAI_API_BASE") or "https://api.openai.com") + "/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": os.getenv("OPENAI_MODEL_GPT4O_MINI") or "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.5,
                "max_tokens": 2000,
            },
            timeout=90,
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"]
        if not raw or not raw.strip():
            logger.warning("GPT director returned empty response")
            return None
        raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        plan = json.loads(raw)
        if isinstance(plan, list) and len(plan) > 0:
            logger.info(f"GPT director generated {len(plan)} segments")
            return plan
    except json.JSONDecodeError as je:
        logger.warning(f"GPT director returned invalid JSON: {je}")
    except Exception as e:
        logger.warning(f"GPT director plan failed, using algorithmic: {e}")

    return None


def build_director_timeline(speaker_timeline, camera_ids, style="auto", min_shot_sec=3.0):
    """
    Convert speaker timeline to a director timeline with layouts and reasons.
    Merges short segments for smooth switching.
    """
    if not speaker_timeline:
        # Fallback: show everyone
        return [{
            "startTime": 0, "endTime": 60,
            "selectedCameraId": None,
            "layoutMode": "show_everyone",
            "cropMode": "normal",
            "reason": "no_speaker_data",
            "confidence": 0.0,
        }], "fallback_no_data"

    director = []
    prev = None

    for seg in speaker_timeline:
        cam_id = seg.get("cameraId")
        conf = seg.get("confidence", 0)
        start = seg.get("startTime", 0)
        end = seg.get("endTime", start + min_shot_sec)

        # Determine layout + reason
        if cam_id is None:
            layout = "show_everyone"
            crop = "split"
            reason = "overlap_or_low_confidence"
        else:
            layout = "hero"
            crop = "normal"
            reason = "speaker_changed" if (prev and prev.get("cameraId") != cam_id) else "strongest_voice"

        seg_data = {
            "startTime": start,
            "endTime": end,
            "selectedCameraId": cam_id,
            "layoutMode": layout,
            "cropMode": crop,
            "reason": reason,
            "confidence": round(conf, 3),
        }

        # Merge with previous if same camera and short
        if prev and prev.get("selectedCameraId") == cam_id and prev.get("layoutMode") == layout:
            prev["endTime"] = end
            prev["confidence"] = max(prev["confidence"], conf)
        elif prev and (end - start) < min_shot_sec and len(director) > 0:
            # Too short to be its own shot — merge
            director[-1]["endTime"] = end
            director[-1]["confidence"] = max(director[-1]["confidence"], conf)
        else:
            director.append(seg_data)
            prev = seg_data

    # Apply style adjustments
    if style == "show_everyone":
        for seg in director:
            seg["layoutMode"] = "show_everyone"
    elif style == "hero_angle":
        for seg in director:
            if seg["confidence"] > 0.6:
                seg["layoutMode"] = "hero"

    return director, "ok"


async def clean_audio_sync_impl(request: CleanAudioSyncRequest, job_id: str):
    if not request.sources:
        raise HTTPException(status_code=400, detail="At least one camera source is required")
    if not request.external_audio or not request.external_audio.url:
        raise HTTPException(status_code=400, detail="External clean audio is required")

    shared_tmp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp", f"{job_id}_clean_sync"))
    os.makedirs(shared_tmp_dir, exist_ok=True)
    offsets = []

    try:
        # --- Step 1: Prepare & extract clean audio ---
        update_firestore_job(job_id, {
            "status": "extracting_clean_audio", "stage": "extracting_clean_audio",
            "progress": 5, "detail": "Downloading external clean audio",
        })
        external_path = os.path.join(shared_tmp_dir, "external_audio_input")
        await materialize_cached_media_input(
            request.external_audio.url, external_path,
            request.external_audio.cache_key or f"{request.user_id}:{request.external_audio.name}:{request.external_audio.size}",
        )

        update_firestore_job(job_id, {
            "status": "extracting_clean_audio", "stage": "extracting_clean_audio",
            "progress": 12, "detail": "Extracting clean audio for sync",
        })
        clean_cache_key = f"clean:{request.external_audio.cache_key or request.external_audio.name or 'ext'}:{MULTICAM_SYNC_SAMPLE_RATE}"
        external_wav = await extract_sync_audio_cached(
            external_path, clean_cache_key, job_id,
            analysis_seconds=MULTICAM_SYNC_ANALYSIS_SECONDS, label="clean audio",
        )

        # Build clean envelope (full, for spike detection + waveform)
        clean_envelope, bins_per_second = build_sync_envelope(external_wav)

        # --- Step 2: Process each camera ---
        for index, source in enumerate(request.sources):
            cam_label = source.label or source.id or f"cam_{index}"
            base_pct = 25 + int(((index + 1) / max(1, len(request.sources))) * 55)

            update_firestore_job(job_id, {
                "status": "extracting_camera_audio", "stage": "extracting_camera_audio",
                "progress": base_pct - 8,
                "detail": f"Downloading {cam_label}",
            })
            local_path = os.path.join(shared_tmp_dir, f"camera_{index}_input")
            await materialize_cached_media_input(
                source.url, local_path,
                source.cache_key or f"{request.user_id}:{source.name or source.label}:{source.size}:{source.duration}",
            )

            if not has_audio_stream(local_path):
                offsets.append({
                    "sourceId": source.id, "label": cam_label,
                    "offsetSeconds": round(float(source.offset_seconds or 0.0), 3),
                    "confidence": 0.0, "method": "manual",
                    "message": "No camera audio; manual nudge required.",
                })
                continue

            update_firestore_job(job_id, {
                "status": "extracting_camera_audio", "stage": "extracting_camera_audio",
                "progress": base_pct - 4,
                "detail": f"Extracting audio from {cam_label}",
            })
            cam_cache_key = f"cam:{source.cache_key or source.name or source.id}:{MULTICAM_SYNC_SAMPLE_RATE}"
            camera_wav = await extract_sync_audio_cached(
                local_path, cam_cache_key, job_id,
                analysis_seconds=MULTICAM_SYNC_ANALYSIS_SECONDS, label=cam_label,
            )

            # --- Step 2a: Clap/spike detection ---
            update_firestore_job(job_id, {
                "status": "detecting_clap", "stage": "detecting_clap",
                "progress": base_pct - 1,
                "detail": f"Scanning {cam_label} for clap/spike",
            })
            _ = build_sync_envelope(camera_wav)  # warm—build full envelope for spike detection

            # --- Step 2b: Waveform matching (two-stage) ---
            update_firestore_job(job_id, {
                "status": "matching_waveforms", "stage": "matching_waveforms",
                "progress": base_pct,
                "detail": f"Matching {cam_label} waveform",
            })
            camera_envelope, _ = build_sync_envelope(camera_wav)
            delta, confidence, method = estimate_envelope_offset(clean_envelope, camera_envelope, bins_per_second)

            # --- Voice activity envelope for auto-director (browser can't decode ProRes) ---
            voice_activity = None
            va_seconds_per_bin = 0.5
            try:
                samples, sr = read_wav_mono_float(camera_wav)
                secs_per_bin = 0.25
                frame_size = max(1, int(sr * secs_per_bin))
                usable = samples[: (samples.size // frame_size) * frame_size]
                if usable.size >= frame_size * 4:
                    rms = np.sqrt(np.mean(np.reshape(usable, (-1, frame_size)) ** 2, axis=1))
                    if rms.size > 0:
                        rms = rms - np.percentile(rms, 5)
                        rms = rms / (float(np.max(np.abs(rms))) or 1.0)
                        # Downsample to ~2 values per second for the UI
                        target_bps = 2
                        ds_factor = max(1, int((1.0 / secs_per_bin) / target_bps))
                        if ds_factor > 1:
                            rms = rms[::ds_factor]
                        va_seconds_per_bin = round(secs_per_bin * ds_factor, 3)
                        # Send ALL values (no truncation) — auto-director needs full timeline
                        voice_activity = [round(float(v), 4) for v in rms]
            except Exception:
                pass

            # --- Drift check ---
            drift = None
            if confidence > 0.3:
                try:
                    drift = detect_drift(external_wav, camera_wav, bins_per_second)
                except Exception:
                    drift = {"hasDrift": False, "maxDelta": 0.0, "points": [], "warning": None}

            # --- Step 2d: Build detailed result with sanity checks ---
            camera_duration = get_media_duration(local_path)
            clean_duration = get_media_duration(external_path)

            # SANITY CHECK: reject absurd offsets (> 25% of media duration)
            max_reasonable_offset = max(camera_duration, clean_duration) * 0.25
            abs_delta = abs(delta)
            offset_rejected = abs_delta > max_reasonable_offset > 1.0

            if confidence < 0.25 or offset_rejected:
                warning = "Low confidence — review and nudge manually" if not offset_rejected else f"Offset rejected ({abs_delta:.1f}s > {max_reasonable_offset:.1f}s max) — place manually"
                status_label = "needs_review"
                method = "manual"
                applied_offset = 0.0  # Do NOT apply bad offsets
            elif confidence < 0.55:
                warning = "Moderate confidence — verify alignment"
                status_label = "needs_review"
                applied_offset = round(float(request.external_audio.offset_seconds or 0.0) + delta, 3)
            elif drift and drift.get("hasDrift"):
                warning = drift.get("warning", "Possible drift detected")
                status_label = "synced_with_warning"
                applied_offset = round(float(request.external_audio.offset_seconds or 0.0) + delta, 3)
            else:
                warning = None
                status_label = "synced"
                applied_offset = round(float(request.external_audio.offset_seconds or 0.0) + delta, 3)

            message = "Synced with high confidence." if status_label == "synced" else (warning or "Synced.")

            # DEBUG LOG
            logger.info(
                f"SYNC_DEBUG {cam_label}: "
                f"cam_dur={camera_duration:.1f}s clean_dur={clean_duration:.1f}s "
                f"delta={delta:.3f}s abs_delta={abs_delta:.1f}s max_ok={max_reasonable_offset:.1f}s "
                f"rejected={offset_rejected} conf={confidence:.3f} method={method} "
                f"applied_offset={applied_offset:.3f}s"
            )

            offsets.append({
                "sourceId": source.id, "label": cam_label,
                "offsetSeconds": applied_offset,
                "delta": round(delta, 3),
                "confidence": confidence,
                "method": method,
                "status": status_label,
                "message": message,
                "warning": warning,
                "drift": drift,
                "voiceActivity": voice_activity,
                "voiceActivitySecondsPerBin": va_seconds_per_bin,
                "debug": {
                    "cameraDuration": round(camera_duration, 1),
                    "cleanDuration": round(clean_duration, 1),
                    "rawDelta": round(delta, 3),
                    "rejected": offset_rejected,
                    "maxReasonableOffset": round(max_reasonable_offset, 1),
                },
            })

            update_firestore_job(job_id, {
                "status": "calculating_offsets", "stage": "calculating_offsets",
                "progress": base_pct + 2,
                "detail": f"Aligned {cam_label} ({method}, {confidence:.0%})" + (f" — drift {drift['maxDelta']:.1f}s" if drift and drift.get("hasDrift") else ""),
                "offsets": offsets,
            })

        # --- Step 3: Assess sync quality ---
        needs_review = []
        has_drift = False
        has_warning = False

        # --- Step 4: Inter-camera sync ---
        # Sync cameras to each other. Same room = same audio = high confidence.
        # External audio is the master export track — doesn't need to be synced.
        director_status = "ok"
        director_timeline = []
        speaker_timeline = []
        voice_activity_by_camera = {}

        # Collect camera WAV paths for inter-camera sync
        camera_wav_paths = []
        for o in offsets:
            src_id = o.get("sourceId")
            cam_cache = f"cam:{next((s.cache_key or s.name or s.id for s in request.sources if s.id == src_id), src_id)}:{MULTICAM_SYNC_SAMPLE_RATE}"
            wav_path = _sync_wav_cache_path(cam_cache)
            if os.path.exists(wav_path) and os.path.getsize(wav_path) > 1024:
                camera_wav_paths.append((src_id, wav_path))

        # Sync cameras to each other (reference = first camera with audio)
        if len(camera_wav_paths) >= 2:
            ref_id, ref_path = camera_wav_paths[0]
            ref_env, bps = build_sync_envelope(ref_path)
            for o in offsets:
                if o.get("sourceId") == ref_id:
                    o["offsetSeconds"] = 0.0
                    o["confidence"] = 1.0
                    o["method"] = "intercam_ref"
                    o["status"] = "synced"
                    o["message"] = "Reference camera (synced to itself)"
                else:
                    match = next((p for sid, p in camera_wav_paths if sid == o.get("sourceId")), None)
                    if match and os.path.exists(match):
                        cam_env, _ = build_sync_envelope(match)
                        delta, conf, method = estimate_envelope_offset(ref_env, cam_env, bps)
                        if conf > 0.2:
                            o["offsetSeconds"] = round(delta, 3)
                            o["confidence"] = conf
                            o["method"] = f"intercam_{method}"
                            o["status"] = "synced"
                            o["message"] = f"Synced to reference camera ({method})"
                        else:
                            o["offsetSeconds"] = 0.0
                            o["status"] = "needs_review"
                            o["message"] = "Could not sync to reference camera"
                    else:
                        o["offsetSeconds"] = 0.0
                        o["status"] = "needs_review"
                        o["message"] = "Sync WAV not found"
            logger.info(f"Inter-camera sync: {len(offsets)} cameras aligned to reference {ref_id}")
        else:
            for o in offsets:
                o["offsetSeconds"] = 0.0
                o["confidence"] = 1.0
                o["method"] = "single_cam"
                o["status"] = "synced"

        # Voice activity for director
        for o in offsets:
            va = o.get("voiceActivity")
            if va and isinstance(va, list) and len(va) > 0:
                voice_activity_by_camera[o["sourceId"]] = va

        if voice_activity_by_camera:
            speaker_timeline, spk_status = build_speaker_timeline(voice_activity_by_camera, 3600)
            if spk_status == "ok" and speaker_timeline:
                style = getattr(request, "director_style", "auto") or "auto"
                director_timeline, dir_status = build_director_timeline(speaker_timeline, list(voice_activity_by_camera.keys()), style)
                if dir_status == "ok":
                    update_firestore_job(job_id, {"status": "generating_director", "stage": "generating_director", "progress": 92, "detail": f"Director: {len(director_timeline)} segments"})
                    gpt_timeline = generate_gpt_director_plan(speaker_timeline, offsets, director_timeline, request)
                    if gpt_timeline:
                        director_timeline = gpt_timeline
                        director_status = "gpt_director"

        # --- Step 5: Final status ---
        needs_review_list = [o for o in offsets if o.get("status") == "needs_review"]
        if needs_review_list:
            final_status = "sync_low_confidence"
            summary = f"Sync complete — {len(needs_review_list)} camera(s) need review"
        else:
            final_status = "sync_complete"
            summary = "All cameras synced successfully"

        update_firestore_job(job_id, {
            "status": final_status,
            "stage": final_status,
            "progress": 100,
            "detail": summary,
            "offsets": offsets,
            "mixMode": request.mix_mode,
            "directorStatus": director_status,
            "directorTimeline": director_timeline,
            "speakerTimeline": speaker_timeline,
            "voiceActivityByCamera": {k: v[:100] for k, v in voice_activity_by_camera.items()} if voice_activity_by_camera else {},
        })
        return {
            "status": "ready_for_review", "job_id": job_id, "offsets": offsets, "summary": summary,
            "directorStatus": director_status,
            "directorTimeline": director_timeline,
            "speakerTimeline": speaker_timeline,
        }

    except asyncio.TimeoutError:
        logger.error("Clean-audio sync timed out")
        update_firestore_job(job_id, {
            "status": "sync_failed", "stage": "sync_failed",
            "progress": 0, "error": "Sync timed out — file may be too large",
        })
        return {"status": "failed", "job_id": job_id, "error": "Sync timed out"}
    except Exception as e:
        logger.error(f"Clean-audio sync failed: {e}")
        update_firestore_job(job_id, {
            "status": "sync_failed", "stage": "sync_failed",
            "progress": 0,
            "error": str(e.detail) if isinstance(e, HTTPException) else str(e),
        })
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up downloaded camera/external input files (keep cached WAVs)
        import glob as _glob, time as _time
        try:
            shutil.rmtree(shared_tmp_dir, ignore_errors=True)
        except Exception:
            pass
        # Prune old ingest tmp files older than 2 hours
        try:
            cutoff = _time.time() - 7200
            ingest_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp/ingest"))
            for f in _glob.glob(os.path.join(ingest_dir, "*")):
                try:
                    if os.path.getmtime(f) < cutoff:
                        os.remove(f)
                except Exception:
                    pass
        except Exception:
            pass

@app.post("/render-multicam")
async def render_multicam(request: RenderMultiCamRequest, background_tasks: BackgroundTasks):
    if request.async_mode:
        job_id = request.job_id or str(uuid.uuid4())
        logger.info(f"Queuing ASYNC multicam render job {job_id}")
        background_tasks.add_task(render_multicam_impl, request, job_id)
        return {"status": "processing", "job_id": job_id, "mode": "async"}

    return await render_multicam_impl(request)

async def render_multicam_impl(request: RenderMultiCamRequest, provided_job_id: str = None):
    if len(request.sources or []) < 2:
        raise HTTPException(status_code=400, detail="At least two camera sources are required")

    job_id = provided_job_id or str(uuid.uuid4())
    shared_tmp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(shared_tmp_dir):
        os.makedirs(shared_tmp_dir)

    concat_list_path = os.path.join(shared_tmp_dir, f"{job_id}_multicam_concat.txt")
    output_path = os.path.join(shared_tmp_dir, f"{job_id}_multicam.mp4")
    video_only_output_path = os.path.join(shared_tmp_dir, f"{job_id}_multicam_video.mp4")
    primary_audio_output_path = os.path.join(shared_tmp_dir, f"{job_id}_multicam_audio.m4a")
    external_audio_input_path = os.path.join(shared_tmp_dir, f"{job_id}_external_audio_input")
    prepared_sources = []
    segment_paths = []

    if request.async_mode:
        try:
            update_firestore_job(job_id, {"status": "processing", "progress": 0, "detail": "Preparing sources"})
        except Exception:
            pass

    try:
        for index, source in enumerate(request.sources):
            local_path = os.path.join(shared_tmp_dir, f"{job_id}_multicam_src_{index}.mp4")
            await materialize_video_input(source.url, local_path)
            source_duration = get_media_duration(local_path)
            if source_duration <= 0.1:
                raise HTTPException(status_code=400, detail=f"Source {source.label or source.id} has no readable duration")

            prepared_sources.append(
                {
                    "id": source.id,
                    "label": source.label or source.id,
                    "path": local_path,
                    "duration": source_duration,
                    "offset_seconds": float(source.offset_seconds or 0.0),
                    "has_audio": has_audio_stream(local_path),
                    "silence_intervals": [],
                }
            )

        if request.async_mode:
            update_firestore_job(job_id, {"progress": 20, "detail": "Sources ready"})

        calculated_overlap_start = max(source["offset_seconds"] for source in prepared_sources)
        calculated_overlap_end = min(
            source["offset_seconds"] + source["duration"] for source in prepared_sources
        )

        overlap_start = max(calculated_overlap_start, float(request.overlap_start or calculated_overlap_start))
        overlap_end = calculated_overlap_end
        if float(request.overlap_duration or 0.0) > 0:
            overlap_end = min(overlap_end, overlap_start + float(request.overlap_duration))

        overlap_duration = max(0.0, overlap_end - overlap_start)
        if overlap_duration <= 0.25:
            raise HTTPException(status_code=400, detail="The selected camera offsets do not produce a usable overlap")

        if request.auto_switch:
            if request.async_mode:
                update_firestore_job(job_id, {"progress": 35, "detail": "Scoring faces, motion, and speech"})
            for source in prepared_sources:
                source["window_scores"] = analyze_multicam_visual_windows(
                    source["path"],
                    source["offset_seconds"],
                    overlap_start,
                    overlap_duration,
                    request.auto_switch_interval,
                )
                placeholder_penalties = [
                    float(slot.get("placeholder_penalty", 0.0))
                    for slot in source["window_scores"]
                    if slot is not None
                ]
                source["placeholder_score"] = round(
                    float(np.median(placeholder_penalties)) if placeholder_penalties else 0.0,
                    4,
                )
                if source["has_audio"]:
                    source["silence_intervals"] = await detect_silence_intervals(
                        source["path"], threshold="-32dB", duration=0.45
                    )

        segments = normalize_multicam_segments(request, prepared_sources, overlap_start, overlap_duration)
        if not segments:
            raise HTTPException(status_code=400, detail="No valid multicam segment plan could be generated")
        switches = build_multicam_switches_from_segments(segments)
        master_duration = float(segments[-1]["timeline_end"])

        normalize_vf = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2"
        if str(request.output_aspect_ratio or "9:16") != "9:16":
            normalize_vf = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"

        if request.async_mode:
            update_firestore_job(job_id, {"progress": 55, "detail": "Rendering switched segments"})

        source_map = {source["id"]: source for source in prepared_sources}
        for index, segment in enumerate(segments):
            segment_start = float(segment["timeline_start"])
            segment_end = float(segment["timeline_end"])
            segment_duration = max(0.0, segment_end - segment_start)
            if segment_duration <= 0.02:
                continue

            source = source_map.get(segment["camera_id"]) or prepared_sources[0]
            trim_start = float(segment["source_start"])
            trim_end = float(segment["source_end"])

            if trim_start < 0 or trim_end > source["duration"] + 0.01:
                raise HTTPException(status_code=400, detail=f"Segment exceeds source bounds for {source['label']}")

            segment_output_path = os.path.join(shared_tmp_dir, f"{job_id}_multicam_segment_{index}.mp4")
            await run_subprocess_async(
                [
                    "ffmpeg",
                    "-ss",
                    str(trim_start),
                    "-i",
                    source["path"],
                    "-t",
                    str(segment_duration),
                    "-vf",
                    normalize_vf,
                    "-map",
                    "0:v:0",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "ultrafast",
                    "-an",
                    "-pix_fmt",
                    "yuv420p",
                    "-movflags",
                    "+faststart",
                    "-y",
                    segment_output_path,
                ],
                check=True,
                job_context=job_id,
            )
            segment_paths.append(segment_output_path)

        if not segment_paths:
            raise HTTPException(status_code=400, detail="No multicam segments were produced")

        if request.async_mode:
            update_firestore_job(job_id, {"progress": 82, "detail": "Concatenating master"})

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
                    video_only_output_path,
                ],
                check=True,
                job_context=job_id,
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
                    "-an",
                    "-pix_fmt",
                    "yuv420p",
                    "-movflags",
                    "+faststart",
                    "-y",
                    video_only_output_path,
                ],
                check=True,
                job_context=job_id,
            )

        if request.external_audio_url:
            if request.async_mode:
                update_firestore_job(job_id, {"progress": 88, "detail": "Preparing external clean audio"})
            await materialize_cached_media_input(
                request.external_audio_url,
                external_audio_input_path,
                request.external_audio_cache_key or f"{job_id}:external-clean-audio",
            )
            audio_trim_start = max(0.0, overlap_start - float(request.external_audio_offset_seconds or 0.0))
            await run_subprocess_async(
                [
                    "ffmpeg",
                    "-ss",
                    str(audio_trim_start),
                    "-i",
                    external_audio_input_path,
                    "-t",
                    str(master_duration),
                    "-vn",
                    "-ac",
                    "2",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-y",
                    primary_audio_output_path,
                ],
                check=True,
                job_context=job_id,
            )

            await run_subprocess_async(
                [
                    "ffmpeg",
                    "-i",
                    video_only_output_path,
                    "-i",
                    primary_audio_output_path,
                    "-map",
                    "0:v:0",
                    "-map",
                    "1:a:0",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-shortest",
                    "-movflags",
                    "+faststart",
                    "-y",
                    output_path,
                ],
                check=True,
                job_context=job_id,
            )
        else:
            audio_source = source_map.get(request.primary_audio_camera_id or "")
            if not audio_source or not audio_source.get("has_audio"):
                audio_source = next((source for source in prepared_sources if source.get("has_audio")), None)

            if audio_source and audio_source.get("has_audio"):
                audio_anchor = overlap_start - float(audio_source["offset_seconds"])
                primary_segments = [segment for segment in segments if segment["camera_id"] == audio_source["id"]]
                if primary_segments:
                    inferred_anchor = float(primary_segments[0]["source_start"]) - float(primary_segments[0]["timeline_start"])
                    if inferred_anchor >= -0.01:
                        audio_anchor = inferred_anchor
                audio_trim_start = max(0.0, audio_anchor)
                await run_subprocess_async(
                    [
                        "ffmpeg",
                        "-ss",
                        str(audio_trim_start),
                        "-i",
                        audio_source["path"],
                        "-t",
                        str(master_duration),
                        "-map",
                        "0:a:0",
                        "-vn",
                        "-c:a",
                        "aac",
                        "-y",
                        primary_audio_output_path,
                    ],
                    check=True,
                    job_context=job_id,
                )

                await run_subprocess_async(
                    [
                        "ffmpeg",
                        "-i",
                        video_only_output_path,
                        "-i",
                        primary_audio_output_path,
                        "-map",
                        "0:v:0",
                        "-map",
                        "1:a:0",
                        "-c:v",
                        "copy",
                        "-c:a",
                        "aac",
                        "-shortest",
                        "-movflags",
                        "+faststart",
                        "-y",
                        output_path,
                    ],
                    check=True,
                    job_context=job_id,
                )
            else:
                shutil.copy2(video_only_output_path, output_path)

        if request.async_mode:
            update_firestore_job(job_id, {"progress": 94, "detail": "Uploading master"})

        public_url = upload_file_to_firebase(output_path, f"processed/multicam_{job_id}.mp4")
        if not public_url:
            raise HTTPException(status_code=500, detail="Failed to upload multi-camera output")

        result_data = {
            "status": "completed",
            "job_id": job_id,
            "output_path": os.path.abspath(output_path),
            "output_url": public_url,
            "duration": round(master_duration, 3),
            "segments": segments,
            "switches": switches,
        }

        if request.async_mode:
            update_firestore_job(job_id, {
                "status": "completed",
                "progress": 100,
                "detail": "Multi-camera master ready",
                **result_data,
            })

        return result_data
    except HTTPException as e:
        if request.async_mode:
            update_firestore_job(job_id, {"status": "failed", "error": str(e.detail), "progress": 0})
            return
        raise
    except Exception as e:
        logger.error(f"Multicam render failed: {e}")
        if request.async_mode:
            update_firestore_job(job_id, {"status": "failed", "error": str(e), "progress": 0})
            return
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for source in prepared_sources:
            if os.path.exists(source["path"]):
                os.remove(source["path"])
        for segment_path in segment_paths:
            if os.path.exists(segment_path):
                os.remove(segment_path)
        if os.path.exists(concat_list_path):
            os.remove(concat_list_path)
        if os.path.exists(video_only_output_path):
            os.remove(video_only_output_path)
        if os.path.exists(primary_audio_output_path):
            os.remove(primary_audio_output_path)
        if os.path.exists(external_audio_input_path):
            os.remove(external_audio_input_path)
        if os.path.exists(output_path):
            os.remove(output_path)
        
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
        final_clip.write_videofile(final_output_path, codec=GPU_VIDEO_ENCODER if GPU_VIDEO_ENCODER == "h264_nvenc" else "libx264", audio_codec="aac", fps=24, logger=None)
        
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


# ============================================================
# NEW ENDPOINTS: Speaker Track Crop + Auto-Generate All Clips
# ============================================================

@app.post("/speaker-track-crop")
async def speaker_track_crop(request: Dict[str, Any]):
    """
    Speaker-tracking auto-reframe: detects faces and dynamically crops
    the video to follow the speaker for vertical format.
    """
    video_url = request.get("video_url")
    if not video_url:
        raise HTTPException(status_code=400, detail="video_url is required")

    target_aspect = str(request.get("target_aspect_ratio", "9:16")).strip()
    job_id = str(uuid.uuid4())
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    os.makedirs(SHARED_TMP_DIR, exist_ok=True)

    input_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_input.mp4")
    output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_tracked.mp4")

    try:
        await materialize_video_input(video_url, input_path)
        src_w, src_h = get_video_dimensions(input_path)
        loop = asyncio.get_running_loop()

        logger.info(f"Detecting speaker positions in {input_path}...")
        positions = await loop.run_in_executor(None, detect_speaker_positions, input_path, 0.5)

        if positions and len(positions) >= 3:
            keyframes, crop_w, crop_h = build_speaker_track_crop_filter(positions, src_w, src_h, target_aspect)
            sendcmd_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_sendcmd.txt")
            with open(sendcmd_path, "w") as f:
                f.write("\n".join(keyframes))
            vf = f"sendcmd=f='{sendcmd_path}',crop={crop_w}:{crop_h}:0:0,scale=1080:1920"
            await run_subprocess_async([
                "ffmpeg", "-i", input_path, "-vf", vf,
                "-c:v", GPU_VIDEO_ENCODER, "-preset", GPU_PRESET, "-c:a", "copy", "-y", output_path
            ], check=True)
        else:
            logger.info("No faces detected, using center crop fallback")
            vf = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
            await run_subprocess_async([
                "ffmpeg", "-i", input_path, "-vf", vf,
                "-c:v", "libx264", "-c:a", "copy", "-y", output_path
            ], check=True)

        if os.path.exists(output_path):
            url = upload_file_to_firebase(output_path)
            return {
                "status": "completed",
                "job_id": job_id,
                "output_url": url,
                "faces_detected": len([p for p in (positions or []) if p[1] != 0.5]),
                "total_samples": len(positions or []),
            }
        raise Exception("Output not generated")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Speaker track crop error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for p in [input_path]:
            if os.path.exists(p):
                try: os.remove(p)
                except: pass


@app.post("/auto-generate-clips")
async def auto_generate_clips(request: Dict[str, Any], background_tasks: BackgroundTasks):
    """
    One-click auto-generate: analyze video → render top N clips automatically.
    Returns immediately with job_id, results are written to Firestore.
    """
    video_url = request.get("video_url")
    if not video_url:
        raise HTTPException(status_code=400, detail="video_url is required")

    job_id = request.get("job_id") or str(uuid.uuid4())
    max_clips = min(int(request.get("max_clips", 5)), 10)
    output_mode = str(request.get("output_mode", "campaign_set")).strip().lower()
    if output_mode not in {"campaign_set", "story_edit"}:
        output_mode = "campaign_set"
    target_duration_cap = 300 if output_mode == "story_edit" else 60
    target_duration = max(6, min(int(request.get("target_duration", 30)), target_duration_cap))
    caption_style = str(request.get("caption_style", "bold_pop")).strip()
    smart_crop_mode = str(request.get("smart_crop_mode", "center")).strip()
    target_aspect = str(request.get("target_aspect_ratio", "9:16")).strip()
    template_name = str(request.get("template", "")).strip()
    campaign_roles = request.get("campaign_roles") or []
    analysis_cache_key = str(request.get("analysis_cache_key") or request.get("source_fingerprint") or video_url).strip()
    workflow_type = str(request.get("workflow_type") or SMART_PROMO_WORKFLOW_TYPE).strip() or SMART_PROMO_WORKFLOW_TYPE

    # Apply template defaults if specified
    if template_name in CLIP_TEMPLATES:
        tmpl = CLIP_TEMPLATES[template_name]
        caption_style = caption_style or tmpl["caption_style"]
        smart_crop_mode = smart_crop_mode or tmpl["smart_crop_mode"]
        target_aspect = target_aspect or tmpl["aspect_ratio"]

    logger.info(f"Auto-generate job {job_id}: {max_clips} clips, style={caption_style}, crop={smart_crop_mode}, duration={target_duration}")

    try:
        update_firestore_job(job_id, {
            "status": "analyzing",
            "progress": 0,
            "total_clips": max_clips,
            "completed_clips": 0,
            "clips": [],
            "outputMode": output_mode,
            "workflowType": workflow_type,
        })
    except Exception:
        pass

    background_tasks.add_task(
        run_queued_heavy_job,
        job_id,
        "smart_promo" if str(job_id).startswith("promo-") else "find_viral_clips",
        lambda: _auto_generate_clips_impl(
            video_url,
            job_id,
            max_clips,
            target_duration,
            caption_style,
            smart_crop_mode,
            target_aspect,
            campaign_roles,
            output_mode,
            analysis_cache_key,
            workflow_type,
        ),
    )
    return {"status": "processing", "job_id": job_id, "mode": "async"}


async def _auto_generate_clips_impl(
    video_url,
    job_id,
    max_clips,
    target_duration,
    caption_style,
    smart_crop_mode,
    target_aspect,
    campaign_roles=None,
    output_mode="campaign_set",
    analysis_cache_key=None,
    workflow_type=SMART_PROMO_WORKFLOW_TYPE,
):
    """Background task: analyze → sort → render top clips."""
    promo_angle = ""
    if isinstance(campaign_roles, list) and campaign_roles:
        promo_angle = str((campaign_roles[0] or {}).get("promoAngle") or "").strip().lower()

    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    os.makedirs(SHARED_TMP_DIR, exist_ok=True)
    input_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_autogen_input.mp4")
    analysis_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_autogen_analysis.mp4")
    render_source_path = input_path

    try:
        # 1. Download
        await materialize_video_input(video_url, input_path)
        source_file_mb = os.path.getsize(input_path) / (1024 * 1024) if os.path.exists(input_path) else 0
        source_duration = get_media_duration(input_path)
        logger.info(
            json.dumps({
                "event": "job_input_loaded",
                "jobId": job_id,
                "feature": "smart_promo" if str(job_id).startswith("promo-") else "find_viral_clips",
                "durationSeconds": round(source_duration, 2),
                "fileSizeMb": round(source_file_mb, 2),
            })
        )
        if source_file_mb > MEDIA_WORKER_MAX_FILE_MB:
            raise HTTPException(
                status_code=413,
                detail=f"Video is too large for this worker ({source_file_mb:.1f}MB > {MEDIA_WORKER_MAX_FILE_MB}MB).",
            )
        if source_duration > MEDIA_WORKER_MAX_VIDEO_SECONDS:
            raise HTTPException(
                status_code=413,
                detail=f"Video is too long for this worker ({source_duration:.1f}s > {MEDIA_WORKER_MAX_VIDEO_SECONDS}s).",
            )
        update_firestore_job(job_id, {"status": "analyzing", "progress": 10})

        # 1b. Normalize a cheaper analysis copy so odd source timing does not
        # stall Whisper / scene detect / energy scoring.
        await create_promo_analysis_copy(input_path, analysis_path)
        update_firestore_job(job_id, {"status": "analyzing", "progress": 20})

        artifact = load_analysis_artifact(
            analysis_cache_key,
            workflow_type=workflow_type,
            pipeline_version=SMART_PROMO_PIPELINE_VERSION,
        )
        analysis_reused = False
        artifact_id = artifact.get("artifactId") if artifact else None
        visual_notes = []
        transcript_quality = ((artifact or {}).get("analysisSummary") or {}).get("transcriptQuality") or {}
        cached_story_master_target_duration = float((artifact or {}).get("storyMasterTargetDuration", 0.0) or 0.0)
        story_plan_cache_matches_request = (
            cached_story_master_target_duration > 0.0
            and abs(cached_story_master_target_duration - float(target_duration or 0.0)) <= 3.0
        )
        cached_story_master_plan = (
            dict((artifact or {}).get("storyMasterPlan") or {})
            if story_plan_cache_matches_request and (artifact or {}).get("storyMasterPlan")
            else None
        )
        cached_derived_short_plans = (
            [dict(plan) for plan in ((artifact or {}).get("derivedShortPlans") or []) if isinstance(plan, dict)]
            if story_plan_cache_matches_request
            else []
        )
        confidence_summary = (
            dict((artifact or {}).get("confidenceSummary") or {})
            if story_plan_cache_matches_request and (artifact or {}).get("confidenceSummary")
            else {}
        )

        if artifact and artifact.get("rankedCandidates"):
            ranked = artifact.get("rankedCandidates") or []
            visual_notes = artifact.get("visualNotes") or []
            analysis_reused = True
            update_firestore_job(job_id, {
                "status": "analyzing",
                "progress": 40,
                "analysisReused": True,
                "artifactId": artifact_id,
                "pipelineVersion": SMART_PROMO_PIPELINE_VERSION,
                "workflowType": workflow_type,
                "confidenceSummary": confidence_summary or None,
            })
            logger.info(f"Promo job {job_id}: reusing cached analysis artifact {artifact_id}.")
        else:
            # 2. Analyze (reuse analyze-clips logic)
            loop = asyncio.get_running_loop()
            analysis_duration = max(0.0, get_media_duration(analysis_path))
            audio_present = media_has_audio_stream(analysis_path)
            podcast_workflow = workflow_type == SMART_PROMO_WORKFLOW_TYPE
            transcription_limit = 300.0 if output_mode == "story_edit" else 120.0
            allow_full_transcription = audio_present and analysis_duration > 0 and analysis_duration <= transcription_limit
            analysis_transcription_timeout = min(
                210,
                max(
                    75,
                    int(analysis_duration * (0.55 if output_mode == "story_edit" else 0.4)) + 45,
                ),
            )

            promo_whisper_model_name = get_promo_whisper_model_name()

            def run_whisper_local():
                if not audio_present:
                    logger.info(f"Promo job {job_id}: skipping transcription because source has no audio stream.")
                    return []
                if not allow_full_transcription:
                    return []
                model = get_whisper_model(model_name=promo_whisper_model_name)
                if model:
                    return model.transcribe(
                        analysis_path, fp16=False, word_timestamps=False,
                        condition_on_previous_text=False,
                        temperature=0,
                        compression_ratio_threshold=2.4,
                        logprob_threshold=-0.9,
                        no_speech_threshold=0.5,
                        initial_prompt=build_transcription_prompt(),
                    ).get("segments", [])
                return []

            def run_scenedetect_local():
                video = open_video(analysis_path)
                try:
                    video.set_downscale_factor(8)
                except Exception:
                    pass
                sm = SceneManager()
                sm.add_detector(ContentDetector(threshold=27.0))
                sm.detect_scenes(video=video)
                return sm.get_scene_list()

            async def run_analysis_task(label, fn, *args, timeout_seconds=45, fallback_value=None):
                try:
                    return await asyncio.wait_for(
                        loop.run_in_executor(None, fn, *args),
                        timeout=timeout_seconds,
                    )
                except asyncio.TimeoutError:
                    logger.warning(
                        f"Promo analysis '{label}' timed out after {timeout_seconds}s for job {job_id}; using fallback."
                    )
                except Exception as exc:
                    logger.warning(f"Promo analysis '{label}' failed for job {job_id}: {exc}")
                return fallback_value

            if not allow_full_transcription:
                logger.info(
                    f"Promo job {job_id} is using fast highlight mode (duration {analysis_duration:.1f}s); skipping full transcription."
                )
            else:
                logger.info(
                    f"Promo job {job_id} is using Whisper model '{promo_whisper_model_name}' for promo analysis."
                )
            if podcast_workflow:
                logger.info(
                    f"Promo job {job_id} is using podcast-first analysis mode; skipping scene, motion, and visual-note passes."
                )

            if podcast_workflow:
                transcription_segments, audio_energy = await asyncio.gather(
                    run_analysis_task(
                        "transcription",
                        run_whisper_local,
                        timeout_seconds=analysis_transcription_timeout if allow_full_transcription else 1,
                        fallback_value=[],
                    ),
                    run_analysis_task("audio_energy", analyze_audio_energy, analysis_path, 1.0, timeout_seconds=20, fallback_value=[]),
                )
                scene_list = []
                motion_scores_data = []
                visual_notes = []
            else:
                transcription_segments, scene_list, audio_energy, motion_scores_data = await asyncio.gather(
                    run_analysis_task(
                        "transcription",
                        run_whisper_local,
                        timeout_seconds=analysis_transcription_timeout if allow_full_transcription else 1,
                        fallback_value=[],
                    ),
                    run_analysis_task("scene_detect", run_scenedetect_local, timeout_seconds=20, fallback_value=[]),
                    run_analysis_task("audio_energy", analyze_audio_energy, analysis_path, 1.0, timeout_seconds=20, fallback_value=[]),
                    run_analysis_task("visual_motion", analyze_visual_motion, analysis_path, 1.0, timeout_seconds=20, fallback_value=[]),
                )

                visual_notes = await run_analysis_task(
                    "visual_frame_understanding",
                    build_visual_chapter_notes,
                    analysis_path,
                    analysis_duration,
                    max(8, min(16, max_clips * 4)),
                    timeout_seconds=55,
                    fallback_value=[],
                )
            transcription_segments = annotate_transcription_segments(transcription_segments)

            update_firestore_job(job_id, {"status": "analyzing", "progress": 40, "analysisReused": False})

            # Build candidates with enhanced scoring
            VIRAL_KEYWORDS = {
                "money": 15, "rich": 10, "secret": 20, "hack": 15, "trick": 10,
                "mistake": 15, "stop": 10, "wait": 10, "shocking": 15, "crazy": 10,
                "millions": 15, "dollars": 10, "profit": 10, "loss": 10,
                "tutorial": 10, "example": 5, "how to": 10, "why": 5,
                "essential": 10, "proven": 10, "guaranteed": 15,
                "love": 10, "hate": 10, "fail": 15, "win": 10,
            }

            source_duration = max(0.0, get_media_duration(input_path))
            transcript_quality = summarize_transcript_quality(
                transcription_segments,
                content_type="podcast_conversation" if workflow_type == SMART_PROMO_WORKFLOW_TYPE else "general",
            )
            if workflow_type == SMART_PROMO_WORKFLOW_TYPE:
                ranked, transcript_quality = build_podcast_candidate_pool(
                    transcription_segments,
                    VIRAL_KEYWORDS,
                    audio_energy=audio_energy,
                    target_duration=target_duration,
                    source_duration=source_duration,
                )
                ranked = enrich_candidates_with_visual_notes(ranked, visual_notes)
                if not ranked or not transcript_quality.get("allowTranscriptWindows"):
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            "Smart Promo podcast V1 could not find enough trustworthy speech structure in this video. "
                            "Please use a clearer podcast/interview source or try a section with stronger spoken dialogue."
                        ),
                    )
                ranked = rerank_clip_candidates_with_ai(
                    ranked,
                    objective_label="smart_promo",
                    output_mode=output_mode,
                    promo_angle=promo_angle,
                    visual_notes=visual_notes,
                    max_candidates=8,
                )
            else:
                scenes = []
                for i, scene in enumerate(scene_list):
                    start_sec = scene[0].get_seconds()
                    end_sec = scene[1].get_seconds()
                    dur = end_sec - start_sec
                    if dur < 2.0:
                        continue

                    scene_text = ""
                    overlapping = [s for s in transcription_segments if s["start"] < end_sec and s["end"] > start_sec]
                    if overlapping:
                        scene_text = " ".join(s["text"].strip() for s in overlapping).lower()
                    elif visual_notes:
                        scene_midpoint = (start_sec + end_sec) / 2.0
                        visual_note = nearest_visual_note(visual_notes, scene_midpoint)
                        scene_text = str((visual_note or {}).get("caption") or (visual_note or {}).get("label") or "").strip()

                    enhanced_score, reasons = compute_enhanced_viral_score(
                        60, start_sec, end_sec, scene_text, VIRAL_KEYWORDS, audio_energy, motion_scores_data
                    )
                    scenes.append({
                        "id": f"scene_{i}",
                        "start": round(start_sec, 2),
                        "end": round(end_sec, 2),
                        "duration": round(dur, 2),
                        "viralScore": enhanced_score,
                        "reason": " + ".join(["Visual scene"] + reasons),
                        "text": (scene_text[:150] + "...") if len(scene_text) > 150 else scene_text,
                    })

                transcript_windows = build_transcript_windows(transcription_segments, VIRAL_KEYWORDS)
                aligned_windows = [align_clip_to_scenes(c, scene_list) for c in transcript_windows]
                timed_candidates = build_timed_promo_candidates(
                    get_media_duration(render_source_path),
                    motion_scores_data,
                    audio_energy,
                    target_duration,
                    max_candidates=max(24, max_clips * 8),
                )
                scenes = enrich_candidates_with_visual_notes(scenes, visual_notes)
                aligned_windows = enrich_candidates_with_visual_notes(aligned_windows, visual_notes)
                timed_candidates = enrich_candidates_with_visual_notes(timed_candidates, visual_notes)
                candidate_limit = max(max_clips, max_clips * 8 if campaign_roles else max_clips)
                if output_mode == "story_edit":
                    candidate_limit = max(
                        candidate_limit,
                        min(96, max(40, int(max(40.0, source_duration) / 6.0))),
                    )
                ranked = dedupe_ranked_candidates(
                    scenes + aligned_windows + timed_candidates,
                    max_results=candidate_limit,
                    source_duration=source_duration,
                )
                ranked = rerank_clip_candidates_with_ai(
                    ranked,
                    objective_label="smart_promo",
                    output_mode=output_mode,
                    promo_angle=promo_angle,
                    visual_notes=visual_notes,
                    max_candidates=12 if campaign_roles else 10,
                )

            artifact_id = store_analysis_artifact(
                analysis_cache_key,
                {
                    "sourceDuration": round(source_duration, 2),
                    "analysisDuration": round(analysis_duration, 2),
                    "rankedCandidates": ranked,
                    "visualNotes": visual_notes[:24] if visual_notes else [],
                    "analysisSummary": {
                        "candidateCount": len(ranked),
                        "visualNoteCount": len(visual_notes or []),
                        "transcriptQuality": transcript_quality,
                    },
                },
                workflow_type=workflow_type,
                pipeline_version=SMART_PROMO_PIPELINE_VERSION,
            )

        if not ranked:
            desired = max(6.0, min(float(target_duration or 30), 60.0))
            fallback_clip_count = max(1, int(max_clips or 1))
            fallback_window = min(desired, source_duration) if source_duration > 0 else desired

            if source_duration <= 0:
                ranked = [
                    {
                        "id": "fallback_0",
                        "start": 0.0,
                        "end": round(desired, 2),
                        "duration": round(desired, 2),
                        "viralScore": 58,
                        "reason": "Balanced timing fallback",
                        "text": "we created a balanced promo based on timing",
                    }
                ]
            else:
                span = max(0.0, source_duration - fallback_window)
                starts = [0.0]
                if fallback_clip_count > 1 and span > 0:
                    starts = [round(span * (index / max(1, fallback_clip_count - 1)), 2) for index in range(fallback_clip_count)]

                ranked = []
                for index, start_sec in enumerate(starts[:fallback_clip_count]):
                    end_sec = min(source_duration, start_sec + fallback_window)
                    if end_sec - start_sec < 2.0:
                        continue
                    ranked.append(
                        {
                            "id": f"fallback_{index}",
                            "start": round(start_sec, 2),
                            "end": round(end_sec, 2),
                            "duration": round(end_sec - start_sec, 2),
                            "viralScore": max(50, 62 - index * 2),
                            "reason": "Balanced timing fallback",
                            "text": "we created a balanced promo based on timing",
                        }
                    )

        def rebalance_clip_duration(clip):
            start_sec = float(clip.get("start", 0.0))
            end_sec = float(clip.get("end", start_sec))
            source_duration = max(0.0, get_media_duration(render_source_path))
            desired = max(6.0, min(float(target_duration or 30), 60.0))
            current = max(0.1, end_sec - start_sec)
            if source_duration <= 0 or current >= desired * 0.92:
                clip["duration"] = round(current, 2)
                return clip

            midpoint = start_sec + current / 2.0
            half = desired / 2.0
            new_start = max(0.0, midpoint - half)
            new_end = min(source_duration, new_start + desired)
            if new_end - new_start < desired:
                new_start = max(0.0, new_end - desired)

            clip["start"] = round(new_start, 2)
            clip["end"] = round(new_end, 2)
            clip["duration"] = round(new_end - new_start, 2)
            return clip

        original_ranked = [dict(clip) for clip in ranked]
        story_master_clip = None
        derived_short_clips = []
        if output_mode == "story_edit":
            if analysis_reused and cached_story_master_plan:
                story_master_clip = dict(cached_story_master_plan)
                derived_short_clips = [dict(clip) for clip in cached_derived_short_plans]
            else:
                story_master_clip = build_podcast_story_master_plan(
                    original_ranked,
                    target_duration,
                    source_duration=get_media_duration(render_source_path),
                    visual_notes=visual_notes,
                )
            if story_master_clip:
                if not derived_short_clips:
                    derived_short_clips = derive_shorts_from_story_master(
                        story_master_clip,
                        max_shorts=max(1, min(3, max_clips - 1 if max_clips > 1 else 3)),
                    )
                confidence_summary = build_story_confidence_summary(
                    story_master_clip,
                    derived_short_clips,
                    transcript_quality,
                    analysis_reused=analysis_reused,
                )
                story_master_clip["confidenceSummary"] = dict(confidence_summary)
                for derived_clip in derived_short_clips:
                    derived_clip["confidenceSummary"] = dict(confidence_summary)
                ranked = [story_master_clip, *derived_short_clips]
                artifact_id = store_analysis_artifact(
                    analysis_cache_key,
                    {
                        "storyMasterPlan": story_master_clip,
                        "derivedShortPlans": derived_short_clips,
                        "storyMasterTargetDuration": float(target_duration or 0.0),
                        "confidenceSummary": confidence_summary,
                    },
                    workflow_type=workflow_type,
                    pipeline_version=SMART_PROMO_PIPELINE_VERSION,
                ) or artifact_id
            else:
                ranked = [rebalance_clip_duration(dict(clip)) for clip in original_ranked[: max(1, max_clips)]]
        elif campaign_roles:
            ranked = build_promo_montage_plans(
                original_ranked,
                target_duration,
                max_clips,
                campaign_roles,
                source_duration=get_media_duration(render_source_path),
                visual_notes=visual_notes,
            )
        else:
            ranked = [rebalance_clip_duration(dict(clip)) for clip in original_ranked]

        for idx, clip in enumerate(ranked):
            logger.info(
                "Smart Promo plan %s/%s role=%s story=%s duration=%.2fs montage=%.2fs windows=%s",
                idx + 1,
                len(ranked),
                clip.get("campaignRole") or "default",
                bool(clip.get("storyMaster")),
                float(clip.get("duration", 0.0) or 0.0),
                float(clip.get("montageDuration", clip.get("duration", 0.0)) or 0.0),
                clip.get("debugSummary") or "n/a",
            )

        update_firestore_job(job_id, {
            "status": "rendering",
            "progress": 50,
            "clipSuggestions": ranked,
            "total_clips": len(ranked),
            "visualNotes": visual_notes[:24] if visual_notes else [],
            "artifactId": artifact_id,
            "analysisReused": analysis_reused,
            "pipelineVersion": SMART_PROMO_PIPELINE_VERSION,
            "workflowType": workflow_type,
            "confidenceSummary": confidence_summary or None,
        })

        # 3. Render each clip
        completed = []
        def build_story_outputs(clips):
            story_master = next((entry for entry in clips if entry.get("storyMaster")), None)
            derived = [entry for entry in clips if not entry.get("storyMaster")]
            return story_master, derived

        for idx, clip in enumerate(ranked):
            try:
                update_firestore_job(job_id, {
                    "status": "rendering",
                    "progress": min(94, 50 + int(42 * idx / max(1, len(ranked)))),
                    "detail": f"Rendering promo clip {idx + 1} of {len(ranked)}",
                    "activeClipIndex": idx,
                })
                clip_output = os.path.join(SHARED_TMP_DIR, f"{job_id}_clip_{idx}.mp4")
                trimmed = os.path.join(SHARED_TMP_DIR, f"{job_id}_trim_{idx}.mp4")
                duration = clip["end"] - clip["start"]
                segment_paths = []
                concat_list_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_concat_{idx}.txt")
                is_story_master_render = bool(clip.get("storyMaster"))

                # Smart Promo preserves the whole useful frame for demos and screen recordings.
                vf = build_promo_video_filter(target_aspect, "promo_fit")

                # Render with captions if style is set
                if clip.get("segments") and len(clip.get("segments")) > 1:
                    logger.info(
                        "Rendering Smart Promo %s %s/%s with %s internal beats over %.2fs",
                        "story edit" if is_story_master_render else "montage",
                        idx + 1,
                        len(ranked),
                        len(clip.get("segments")),
                        float(clip.get("duration", 0.0) or 0.0),
                    )
                    for segment_index, segment in enumerate(clip.get("segments")):
                        segment_path = os.path.join(
                            SHARED_TMP_DIR,
                            f"{job_id}_segment_{idx}_{segment_index}.mp4",
                        )
                        segment_duration = max(0.1, float(segment.get("end", 0.0)) - float(segment.get("start", 0.0)))
                        await run_subprocess_async([
                            "ffmpeg",
                            "-ss",
                            str(segment["start"]),
                            "-i",
                            render_source_path,
                            "-t",
                            str(segment_duration),
                            "-vf",
                            vf,
                            "-c:v", GPU_VIDEO_ENCODER, "-preset", GPU_PRESET,
                            "-c:a",
                            "aac",
                            "-y",
                            segment_path,
                        ], check=True, job_context=job_id, timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS)
                        segment_paths.append(segment_path)

                    with open(concat_list_path, "w", encoding="utf-8") as concat_file:
                        for segment_path in segment_paths:
                            concat_file.write(f"file '{segment_path}'\n")

                    await run_subprocess_async([
                        "ffmpeg",
                        "-f",
                        "concat",
                        "-safe",
                        "0",
                        "-i",
                        concat_list_path,
                        "-c:v", GPU_VIDEO_ENCODER, "-preset", GPU_PRESET,
                        "-c:a",
                        "aac",
                        "-y",
                        trimmed,
                    ], check=True, job_context=job_id, timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS)
                    duration = clip.get("duration", duration)
                else:
                    await run_subprocess_async([
                        "ffmpeg", "-ss", str(clip["start"]), "-i", render_source_path,
                        "-t", str(duration), "-vf", vf,
                        "-c:v", GPU_VIDEO_ENCODER, "-preset", GPU_PRESET, "-c:a", "aac", "-y", trimmed
                    ], check=True, job_context=job_id, timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS)

                if caption_style in CAPTION_STYLES:

                    # Generate captions
                    model = get_whisper_model()
                    if clip.get("renderStrategy") == "promo_montage":
                        try:
                            w, h = get_video_dimensions(trimmed)
                            ass_content = generate_promo_story_captions(
                                clip,
                                w,
                                h,
                                continuous_timeline=False,
                            )
                            ass_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_promo_story_{idx}.ass")
                            with open(ass_path, "w", encoding="utf-8") as f:
                                f.write(ass_content)
                            safe_ass = ass_path.replace("\\", "/").replace(":", "\\:")
                            audio_args = ["-c:a", "copy"] if has_audio_stream(trimmed) else ["-an"]
                            await run_subprocess_async([
                                "ffmpeg", "-i", trimmed, "-vf", f"ass='{safe_ass}'",
                                "-c:v", GPU_VIDEO_ENCODER, "-preset", GPU_PRESET, *audio_args, "-y", clip_output
                            ], check=True, job_context=job_id, timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS)
                            if os.path.exists(ass_path):
                                os.remove(ass_path)
                        except Exception as story_caption_err:
                            logger.warning(f"Promo story captions failed for clip {idx}; falling back to captionless render: {story_caption_err}")
                            shutil.copy(trimmed, clip_output)
                    elif model and has_audio_stream(trimmed):
                        try:
                            whisper_res = model.transcribe(trimmed, fp16=False, word_timestamps=True, condition_on_previous_text=False)
                            w, h = get_video_dimensions(trimmed)
                            ass_content = generate_ass_captions(whisper_res, caption_style, w, h)
                            ass_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_cap_{idx}.ass")
                            with open(ass_path, "w", encoding="utf-8") as f:
                                f.write(ass_content)
                            safe_ass = ass_path.replace("\\", "/").replace(":", "\\:")
                            await run_subprocess_async([
                                "ffmpeg", "-i", trimmed, "-vf", f"ass='{safe_ass}'",
                                "-c:v", GPU_VIDEO_ENCODER, "-preset", GPU_PRESET, "-c:a", "copy", "-y", clip_output
                            ], check=True, job_context=job_id, timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS)
                            if os.path.exists(ass_path):
                                os.remove(ass_path)
                        except Exception as caption_err:
                            logger.warning(f"Promo captions failed for clip {idx}; falling back to captionless render: {caption_err}")
                            shutil.copy(trimmed, clip_output)
                    else:
                        shutil.copy(trimmed, clip_output)
                else:
                    shutil.copy(trimmed, clip_output)

                if os.path.exists(clip_output):
                    storage_path = f"generated_clips/{job_id}/clip_{idx}_{uuid.uuid4().hex[:8]}.mp4"
                    url = upload_file_to_firebase(clip_output, storage_path)
                    update_firestore_job(job_id, {
                        "status": "generating_visuals",
                        "progress": min(94, 52 + int(42 * (idx + 1) / max(1, len(ranked)))),
                        "detail": f"Generating thumbnails and promo posters for clip {idx + 1}",
                    })
                    visual_style_key = (
                        "hype" if caption_style in {"glow", "bounce", "bold_pop"} else
                        "cinematic" if caption_style in {"karaoke"} else
                        "clean"
                    )
                    clip_midpoint = (
                        float(clip.get("start", 0.0) or 0.0) + float(clip.get("end", clip.get("start", 0.0)) or 0.0)
                    ) / 2.0
                    visual_note = nearest_visual_note(visual_notes, clip_midpoint)
                    try:
                        visual_assets = build_promo_visual_assets(
                            clip_output,
                            clip,
                            job_id,
                            idx,
                            visual_style_key,
                            visual_note=visual_note,
                        )
                    except Exception as visual_err:
                        logger.warning(f"Promo visual package failed for clip {idx}: {visual_err}")
                        visual_assets = []
                    asset_profile = infer_promo_content_profile(
                        clip,
                        visual_style_key,
                        frame=extract_best_frame_image(clip_output),
                        visual_note=visual_note,
                    )
                    asset_fallback = VISUAL_PROFILE_FALLBACKS.get(asset_profile["style"], {})
                    ai_thumbnail_package = clip.get("aiThumbnailPackage")
                    hook_text = choose_thumbnail_text(
                        [
                            (ai_thumbnail_package or {}).get("hook"),
                            clip.get("hookText"),
                            clip.get("promoCaption"),
                            (visual_note or {}).get("caption"),
                            clip.get("text"),
                        ],
                        asset_fallback.get("hooks", PROMO_SAFE_HOOKS)[idx % len(asset_fallback.get("hooks", PROMO_SAFE_HOOKS))],
                        max_words=7,
                    )
                    # --- GPT creative social captions ---
                    gpt_captions = None
                    try:
                        content_type = clip.get("contentType") or "general"
                        gpt_captions = generate_creative_social_captions(clip, content_type)
                    except Exception:
                        pass

                    subtitle_text = choose_thumbnail_text(
                        [
                            (ai_thumbnail_package or {}).get("subtitle"),
                            (visual_note or {}).get("caption"),
                            clip.get("captionSuggestion"),
                            clip.get("reason"),
                            asset_fallback.get("subtitle"),
                        ],
                        asset_fallback.get("subtitle") or "Full clip inside",
                        max_words=10,
                    )
                    if (clip.get("contentType") in {"choir_performance", "music_performance"}) and float(clip.get("transcriptConfidence", 0.0) or 0.0) < 0.74:
                        clip["captionSuggestion"] = (
                            (gpt_captions or {}).get("captions", [None])[0]
                            or (visual_note or {}).get("caption")
                            or clip.get("captionSuggestion")
                            or subtitle_text
                        )
                    completed.append({
                        **clip,
                        "url": url,
                        "storagePath": storage_path,
                        "rendered": True,
                        "hookText": hook_text,
                        "titleSuggestion": hook_text,
                        "promoCaption": clip.get("promoCaption") or subtitle_text,
                        "subtitleText": subtitle_text,
                        "gptCaptions": gpt_captions,
                        "gptHook": gpt_captions.get("hook") if gpt_captions else None,
                        "gptVibe": gpt_captions.get("vibe") if gpt_captions else None,
                        "captions": clip.get("segments") or [
                            {
                                "start": 0,
                                "end": round(float(clip.get("duration", duration) or duration), 2),
                                "text": subtitle_text,
                            }
                        ],
                        "visualAssets": visual_assets,
                        "thumbnailOptions": [asset for asset in visual_assets if asset.get("type") == "thumbnail"],
                        "posterOptions": [asset for asset in visual_assets if asset.get("type") in {"poster", "story"}],
                        "promoPackage": {
                            "hook": hook_text,
                            "title": hook_text,
                            "subtitle": subtitle_text,
                            "copySource": "ai_refined" if ai_thumbnail_package else "heuristic",
                            "aiThumbnailPackage": ai_thumbnail_package,
                            "assets": visual_assets,
                            "assetCount": len(visual_assets),
                        },
                    })
                    if os.path.exists(clip_output): os.remove(clip_output)

                update_firestore_job(job_id, {
                    "status": "rendering",
                    "progress": 50 + int(48 * (idx + 1) / len(ranked)),
                    "completed_clips": idx + 1,
                    "clips": completed,
                    "storyMasterClip": build_story_outputs(completed)[0],
                    "derivedShorts": build_story_outputs(completed)[1],
                    "confidenceSummary": confidence_summary or None,
                })
            except Exception as clip_err:
                logger.error(f"Auto-gen clip {idx} failed: {clip_err}")
                completed.append({**clip, "rendered": False, "error": str(clip_err)})
            finally:
                if os.path.exists(trimmed):
                    try:
                        os.remove(trimmed)
                    except Exception:
                        pass
                if os.path.exists(concat_list_path):
                    try:
                        os.remove(concat_list_path)
                    except Exception:
                        pass
                for segment_path in segment_paths:
                    if os.path.exists(segment_path):
                        try:
                            os.remove(segment_path)
                        except Exception:
                            pass

        rendered_count = len([c for c in completed if c.get("rendered")])
        story_master_output, derived_short_outputs = build_story_outputs(completed)
        if rendered_count > 0:
            update_firestore_job(job_id, {
                "status": "completed",
                "progress": 100,
                "clips": completed,
                "promoClips": [story_master_output, *derived_short_outputs] if story_master_output else completed,
                "storyMasterClip": story_master_output,
                "derivedShorts": derived_short_outputs,
                "completed_clips": rendered_count,
                "total_clips": len(ranked),
                "analysisReused": analysis_reused,
                "artifactId": artifact_id,
                "pipelineVersion": SMART_PROMO_PIPELINE_VERSION,
                "workflowType": workflow_type,
                "confidenceSummary": confidence_summary or None,
            })
        else:
            update_firestore_job(job_id, {
                "status": "failed",
                "progress": 100,
                "clips": completed,
                "storyMasterClip": story_master_output,
                "derivedShorts": derived_short_outputs,
                "completed_clips": 0,
                "total_clips": len(ranked),
                "error": "Promo generation completed without usable clips",
                "analysisReused": analysis_reused,
                "artifactId": artifact_id,
                "pipelineVersion": SMART_PROMO_PIPELINE_VERSION,
                "workflowType": workflow_type,
                "confidenceSummary": confidence_summary or None,
            })

    except Exception as e:
        logger.error(f"Auto-generate failed: {e}")
        try:
            update_firestore_job(job_id, {"status": "failed", "error": str(e)})
        except:
            pass
    finally:
        if os.path.exists(input_path):
            try: os.remove(input_path)
            except: pass
        if os.path.exists(analysis_path):
            try: os.remove(analysis_path)
            except: pass


@app.get("/clip-templates")
def get_clip_templates():
    """Return available clip templates and caption styles."""
    return {
        "templates": {k: {**v, "target_duration": list(v["target_duration"])} for k, v in CLIP_TEMPLATES.items()},
        "caption_styles": {k: {"label": v["label"], "animation": v["animation"]} for k, v in CAPTION_STYLES.items()},
        "platform_presets": PLATFORM_PRESETS,
    }


@app.get("/caption-styles")
def get_caption_styles():
    """Return available animated caption styles."""
    return {k: {"label": v["label"], "animation": v["animation"], "description": f"{v['label']} style"} for k, v in CAPTION_STYLES.items()}


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
    caption_style: str = ""  # "", "bold_pop", "karaoke", "glow", "bounce", "minimal"
    smart_crop: bool = False
    smart_crop_mode: str = "center"  # "center" or "speaker_track"
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
    template: str = ""  # preset template name from CLIP_TEMPLATES

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
            crop_mode = str(request.smart_crop_mode or "center").strip().lower()
            try:
                if crop_mode == "speaker_track":
                    logger.info("Applying Speaker-Tracking Smart Crop...")
                    src_w, src_h = get_video_dimensions(trimmed_path)
                    loop = asyncio.get_running_loop()
                    positions = await loop.run_in_executor(None, detect_speaker_positions, trimmed_path, 0.5)

                    if positions and len(positions) >= 3:
                        keyframes, crop_w, crop_h = build_speaker_track_crop_filter(positions, src_w, src_h, "9:16")
                        sendcmd_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_sendcmd.txt")
                        with open(sendcmd_path, "w") as f:
                            f.write("\n".join(keyframes))
                        vf_track = (
                            f"sendcmd=f='{sendcmd_path}',"
                            f"crop={crop_w}:{crop_h}:0:0,"
                            f"scale=1080:1920"
                        )
                        await run_subprocess_async([
                            "ffmpeg", "-i", trimmed_path,
                            "-vf", vf_track,
                            "-c:v", GPU_VIDEO_ENCODER, "-preset", GPU_PRESET, "-c:a", "copy", "-y", cropped_path
                        ], check=True)
                        working_path = cropped_path
                    else:
                        logger.info("Speaker tracking found no faces, falling back to center crop")
                        vf_crop = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
                        await run_subprocess_async([
                            "ffmpeg", "-i", trimmed_path,
                            "-vf", vf_crop,
                            "-c:v", "libx264", "-c:a", "copy", "-y", cropped_path
                        ], check=True)
                        working_path = cropped_path
                else:
                    logger.info("Applying Smart Crop (Center Focus 9:16)...")
                    vf_crop = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
                    await run_subprocess_async([
                        "ffmpeg", "-i", trimmed_path,
                        "-vf", vf_crop,
                        "-c:v", "libx264", "-c:a", "copy", "-y", cropped_path
                    ], check=True)
                    working_path = cropped_path
            except Exception as e:
                logger.error(f"Smart Crop failed: {e}. Proceeding with original aspect ratio.")
                # Fallback to trimmed_path

        # 3. Auto-Captions (Optional) — supports animated ASS styles
        ass_subtitle_path = None
        if request.auto_captions:
            caption_style_name = str(request.caption_style or "").strip().lower()
            use_animated = caption_style_name in CAPTION_STYLES
            try:
                logger.info(f"Generating auto-captions (style={caption_style_name or 'legacy'}, animated={use_animated})...")
                loop = asyncio.get_running_loop()
                model = get_whisper_model()
                if model:
                    whisper_result = await loop.run_in_executor(None, lambda: model.transcribe(
                        working_path,
                        fp16=False,
                        condition_on_previous_text=False,
                        word_timestamps=use_animated,
                    ))
                    segments = whisper_result.get("segments", [])
                    logger.info(f"Generated {len(segments)} caption segments (word_timestamps={use_animated})")

                    if use_animated and segments:
                        # Generate ASS subtitle file with animated word-level captions
                        w, h = get_video_dimensions(working_path)
                        ass_content = generate_ass_captions(whisper_result, caption_style_name, w, h)
                        ass_subtitle_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_captions.ass")
                        with open(ass_subtitle_path, "w", encoding="utf-8") as f:
                            f.write(ass_content)
                        logger.info(f"ASS subtitle file written to {ass_subtitle_path}")
                    else:
                        # Legacy: add text overlays the old way
                        hallucinations = ["Thank you.", "Thanks.", "Bye.", "Music.", "Watching.", "MBC", "LBC", "You", "Silence"]
                        for seg in segments:
                            txt = seg.get('text', '').strip()
                            txt = txt.replace("[Music]", "").replace("(Music)", "").strip()
                            if not txt or txt in hallucinations:
                                continue
                            if seg.get('no_speech_prob', 0) > 0.85:
                                continue
                            start = float(seg['start'])
                            end = float(seg['end'])
                            ov = ViralOverlay(
                                id=f"auto_{seg['id']}",
                                type='text',
                                text=txt,
                                x=50, y=85,
                                bg="black@0.5",
                                color="yellow",
                                start_time=start,
                                duration=(end - start)
                            )
                            request.overlays.append(ov)
            except Exception as e:
                logger.error(f"Auto-caption generation failed: {e}")
        
        # Use working_path (either original trimmed or cropped version) as base for overlays
        base_width, base_height = get_video_dimensions(working_path)
        inputs = ["-i", working_path]
        filter_chain = []
        current_v_label = "0:v"
        input_idx = 1

        # If ASS captions were generated, apply them as a video filter
        if ass_subtitle_path and os.path.exists(ass_subtitle_path):
            safe_ass = ass_subtitle_path.replace("\\", "/").replace(":", "\\:")
            filter_chain.append(f"[{current_v_label}]ass='{safe_ass}'[v_captions];")
            current_v_label = "v_captions"

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


# In-memory job tracker for ingest (survives between requests, lost on restart)
_ingest_jobs: Dict[str, dict] = {}


def _run_ingest_job(job_id: str, input_path: str, cache_key: str, cached_mp4: str, cached_meta_path: str, safe_name: str, uid: str, label: str, total_bytes: int, file_hash: str, mode: str = "full"):
    """
    Background: extract sync audio, optionally transcode video, cache, upload.
    mode: "audio_only" = just extract sync audio (fast, tiny), skip video transcode
          "full" = extract audio + transcode video for export
    """
    audio_only = mode == "audio_only"
    is_audio_file = safe_name.lower().endswith(('.wav', '.mp3', '.aac', '.ogg', '.flac', '.m4a', '.wma'))
    try:
        _ingest_jobs[job_id] = {"status": "extracting_audio", "progress": 5, "label": label}

        # --- Extract sync audio (16kHz mono WAV for clap detection) ---
        sync_audio_path = input_path + "_sync.wav"
        sync_audio_url = None
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-nostdin", "-i", input_path,
                 "-vn", "-ac", "1", "-ar", "16000", "-acodec", "pcm_s16le",
                 "-t", str(MULTICAM_SYNC_ANALYSIS_SECONDS),
                 sync_audio_path],
                check=True, timeout=120,
            )
            sync_size = os.path.getsize(sync_audio_path)
            logger.info(f"Extracted sync audio {label}: {sync_size / 1024:.0f} KB")

            # For audio files: serve locally, no Firebase needed for sync
            if is_audio_file:
                os.makedirs(LOCAL_MEDIA_OUTPUT_DIR, exist_ok=True)
                local_name = f"{uuid.uuid4().hex}_{os.path.basename(sync_audio_path)}"
                local_path = os.path.join(LOCAL_MEDIA_OUTPUT_DIR, local_name)
                shutil.copy2(sync_audio_path, local_path)
                sync_audio_url = f"http://127.0.0.1:8000/local-output/{local_name}"
                logger.info(f"Audio-only {label}: serving sync WAV locally (no Firebase upload)")
            else:
                sync_dest = f"temp/multicam-clean-sync/{uid}/{uuid.uuid4().hex}_{os.path.basename(sync_audio_path)}"
                sync_audio_url = upload_file_to_firebase(sync_audio_path, sync_dest)
                if not sync_audio_url:
                    # Copy to worker_outputs so local-output route can serve it
                    local_name = f"{uuid.uuid4().hex}_{os.path.basename(sync_audio_path)}"
                    local_path = os.path.join(LOCAL_MEDIA_OUTPUT_DIR, local_name)
                    os.makedirs(LOCAL_MEDIA_OUTPUT_DIR, exist_ok=True)
                    shutil.copy2(sync_audio_path, local_path)
                    sync_audio_url = f"http://127.0.0.1:8000/local-output/{local_name}"

            _ingest_jobs[job_id]["syncAudioUrl"] = sync_audio_url
            _ingest_jobs[job_id]["progress"] = 15
            _ingest_jobs[job_id]["status"] = "sync_audio_ready"
        except Exception as e:
            logger.warning(f"Sync audio extraction failed for {label}: {e}")

        # --- Then transcode video (skip if audio_only mode) ---
        if not audio_only:
            _ingest_jobs[job_id] = {"status": "transcoding", "progress": 20, "label": label, "syncAudioUrl": sync_audio_url}
        transcoded_path = input_path + "_transcoded.mp4"
        if not audio_only:
            transcode_cmd = [
                "ffmpeg", "-y", "-nostdin",
                "-i", input_path,
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26",
                "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart",
                transcoded_path,
            ]
            try:
                subprocess.run(transcode_cmd, check=True, timeout=3600)
                transcoded_size = os.path.getsize(transcoded_path)
                pct_saved = round((1 - transcoded_size / max(total_bytes, 1)) * 100)
                logger.info(f"Transcoded {label}: {total_bytes / (1024*1024):.1f} MB → {transcoded_size / (1024*1024):.1f} MB ({pct_saved}% smaller)")
            except Exception as e:
                logger.warning(f"Transcode failed for {label}, using original: {e}")
                transcoded_path = input_path
                transcoded_size = total_bytes
                pct_saved = 0

            # Cache result
            try:
                shutil.copy2(transcoded_path, cached_mp4)
                with open(cached_meta_path, "w") as mf:
                    json.dump({"hash": file_hash, "name": safe_name, "original_size": total_bytes, "transcoded_size": transcoded_size}, mf)
            except Exception as e:
                logger.warning(f"Failed to cache: {e}")

            # Upload video to Firebase
            _ingest_jobs[job_id] = {"status": "uploading", "progress": 80, "label": label, "syncAudioUrl": sync_audio_url}
            dest = f"temp/multicam-clean-sync/{uid}/{uuid.uuid4().hex}_{os.path.basename(transcoded_path)}"
            firebase_url = upload_file_to_firebase(transcoded_path, dest)
        else:
            transcoded_size = 0
            pct_saved = 100
            firebase_url = None

        # Cleanup input file (always)
        try:
            if os.path.exists(input_path):
                os.remove(input_path)
        except Exception:
            pass
        if not audio_only and os.path.exists(transcoded_path) and transcoded_path != input_path:
            try: os.remove(transcoded_path)
            except: pass

        _ingest_jobs[job_id] = {
            "status": "done",
            "progress": 100,
            "label": label,
            "url": firebase_url or sync_audio_url or "",
            "syncAudioUrl": sync_audio_url,
            "original_size": total_bytes,
            "transcoded_size": transcoded_size if not audio_only else 0,
            "size_saved_pct": pct_saved if not audio_only else 100,
            "mode": mode,
        }
    except Exception as e:
        logger.error(f"Ingest job {job_id} failed: {e}")
        _ingest_jobs[job_id] = {"status": "failed", "error": str(e), "label": label}


@app.post("/api/media/ingest-local")
async def ingest_local_file(
    file: UploadFile = File(...),
    uid: str = Form(...),
    label: str = Form("source"),
):
    """
    Save file to disk, return immediately. Transcode + upload runs in background.
    Poll GET /api/media/ingest-local/{job_id} for completion.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    if not uid:
        raise HTTPException(status_code=400, detail="uid is required")

    tmp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp/ingest"))
    cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp/ingest-cache"))
    os.makedirs(tmp_dir, exist_ok=True)
    os.makedirs(cache_dir, exist_ok=True)

    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", file.filename or "upload").strip("._")
    input_path = os.path.join(tmp_dir, f"{uuid.uuid4().hex[:8]}_{safe_name}")

    hasher = hashlib.sha256()
    total_bytes = 0
    try:
        with open(input_path, "wb") as f:
            while True:
                chunk = await file.read(8 * 1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
                hasher.update(chunk)
                total_bytes += len(chunk)
    except Exception as e:
        if os.path.exists(input_path):
            os.remove(input_path)
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    file_hash = hasher.hexdigest()[:16]
    cache_key = f"{file_hash}_{safe_name}"
    cached_mp4 = os.path.join(cache_dir, f"{cache_key}.mp4")
    cached_meta_path = os.path.join(cache_dir, f"{cache_key}.json")
    logger.info(f"Received {label} ({total_bytes / (1024*1024):.1f} MB, hash={file_hash})")

    # --- CACHE HIT: return immediately ---
    if os.path.exists(cached_mp4) and os.path.getsize(cached_mp4) > 1024:
        try: os.remove(input_path)
        except: pass
        cached_size = os.path.getsize(cached_mp4)
        dest = f"temp/multicam-clean-sync/{uid}/{uuid.uuid4().hex}_{safe_name}.mp4"
        firebase_url = upload_file_to_firebase(cached_mp4, dest)
        return {
            "success": True,
            "status": "done",
            "url": firebase_url or f"http://127.0.0.1:8000/local-output/{os.path.basename(cached_mp4)}",
            "original_size": total_bytes,
            "transcoded_size": cached_size,
            "size_saved_pct": round((1 - cached_size / max(total_bytes, 1)) * 100),
            "cached": True,
        }

    # --- CACHE MISS: spin up background job ---
    job_id = uuid.uuid4().hex[:12]
    is_audio_file = safe_name.lower().endswith(('.wav', '.mp3', '.aac', '.ogg', '.flac', '.m4a', '.wma'))
    ingest_mode = "audio_only" if (total_bytes > 1_000_000_000 or is_audio_file) else "full"
    _ingest_jobs[job_id] = {"status": "saving", "progress": 0, "label": label, "original_size": total_bytes}
    threading.Thread(
        target=_run_ingest_job,
        args=(job_id, input_path, cache_key, cached_mp4, cached_meta_path, safe_name, uid, label, total_bytes, file_hash, ingest_mode),
        daemon=True,
    ).start()
    logger.info(f"Started ingest job {job_id} for {label} ({total_bytes / (1024*1024):.1f} MB, mode={ingest_mode})")
    return {
        "success": True,
        "status": "processing",
        "job_id": job_id,
        "original_size": total_bytes,
        "label": label,
    }


@app.get("/api/media/ingest-local/{job_id}")
async def get_ingest_status(job_id: str):
    """Poll for ingest job completion."""
    job = _ingest_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"success": True, "job_id": job_id, **job}


if __name__ == "__main__":
    import uvicorn
    # Use PORT env var for Render/Heroku support, default to 8000 for localhost
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
