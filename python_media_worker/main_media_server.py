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
import itertools
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

def build_multicam_segment_encode_args():
    """Encode short multicam segments quickly while keeping concat-safe output."""
    if GPU_VIDEO_ENCODER == "h264_nvenc":
        return [
            "-c:v",
            "h264_nvenc",
            "-preset",
            os.getenv("MULTICAM_NVENC_PRESET", "p1"),
            "-rc",
            "vbr",
            "-cq",
            os.getenv("MULTICAM_NVENC_CQ", "21"),
            "-b:v",
            os.getenv("MULTICAM_NVENC_BITRATE", "7000k"),
            "-maxrate:v",
            os.getenv("MULTICAM_NVENC_MAXRATE", "10000k"),
            "-bufsize:v",
            os.getenv("MULTICAM_NVENC_BUFSIZE", "14000k"),
            "-pix_fmt",
            "yuv420p",
        ]
    return [
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
    ]


def build_multicam_caption_encode_args():
    """Burned captions require a full video pass, so use the GPU encoder when available."""
    if GPU_VIDEO_ENCODER == "h264_nvenc" and os.getenv("MULTICAM_CAPTION_ENCODER", "nvenc").strip().lower() != "x264":
        return [
            "-c:v",
            "h264_nvenc",
            "-preset",
            os.getenv("MULTICAM_CAPTION_NVENC_PRESET", os.getenv("MULTICAM_NVENC_PRESET", "p1")),
            "-rc",
            "vbr",
            "-cq",
            os.getenv("MULTICAM_CAPTION_NVENC_CQ", "20"),
            "-b:v",
            os.getenv("MULTICAM_CAPTION_NVENC_BITRATE", "7000k"),
            "-maxrate:v",
            os.getenv("MULTICAM_CAPTION_NVENC_MAXRATE", "10000k"),
            "-bufsize:v",
            os.getenv("MULTICAM_CAPTION_NVENC_BUFSIZE", "14000k"),
            "-pix_fmt",
            "yuv420p",
        ]
    return [
        "-c:v",
        "libx264",
        "-preset",
        os.getenv("MULTICAM_CAPTION_X264_PRESET", "veryfast"),
        "-crf",
        os.getenv("MULTICAM_CAPTION_X264_CRF", "18"),
        "-pix_fmt",
        "yuv420p",
    ]


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


def probe_media_stream_summary(input_path):
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "stream=index,codec_type,codec_name,duration",
                "-show_entries",
                "format=duration,size",
                "-of",
                "json",
                input_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        )
        return json.loads(result.stdout or "{}")
    except Exception as probe_error:
        return {"error": str(probe_error)}


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


def get_video_rotation_degrees(input_path):
    """Read phone/camera display rotation metadata so Cam Combiner renders upright."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream_tags=rotate:stream_side_data=rotation",
                "-of",
                "json",
                input_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        )
        payload = json.loads(result.stdout or "{}")
        streams = payload.get("streams") or []
        if not streams:
            return 0
        stream = streams[0] or {}
        candidates = []
        tags = stream.get("tags") or {}
        if tags.get("rotate") is not None:
            candidates.append(tags.get("rotate"))
        for item in stream.get("side_data_list") or []:
            if isinstance(item, dict) and item.get("rotation") is not None:
                candidates.append(item.get("rotation"))
        for candidate in candidates:
            rotation = normalize_multicam_rotation_degrees(candidate)
            if rotation:
                return rotation
    except Exception as rotation_error:
        logger.debug("Could not probe video rotation for %s: %s", input_path, rotation_error)
    return 0


def probe_video_color_metadata(input_path):
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=pix_fmt,color_space,color_transfer,color_primaries",
                "-of",
                "json",
                input_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        )
        payload = json.loads(result.stdout or "{}")
        stream = (payload.get("streams") or [{}])[0] or {}
        return {
            "pix_fmt": stream.get("pix_fmt") or "",
            "color_space": stream.get("color_space") or "",
            "color_transfer": stream.get("color_transfer") or "",
            "color_primaries": stream.get("color_primaries") or "",
        }
    except Exception as color_metadata_error:
        logger.debug("Could not probe video color metadata for %s: %s", input_path, color_metadata_error)
        return {}


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

async def materialize_video_input(video_url, local_path, keep_audio=False):
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
        # Download ONCE and probe locally instead of probing the URL first (eliminates double download)
        logger.info(f"Downloading source video: {source[:120]}...")
        download_start = time.time()
        try:
            ffmpeg_result = await run_subprocess_async(
                [
                    "ffmpeg",
                    "-nostdin",
                    "-user_agent",
                    "Mozilla/5.0",
                    "-timeout",
                    "30000000",  # 30s connection timeout in microseconds
                    "-fflags", "+genpts",
                    "-i",
                    source,
                    "-c:v", "libx264",
                    "-preset", "ultrafast",
                    "-crf", "23",
                    "-vf", "fps=30",
                    *([] if keep_audio else ["-an"]),
                    "-vsync", "cfr",
                    "-movflags", "+faststart",
                    "-y",
                    resolved_local_path,
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            download_elapsed = time.time() - download_start
            file_mb = os.path.getsize(resolved_local_path) / (1024 * 1024) if os.path.exists(resolved_local_path) else 0
            logger.info(f"Downloaded {file_mb:.1f}MB in {download_elapsed:.1f}s ({file_mb / max(0.1, download_elapsed):.1f} MB/s)")

            # Probe the LOCAL file (instant, no network)
            materialized_duration = await probe_duration_async(resolved_local_path)
            await validate_materialized_file(
                resolved_local_path,
                materialized_duration,  # use local probe, not URL probe
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
                    with urllib.request.urlopen(request, timeout=120) as response:
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
                # Normalize VFR to CFR after HTTP download
                tmp_cfr_path = resolved_local_path + ".cfr.mp4"
                await run_subprocess_async(
                    [
                        "ffmpeg",
                        "-nostdin",
                        "-fflags", "+genpts",
                        "-i", resolved_local_path,
                        "-c:v", "libx264",
                        "-preset", "ultrafast",
                        "-crf", "23",
                        "-vf", "fps=30",
                        *([] if keep_audio else ["-an"]),
                        "-vsync", "cfr",
                        "-movflags", "+faststart",
                        "-y",
                        tmp_cfr_path,
                    ],
                    check=True,
                )
                os.replace(tmp_cfr_path, resolved_local_path)
                materialized_duration = await probe_duration_async(resolved_local_path)
                await validate_materialized_file(
                    resolved_local_path,
                    materialized_duration,
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
        # Transcode local copy to CFR to eliminate iPhone VFR drift
        await run_subprocess_async(
            [
                "ffmpeg",
                "-nostdin",
                "-fflags", "+genpts",
                "-i", absolute_source,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "23",
                "-vf", "fps=30",
                *([] if keep_audio else ["-an"]),
                "-vsync", "cfr",
                "-movflags", "+faststart",
                "-y",
                resolved_local_path,
            ],
            check=True,
        )
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


def link_or_copy_cached_media(source_path, local_path):
    """Create a cheap job-local reference to cached media, falling back to copy."""
    source_abs = os.path.abspath(source_path)
    local_abs = os.path.abspath(local_path)
    if source_abs == local_abs:
        return local_abs
    os.makedirs(os.path.dirname(local_abs), exist_ok=True)
    try:
        if os.path.exists(local_abs):
            os.remove(local_abs)
        os.link(source_abs, local_abs)
        return local_abs
    except OSError:
        shutil.copy2(source_abs, local_abs)
        return local_abs


async def materialize_cached_media_input(source_url, local_path, cache_key=None, keep_audio=False):
    source = str(source_url or "").strip()
    if not source:
        raise HTTPException(status_code=400, detail="source_url is required")

    cache_key_text = str(cache_key or source)
    extension = os.path.splitext(cache_key_text.split("?")[0])[1] or os.path.splitext(local_path)[1] or ".bin"
    cache_mode_key = f"{cache_key_text}:keep-audio" if keep_audio else cache_key_text
    cache_path = os.path.join(get_local_media_cache_dir(), f"{build_media_cache_key(source, cache_mode_key)}{extension}")

    if not IS_PRODUCTION_ENV and os.path.exists(cache_path) and os.path.getsize(cache_path) > 1024:
        if keep_audio and not has_audio_stream(cache_path):
            logger.warning(f"Ignoring cached media without required audio stream: {cache_path}")
            try:
                os.remove(cache_path)
            except OSError:
                pass
        else:
            logger.info(f"Using cached local media for clean-audio sync: {cache_path}")
            return link_or_copy_cached_media(cache_path, local_path)

    resolved_local_path = await materialize_video_input(source, local_path, keep_audio=keep_audio)
    if keep_audio and not has_audio_stream(resolved_local_path):
        raise HTTPException(status_code=422, detail="External clean-audio input has no audio stream after materialization")

    if not IS_PRODUCTION_ENV and os.path.exists(resolved_local_path) and os.path.getsize(resolved_local_path) > 1024:
        try:
            shutil.copy2(resolved_local_path, cache_path)
            logger.info(f"Cached local media for repeat dev sync tests: {cache_path}")
        except Exception as cache_error:
            logger.warning(f"Could not cache local media input: {cache_error}")

    return resolved_local_path


async def materialize_audio_input(source_url, local_path, sample_rate=None):
    """Materialize any URL/local media as mono WAV for sync-only analysis."""
    source = str(source_url or "").strip()
    if not source:
        raise HTTPException(status_code=400, detail="source_url is required")

    resolved_local_path = local_path if local_path.lower().endswith(".wav") else f"{local_path}.wav"
    os.makedirs(os.path.dirname(os.path.abspath(resolved_local_path)), exist_ok=True)

    if source.startswith("http://") or source.startswith("https://"):
        input_source = source
    else:
        if IS_PRODUCTION_ENV:
            raise HTTPException(status_code=400, detail="Only http/https URLs are accepted for audio source_url")
        absolute_source = os.path.abspath(source)
        allowed_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tmp"))
        if not absolute_source.startswith(allowed_dir + os.sep):
            raise HTTPException(status_code=400, detail="Local paths must be within the tmp directory")
        if not os.path.exists(absolute_source):
            raise HTTPException(status_code=404, detail=f"Input audio not found: {absolute_source}")
        input_source = absolute_source

    part_path = f"{resolved_local_path}.part.wav"
    try:
        if os.path.exists(part_path):
            os.remove(part_path)
    except OSError:
        pass

    cmd = ["ffmpeg", "-nostdin"]
    if input_source.startswith("http://") or input_source.startswith("https://"):
        cmd.extend(["-user_agent", "Mozilla/5.0", "-timeout", "30000000"])
    cmd.extend([
        "-i",
        input_source,
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(sample_rate or MULTICAM_SYNC_SAMPLE_RATE),
        "-acodec",
        "pcm_s16le",
        "-y",
        part_path,
    ])

    try:
        await run_subprocess_async(
            cmd,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        os.replace(part_path, resolved_local_path)
        if not os.path.exists(resolved_local_path) or os.path.getsize(resolved_local_path) < 1024:
            raise ValueError("audio materialization produced an empty or tiny file")
        if not has_audio_stream(resolved_local_path):
            raise ValueError("audio materialization produced a file without an audio stream")
        duration = get_media_duration(resolved_local_path)
        if duration <= 0.0:
            raise ValueError("audio materialization produced a zero-duration file")
        logger.info(
            "Materialized sync audio %.1fs (%.1fMB): %s",
            duration,
            os.path.getsize(resolved_local_path) / 1024 / 1024,
            resolved_local_path,
        )
        return resolved_local_path
    except Exception as audio_error:
        try:
            if os.path.exists(part_path):
                os.remove(part_path)
        except OSError:
            pass
        raise HTTPException(status_code=422, detail=f"Could not materialize audio for sync: {audio_error}")


async def materialize_cached_audio_input(source_url, local_path, cache_key=None, sample_rate=None):
    source = str(source_url or "").strip()
    if not source:
        raise HTTPException(status_code=400, detail="source_url is required")

    cache_key_text = str(cache_key or source)
    cache_mode_key = f"{cache_key_text}:sync-audio:{sample_rate or MULTICAM_SYNC_SAMPLE_RATE}"
    cache_path = os.path.join(
        get_local_media_cache_dir(),
        f"{build_media_cache_key(source, cache_mode_key)}.wav",
    )

    if not IS_PRODUCTION_ENV and os.path.exists(cache_path) and os.path.getsize(cache_path) > 1024:
        if has_audio_stream(cache_path):
            logger.info(f"Using cached local sync audio: {cache_path}")
            return link_or_copy_cached_media(cache_path, local_path if local_path.endswith(".wav") else f"{local_path}.wav")
        try:
            os.remove(cache_path)
        except OSError:
            pass

    resolved_local_path = await materialize_audio_input(source, local_path, sample_rate=sample_rate)

    if not IS_PRODUCTION_ENV and os.path.exists(resolved_local_path) and os.path.getsize(resolved_local_path) > 1024:
        try:
            shutil.copy2(resolved_local_path, cache_path)
            logger.info(f"Cached local sync audio for repeat dev tests: {cache_path}")
        except Exception as cache_error:
            logger.warning(f"Could not cache local sync audio input: {cache_error}")

    return resolved_local_path


def get_cfr_cache_dir():
    """Persistent cache directory for normalized CFR sources — survives across renders."""
    cache_dir = os.path.join(
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp/cfr-cache"))
    )
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir


def cfr_cache_key(source_url):
    """Stable cache key from source URL."""
    return hashlib.sha256(str(source_url or "").strip().encode("utf-8")).hexdigest()[:32]


def cfr_cache_path_for(source_url, keep_audio=False):
    """Full path to the CFR cache file for a given source URL (may not exist yet)."""
    suffix = "_av" if keep_audio else ""
    return os.path.join(get_cfr_cache_dir(), f"{cfr_cache_key(source_url)}{suffix}.mp4")


def get_multicam_audio_analysis_cache_dir():
    """Persistent lightweight audio cache used by Cam Combiner active-speaker scoring."""
    cache_dir = os.getenv(
        "MULTICAM_AUDIO_ANALYSIS_CACHE_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp/multicam-audio-analysis-cache")),
    )
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir


def multicam_audio_analysis_cache_path_for(source_url):
    return os.path.join(get_multicam_audio_analysis_cache_dir(), f"{cfr_cache_key(source_url)}.wav")


async def materialize_multicam_audio_analysis_cache(source_url):
    """
    Keep active-speaker scoring independent from the video CFR cache.
    CFR render files can be video-only for speed; this mono WAV cache gives the
    auto-director real camera audio without decoding the full camera file again.
    """
    source = str(source_url or "").strip()
    cache_path = multicam_audio_analysis_cache_path_for(source)
    part_path = cache_path + ".tmp.wav"

    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 1024 and has_audio_stream(cache_path):
        return cache_path

    if os.path.exists(part_path):
        try:
            os.remove(part_path)
        except OSError:
            pass

    cmd = ["ffmpeg", "-y", "-nostdin"]
    if source.startswith("http://") or source.startswith("https://"):
        cmd.extend(["-user_agent", "Mozilla/5.0", "-timeout", "30000000"])
    cmd.extend([
        "-i",
        source,
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(MULTICAM_SYNC_SAMPLE_RATE),
        "-acodec",
        "pcm_s16le",
        part_path,
    ])
    await run_subprocess_async(cmd, check=True)
    os.replace(part_path, cache_path)
    logger.info(
        "Multicam audio analysis cache ready (%.1fMB): %s",
        os.path.getsize(cache_path) / 1024 / 1024,
        cache_path,
    )
    return cache_path


async def materialize_to_cfr_cache(source_url, keep_audio=False):
    """
    Download + CFR-transcode the source directly into the persistent CFR cache.
    Uses atomic .tmp.mp4 → .mp4 rename so interrupted transcodes are safely discarded.
    Returns the path to the cached CFR file.
    """
    source = str(source_url or "").strip()
    cache_path = cfr_cache_path_for(source, keep_audio=keep_audio)
    part_path = cache_path + ".tmp.mp4"  # keep .mp4 extension so ffmpeg detects format

    # Already cached?
    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 1024:
        try:
            if get_media_duration(cache_path) > 0.1 and (not keep_audio or has_audio_stream(cache_path)):
                return cache_path
        except Exception:
            pass

    # Clean up any stale partial from a previous crash
    if os.path.exists(part_path):
        try:
            os.remove(part_path)
        except OSError:
            pass

    logger.info(f"CFR cache miss — transcoding: {source[:120]}...")

    # Transcode directly to the cache .part file
    await materialize_video_input(source, part_path, keep_audio=keep_audio)

    # Atomically promote on success
    os.rename(part_path, cache_path)
    logger.info(f"CFR cache stored ({os.path.getsize(cache_path) / 1024 / 1024:.1f}MB): {cache_path}")
    return cache_path


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
    normalized = cleaned.lower()

    editorial_hooks = [
        (("fail", "scared"), "WHY ARE WE SO SCARED TO FAIL?"),
        (("failing", "scared"), "WHY ARE WE SO SCARED TO FAIL?"),
        (("stopped today", "soulmate"), "WHAT WOULD YOU REGRET MOST?"),
        (("stopped today", "married"), "WHAT WOULD YOU REGRET MOST?"),
        (("happiness", "home"), "WHERE HAPPINESS FEELS LIKE HOME"),
        (("feel at home", "belong"), "WHERE HAPPINESS FEELS LIKE HOME"),
        (("open up", "pain"), "THE PAIN THEY NEVER SAY OUT LOUD"),
        (("pain", "past"), "THE PAIN THEY NEVER SAY OUT LOUD"),
        (("journey", "grown"), "YOU GREW INTO THE LEADER"),
        (("choir master", "conductor"), "YOU GREW INTO THE LEADER"),
        (("be remembered", "kind"), "BE REMEMBERED FOR KINDNESS"),
        (("wrong things", "human"), "BE REMEMBERED FOR KINDNESS"),
        (("youth", "bad energy"), "BAD ENERGY IS COSTING US"),
    ]
    for markers, hook_text in editorial_hooks:
        if all(marker in normalized for marker in markers):
            return hook_text

    cleaned = re.sub(r"^[,.;:!?\\-\\s]+", "", cleaned)
    filler_pattern = r"^(so|yeah|okay|ok|uh|um|like|you know|i mean|there|o)\b[,.\s-]*"
    for _ in range(3):
        cleaned = re.sub(filler_pattern, "", cleaned, flags=re.IGNORECASE).strip()
    words = cleaned.split()
    if len(words) >= 5 and words[0].lower() in {"why", "how", "what", "when"}:
        hook = " ".join(words[:8]).strip(" ,.;:")
    elif "?" in cleaned[:90]:
        question = cleaned[:90].split("?", 1)[0]
        hook = question.strip(" ,.;:") + "?"
    elif any(word.lower().strip(".,!?") in {"never", "always", "truth", "secret", "mistake"} for word in words[:18]):
        hook = " ".join(words[:8]).strip(" ,.;:")
    else:
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


def build_find_viral_studio_package(candidate, index=0):
    text_blob = " ".join(
        str(value or "")
        for value in [
            candidate.get("hookText"),
            candidate.get("captionSuggestion"),
            candidate.get("text"),
            candidate.get("reason"),
            candidate.get("strategyLabel"),
        ]
    ).lower()
    strategy_label = str(candidate.get("strategyLabel") or "").strip().lower()
    hook_text = build_short_hook_from_text(
        candidate.get("hookText") or candidate.get("captionSuggestion") or candidate.get("text"),
        "THIS MOMENT HITS DIFFERENT",
    )

    if any(marker in text_blob for marker in ["pain", "soulmate", "married", "kids", "regret", "scared", "fail"]):
        treatment = {
            "name": "emotional_confession",
            "label": "Emotional Confession",
            "caption_style": "karaoke",
            "hook_template": "freeze_text",
            "hook_text_animation": "fade_in",
            "hook_intro_seconds": 3.8,
            "hook_zoom_scale": 1.06,
            "headlineTone": "deep, human, curiosity-led",
        }
    elif any(marker in text_blob for marker in ["why", "how", "lesson", "mistake", "learn", "truth"]):
        treatment = {
            "name": "lesson_hook",
            "label": "Lesson Hook",
            "caption_style": "bold_pop",
            "hook_template": "blur_reveal",
            "hook_text_animation": "slide_up",
            "hook_intro_seconds": 3.4,
            "hook_zoom_scale": 1.08,
            "headlineTone": "clear, useful, high-retention",
        }
    elif any(marker in text_blob for marker in ["crazy", "energy", "fun", "win", "hype"]) or "hero" in strategy_label:
        treatment = {
            "name": "hype_reveal",
            "label": "Hype Reveal",
            "caption_style": "bounce",
            "hook_template": "zoom_focus",
            "hook_text_animation": "slide_up",
            "hook_intro_seconds": 3.2,
            "hook_zoom_scale": 1.1,
            "headlineTone": "bold, punchy, scroll-stopping",
        }
    else:
        treatment = {
            "name": "premium_story",
            "label": "Premium Story Hook",
            "caption_style": "bold_pop",
            "hook_template": "blur_reveal",
            "hook_text_animation": "slide_up",
            "hook_intro_seconds": 3.4,
            "hook_zoom_scale": 1.08,
            "headlineTone": "clean, confident, creator-polished",
        }

    return {
        "hookText": hook_text,
        "titleSuggestion": hook_text.title(),
        "captionSuggestion": hook_text.title(),
        "hookTreatment": treatment,
        "renderDefaults": {
            "template": "podcast" if str(candidate.get("contentType") or "general") == "general" else "story",
            "add_hook": True,
            "hook_text": hook_text,
            "hook_template": treatment["hook_template"],
            "hook_intro_seconds": treatment["hook_intro_seconds"],
            "hook_text_animation": treatment["hook_text_animation"],
            "hook_zoom_scale": treatment["hook_zoom_scale"],
            "hook_blur_background": True,
            "hook_dark_overlay": True,
            "caption_style": treatment["caption_style"],
            "auto_captions": True,
            "smart_crop": True,
            "smart_crop_mode": "speaker_track",
            "brand_watermark": True,
            "watermark_text": "AUTOPROMOTE",
        },
        "creativeWhy": (
            "Packaged from Find Viral Clips with Viral Clip Studio hook treatment "
            f"#{index + 1}: {treatment['label']}."
        ),
    }


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

    hook_lines = [line.strip() for line in wrapped.split("\n") if line.strip()]
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
        # Premium hook card: the hook sells the moment without extra explainer copy.
        filters.append(
            f"drawbox=x=iw*0.06:y=ih*0.27:w=iw*0.88:h=ih*0.38:color=black@0.42:t=fill:enable='between(t,{hook_start:.2f},{outro_end:.2f})'"
        )
        filters.append(
            f"drawbox=x=iw*0.075:y=ih*0.18:w=iw*0.405:h=ih*0.045:color=0xFF0018@0.94:t=fill:enable='between(t,{hook_start:.2f},{hook_end:.2f})'"
        )
        filters.append(
            f"drawbox=x=iw*0.56:y=ih*0.18:w=iw*0.37:h=ih*0.045:color=black@0.82:t=fill:enable='between(t,{hook_start:.2f},{hook_end:.2f})'"
        )
        filters.append(
            f"drawbox=x=iw*0.14:y=ih*0.245:w=iw*0.72:h=ih*0.006:color=0xFFE45C@0.96:t=fill:enable='between(t,{hook_start:.2f},{hook_end:.2f})'"
        )
        filters.append(
            f"drawtext=text='AUTOPROMOTE':font='DejaVu Sans':fontcolor=white:alpha={fade_expr}:fontsize=h*0.024:x=iw*0.095:y=ih*0.189:borderw=2:bordercolor=black@0.88:enable='between(t,{hook_start:.2f},{outro_end:.2f})'"
        )
        filters.append(
            f"drawtext=text='FIND VIRAL CLIPS':font='DejaVu Sans':fontcolor=white:alpha={fade_expr}:fontsize=h*0.019:x=iw*0.585:y=ih*0.194:borderw=2:bordercolor=black@0.88:enable='between(t,{hook_start:.2f},{outro_end:.2f})'"
        )

    line_gap = 0.086
    block_top = 0.34 if len(hook_lines) >= 3 else 0.385
    for index, line in enumerate(hook_lines):
        safe_line = escape_drawtext_text(line)
        line_color = "0xFFE45C" if index == 1 or (len(hook_lines) == 1 and len(line) <= 14) else "white"
        line_font_size = "h*0.058" if len(line) <= 16 else "h*0.050"
        base_y = f"h*{block_top + (index * line_gap):.3f}"
        if normalized_animation == "fade_in":
            text_y = base_y
        else:
            text_y = f"{base_y}+((1-{intro_text_expr})*34)"
        filters.append(
            f"drawtext=text='{safe_line}':font='DejaVu Sans':fontcolor={line_color}:alpha={fade_expr}*{intro_text_expr}:fontsize={line_font_size}:x=(w-text_w)/2:y={text_y}:borderw=5:bordercolor=black@0.94:shadowx=3:shadowy=3:enable='between(t,{hook_start:.2f},{outro_end:.2f})'"
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


def even_dimension(value, minimum=2):
    safe_value = max(int(minimum), int(round(float(value or minimum))))
    return safe_value if safe_value % 2 == 0 else safe_value - 1


def promo_feature_card_size(max_width, max_height, src_width=None, src_height=None, fallback_aspect=16 / 9):
    source_aspect = float(fallback_aspect or (16 / 9))
    if float(src_width or 0) > 0 and float(src_height or 0) > 0:
        source_aspect = clamp_float(float(src_width) / max(1.0, float(src_height)), 0.35, 2.4)
    card_width = min(int(max_width), int(int(max_height) * source_aspect))
    card_height = int(card_width / source_aspect)
    if card_height > int(max_height):
        card_height = int(max_height)
        card_width = int(card_height * source_aspect)
    return even_dimension(card_width), even_dimension(card_height)


def build_promo_rounded_card_filter(input_label, card_width, card_height, card_label, radius=54):
    return ";".join([
        f"[{input_label}]scale={card_width}:{card_height}:force_original_aspect_ratio=increase,"
        f"crop={card_width}:{card_height},setsar=1[{card_label}src]",
        multicam_rounded_card_filter(card_label + "src", card_width, card_height, card_label, radius=radius),
    ])


def build_promo_video_filter(target_aspect="9:16", mode="promo_fit", src_width=None, src_height=None):
    normalized_aspect = str(target_aspect or "9:16").strip()
    normalized_mode = str(mode or "promo_fit").strip()

    if normalized_aspect == "9:16":
        if normalized_mode == "crop":
            return "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"
        card_width, card_height = promo_feature_card_size(1000, 1760, src_width, src_height)
        return (
            "split=2[bg][fg];"
            "[bg]scale=1080:1920:force_original_aspect_ratio=increase,"
            "crop=1080:1920,gblur=sigma=22:steps=1,"
            "eq=brightness=-0.09:contrast=1.05:saturation=1.14[bg];"
            f"{build_promo_rounded_card_filter('fg', card_width, card_height, 'promo_card', radius=54)};"
            "[bg][promo_card]overlay=(W-w)/2:(H-h)/2,setsar=1"
        )

    if normalized_aspect == "1:1":
        card_width, card_height = promo_feature_card_size(1010, 1010, src_width, src_height)
        return (
            "split=2[bg][fg];"
            "[bg]scale=1080:1080:force_original_aspect_ratio=increase,"
            "crop=1080:1080,gblur=sigma=18:steps=1,"
            "eq=brightness=-0.08:contrast=1.04:saturation=1.10[bg];"
            f"{build_promo_rounded_card_filter('fg', card_width, card_height, 'promo_card', radius=52)};"
            "[bg][promo_card]overlay=(W-w)/2:(H-h)/2,setsar=1"
        )

    card_width, card_height = promo_feature_card_size(1786, 984, src_width, src_height)
    return (
        "split=2[bg][fg];"
        "[bg]scale=1920:1080:force_original_aspect_ratio=increase,"
        "crop=1920:1080,gblur=sigma=16:steps=1,"
        "eq=brightness=-0.08:contrast=1.04:saturation=1.08[bg];"
        f"{build_promo_rounded_card_filter('fg', card_width, card_height, 'promo_card', radius=58)};"
        "[bg][promo_card]overlay=(W-w)/2:(H-h)/2,setsar=1"
    )



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


def multicam_caption_split_rects(video_width, video_height):
    is_vertical = int(video_height or 0) > int(video_width or 0)
    if is_vertical:
        side_margin = max(24, int(video_width * 0.024))
        top_margin = max(72, int(video_height * 0.038))
        card_gap = max(22, int(video_width * 0.02))
        card_width = max(2, int((video_width - (side_margin * 2) - card_gap) / 2))
        card_height = max(2, video_height - (top_margin * 2))
        return [
            {"x": side_margin, "y": top_margin, "w": card_width, "h": card_height},
            {"x": side_margin + card_width + card_gap, "y": top_margin, "w": card_width, "h": card_height},
        ]
    if video_width > video_height:
        side_margin = max(16, int(video_width * 0.009))
        card_gap = max(10, int(video_width * 0.005))
        card_width = max(2, int((video_width - (side_margin * 2) - card_gap) / 2))
        card_height = max(2, int(card_width * 9 / 16))
        top_margin = max(42, int((video_height - card_height) / 2))
        return [
            {"x": side_margin, "y": top_margin, "w": card_width, "h": card_height},
            {"x": side_margin + card_width + card_gap, "y": top_margin, "w": card_width, "h": card_height},
        ]
    side_margin = max(44, int(video_width * 0.025))
    gap = max(24, int(video_width * 0.014))
    card_width = max(2, int((video_width - (side_margin * 2) - gap) / 2))
    card_height = min(max(2, video_height - 96), max(2, int(card_width * 0.84)))
    top_margin = max(42, int((video_height - card_height) / 2))
    return [
        {"x": side_margin, "y": top_margin, "w": card_width, "h": card_height},
        {"x": side_margin + card_width + gap, "y": top_margin, "w": card_width, "h": card_height},
    ]


def multicam_caption_grid_rects(video_width, video_height, source_count=2):
    is_vertical = int(video_height or 0) > int(video_width or 0)
    if is_vertical:
        card_width = video_width - 64
        card_height = int(card_width * 9 / 16)
        top_x = 32
        card_gap = 70
        top_y = int((video_height - (card_height * 2) - card_gap) / 2)
        return [
            {"x": top_x, "y": top_y, "w": card_width, "h": card_height},
            {"x": top_x, "y": top_y + card_height + card_gap, "w": card_width, "h": card_height},
        ]
    gap = max(30, int(video_height * 0.032))
    side_margin = max(74, int(video_width * 0.045))
    top_margin = max(46, int(video_height * 0.052))
    card_width = max(2, video_width - (side_margin * 2))
    card_height = max(2, int((video_height - (top_margin * 2) - gap) / 2))
    return [
        {"x": side_margin, "y": top_margin, "w": card_width, "h": card_height},
        {"x": side_margin, "y": top_margin + card_height + gap, "w": card_width, "h": card_height},
    ]


def build_multicam_caption_layout_context(segments, video_width=1920, video_height=1080):
    context = []
    for segment in segments or []:
        mode = normalize_multicam_layout_mode(segment.get("layout_mode"))
        camera_id = segment.get("camera_id")
        secondary_id = segment.get("secondary_camera_id")
        card_map = {}
        if mode == "split-vertical" and secondary_id:
            left, right = multicam_caption_split_rects(int(video_width), int(video_height))
            card_map[camera_id] = left
            card_map[secondary_id] = right
        elif mode == "scene-grid" and secondary_id:
            top, bottom = multicam_caption_grid_rects(int(video_width), int(video_height), 2)
            card_map[camera_id] = top
            card_map[secondary_id] = bottom
        context.append({
            "start": float(segment.get("timeline_start", 0.0) or 0.0),
            "end": float(segment.get("timeline_end", 0.0) or 0.0),
            "layout_mode": mode,
            "primary_camera_id": camera_id,
            "secondary_camera_id": secondary_id,
            "card_map": card_map,
            "fallback_speaker": segment.get("raw_audio_leader_camera_id")
            or segment.get("audio_leader_camera_id")
            or camera_id,
        })
    return context


def find_multicam_caption_segment(layout_context, seconds):
    for item in layout_context or []:
        if float(item.get("start", 0.0)) <= seconds < float(item.get("end", 0.0)) + 0.05:
            return item
    return None


def extract_caption_channel_samples(audio_path, sample_rate=8000):
    cmd = [
        "ffmpeg",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        audio_path,
        "-vn",
        "-ac",
        "2",
        "-ar",
        str(sample_rate),
        "-f",
        "s16le",
        "-",
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode != 0 or not result.stdout:
        raise RuntimeError((result.stderr or b"").decode("utf-8", errors="ignore")[-500:] or "caption channel decode failed")
    samples = np.frombuffer(result.stdout, dtype=np.int16)
    usable = samples.size - (samples.size % 2)
    if usable <= 0:
        raise RuntimeError("caption channel decode returned no stereo samples")
    return samples[:usable].reshape((-1, 2)).astype(np.float32) / 32768.0, sample_rate


def build_multicam_channel_activity_windows(samples, sample_rate, segment_duration=0.5):
    if samples is None or getattr(samples, "size", 0) == 0:
        return []
    safe_segment = max(0.25, float(segment_duration or 0.5))
    chunk_size = max(1, int(int(sample_rate or 8000) * safe_segment))
    channel_count = int(samples.shape[1]) if len(samples.shape) > 1 else 1
    raw_by_channel = [[] for _ in range(channel_count)]
    for index, start in enumerate(range(0, samples.shape[0], chunk_size)):
        chunk = samples[start : start + chunk_size]
        if chunk.size == 0:
            continue
        for channel_index in range(channel_count):
            channel = chunk[:, channel_index] if channel_count > 1 else chunk
            rms = float(np.sqrt(np.mean(np.square(channel)))) if channel.size else 0.0
            db = -80.0 if rms <= 1e-6 else float(20.0 * np.log10(rms))
            raw_by_channel[channel_index].append((round(index * safe_segment, 3), db))
    return [normalize_audio_energy_windows(channel_windows) for channel_windows in raw_by_channel]


def multicam_activity_series(audio_windows, duration, segment_duration=0.5):
    safe_duration = max(0.0, float(duration or 0.0))
    safe_segment = max(0.25, float(segment_duration or 0.5))
    if safe_duration <= 0.0 or not audio_windows:
        return np.array([], dtype=np.float32)
    count = max(1, int(np.ceil(safe_duration / safe_segment)))
    return np.array(
        [
            get_audio_activity_score_near_source_time(
                audio_windows,
                index * safe_segment,
                window_seconds=safe_segment,
            )
            for index in range(count)
        ],
        dtype=np.float32,
    )


def multicam_series_similarity(a, b):
    if a is None or b is None:
        return {"score": -1.0, "correlation": 0.0, "mae": 1.0}
    count = min(int(getattr(a, "size", 0)), int(getattr(b, "size", 0)))
    if count < 6:
        return {"score": -1.0, "correlation": 0.0, "mae": 1.0}
    aa = np.asarray(a[:count], dtype=np.float32)
    bb = np.asarray(b[:count], dtype=np.float32)
    if float(np.std(aa)) < 1e-6 or float(np.std(bb)) < 1e-6:
        corr = 0.0
    else:
        corr = float(np.corrcoef(aa, bb)[0, 1])
        if not np.isfinite(corr):
            corr = 0.0
    mae = float(np.mean(np.abs(aa - bb)))
    active_overlap = float(np.mean(np.minimum(aa, bb)))
    score = corr + (0.20 * active_overlap) - (0.12 * mae)
    return {
        "score": round(float(score), 5),
        "correlation": round(float(corr), 5),
        "mae": round(float(mae), 5),
        "active_overlap": round(active_overlap, 5),
    }


def extract_multicam_source_activity_for_mapping(source, overlap_start, duration, segment_duration, job_id=None):
    try:
        source_start = get_source_start_for_timeline(source, overlap_start, 0.0)
        probe_duration = max(1.0, min(float(duration or 0.0), float(source.get("duration") or 0.0) - max(0.0, source_start)))
        if probe_duration <= 1.0:
            return []
        cmd = [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{max(0.0, source_start):.6f}",
            "-t",
            f"{probe_duration:.6f}",
            "-i",
            source["path"],
            "-vn",
            "-ac",
            "1",
            "-ar",
            "8000",
            "-f",
            "s16le",
            "-",
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, timeout=120)
        if result.returncode != 0 or not result.stdout:
            return []
        raw = np.frombuffer(result.stdout, dtype=np.int16)
        if raw.size <= 0:
            return []
        samples = raw.astype(np.float32).reshape((-1, 1)) / 32768.0
        return build_multicam_channel_activity_windows(samples, 8000, segment_duration=segment_duration)[0]
    except Exception as exc:
        logger.debug("Director channel auto-map source analysis failed for %s/%s: %s", job_id or "multicam", source.get("id"), exc)
        return []


def auto_map_multicam_director_channels(prepared_sources, channel_windows, overlap_start, overlap_duration, segment_duration, job_id=None):
    source_candidates = [source for source in prepared_sources or [] if source.get("id")]
    channel_count = min(len(channel_windows or []), len(source_candidates))
    if channel_count < 2:
        return None
    analysis_duration = max(
        20.0,
        min(
            float(overlap_duration or 0.0),
            float(os.getenv("MULTICAM_DIRECTOR_CHANNEL_AUTOMAP_SECONDS", "180") or 180),
        ),
    )
    channel_series = [
        multicam_activity_series(channel_windows[index], analysis_duration, segment_duration=segment_duration)
        for index in range(channel_count)
    ]
    source_series = []
    pair_scores = {}
    for source in source_candidates[:channel_count]:
        windows = extract_multicam_source_activity_for_mapping(
            source,
            overlap_start,
            analysis_duration,
            segment_duration,
            job_id=job_id,
        )
        series = multicam_activity_series(windows, analysis_duration, segment_duration=segment_duration)
        source_series.append((source.get("id"), series))
    if len(source_series) < channel_count:
        return None
    for source_id, series in source_series:
        pair_scores[source_id] = {}
        for channel_index, channel_values in enumerate(channel_series):
            pair_scores[source_id][channel_index] = multicam_series_similarity(series, channel_values)
    best = None
    for permutation in itertools.permutations(range(channel_count), channel_count):
        score = 0.0
        pair_details = []
        for source_index, channel_index in enumerate(permutation):
            source_id = source_series[source_index][0]
            detail = pair_scores.get(source_id, {}).get(channel_index, {"score": -1.0})
            score += float(detail.get("score", -1.0))
            pair_details.append({"camera_id": source_id, "channel_index": channel_index, **detail})
        candidate = {"score": round(score, 5), "channel_for_source": permutation, "pairs": pair_details}
        if best is None or candidate["score"] > best["score"]:
            best = candidate
    if not best:
        return None
    ordered_pairs = sorted(best["pairs"], key=lambda item: int(item.get("channel_index", 0)))
    mapped_camera_ids = [item.get("camera_id") for item in ordered_pairs if item.get("camera_id")]
    default_camera_ids = [source.get("id") for source in source_candidates[:channel_count]]
    best["mapped_camera_ids"] = mapped_camera_ids
    best["default_camera_ids"] = default_camera_ids
    best["method"] = "auto_correlate_external_channels_to_camera_scratch_audio"
    return best


def apply_external_director_channel_activity(
    prepared_sources,
    external_audio_path,
    overlap_start,
    overlap_duration,
    external_audio_offset_seconds=0.0,
    segment_duration=0.5,
    job_id=None,
):
    if len(prepared_sources or []) < 2 or not external_audio_path or not os.path.exists(external_audio_path):
        return {"status": "skipped", "reason": "missing_external_audio_or_sources"}

    channel_camera_ids = (os.getenv("MULTICAM_DIRECTOR_CHANNEL_CAMERA_MAP") or "").strip()
    mapping_method = "env_override" if channel_camera_ids else "source_order"
    auto_mapping_receipt = None
    if channel_camera_ids:
        mapped_camera_ids = [item.strip() for item in channel_camera_ids.split(",") if item.strip()]
    else:
        mapped_camera_ids = [source.get("id") for source in prepared_sources if source.get("id")]
    mapped_camera_ids = mapped_camera_ids[:2]
    if len(mapped_camera_ids) < 2:
        return {"status": "skipped", "reason": "not_enough_channel_camera_ids"}

    external_anchor = max(0.0, float(overlap_start or 0.0) - float(external_audio_offset_seconds or 0.0))
    try:
        cmd = [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{external_anchor:.6f}",
            "-t",
            f"{max(0.25, float(overlap_duration or 0.0) + 1.0):.6f}",
            "-i",
            external_audio_path,
            "-vn",
            "-ac",
            "2",
            "-ar",
            "8000",
            "-f",
            "s16le",
            "-",
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, timeout=120)
        if result.returncode != 0 or not result.stdout:
            error_text = (result.stderr or b"").decode("utf-8", errors="ignore")[-500:]
            return {"status": "skipped_decode_failed", "error": error_text}
        raw = np.frombuffer(result.stdout, dtype=np.int16)
        usable = raw.size - (raw.size % 2)
        if usable <= 0:
            return {"status": "skipped_decode_empty"}
        samples = raw[:usable].reshape((-1, 2)).astype(np.float32) / 32768.0
        channel_windows = build_multicam_channel_activity_windows(samples, 8000, segment_duration=segment_duration)
        # Behringer isolated channels are already ordered by speaker/camera in the upload.
        # Scratch-audio automap can falsely flip channels when a room mic bleeds across cams,
        # which puts the real active speaker into the reaction PiP. Keep automap opt-in only.
        if not channel_camera_ids and os.getenv("MULTICAM_DIRECTOR_CHANNEL_AUTOMAP", "0").strip().lower() not in {"0", "false", "no", "off"}:
            auto_mapping_receipt = auto_map_multicam_director_channels(
                prepared_sources,
                channel_windows,
                overlap_start,
                overlap_duration,
                segment_duration,
                job_id=job_id,
            )
            if auto_mapping_receipt and len(auto_mapping_receipt.get("mapped_camera_ids") or []) >= 2:
                mapped_camera_ids = list(auto_mapping_receipt["mapped_camera_ids"])[:2]
                mapping_method = auto_mapping_receipt.get("method") or "auto"
    except Exception as exc:
        logger.warning("External director channel analysis skipped for %s: %s", job_id or "multicam", exc)
        return {"status": "skipped_exception", "error": str(exc)}

    assigned = 0
    for channel_index, camera_id in enumerate(mapped_camera_ids):
        source = next((item for item in prepared_sources if item.get("id") == camera_id), None)
        if not source or channel_index >= len(channel_windows):
            continue
        source["timeline_audio_activity_windows"] = channel_windows[channel_index]
        source["audio_activity_source"] = "external_isolated_channel"
        source["audio_activity_channel_index"] = channel_index
        assigned += 1

    return {
        "status": "active" if assigned >= 2 else "partial",
        "method": "external_stereo_channel_rms",
        "mapping_method": mapping_method,
        "channel_camera_ids": mapped_camera_ids,
        "auto_mapping": auto_mapping_receipt,
        "assigned_source_count": assigned,
        "external_anchor_seconds": round(external_anchor, 3),
        "segment_duration_seconds": round(max(0.25, float(segment_duration or 0.5)), 3),
    }


def build_caption_word_speaker_assignments(audio_path, whisper_result, segments, job_id=None):
    camera_ids = []
    for segment in segments or []:
        for camera_id in (segment.get("camera_id"), segment.get("secondary_camera_id")):
            if camera_id and camera_id not in camera_ids:
                camera_ids.append(camera_id)
    if len(camera_ids) < 2:
        return {"status": "skipped_single_camera", "camera_ids": camera_ids}
    channel_camera_ids = (os.getenv("MULTICAM_CAPTION_CHANNEL_CAMERA_MAP") or "").strip()
    if channel_camera_ids:
        mapped = [item.strip() for item in channel_camera_ids.split(",") if item.strip()]
        if len(mapped) >= 2:
            camera_ids = mapped[:2]
    else:
        for segment in segments or []:
            mapped = [
                item
                for item in (segment.get("director_channel_camera_ids") or [])
                if item
            ]
            if len(mapped) >= 2:
                camera_ids = mapped[:2]
                break

    try:
        samples, sample_rate = extract_caption_channel_samples(audio_path, sample_rate=8000)
    except Exception as exc:
        logger.warning("Per-speaker caption channel analysis skipped for %s: %s", job_id or "multicam", exc)
        return {"status": "skipped_channel_analysis_failed", "error": str(exc), "camera_ids": camera_ids[:2]}

    assigned = 0
    ambiguous = 0
    for segment in (whisper_result or {}).get("segments", []) or []:
        for word in segment.get("words", []) or []:
            start = max(0.0, float(word.get("start", segment.get("start", 0.0)) or 0.0) - 0.035)
            end = max(start + 0.08, float(word.get("end", start + 0.18) or start + 0.18) + 0.035)
            lo = max(0, int(start * sample_rate))
            hi = min(samples.shape[0], max(lo + 1, int(end * sample_rate)))
            window = samples[lo:hi]
            if window.size <= 0:
                continue
            rms = np.sqrt(np.mean(window ** 2, axis=0))
            ch0 = float(rms[0])
            ch1 = float(rms[1])
            loud = max(ch0, ch1, 1e-6)
            quiet = max(min(ch0, ch1), 1e-6)
            ratio = loud / quiet
            if ratio < 1.18:
                ambiguous += 1
                continue
            word["caption_speaker_camera_id"] = camera_ids[0] if ch0 >= ch1 else camera_ids[1]
            word["caption_speaker_confidence"] = round(clamp_float((ratio - 1.0) / 1.25, 0.0, 0.95), 3)
            assigned += 1
    return {
        "status": "active",
        "method": "stereo_channel_rms_per_word",
        "channel_camera_ids": camera_ids[:2],
        "assigned_word_count": assigned,
        "ambiguous_word_count": ambiguous,
        "sample_rate": sample_rate,
    }


def classify_caption_emotion(words, segment_text=""):
    clean_text = str(segment_text or " ".join(str(w.get("word", "")) for w in words)).lower()
    start_times = [float(w.get("start", 0.0) or 0.0) for w in words]
    end_times = [float(w.get("end", 0.0) or 0.0) for w in words]
    duration = max(0.1, (max(end_times) - min(start_times)) if start_times and end_times else 0.1)
    pace = len(words) / duration
    if re.search(r"\b(ha+|haha+|laugh|laughing|lol|lmao)\b", clean_text):
        return "Laugh"
    if "!" in clean_text or pace >= 3.7:
        return "Hype"
    if pace <= 1.65 and len(words) <= 4:
        return "Serious"
    return "Normal"


def caption_ass_position_override(rect, video_width, video_height, emotion="Normal"):
    if not rect:
        return ""
    x = int(rect["x"] + rect["w"] / 2)
    y = int(rect["y"] + rect["h"] - max(44, min(76, rect["h"] * 0.13)))
    fade = "\\fad(80,130)" if emotion == "Serious" else ""
    return f"{{\\pos({x},{y})\\q2\\clip({int(rect['x'])},{int(rect['y'])},{int(rect['x']+rect['w'])},{int(rect['y']+rect['h'])})\\1a&H00&\\pbo0\\fsp0{fade}}}"


def caption_emotion_word_prefix(emotion, index):
    if emotion == "Laugh":
        # Pastel rainbow for playful moments only; normal speech stays clean.
        colors = ["&H00F5E07A&", "&H008EF8D8&", "&H00D9A7FF&", "&H00A6D9FF&", "&H00F6B6F4&"]
        return f"{{\\c{colors[index % len(colors)]}}}"
    if emotion == "Hype":
        return "{\\c&H0042F5F5&}"
    return ""


def generate_multicam_word_highlight_ass(
    whisper_result,
    video_width=1920,
    video_height=1080,
    style_name="podcast_clean",
    layout_context=None,
):
    """
    Clean full-episode captions for multicam podcast renders.
    Captions live low in the safe area so they avoid faces and rounded cards in
    single-cam, PiP, Shared Moment, and Show Everyone layouts.
    """
    is_vertical = int(video_height or 0) > int(video_width or 0)
    font_size = int(clamp_float((video_width if not is_vertical else video_height) * 0.034, 34, 52))
    margin_v = int(clamp_float(video_height * (0.07 if not is_vertical else 0.105), 64, 150))
    max_words = 3 if is_vertical else 4
    primary_color = "&H0042F5F5"  # warm yellow highlight
    secondary_color = "&H00FFFFFF"  # unread words stay white
    outline_color = "&H00111111"
    card_font_size = int(clamp_float(font_size * 0.82, 26, 42))

    ass_lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {int(video_width)}",
        f"PlayResY: {int(video_height)}",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
        "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        (
            f"Style: Default,DejaVu Sans,{font_size},{primary_color},{secondary_color},"
            f"{outline_color},&H98000000,-1,0,0,0,100,100,0,0,1,4,1,2,"
            f"{int(video_width * 0.12)},{int(video_width * 0.12)},{margin_v},1"
        ),
        (
            f"Style: Normal,DejaVu Sans,{card_font_size},&H00FFFFFF,&H00FFFFFF,"
            f"{outline_color},&H98000000,-1,0,0,0,100,100,0,0,1,4,1,2,"
            f"{int(video_width * 0.08)},{int(video_width * 0.08)},{margin_v},1"
        ),
        (
            f"Style: Hype,DejaVu Sans,{int(card_font_size * 1.08)},&H0042F5F5,&H00FFFFFF,"
            f"{outline_color},&H98000000,-1,0,0,0,104,104,0,0,1,5,1,2,"
            f"{int(video_width * 0.08)},{int(video_width * 0.08)},{margin_v},1"
        ),
        (
            f"Style: Laugh,DejaVu Sans,{card_font_size},&H008EF8D8,&H00FFFFFF,"
            f"{outline_color},&H98000000,-1,0,0,0,103,103,0,0,1,4,1,2,"
            f"{int(video_width * 0.08)},{int(video_width * 0.08)},{margin_v},1"
        ),
        (
            f"Style: Serious,DejaVu Sans,{max(24, int(card_font_size * 0.92))},&H00FFFFFF,&H00FFFFFF,"
            f"{outline_color},&H74000000,0,0,0,0,100,100,0,0,1,3,0,2,"
            f"{int(video_width * 0.08)},{int(video_width * 0.08)},{margin_v},1"
        ),
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    hallucinations = {"thank you.", "thanks.", "bye.", "music.", "watching.", "mbc", "lbc", "you", "silence"}
    for segment in (whisper_result or {}).get("segments", []) or []:
        seg_text = str(segment.get("text", "")).strip()
        if not seg_text or seg_text.lower().strip(". ") in hallucinations:
            continue
        if float(segment.get("no_speech_prob", 0.0) or 0.0) > 0.8:
            continue

        words = _chunk_words(segment.get("words", []) or [], max_words=max_words)
        if not words:
            clean = re.sub(r"\[.*?\]|\(.*?\)", "", seg_text).strip()
            if clean:
                start_ass = _seconds_to_ass_time(segment.get("start", 0.0))
                end_ass = _seconds_to_ass_time(segment.get("end", float(segment.get("start", 0.0)) + 2.0))
                ass_lines.append(f"Dialogue: 0,{start_ass},{end_ass},Default,,0,0,0,,{_escape_ass(clean)}")
            continue

        for group in words:
            clean_words = []
            group_start = None
            group_end = None
            for word in group:
                word_text = _escape_ass(str(word.get("word", "")).strip())
                if not word_text:
                    continue
                start = float(word.get("start", segment.get("start", 0.0)) or 0.0)
                end = max(start + 0.05, float(word.get("end", start + 0.25) or start + 0.25))
                group_start = start if group_start is None else min(group_start, start)
                group_end = end if group_end is None else max(group_end, end)
                clean_words.append((word_text, max(1, int(round((end - start) * 100)))))
            if not clean_words or group_start is None or group_end is None:
                continue

            group_midpoint = (group_start + group_end) / 2.0
            layout_segment = find_multicam_caption_segment(layout_context, group_midpoint)
            speaker_votes = {}
            for word in group:
                speaker_id = word.get("caption_speaker_camera_id")
                if speaker_id:
                    speaker_votes[speaker_id] = speaker_votes.get(speaker_id, 0) + 1
            speaker_id = max(speaker_votes, key=speaker_votes.get) if speaker_votes else None
            if not speaker_id and layout_segment:
                speaker_id = layout_segment.get("fallback_speaker")
            card_rect = (layout_segment or {}).get("card_map", {}).get(speaker_id) if layout_segment else None
            emotion = classify_caption_emotion(group, seg_text)
            style = emotion if emotion in {"Hype", "Laugh", "Serious"} else "Normal"
            position_override = caption_ass_position_override(card_rect, video_width, video_height, emotion)
            if not position_override and emotion == "Serious":
                position_override = "{\\fad(100,180)}"
            elif not position_override and emotion == "Laugh":
                position_override = "{\\t(0,160,\\fscx106\\fscy106)\\t(160,320,\\fscx100\\fscy100)}"
            elif not position_override and emotion == "Hype":
                position_override = "{\\t(0,120,\\fscx108\\fscy108)\\t(120,260,\\fscx100\\fscy100)}"

            # ASS karaoke timing highlights words in sequence inside one stable
            # caption line, avoiding the jitter of one subtitle event per word.
            text = " ".join(
                f"{caption_emotion_word_prefix(emotion, idx)}{{\\kf{duration_cs}}}{word_text}"
                for idx, (word_text, duration_cs) in enumerate(clean_words)
            )
            ass_lines.append(
                "Dialogue: 0,{start},{end},{style},,0,0,0,,{override}{text}".format(
                    start=_seconds_to_ass_time(group_start),
                    end=_seconds_to_ass_time(group_end + 0.08),
                    style=style,
                    override=position_override,
                    text=text,
                )
            )
    return "\n".join(ass_lines)


def escape_ffmpeg_filter_path(path):
    return str(path or "").replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


def resolve_multicam_caption_request(request):
    raw = request.burn_captions if request.burn_captions is not None else request.burnCaptions
    allow_disable = env_flag("MULTICAM_ALLOW_CAPTION_DISABLE", default=False)
    enabled = MULTICAM_BURN_CAPTIONS_DEFAULT if raw is None else (bool(raw) or not allow_disable)
    style = str(request.captionStyle or request.caption_style or "podcast_clean").strip() or "podcast_clean"
    return enabled, style


def _escape_drawtext_text(text):
    return str(text or "").replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace("%", "\\%")


def resolve_multicam_branding_request(request):
    raw = request.brand_watermark if request.brand_watermark is not None else request.brandWatermark
    enabled = MULTICAM_BRAND_WATERMARK_DEFAULT if raw is None else bool(raw)
    text = (
        request.watermark_text
        or request.watermarkText
        or os.getenv("MULTICAM_BRAND_WATERMARK_TEXT")
        or "AutoPromote Cam Combiner"
    )
    return enabled, str(text).strip() or "AutoPromote Cam Combiner"


def resolve_multicam_thumbnail_request(request):
    raw = request.generate_thumbnail if request.generate_thumbnail is not None else request.generateThumbnail
    return MULTICAM_GENERATE_THUMBNAIL_DEFAULT if raw is None else bool(raw)


def build_multicam_brand_watermark_filter(output_width, output_height, text="AutoPromote Cam Combiner"):
    width = max(1, int(output_width or 1920))
    height = max(1, int(output_height or 1080))
    font_size = max(22, int(width * 0.0155))
    margin_x = max(28, int(width * 0.022))
    margin_y = max(28, int(height * 0.038))
    safe_text = _escape_drawtext_text(text)
    return (
        "drawtext="
        f"text='{safe_text}':"
        f"x=w-tw-{margin_x}:y={margin_y}:"
        f"fontsize={font_size}:"
        "fontcolor=white@0.88:"
        "box=1:boxcolor=0x05070c@0.38:"
        f"boxborderw={max(12, int(font_size * 0.56))}:"
        "shadowcolor=black@0.55:shadowx=1:shadowy=1"
    )


async def apply_multicam_brand_watermark(output_path, job_id, output_width, output_height, text="AutoPromote Cam Combiner"):
    receipt = {
        "enabled": True,
        "status": "pending",
        "text": text,
        "placement": "top_right",
        "style": "subtle_glass_pill",
    }
    branded_output_path = os.path.join(os.path.dirname(output_path), f"{job_id}_multicam_branded.mp4")
    try:
        await run_subprocess_async(
            [
                "ffmpeg",
                "-nostdin",
                "-i",
                output_path,
                "-vf",
                build_multicam_brand_watermark_filter(output_width, output_height, text),
                *build_multicam_caption_encode_args(),
                "-c:a",
                "copy",
                "-movflags",
                "+faststart",
                "-y",
                branded_output_path,
            ],
            check=True,
            job_context=job_id,
            timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS,
        )
        os.replace(branded_output_path, output_path)
        receipt["status"] = "burned_in"
        receipt["video_encoder"] = "h264_nvenc" if GPU_VIDEO_ENCODER == "h264_nvenc" else "libx264"
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"message": "AutoPromote watermark burn-in failed", "error": str(exc)})
    finally:
        try:
            if os.path.exists(branded_output_path):
                os.remove(branded_output_path)
        except OSError:
            pass
    return receipt


def pick_multicam_thumbnail_time(segments, duration):
    safe_duration = max(0.0, float(duration or 0.0))
    ordered = sorted(segments or [], key=lambda item: float(item.get("timeline_start", 0.0) or 0.0))
    preferred_modes = {"split-vertical", "scene-grid", "pip"}
    for mode in ["split-vertical", "scene-grid", "pip"]:
        for segment in ordered:
            layout_mode = normalize_multicam_layout_mode(segment.get("layout_mode") or "cut")
            start = float(segment.get("timeline_start", 0.0) or 0.0)
            end = float(segment.get("timeline_end", start) or start)
            if layout_mode == mode and end - start >= 4.0 and start >= 15.0:
                return round(min(max(start + (end - start) * 0.5, 0.0), max(0.0, safe_duration - 0.5)), 3)
    return round(min(max(safe_duration * 0.18, 8.0), max(0.0, safe_duration - 0.5)), 3)


async def generate_multicam_thumbnail_asset(output_path, job_id, duration, segments=None):
    thumbnail_time = pick_multicam_thumbnail_time(segments or [], duration)
    thumbnail_path = os.path.join(os.path.dirname(output_path), f"{job_id}_multicam_thumbnail.jpg")
    receipt = {
        "enabled": True,
        "status": "pending",
        "time_seconds": thumbnail_time,
        "type": "branded_multicam_thumbnail",
        "path": thumbnail_path,
    }
    font_file = os.getenv("MULTICAM_THUMBNAIL_FONT_FILE") or "/usr/share/fonts/truetype/noto/NotoSansDisplay-Bold.ttf"
    font_arg = f"fontfile='{escape_ffmpeg_filter_path(font_file)}':" if os.path.exists(font_file) else ""
    raw_title = os.getenv("MULTICAM_THUMBNAIL_TITLE") or "PODCAST|EDITED|ITSELF"
    title_lines = [line.strip() for line in str(raw_title).split("|") if line.strip()][:3]
    while len(title_lines) < 3:
        title_lines.append("")
    title_1, title_2, title_3 = [_escape_drawtext_text(line) for line in title_lines]
    badge_text = _escape_drawtext_text(os.getenv("MULTICAM_THUMBNAIL_BADGE") or "AUTOPROMOTE")
    feature_text = _escape_drawtext_text(os.getenv("MULTICAM_THUMBNAIL_FEATURE") or "AUTO MULTICAM")
    footer_text = _escape_drawtext_text(os.getenv("MULTICAM_THUMBNAIL_FOOTER") or "NO MANUAL CUTS")
    vf = (
        "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,"
        "eq=contrast=1.12:saturation=1.07:brightness=0.015,"
        "unsharp=5:5:0.45:3:3:0.20,"
        "drawbox=x=0:y=0:w=590:h=720:color=black@0.56:t=fill,"
        "drawbox=x=0:y=0:w=1280:h=720:color=0xffd12f@0.95:t=8,"
        f"drawtext={font_arg}text='{badge_text}':x=54:y=40:fontsize=30:fontcolor=white:"
        "box=1:boxcolor=0xff2a26@0.95:boxborderw=10:borderw=2:bordercolor=black@0.65,"
        f"drawtext={font_arg}text='{title_1}':x=50:y=88:fontsize=78:fontcolor=white:"
        "borderw=6:bordercolor=black@0.86,"
        f"drawtext={font_arg}text='{title_2}':x=50:y=172:fontsize=84:fontcolor=0xffd12f:"
        "borderw=6:bordercolor=black@0.86,"
        f"drawtext={font_arg}text='{title_3}':x=50:y=264:fontsize=86:fontcolor=white:"
        "borderw=6:bordercolor=black@0.86,"
        "drawbox=x=54:y=384:w=470:h=74:color=0xff2a26@0.95:t=fill,"
        f"drawtext={font_arg}text='{feature_text}':x=78:y=391:fontsize=48:fontcolor=white:"
        "borderw=3:bordercolor=black@0.70,"
        f"drawtext={font_arg}text='{footer_text}':x=70:y=520:fontsize=42:fontcolor=white:"
        "borderw=4:bordercolor=black@0.82,"
        f"drawtext={font_arg}text='AutoPromote Cam Combiner':x=w-tw-38:y=32:fontsize=24:fontcolor=white@0.92:"
        "box=1:boxcolor=0x05070c@0.62:boxborderw=10:shadowcolor=black@0.55:shadowx=1:shadowy=1"
    )
    try:
        await run_subprocess_async(
            [
                "ffmpeg",
                "-nostdin",
                "-ss",
                str(thumbnail_time),
                "-i",
                output_path,
                "-frames:v",
                "1",
                "-vf",
                vf,
                "-q:v",
                "2",
                "-y",
                thumbnail_path,
            ],
            check=True,
            job_context=job_id,
            timeout_seconds=120,
        )
        if not os.path.exists(thumbnail_path) or os.path.getsize(thumbnail_path) <= 1024:
            raise RuntimeError("Thumbnail file was not created")
        receipt["status"] = "created"
        receipt["path"] = os.path.abspath(thumbnail_path)
    except Exception as exc:
        receipt["status"] = "failed"
        receipt["error"] = str(exc)
    return receipt


async def burn_multicam_word_captions(
    output_path,
    job_id,
    output_width,
    output_height,
    style_name="podcast_clean",
    render_segments=None,
    extra_video_filter=None,
):
    receipt = {
        "enabled": True,
        "status": "pending",
        "style": style_name,
        "output_width": int(output_width),
        "output_height": int(output_height),
    }
    if not has_audio_stream(output_path):
        raise HTTPException(status_code=500, detail={"message": "Captions are mandatory but final render has no audio stream"})
    if whisper is None:
        raise HTTPException(status_code=500, detail={"message": "Captions are mandatory but Whisper is not available"})

    loop = asyncio.get_event_loop()
    try:
        whisper_result = await loop.run_in_executor(
            None,
            lambda: transcribe_with_hints(
                output_path,
                word_timestamps=True,
                prompt_hint="Podcast conversation. Preserve natural spoken wording for burned word-by-word captions.",
                model_name=os.getenv("MULTICAM_CAPTION_WHISPER_MODEL") or None,
            ),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"message": "Mandatory caption transcription failed", "error": str(exc)})

    transcript_segments = (whisper_result or {}).get("segments") or []
    word_count = sum(len(segment.get("words") or []) for segment in transcript_segments)
    if not transcript_segments or word_count <= 0:
        raise HTTPException(
            status_code=500,
            detail={"message": "Mandatory captions could not be created because Whisper returned no word timestamps"},
        )

    speaker_assignment_receipt = build_caption_word_speaker_assignments(
        output_path,
        whisper_result,
        render_segments or [],
        job_id=job_id,
    )
    layout_context = build_multicam_caption_layout_context(
        render_segments or [],
        video_width=output_width,
        video_height=output_height,
    )

    ass_path = os.path.join(os.path.dirname(output_path), f"{job_id}_multicam_captions.ass")
    captioned_output_path = os.path.join(os.path.dirname(output_path), f"{job_id}_multicam_captioned.mp4")
    with open(ass_path, "w", encoding="utf-8") as ass_file:
        ass_file.write(
            generate_multicam_word_highlight_ass(
                whisper_result,
                video_width=output_width,
                video_height=output_height,
                style_name=style_name,
                layout_context=layout_context,
            )
        )

    try:
        await run_subprocess_async(
            [
                "ffmpeg",
                "-nostdin",
                "-i",
                output_path,
                "-vf",
                ",".join(
                    item
                    for item in [
                        f"ass='{escape_ffmpeg_filter_path(ass_path)}'",
                        extra_video_filter,
                    ]
                    if item
                ),
                *build_multicam_caption_encode_args(),
                "-c:a",
                "copy",
                "-movflags",
                "+faststart",
                "-y",
                captioned_output_path,
            ],
            check=True,
            job_context=job_id,
            timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS,
        )
        os.replace(captioned_output_path, output_path)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"message": "Mandatory caption burn-in failed", "error": str(exc)})
    finally:
        for temp_path in [ass_path, captioned_output_path]:
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except OSError:
                pass

    receipt.update({
        "status": "burned_in",
        "segment_count": len(transcript_segments),
        "word_count": word_count,
        "placement": "speaker_card_when_available",
        "video_encoder": "h264_nvenc" if GPU_VIDEO_ENCODER == "h264_nvenc" and os.getenv("MULTICAM_CAPTION_ENCODER", "nvenc").strip().lower() != "x264" else "libx264",
        "speaker_assignment": speaker_assignment_receipt,
        "applies_to_layouts": ["single_cam_pip", "pip_reaction", "shared_moment", "show_everyone"],
        "emotion_styles": ["normal", "hype", "laugh", "serious"],
        "extra_video_filter": bool(extra_video_filter),
    })
    return receipt


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
        "{\"ranking\": [{\"id\": \"candidate_id\", \"score\": 87, \"why\": \"short reason\", \"hook\": \"5-9 word punchy hook\"}]}\n\n"
        "Hook rules: write the hook like a premium YouTube Shorts editor, not a raw transcript quote. "
        "Use curiosity, emotional tension, clear stakes, and natural wording. Avoid filler words, half-sentences, and vague hooks like 'watch this'.\n\n"
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
                    should_prefer_packaged_hook = str(objective_label or "").strip().lower() == "find_viral_clips"
                    if (
                        should_prefer_packaged_hook
                        or not current_caption
                        or current_caption.lower() in generic_caption_suggestions
                    ):
                        updated["captionSuggestion"] = rerank["hook"]
                    if should_prefer_packaged_hook or not str(updated.get("hookText") or "").strip():
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

def _load_face_cascade():
    face_cascade_paths = [
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml",
        cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml",
    ]
    for cascade_path in face_cascade_paths:
        if os.path.exists(cascade_path):
            cascade = cv2.CascadeClassifier(cascade_path)
            if cascade is not None and not cascade.empty():
                return cascade
    return None


def _estimate_safe_zoom_ratio(width, height, face_count=0, lead_size_ratio=0.0, scene_type="lead"):
    width = max(1, int(width or 0))
    height = max(1, int(height or 0))
    pixel_count = float(width * height)
    resolution_factor = max(0.0, min(1.0, pixel_count / float(1920 * 1080)))
    safe_zoom_ratio = 0.94 - (0.14 * resolution_factor)

    if width < 900 or height < 540:
        safe_zoom_ratio = max(safe_zoom_ratio, 0.94)
    elif width < 1280:
        safe_zoom_ratio = max(safe_zoom_ratio, 0.9)

    if face_count >= 4 or scene_type == "group":
        safe_zoom_ratio = max(safe_zoom_ratio, 0.96)
    elif lead_size_ratio < 0.035:
        safe_zoom_ratio = max(safe_zoom_ratio, 0.92)
    elif lead_size_ratio < 0.07:
        safe_zoom_ratio = max(safe_zoom_ratio, 0.88)
    else:
        safe_zoom_ratio = max(safe_zoom_ratio, 0.82)

    return round(max(0.8, min(0.98, safe_zoom_ratio)), 3)


def detect_speaker_positions(video_path, sample_interval=0.5, return_metadata=False):
    """
    Use OpenCV Haar cascade face detection to track speaker positions
    throughout the video. Returns a list of (timestamp, center_x_ratio, center_y_ratio) tuples.
    """
    face_cascade = _load_face_cascade()
    if face_cascade is None:
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
    metadata = []
    sample_times = [t for t in _frange(0, duration, sample_interval)]
    last_focus_x = 0.5
    last_focus_y = 0.5

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
            detections = []
            for fx, fy, fw, fh in faces:
                cx = (fx + fw / 2) / scale / width
                cy = (fy + fh / 2) / scale / height
                face_w_ratio = (fw / scale) / max(width, 1)
                face_h_ratio = (fh / scale) / max(height, 1)
                area_ratio = face_w_ratio * face_h_ratio
                center_weight = 1.0 - min(
                    1.0,
                    np.sqrt(((cx - 0.5) ** 2) + ((cy - 0.5) ** 2)) / 0.75,
                )
                detections.append(
                    {
                        "x": float(cx),
                        "y": float(cy),
                        "areaRatio": float(area_ratio),
                        "centerWeight": float(center_weight),
                        "score": float((area_ratio * 0.74) + (center_weight * 0.26)),
                    }
                )

            detections.sort(key=lambda item: item["score"], reverse=True)
            top_detections = detections[: min(6, len(detections))]
            if len(detections) >= 4:
                total_weight = sum(max(d["areaRatio"], 0.0015) for d in top_detections) or 1.0
                cx = sum(d["x"] * max(d["areaRatio"], 0.0015) for d in top_detections) / total_weight
                cy = sum(d["y"] * max(d["areaRatio"], 0.0015) for d in top_detections) / total_weight
                lead_size_ratio = max(d["areaRatio"] for d in top_detections)
            else:
                best_detection = detections[0]
                cx = best_detection["x"]
                cy = best_detection["y"]
                lead_size_ratio = best_detection["areaRatio"]

            horizontal_spread = 0.0
            vertical_spread = 0.0
            if len(top_detections) >= 2:
                xs = [float(d["x"]) for d in top_detections]
                ys = [float(d["y"]) for d in top_detections]
                horizontal_spread = max(xs) - min(xs)
                vertical_spread = max(ys) - min(ys)

            weighted_lower_bias = sum(
                max(0.0, float(d["y"]) - 0.56) * max(d["areaRatio"], 0.0015)
                for d in top_detections
            )
            weighted_lower_bias /= sum(max(d["areaRatio"], 0.0015) for d in top_detections) or 1.0
            audience_likelihood = 0.0
            if len(detections) >= 4:
                audience_likelihood = (
                    max(0.0, min(1.0, (weighted_lower_bias / 0.2))) * 0.55
                    + max(0.0, min(1.0, (0.04 - float(lead_size_ratio)) / 0.03)) * 0.3
                    + max(0.0, min(1.0, horizontal_spread / 0.45)) * 0.15
                )

            if len(detections) >= 4 and audience_likelihood >= 0.5:
                scene_type = "audience"
            elif len(detections) >= 4:
                scene_type = "group"
            else:
                scene_type = "lead"

            cx = max(0.18, min(0.82, float(cx)))
            cy = max(0.24, min(0.76, float(cy)))
            last_focus_x = cx
            last_focus_y = cy
            positions.append((t, cx, cy))
            metadata.append(
                {
                    "time": round(float(t), 3),
                    "x": round(cx, 4),
                    "y": round(cy, 4),
                    "faceCount": int(len(detections)),
                    "leadSizeRatio": round(float(lead_size_ratio), 4),
                    "sceneType": scene_type,
                    "audienceLikelihood": round(float(audience_likelihood), 4),
                    "horizontalSpread": round(float(horizontal_spread), 4),
                    "verticalSpread": round(float(vertical_spread), 4),
                    "safeZoom": _estimate_safe_zoom_ratio(
                        width,
                        height,
                        face_count=len(detections),
                        lead_size_ratio=lead_size_ratio,
                        scene_type=scene_type,
                    ),
                    "carryForward": False,
                }
            )
        else:
            positions.append((t, last_focus_x, last_focus_y))
            metadata.append(
                {
                    "time": round(float(t), 3),
                    "x": round(last_focus_x, 4),
                    "y": round(last_focus_y, 4),
                    "faceCount": 0,
                    "leadSizeRatio": 0.0,
                    "sceneType": "carry",
                    "audienceLikelihood": 0.0,
                    "horizontalSpread": 0.0,
                    "verticalSpread": 0.0,
                    "safeZoom": _estimate_safe_zoom_ratio(width, height, face_count=0, lead_size_ratio=0.0, scene_type="carry"),
                    "carryForward": True,
                }
            )

    cap.release()
    smoothed_positions = smooth_positions(positions, window=5)
    if not return_metadata:
        return smoothed_positions

    enriched_metadata = []
    for index, meta in enumerate(metadata):
        smoothed = smoothed_positions[index] if index < len(smoothed_positions) else positions[index]
        enriched = dict(meta)
        enriched["x"] = round(float(smoothed[1]), 4)
        enriched["y"] = round(float(smoothed[2]), 4)
        enriched_metadata.append(enriched)
    return enriched_metadata


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

def analyze_audio_energy(video_path, segment_duration=1.0, start_time=0.0, analysis_duration=None):
    """
    Analyze audio energy levels throughout the video by decoding mono PCM and
    computing per-segment RMS levels in Python. This avoids FFmpeg astats
    hangs on unusual source files.
    """
    try:
        cmd = ["ffmpeg", "-v", "error"]
        safe_start = max(0.0, float(start_time or 0.0))
        safe_duration = float(analysis_duration or 0.0)
        if safe_start > 0.0:
            cmd.extend(["-ss", str(safe_start)])
        if safe_duration > 0.0:
            cmd.extend(["-t", str(safe_duration)])
        cmd.extend([
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
        ])
        result = subprocess.run(
            cmd,
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
            rms_values.append((round(safe_start + (index * segment_seconds), 2), db))
        return rms_values
    except Exception as e:
        logger.warning(f"Audio energy analysis failed: {e}")
        return []

def audio_db_to_activity_score(db_value):
    try:
        db = float(db_value)
    except Exception:
        return 0.0
    if db <= -78.0:
        return 0.0
    return clamp_float((db + 48.0) / 28.0, 0.0, 1.0)

def normalize_audio_energy_windows(audio_windows):
    if not audio_windows:
        return []
    db_values = [
        float(item[1] if isinstance(item, (list, tuple)) and len(item) > 1 else item.get("db", -80.0))
        for item in audio_windows
    ]
    if not db_values:
        return []
    quiet_floor = float(np.percentile(db_values, 18))
    loud_ceiling = float(np.percentile(db_values, 92))
    dynamic_range = max(4.0, loud_ceiling - quiet_floor)
    normalized = []
    for item in audio_windows:
        timestamp = float(item[0] if isinstance(item, (list, tuple)) else item.get("time", 0.0))
        db = float(item[1] if isinstance(item, (list, tuple)) and len(item) > 1 else item.get("db", -80.0))
        normalized.append(
            {
                "time": round(timestamp, 3),
                "db": round(db, 3),
                "activity": round(clamp_float((db - quiet_floor) / dynamic_range, 0.0, 1.0), 4),
            }
        )
    return normalized

def get_audio_activity_score_at_source_time(audio_windows, source_time):
    if not audio_windows:
        return 0.0
    safe_time = max(0.0, float(source_time or 0.0))
    nearest = min(
        audio_windows,
        key=lambda item: abs(float(item[0] if isinstance(item, (list, tuple)) else item.get("time", 0.0)) - safe_time),
    )
    if isinstance(nearest, dict) and "activity" in nearest:
        return clamp_float(float(nearest.get("activity", 0.0)), 0.0, 1.0)
    db_value = nearest[1] if isinstance(nearest, (list, tuple)) and len(nearest) > 1 else nearest.get("db", -80.0)
    return audio_db_to_activity_score(db_value)

def get_audio_activity_score_near_source_time(audio_windows, source_time, window_seconds=0.8):
    if not audio_windows:
        return 0.0
    safe_time = max(0.0, float(source_time or 0.0))
    half_window = max(0.05, float(window_seconds or 0.8) / 2.0)
    values = []
    for item in audio_windows:
        timestamp = float(item[0] if isinstance(item, (list, tuple)) else item.get("time", 0.0))
        if abs(timestamp - safe_time) <= half_window:
            if isinstance(item, dict) and "activity" in item:
                values.append(clamp_float(float(item.get("activity", 0.0)), 0.0, 1.0))
            else:
                db_value = item[1] if isinstance(item, (list, tuple)) and len(item) > 1 else item.get("db", -80.0)
                values.append(audio_db_to_activity_score(db_value))
    if not values:
        return get_audio_activity_score_at_source_time(audio_windows, source_time)
    return clamp_float(float(np.median(values)), 0.0, 1.0)

def get_conversation_audio_score(activity, loudest_activity, second_activity):
    safe_activity = clamp_float(float(activity or 0.0), 0.0, 1.0)
    safe_loudest = clamp_float(float(loudest_activity or 0.0), 0.0, 1.0)
    safe_second = clamp_float(float(second_activity or 0.0), 0.0, 1.0)
    gap = safe_activity - safe_second if safe_activity >= safe_loudest - 0.0001 else safe_activity - safe_loudest
    dominance = clamp_float((gap + 0.04) / 0.28, 0.0, 1.0)
    floor_penalty = 0.18 if safe_activity < 0.12 else 0.0
    return clamp_float((safe_activity * 0.68) + (dominance * 0.42) - floor_penalty, 0.0, 1.0)


def estimate_multicam_isolated_handoff_start(
    prepared_sources,
    leader_camera_id,
    previous_camera_id,
    decision_time,
    decision_interval,
    minimum_start_time=0.0,
):
    """
    Offline renders can place a confirmed mic handoff near the speech onset instead
    of waiting for the next director tick. This keeps switching stable while avoiding
    visibly late cuts when someone starts speaking inside a 5s analysis window.
    """
    if not leader_camera_id or leader_camera_id == previous_camera_id:
        return round(max(float(minimum_start_time or 0.0), float(decision_time or 0.0)), 3)

    leader_source = next((s for s in prepared_sources or [] if s.get("id") == leader_camera_id), None)
    previous_source = next((s for s in prepared_sources or [] if s.get("id") == previous_camera_id), None)
    leader_windows = (leader_source or {}).get("timeline_audio_activity_windows") or []
    previous_windows = (previous_source or {}).get("timeline_audio_activity_windows") or []
    if not leader_windows or not previous_windows:
        return round(max(float(minimum_start_time or 0.0), float(decision_time or 0.0)), 3)

    safe_decision = max(0.0, float(decision_time or 0.0))
    safe_interval = clamp_float(float(decision_interval or 5.0), 1.0, 10.0)
    lookback_start = max(float(minimum_start_time or 0.0), safe_decision - min(4.0, safe_interval))
    candidate_times = sorted(
        {
            float(item.get("time", 0.0) if isinstance(item, dict) else item[0])
            for item in leader_windows
            if lookback_start - 0.001 <= float(item.get("time", 0.0) if isinstance(item, dict) else item[0]) <= safe_decision + 0.001
        }
    )
    if not candidate_times:
        return round(max(float(minimum_start_time or 0.0), safe_decision), 3)

    best_start = safe_decision
    sustained = 0
    for timestamp in candidate_times:
        leader_activity = get_audio_activity_score_near_source_time(leader_windows, timestamp, window_seconds=0.7)
        previous_activity = get_audio_activity_score_near_source_time(previous_windows, timestamp, window_seconds=0.7)
        if leader_activity >= 0.26 and (leader_activity - previous_activity) >= 0.08:
            sustained += 1
            if sustained >= 2:
                best_start = timestamp - min(0.35, safe_interval * 0.08)
                break
        else:
            sustained = 0

    return round(clamp_float(best_start, float(minimum_start_time or 0.0), safe_decision), 3)


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


def _sample_timeline_metric(samples, timestamp, default=0.0):
    if not samples:
        return float(default or 0.0)
    target = float(timestamp or 0.0)
    best_value = None
    best_delta = None
    for point in samples:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            continue
        try:
            point_time = float(point[0] or 0.0)
            point_value = float(point[1] or 0.0)
        except Exception:
            continue
        delta = abs(point_time - target)
        if best_delta is None or delta < best_delta:
            best_delta = delta
            best_value = point_value
    return float(best_value if best_value is not None else default or 0.0)


def _nearest_tracked_position(positions, timestamp):
    if not positions:
        return None
    target = float(timestamp or 0.0)
    best = None
    best_delta = None
    for entry in positions:
        if not isinstance(entry, (list, tuple)) or len(entry) < 3:
            continue
        try:
            point_time = float(entry[0] or 0.0)
            point_x = float(entry[1] or 0.5)
            point_y = float(entry[2] or 0.5)
        except Exception:
            continue
        delta = abs(point_time - target)
        if best_delta is None or delta < best_delta:
            best_delta = delta
            best = (point_time, point_x, point_y)
    return best


def _nearest_subject_sample(subject_samples, timestamp):
    if not subject_samples:
        return None
    target = float(timestamp or 0.0)
    best = None
    best_delta = None
    for sample in subject_samples:
        if not isinstance(sample, dict):
            continue
        try:
            point_time = float(sample.get("time", 0.0) or 0.0)
        except Exception:
            continue
        delta = abs(point_time - target)
        if best_delta is None or delta < best_delta:
            best_delta = delta
            best = sample
    return best


def _subject_sample_at_or_before(subject_samples, timestamp):
    if not subject_samples:
        return None
    target = float(timestamp or 0.0)
    best = None
    best_time = None
    for sample in subject_samples:
        if not isinstance(sample, dict):
            continue
        try:
            point_time = float(sample.get("time", 0.0) or 0.0)
        except Exception:
            continue
        if point_time > target:
            continue
        if best_time is None or point_time > best_time:
            best = sample
            best_time = point_time
    return best or _nearest_subject_sample(subject_samples, timestamp)


def _subject_sample_at_or_after(subject_samples, timestamp):
    if not subject_samples:
        return None
    target = float(timestamp or 0.0)
    best = None
    best_time = None
    for sample in subject_samples:
        if not isinstance(sample, dict):
            continue
        try:
            point_time = float(sample.get("time", 0.0) or 0.0)
        except Exception:
            continue
        if point_time < target:
            continue
        if best_time is None or point_time < best_time:
            best = sample
            best_time = point_time
    return best or _nearest_subject_sample(subject_samples, timestamp)


def build_visual_confidence_summary(
    master_plan,
    derived_short_plans=None,
    *,
    analysis_reused=False,
):
    master = master_plan or {}
    segments = list(master.get("segments") or [])
    derived_count = len(list(derived_short_plans or []))
    avg_segment_duration = round(
        sum(float(segment.get("duration", 0.0) or 0.0) for segment in segments) / max(1, len(segments)),
        2,
    ) if segments else 0.0
    focus_shift_count = 0
    last_signature = None
    for segment in segments:
        signature = (
            round(float(segment.get("focusX", 0.5) or 0.5), 2),
            round(float(segment.get("zoom", 1.0) or 1.0), 2),
            str(segment.get("visualMode") or "wide"),
        )
        if last_signature and signature != last_signature:
            focus_shift_count += 1
        last_signature = signature
    avg_motion = round(
        sum(float(segment.get("motionScore", 0.0) or 0.0) for segment in segments) / max(1, len(segments)),
        3,
    ) if segments else 0.0
    avg_energy = round(
        sum(float(segment.get("audioEnergyDb", -40.0) or -40.0) for segment in segments) / max(1, len(segments)),
        2,
    ) if segments else -40.0
    confidence_score = float(master.get("confidenceScore", 0.0) or 0.0)
    confidence_label = master.get("confidenceLabel") or summarize_story_confidence(confidence_score)
    reused_prefix = "Reused saved analysis." if analysis_reused else "Fresh analysis."
    summary = (
        f"{reused_prefix} Visual master keeps one continuous original audio bed while refreshing framing every "
        f"{avg_segment_duration:.1f}s on average. {focus_shift_count} focus changes were planned across the edit."
    )
    return {
        "confidenceScore": round(confidence_score, 1),
        "confidenceLabel": confidence_label,
        "audioContinuous": True,
        "avgSegmentDuration": avg_segment_duration,
        "focusShiftCount": focus_shift_count,
        "avgMotionScore": avg_motion,
        "avgAudioEnergyDb": avg_energy,
        "derivedShortCount": derived_count,
        "analysisReused": bool(analysis_reused),
        "analysisFocus": "visual_pacing",
        "summary": summary,
    }


def build_visual_edit_master_plan(
    source_duration,
    target_duration,
    *,
    audio_energy=None,
    motion_scores=None,
    face_positions=None,
    subject_samples=None,
    style_hint="clean",
):
    source_total = max(0.0, float(source_duration or 0.0))
    if source_total < 8.0:
        return None

    style_key = str(style_hint or "clean").strip().lower()
    style_profiles = {
        "clean": {
            "base": 4.5,
            "min": 2.8,
            "max": 6.8,
            "zooms": [0.93, 0.88, 0.84, 0.86, 0.91],
            "tight_zooms": [0.82, 0.78, 0.75, 0.8],
            "wide_interval": 4,
            "max_segments": 64,
        },
        "hype": {
            "base": 3.2,
            "min": 2.0,
            "max": 5.0,
            "zooms": [0.89, 0.84, 0.8, 0.86, 0.92],
            "tight_zooms": [0.78, 0.74, 0.71, 0.77],
            "wide_interval": 4,
            "max_segments": 80,
        },
        "minimal": {
            "base": 5.5,
            "min": 3.6,
            "max": 7.8,
            "zooms": [0.95, 0.92, 0.88, 0.9],
            "tight_zooms": [0.85, 0.82, 0.79],
            "wide_interval": 5,
            "max_segments": 40,
        },
    }
    profile = style_profiles.get(style_key, style_profiles["clean"])
    edit_end = min(source_total, max(45.0, float(target_duration or source_total)))
    if source_total <= edit_end + 1.0:
        edit_end = source_total

    segments = []
    cursor = 0.0
    segment_index = 0
    max_segments = max(
        8,
        min(
            int(profile.get("max_segments", 28) or 28),
            int(round(edit_end / max(profile["min"] + 1.2, 5.6))),
        ),
    )
    last_focus_x = 0.5
    last_focus_y = 0.5
    last_visual_mode = "wide"
    last_edit_label = ""
    last_framing_variant = "group_balance"
    prev_activity = 0.0
    prev_energy_norm = 0.0
    tight_streak = 0
    last_visual_pressure = 0.0

    def clamp_ratio(value, lower, upper, fallback):
        try:
            numeric = float(value)
        except Exception:
            numeric = float(fallback)
        return max(float(lower), min(float(upper), numeric))

    shot_templates = {
        "wide_reveal": {
            "label": "Wide Reveal",
            "mode": "wide",
            "framing": "group_balance",
            "zoom_offset": 0.02,
            "movement_weight": 0.45,
        },
        "release_pullback": {
            "label": "Breather Reset",
            "mode": "wide",
            "framing": "slow_movement",
            "zoom_offset": 0.03,
            "movement_weight": 0.35,
        },
        "crowd_lift": {
            "label": "Room Energy",
            "mode": "focus",
            "framing": "crowd_lift",
            "zoom_offset": -0.01,
            "movement_weight": 0.9,
        },
        "reaction_cut": {
            "label": "Reaction Jump",
            "mode": "tight",
            "framing": "asymmetric",
            "zoom_offset": -0.04,
            "movement_weight": 1.35,
        },
        "lead_surge": {
            "label": "Surge In",
            "mode": "tight",
            "framing": "asymmetric",
            "zoom_offset": -0.055,
            "movement_weight": 1.55,
        },
        "emotion_lock": {
            "label": "Face Lock",
            "mode": "focus",
            "framing": "emotion_lock",
            "zoom_offset": -0.035,
            "movement_weight": 0.7,
        },
        "cross_stage_sweep": {
            "label": "Stage Sweep",
            "mode": "focus",
            "framing": "cross_sweep",
            "zoom_offset": -0.02,
            "movement_weight": 1.45,
        },
        "anticipation_drift": {
            "label": "Anticipation",
            "mode": "focus",
            "framing": "anticipation",
            "zoom_offset": -0.015,
            "movement_weight": 1.05,
        },
        "human_detail": {
            "label": "Human Detail",
            "mode": "focus",
            "framing": "asymmetric",
            "zoom_offset": -0.02,
            "movement_weight": 0.9,
        },
        "guided_drift": {
            "label": "Guided Drift",
            "mode": "focus",
            "framing": "guided_drift",
            "zoom_offset": -0.01,
            "movement_weight": 0.8,
        },
        "face_chase": {
            "label": "Face Chase",
            "mode": "tight",
            "framing": "slow_movement",
            "zoom_offset": -0.045,
            "movement_weight": 1.65,
        },
        "body_scan": {
            "label": "Body Scan",
            "mode": "focus",
            "framing": "guided_drift",
            "zoom_offset": -0.025,
            "movement_weight": 1.15,
        },
        "gesture_follow": {
            "label": "Gesture Follow",
            "mode": "focus",
            "framing": "asymmetric",
            "zoom_offset": -0.02,
            "movement_weight": 1.25,
        },
        "speed_ramp": {
            "label": "Speed Ramp",
            "mode": "tight",
            "framing": "cross_sweep",
            "zoom_offset": -0.06,
            "movement_weight": 1.75,
        },
        "stage_reset": {
            "label": "Stage Reset",
            "mode": "wide",
            "framing": "group_balance",
            "zoom_offset": 0.03,
            "movement_weight": 0.3,
        },
        "punch_back": {
            "label": "Punch Back",
            "mode": "tight",
            "framing": "anticipation",
            "zoom_offset": -0.05,
            "movement_weight": 1.45,
        },
        "linger_push": {
            "label": "Linger Push",
            "mode": "focus",
            "framing": "slow_movement",
            "zoom_offset": -0.03,
            "movement_weight": 1.0,
        },
        "two_shot_drift": {
            "label": "Two-Shot Drift",
            "mode": "focus",
            "framing": "group_balance",
            "zoom_offset": -0.01,
            "movement_weight": 0.75,
        },
        "energy_chase": {
            "label": "Energy Chase",
            "mode": "tight",
            "framing": "cross_sweep",
            "zoom_offset": -0.055,
            "movement_weight": 1.6,
        },
        "subtle_shift": {
            "label": "Subtle Shift",
            "mode": "focus",
            "framing": "asymmetric",
            "zoom_offset": -0.01,
            "movement_weight": 0.65,
        },
    }

    while cursor < edit_end - 0.2:
        if segment_index >= max_segments:
            break
        midpoint = min(edit_end, cursor + profile["base"] / 2.0)
        energy_db = _sample_timeline_metric(audio_energy or [], midpoint, default=-36.0)
        motion_score = _sample_timeline_metric(motion_scores or [], midpoint, default=0.15)
        position = _nearest_tracked_position(face_positions or [], midpoint)
        subject_sample = _nearest_subject_sample(subject_samples or [], midpoint)
        before_sample = _subject_sample_at_or_before(subject_samples or [], max(0.0, midpoint - max(0.4, profile["min"] * 0.45)))
        after_sample = _subject_sample_at_or_after(subject_samples or [], min(edit_end, midpoint + max(0.4, profile["min"] * 0.45)))

        focus_x = float(position[1]) if position else float((subject_sample or {}).get("x", 0.5) or 0.5)
        focus_y = float(position[2]) if position else float((subject_sample or {}).get("y", 0.5) or 0.5)
        focus_x = clamp_ratio(focus_x, 0.18, 0.82, 0.5)
        focus_y = clamp_ratio(focus_y, 0.24, 0.76, 0.5)

        before_focus_x = clamp_ratio((before_sample or {}).get("x", last_focus_x), 0.16, 0.84, last_focus_x)
        before_focus_y = clamp_ratio((before_sample or {}).get("y", last_focus_y), 0.22, 0.78, last_focus_y)
        after_focus_x = clamp_ratio((after_sample or {}).get("x", focus_x), 0.16, 0.84, focus_x)
        after_focus_y = clamp_ratio((after_sample or {}).get("y", focus_y), 0.22, 0.78, focus_y)

        face_count = int((subject_sample or {}).get("faceCount", 0) or 0)
        scene_type = str((subject_sample or {}).get("sceneType") or ("lead" if position else "carry")).strip().lower()
        min_safe_zoom = float((subject_sample or {}).get("safeZoom", 0.9) or 0.9)
        lead_size_ratio = float((subject_sample or {}).get("leadSizeRatio", 0.0) or 0.0)
        audience_likelihood = float((subject_sample or {}).get("audienceLikelihood", 0.0) or 0.0)
        horizontal_spread = float((subject_sample or {}).get("horizontalSpread", 0.0) or 0.0)
        vertical_spread = float((subject_sample or {}).get("verticalSpread", 0.0) or 0.0)

        energy_norm = max(0.0, min(1.0, (float(energy_db) + 46.0) / 30.0))
        motion_norm = max(0.0, min(1.0, float(motion_score or 0.0)))
        travel_x = float(after_focus_x) - float(before_focus_x)
        travel_y = float(after_focus_y) - float(before_focus_y)
        subject_travel = min(1.0, (((travel_x * travel_x) + (travel_y * travel_y)) ** 0.5) / 0.22)
        activity = max(
            0.0,
            min(
                1.0,
                (energy_norm * 0.56)
                + (motion_norm * 0.27)
                + (subject_travel * 0.17),
            ),
        )
        energy_delta = energy_norm - prev_energy_norm
        surge = max(0.0, min(1.0, activity - prev_activity))
        release = max(0.0, min(1.0, prev_activity - activity))
        focus_delta = abs(focus_x - last_focus_x)
        focus_delta_y = abs(focus_y - last_focus_y)
        strong_focus_shift = bool(position) and (focus_delta >= 0.11 or focus_delta_y >= 0.08 or subject_travel >= 0.34)

        reaction_window = (
            scene_type == "audience"
            or (audience_likelihood >= 0.34 and energy_norm >= 0.56)
            or (scene_type == "group" and face_count >= 6 and surge >= 0.14)
        )
        intense_lead = (
            scene_type == "lead"
            and (
                energy_norm >= 0.58
                or surge >= 0.12
                or lead_size_ratio >= 0.055
            )
        )
        sweep_window = strong_focus_shift or subject_travel >= 0.42 or horizontal_spread >= 0.3
        wide_recovery = (
            segment_index == 0
            or release >= 0.18
            or (tight_streak >= 2 and activity < 0.72)
            or (last_visual_pressure >= 0.74 and activity < 0.48)
            or (segment_index > 0 and segment_index % int(profile.get("wide_interval", 4) or 4) == 0 and activity < 0.82)
        )

        segment_duration = profile["base"] - (2.05 * activity) - (0.95 * max(0.0, energy_delta)) + (0.75 * release)
        if reaction_window or sweep_window:
            segment_duration -= 0.4
        if intense_lead and surge >= 0.12:
            segment_duration -= 0.35
        if scene_type == "carry":
            segment_duration += 0.55
        if wide_recovery:
            segment_duration += 0.6
        segment_duration = max(profile["min"], min(profile["max"], segment_duration))

        segment_end = min(edit_end, cursor + segment_duration)
        if edit_end - segment_end < profile["min"] * 0.5:
            segment_end = edit_end
        actual_duration = max(0.2, segment_end - cursor)

        scored_candidates = []

        def push_candidate(template_key, score):
            template = shot_templates.get(template_key)
            if not template:
                return
            adjusted_score = float(score)
            if template["label"] == last_edit_label:
                adjusted_score -= 0.45
            if template["mode"] == last_visual_mode:
                adjusted_score -= 0.14
            if template["framing"] == last_framing_variant:
                adjusted_score -= 0.16
            if template["mode"] == "tight" and tight_streak >= 2:
                adjusted_score -= 0.75
            if face_count >= 6 and template["mode"] == "tight":
                adjusted_score -= 0.28
            if scene_type == "audience" and template_key == "lead_surge":
                adjusted_score -= 0.5
            scored_candidates.append((adjusted_score, template_key))

        if segment_index == 0:
            push_candidate("wide_reveal", 2.3)
        if wide_recovery:
            push_candidate("release_pullback", 1.55 + (release * 1.15))
            push_candidate("stage_reset", 1.35 + (release * 0.9))
        if reaction_window:
            push_candidate("reaction_cut", 1.38 + (audience_likelihood * 0.75) + (surge * 0.45))
            push_candidate("crowd_lift", 1.26 + (energy_norm * 0.44) + (motion_norm * 0.25))
        if intense_lead:
            push_candidate("lead_surge", 1.42 + (energy_norm * 0.5) + (surge * 0.7))
            push_candidate("emotion_lock", 1.12 + (lead_size_ratio * 5.5) + (max(0.0, 0.6 - motion_norm) * 0.2))
            push_candidate("face_chase", 1.05 + (lead_size_ratio * 4.8) + (surge * 0.55))
            push_candidate("speed_ramp", 0.98 + (surge * 0.8) + (motion_norm * 0.25))
        if sweep_window:
            push_candidate("cross_stage_sweep", 1.22 + (subject_travel * 0.95) + (motion_norm * 0.22))
            push_candidate("energy_chase", 1.08 + (subject_travel * 0.85) + (horizontal_spread * 0.7))
        if max(0.0, energy_delta) >= 0.08 and not reaction_window:
            push_candidate("anticipation_drift", 1.02 + (energy_delta * 1.25) + (motion_norm * 0.15))
            push_candidate("linger_push", 0.9 + (energy_delta * 0.9) + (motion_norm * 0.18))
        if scene_type in {"lead", "group"}:
            push_candidate("human_detail", 0.96 + (max(energy_norm, motion_norm) * 0.18) + (0.1 if scene_type == "lead" else 0.0))
            push_candidate("body_scan", 0.88 + (motion_norm * 0.22) + (face_count * 0.03))
            push_candidate("gesture_follow", 0.82 + (motion_norm * 0.25) + (subject_travel * 0.3))
            if face_count >= 6:
                push_candidate("two_shot_drift", 0.8 + (face_count * 0.05) + (energy_norm * 0.15))
        if tight_streak >= 3:
            push_candidate("stage_reset", 1.6 + (release * 1.2))
        push_candidate("guided_drift", 0.84 + (motion_norm * 0.16))
        push_candidate("subtle_shift", 0.72 + (focus_delta * 1.8) + (focus_delta_y * 1.6))

        scored_candidates.sort(key=lambda item: item[0], reverse=True)
        shot_key = scored_candidates[0][1] if scored_candidates else "guided_drift"
        shot = shot_templates.get(shot_key, shot_templates["guided_drift"])
        visual_mode = str(shot["mode"]).strip().lower()
        edit_label = str(shot["label"]).strip()
        framing_variant = str(shot["framing"]).strip().lower()

        zoom_sequence = list(profile.get("zooms") or [0.92, 0.88, 0.9])
        tight_zoom_sequence = list(profile.get("tight_zooms") or [0.84, 0.8])
        base_focus_zoom = float(zoom_sequence[segment_index % len(zoom_sequence)])
        base_tight_zoom = float(tight_zoom_sequence[segment_index % len(tight_zoom_sequence)])
        if visual_mode == "wide":
            zoom_end = max(min_safe_zoom, min(1.0, 0.992 + float(shot.get("zoom_offset", 0.0))))
        elif visual_mode == "tight":
            zoom_end = max(min_safe_zoom, min(0.92, base_tight_zoom + float(shot.get("zoom_offset", 0.0)) - min(0.03, surge * 0.05)))
        else:
            zoom_end = max(min_safe_zoom, min(0.96, base_focus_zoom + float(shot.get("zoom_offset", 0.0)) - min(0.02, max(0.0, energy_delta) * 0.03)))

        if visual_mode == "wide":
            zoom_start = 1.0
        elif visual_mode == "tight":
            zoom_start = min(1.0, zoom_end + 0.07 + min(0.03, surge * 0.04))
        else:
            zoom_start = min(1.0, zoom_end + 0.05 + min(0.025, max(0.0, energy_delta) * 0.03))

        direction_x = 1 if abs(travel_x) < 0.01 else (1 if travel_x >= 0 else -1)
        movement_energy = min(
            0.18,
            0.03
            + (motion_norm * 0.045)
            + (subject_travel * 0.06)
            + (max(0.0, energy_delta) * 0.05)
            + (float(shot.get("movement_weight", 0.8)) * 0.018),
        )
        lateral_move = min(0.2, movement_energy * (1.0 + max(0.0, horizontal_spread)))
        vertical_move = min(0.09, (movement_energy * 0.45) + (abs(travel_y) * 0.35) + (vertical_spread * 0.08))

        if shot_key == "cross_stage_sweep" or shot_key == "energy_chase":
            start_focus_x = clamp_ratio(before_focus_x - (0.025 * direction_x), 0.16, 0.84, focus_x)
            end_focus_x = clamp_ratio(after_focus_x + (lateral_move * 0.18 * direction_x), 0.16, 0.84, focus_x)
            start_focus_y = clamp_ratio(before_focus_y - (vertical_move * 0.22), 0.22, 0.78, focus_y)
            end_focus_y = clamp_ratio(after_focus_y + (vertical_move * 0.12), 0.22, 0.78, focus_y)
        elif shot_key in {"lead_surge", "emotion_lock"}:
            start_focus_x = clamp_ratio(focus_x - (lateral_move * 0.75 * direction_x), 0.16, 0.84, focus_x)
            end_focus_x = clamp_ratio((focus_x * 0.65) + (after_focus_x * 0.35) + (lateral_move * 0.16 * direction_x), 0.16, 0.84, focus_x)
            start_focus_y = clamp_ratio(focus_y - (vertical_move * 0.28), 0.22, 0.78, focus_y)
            end_focus_y = clamp_ratio((focus_y * 0.78) + (after_focus_y * 0.22) + (vertical_move * 0.08), 0.22, 0.78, focus_y)
        elif shot_key in {"face_chase", "speed_ramp", "punch_back"}:
            start_focus_x = clamp_ratio(focus_x - (lateral_move * 0.6 * direction_x), 0.14, 0.86, focus_x)
            end_focus_x = clamp_ratio(focus_x + (lateral_move * 0.9 * direction_x), 0.14, 0.86, focus_x)
            start_focus_y = clamp_ratio(focus_y - (vertical_move * 0.35), 0.2, 0.8, focus_y)
            end_focus_y = clamp_ratio(focus_y + (vertical_move * 0.2), 0.2, 0.8, focus_y)
        elif shot_key in {"reaction_cut", "crowd_lift"}:
            start_focus_x = clamp_ratio(focus_x - (lateral_move * 0.55 * direction_x), 0.16, 0.84, focus_x)
            end_focus_x = clamp_ratio(focus_x + (lateral_move * 0.8 * direction_x), 0.16, 0.84, focus_x)
            start_focus_y = clamp_ratio(focus_y - (vertical_move * 0.12), 0.22, 0.78, focus_y)
            end_focus_y = clamp_ratio(focus_y + (vertical_move * 0.1), 0.22, 0.78, focus_y)
        elif shot_key in {"release_pullback", "wide_reveal", "stage_reset"}:
            start_focus_x = clamp_ratio((last_focus_x * 0.5) + (focus_x * 0.5) - (lateral_move * 0.2 * direction_x), 0.16, 0.84, focus_x)
            end_focus_x = clamp_ratio(0.5 + (lateral_move * 0.12 * direction_x), 0.2, 0.8, 0.5)
            start_focus_y = clamp_ratio((last_focus_y * 0.45) + (focus_y * 0.55), 0.22, 0.78, focus_y)
            end_focus_y = clamp_ratio(0.5 + (vertical_move * 0.03), 0.25, 0.75, 0.5)
        elif shot_key == "anticipation_drift":
            start_focus_x = clamp_ratio(before_focus_x, 0.16, 0.84, focus_x)
            end_focus_x = clamp_ratio((focus_x * 0.45) + (after_focus_x * 0.55), 0.16, 0.84, focus_x)
            start_focus_y = clamp_ratio(before_focus_y, 0.22, 0.78, focus_y)
            end_focus_y = clamp_ratio((focus_y * 0.6) + (after_focus_y * 0.4), 0.22, 0.78, focus_y)
        elif shot_key == "body_scan":
            start_focus_x = clamp_ratio(focus_x - (lateral_move * 0.2), 0.18, 0.82, focus_x)
            end_focus_x = clamp_ratio(focus_x + (lateral_move * 0.5 * direction_x), 0.18, 0.82, focus_x)
            start_focus_y = clamp_ratio(focus_y - (vertical_move * 0.4), 0.22, 0.78, focus_y)
            end_focus_y = clamp_ratio(focus_y + (vertical_move * 0.15), 0.22, 0.78, focus_y)
        elif shot_key == "gesture_follow":
            start_focus_x = clamp_ratio(focus_x - (lateral_move * 0.35 * direction_x), 0.16, 0.84, focus_x)
            end_focus_x = clamp_ratio(focus_x + (lateral_move * 0.7 * direction_x), 0.16, 0.84, focus_x)
            start_focus_y = clamp_ratio(focus_y - (vertical_move * 0.25), 0.22, 0.78, focus_y)
            end_focus_y = clamp_ratio(focus_y + (vertical_move * 0.18), 0.22, 0.78, focus_y)
        elif shot_key in {"linger_push", "two_shot_drift"}:
            start_focus_x = clamp_ratio((last_focus_x * 0.7) + (focus_x * 0.3), 0.16, 0.84, focus_x)
            end_focus_x = clamp_ratio((focus_x * 0.6) + (after_focus_x * 0.4), 0.16, 0.84, focus_x)
            start_focus_y = clamp_ratio((last_focus_y * 0.65) + (focus_y * 0.35), 0.22, 0.78, focus_y)
            end_focus_y = clamp_ratio(focus_y + (vertical_move * 0.06), 0.22, 0.78, focus_y)
        elif shot_key == "subtle_shift":
            start_focus_x = clamp_ratio(last_focus_x, 0.2, 0.8, focus_x)
            end_focus_x = clamp_ratio(focus_x + (lateral_move * 0.35 * direction_x), 0.2, 0.8, focus_x)
            start_focus_y = clamp_ratio(last_focus_y, 0.25, 0.75, focus_y)
            end_focus_y = clamp_ratio(focus_y + (vertical_move * 0.08), 0.25, 0.75, focus_y)
        else:
            start_focus_x = clamp_ratio(focus_x - (lateral_move * 0.45 * direction_x), 0.16, 0.84, focus_x)
            end_focus_x = clamp_ratio(focus_x + (lateral_move * 0.6 * direction_x), 0.16, 0.84, focus_x)
            start_focus_y = clamp_ratio(focus_y - (vertical_move * 0.15), 0.22, 0.78, focus_y)
            end_focus_y = clamp_ratio(focus_y + (vertical_move * 0.08), 0.22, 0.78, focus_y)

        if shot_key == "reaction_cut":
            reason = "A human reaction spikes here, so the frame briefly chases that emotional response instead of staying locked on the stage."
        elif shot_key == "crowd_lift":
            reason = "The room energy rises here, so the edit opens toward the crowd-and-performer relationship instead of another isolated punch-in."
        elif shot_key == "lead_surge":
            reason = "Performance intensity jumps here, so the virtual camera presses inward with more urgency and visual pressure."
        elif shot_key == "emotion_lock":
            reason = "This moment reads as more human than loud, so the framing settles on the strongest face instead of cutting away too early."
        elif shot_key in {"face_chase", "speed_ramp"}:
            reason = "The movement energy is high here, so the camera tracks the subject aggressively to keep the viewer locked in."
        elif shot_key == "punch_back":
            reason = "After a breather, the frame punches back in hard to recapture attention and restart visual tension."
        elif shot_key == "stage_reset":
            reason = "After a run of tight shots, the frame resets to the full stage so the next push feels earned."
        elif shot_key == "energy_chase":
            reason = "Energy is sweeping across the stage, so the camera rides that wave instead of holding still."
        elif shot_key == "body_scan":
            reason = "There is physical movement worth following, so the frame scans the body language instead of staying on a single crop."
        elif shot_key == "gesture_follow":
            reason = "A hand gesture or physical motion directs attention, so the camera drifts to follow it naturally."
        elif shot_key == "linger_push":
            reason = "The moment starts calm then builds, so the camera holds then pushes in to match the rising intensity."
        elif shot_key == "two_shot_drift":
            reason = "Multiple faces are visible, so the frame drifts between them to keep the group dynamic alive."
        elif shot_key == "subtle_shift":
            reason = "A small focus adjustment here keeps the frame feeling watched rather than static."
        elif shot_key == "cross_stage_sweep":
            reason = "The viewer's attention needs to move across the frame here, so the edit sweeps with the action rather than snapping mechanically."
        elif shot_key == "anticipation_drift":
            reason = "The energy is building, so the camera drifts toward the next point of attention before the performance lands."
        elif shot_key == "release_pullback":
            reason = "After the tighter pressure beat, the framing breathes out into a wider composition so the next move feels earned."
        elif shot_key == "wide_reveal":
            reason = "The edit opens by showing the full performance space before it starts steering attention more aggressively."
        elif shot_key == "human_detail":
            reason = "There is a specific human detail worth following here, so the frame guides the eye instead of repeating a generic crop."
        else:
            reason = "The frame keeps moving with intent here so the performance feels directed rather than statically observed."

        visual_pressure = max(
            0.0,
            min(
                1.0,
                (activity * 0.52)
                + (max(0.0, energy_delta) * 0.26)
                + (subject_travel * 0.22),
            ),
        )

        segments.append(
            {
                "start": round(cursor, 2),
                "end": round(segment_end, 2),
                "duration": round(actual_duration, 2),
                "visualMode": visual_mode,
                "editLabel": edit_label,
                "focusX": round(focus_x, 4),
                "focusY": round(focus_y, 4),
                "zoom": round(float(zoom_end), 3),
                "zoomStart": round(float(zoom_start), 3),
                "zoomEnd": round(float(zoom_end), 3),
                "startFocusX": round(float(start_focus_x), 4),
                "startFocusY": round(float(start_focus_y), 4),
                "endFocusX": round(float(end_focus_x), 4),
                "endFocusY": round(float(end_focus_y), 4),
                "audioEnergyDb": round(float(energy_db), 2),
                "motionScore": round(float(motion_score), 3),
                "faceCount": face_count,
                "sceneType": scene_type,
                "safeZoom": round(float(min_safe_zoom), 3),
                "framingVariant": framing_variant,
                "caption": "Dynamic visual reframe",
                "reason": reason,
                "attentionTarget": scene_type,
                "attentionScore": round(float(activity), 3),
                "energyDelta": round(float(energy_delta), 3),
                "subjectTravel": round(float(subject_travel), 3),
                "audienceLikelihood": round(float(audience_likelihood), 3),
                "visualPressure": round(float(visual_pressure), 3),
            }
        )
        cursor = segment_end
        segment_index += 1
        last_focus_x = focus_x
        last_focus_y = focus_y
        last_visual_mode = visual_mode
        last_edit_label = edit_label
        last_framing_variant = framing_variant
        last_visual_pressure = visual_pressure
        prev_activity = activity
        prev_energy_norm = energy_norm
        if visual_mode == "tight":
            tight_streak += 1
        elif visual_mode == "wide":
            tight_streak = 0
        else:
            tight_streak = max(0, tight_streak - 1)

    if segments and float(segments[-1]["end"]) < edit_end:
        segments[-1]["end"] = round(edit_end, 2)
        segments[-1]["duration"] = round(float(segments[-1]["end"]) - float(segments[-1]["start"]), 2)

    if not segments:
        return None

    avg_motion = sum(float(segment.get("motionScore", 0.0) or 0.0) for segment in segments) / max(1, len(segments))
    average_zoom = sum(float(segment.get("zoom", 1.0) or 1.0) for segment in segments) / max(1, len(segments))
    confidence_score = round(
        min(
            94.0,
            74.0
            + min(9.0, len(segments) * 0.45)
            + min(6.0, avg_motion * 18.0)
            + (4.0 if face_positions else 0.0)
            + (3.0 if average_zoom < 0.95 else 0.0),
        ),
        1,
    )
    confidence_label = summarize_story_confidence(confidence_score)
    duration = round(float(segments[-1]["end"]) - float(segments[0]["start"]), 2)
    return {
        "id": "smart_promo_visual_master",
        "start": float(segments[0]["start"]),
        "end": float(segments[-1]["end"]),
        "duration": duration,
        "montageDuration": duration,
        "sourceSpanDuration": duration,
        "viralScore": None,
        "reason": "Continuous visual edit with original audio preserved",
        "text": "Dynamic visual edit with original performance audio intact",
        "promoCaption": "Continuous visual edit with original audio preserved",
        "selectionWhy": "Built as one continuous visual direction pass. The audio stays untouched and chronological while the framing keeps asking what the viewer should care about right now.",
        "segments": segments,
        "campaignRole": "visual_master",
        "campaignRoleLabel": "Master Visual Edit",
        "renderStrategy": "visual_master",
        "storyMaster": True,
        "visualOnly": True,
        "audioContinuous": True,
        "confidenceScore": confidence_score,
        "confidenceLabel": confidence_label,
        "analysisFocus": "visual_pacing",
        "debugSummary": " | ".join(
            f"{index}:{segment['start']:.2f}-{segment['end']:.2f}:{segment.get('editLabel')}"
            for index, segment in enumerate(segments)
        ),
    }


def derive_shorts_from_visual_master(master_plan, max_shorts=3):
    if not master_plan:
        return []
    segments = list(master_plan.get("segments") or [])
    if not segments:
        return []

    total_duration = max(0.0, float(master_plan.get("duration", 0.0) or 0.0))
    if total_duration < 12.0:
        return []

    preview_duration = max(12.0, min(30.0, total_duration / 3.2))
    preview_specs = [
        ("opening_preview", "Opening Preview", 0.18),
        ("mid_preview", "Middle Preview", 0.50),
        ("closing_preview", "Closing Preview", 0.82),
    ]
    previews = []
    for preview_id, label, progress in preview_specs[: max(1, int(max_shorts or 1))]:
        target_center = float(master_plan.get("start", 0.0) or 0.0) + total_duration * progress
        start = max(float(master_plan.get("start", 0.0) or 0.0), target_center - preview_duration / 2.0)
        end = min(float(master_plan.get("end", total_duration) or total_duration), start + preview_duration)
        if end - start < preview_duration:
            start = max(float(master_plan.get("start", 0.0) or 0.0), end - preview_duration)

        preview_segments = []
        for segment in segments:
            overlap_start = max(float(segment.get("start", 0.0) or 0.0), start)
            overlap_end = min(float(segment.get("end", overlap_start) or overlap_start), end)
            if overlap_end - overlap_start < 0.2:
                continue
            preview_segment = dict(segment)
            preview_segment["start"] = round(overlap_start, 2)
            preview_segment["end"] = round(overlap_end, 2)
            preview_segment["duration"] = round(overlap_end - overlap_start, 2)
            preview_segments.append(preview_segment)

        if not preview_segments:
            continue

        clip_duration = round(float(preview_segments[-1]["end"]) - float(preview_segments[0]["start"]), 2)
        previews.append(
            {
                "id": preview_id,
                "start": float(preview_segments[0]["start"]),
                "end": float(preview_segments[-1]["end"]),
                "duration": clip_duration,
                "montageDuration": clip_duration,
                "sourceSpanDuration": clip_duration,
                "reason": "Preview cut from the continuous master visual edit",
                "text": label,
                "promoCaption": label,
                "selectionWhy": f"{label} comes directly from the continuous master visual edit without changing the original audio order.",
                "segments": preview_segments,
                "campaignRole": preview_id,
                "campaignRoleLabel": label,
                "renderStrategy": "visual_master_preview",
                "storyMaster": False,
                "visualOnly": True,
                "audioContinuous": True,
                "confidenceScore": float(master_plan.get("confidenceScore", 0.0) or 0.0),
                "confidenceLabel": master_plan.get("confidenceLabel"),
                "analysisFocus": "visual_pacing",
            }
        )
    return previews


def build_smart_promo_video_encode_args(src_width, src_height):
    width = max(1, int(src_width or 0))
    height = max(1, int(src_height or 0))
    longest_edge = max(width, height)

    if longest_edge >= 1920:
        target_bitrate = "6500k"
        maxrate = "9000k"
        bufsize = "12000k"
    elif longest_edge >= 1280:
        target_bitrate = "4200k"
        maxrate = "6200k"
        bufsize = "8400k"
    else:
        target_bitrate = "2800k"
        maxrate = "4200k"
        bufsize = "6000k"

    if GPU_VIDEO_ENCODER == "h264_nvenc":
        return [
            "-c:v",
            GPU_VIDEO_ENCODER,
            "-preset",
            GPU_PRESET,
            "-rc",
            "vbr",
            "-tune",
            "hq",
            "-multipass",
            "qres",
            "-cq",
            "19",
            "-b:v",
            target_bitrate,
            "-maxrate:v",
            maxrate,
            "-bufsize:v",
            bufsize,
            "-spatial_aq",
            "1",
            "-temporal_aq",
            "1",
            "-aq-strength",
            "8",
            "-g",
            "60",
            "-pix_fmt",
            "yuv420p",
        ]

    return [
        "-c:v",
        GPU_VIDEO_ENCODER,
        "-preset",
        GPU_PRESET,
        "-crf",
        "18",
        "-maxrate",
        maxrate,
        "-bufsize",
        bufsize,
        "-pix_fmt",
        "yuv420p",
    ]


def _clamp_focus_ratio(value, lower, upper, default_value):
    try:
        numeric = float(value)
    except Exception:
        numeric = float(default_value)
    return max(float(lower), min(float(upper), numeric))


def _build_crop_coordinate_expression(start_px, end_px, max_px, duration_seconds):
    bounded_max = max(0.0, float(max_px or 0.0))
    start_value = max(0.0, min(bounded_max, float(start_px or 0.0)))
    end_value = max(0.0, min(bounded_max, float(end_px or 0.0)))
    if abs(end_value - start_value) < 0.51:
        return str(int(round(start_value)))
    safe_duration = max(0.25, float(duration_seconds or 0.25))
    progress_expr = f"(0.5-0.5*cos(min(max(t/{safe_duration:.3f},0),1)*PI))"
    return (
        f"'max(0,min({bounded_max:.3f},{start_value:.3f}+({end_value - start_value:.3f})*{progress_expr}))'"
    )


def _focus_point_to_crop_origin(focus_x, focus_y, crop_w, crop_h, src_width, src_height):
    crop_x = max(0.0, min(float(src_width) - float(crop_w), float(focus_x) * float(src_width) - float(crop_w) / 2.0))
    crop_y = max(0.0, min(float(src_height) - float(crop_h), float(focus_y) * float(src_height) - float(crop_h) / 2.0))
    return crop_x, crop_y


def build_visual_focus_filter(
    src_width,
    src_height,
    *,
    target_aspect="9:16",
    focus_x=0.5,
    focus_y=0.5,
    zoom=0.9,
    safe_zoom=None,
    start_focus_x=None,
    start_focus_y=None,
    end_focus_x=None,
    end_focus_y=None,
    duration_seconds=3.0,
    framing_variant="center",
):
    if int(src_width or 0) <= 0 or int(src_height or 0) <= 0:
        return build_promo_video_filter(target_aspect, "promo_fit", src_width, src_height)
    if str(target_aspect or "9:16").strip() != "9:16":
        return build_promo_video_filter(target_aspect, "promo_fit", src_width, src_height)

    aspect_ratio = 9.0 / 16.0
    if float(src_width) / max(1.0, float(src_height)) <= aspect_ratio + 0.02:
        return build_promo_video_filter(target_aspect, "promo_fit", src_width, src_height)

    crop_h = int(src_height)
    crop_w = int(crop_h * aspect_ratio)
    crop_w = min(crop_w, int(src_width))
    min_safe_zoom = _estimate_safe_zoom_ratio(src_width, src_height) if safe_zoom is None else float(safe_zoom or 0.9)
    zoom_ratio = max(min_safe_zoom, min(1.0, float(zoom or 0.9)))
    min_crop_w = 320 if max(int(src_width), int(src_height)) >= 1280 else 420
    crop_w = max(min_crop_w, min(int(src_width), int(crop_w * zoom_ratio)))
    crop_h = max(560, min(int(src_height), int(crop_w / aspect_ratio)))
    if crop_h > int(src_height):
        crop_h = int(src_height)
        crop_w = max(min_crop_w, min(int(src_width), int(crop_h * aspect_ratio)))

    safe_focus_x = _clamp_focus_ratio(focus_x, 0.18, 0.82, 0.5)
    safe_focus_y = _clamp_focus_ratio(focus_y, 0.24, 0.76, 0.5)
    safe_start_x = _clamp_focus_ratio(start_focus_x, 0.16, 0.84, safe_focus_x)
    safe_start_y = _clamp_focus_ratio(start_focus_y, 0.22, 0.78, safe_focus_y)
    safe_end_x = _clamp_focus_ratio(end_focus_x, 0.16, 0.84, safe_focus_x)
    safe_end_y = _clamp_focus_ratio(end_focus_y, 0.22, 0.78, safe_focus_y)

    crop_x_start, crop_y_start = _focus_point_to_crop_origin(
        safe_start_x,
        safe_start_y,
        crop_w,
        crop_h,
        src_width,
        src_height,
    )
    crop_x_end, crop_y_end = _focus_point_to_crop_origin(
        safe_end_x,
        safe_end_y,
        crop_w,
        crop_h,
        src_width,
        src_height,
    )

    x_expression = _build_crop_coordinate_expression(crop_x_start, crop_x_end, int(src_width) - crop_w, duration_seconds)
    y_expression = _build_crop_coordinate_expression(crop_y_start, crop_y_end, int(src_height) - crop_h, duration_seconds)
    detail_filter = "scale=1080:1920:flags=lanczos,setsar=1"
    if min(int(src_width), int(src_height)) < 900 or zoom_ratio <= 0.89:
        detail_filter += ",unsharp=5:5:0.55:5:5:0.0"
    elif str(framing_variant or "").strip().lower() == "slow_movement":
        detail_filter += ",unsharp=3:3:0.25:3:3:0.0"

    return f"crop={crop_w}:{crop_h}:x={x_expression}:y={y_expression},{detail_filter}"


def build_visual_segment_filter(segment, target_aspect, src_width, src_height):
    mode = str((segment or {}).get("visualMode") or "wide").strip().lower()
    if mode == "wide" and float(src_width or 0.0) / max(1.0, float(src_height or 0.0)) <= (9.0 / 16.0) + 0.02:
        return build_promo_video_filter(target_aspect, "promo_fit", src_width, src_height)
    return build_visual_focus_filter(
        src_width,
        src_height,
        target_aspect=target_aspect,
        focus_x=float((segment or {}).get("focusX", 0.5) or 0.5),
        focus_y=float((segment or {}).get("focusY", 0.5) or 0.5),
        zoom=float((segment or {}).get("zoomEnd", (segment or {}).get("zoom", 0.9)) or 0.9),
        safe_zoom=float((segment or {}).get("safeZoom", 0.9) or 0.9),
        start_focus_x=float((segment or {}).get("startFocusX", (segment or {}).get("focusX", 0.5)) or 0.5),
        start_focus_y=float((segment or {}).get("startFocusY", (segment or {}).get("focusY", 0.5)) or 0.5),
        end_focus_x=float((segment or {}).get("endFocusX", (segment or {}).get("focusX", 0.5)) or 0.5),
        end_focus_y=float((segment or {}).get("endFocusY", (segment or {}).get("focusY", 0.5)) or 0.5),
        duration_seconds=float((segment or {}).get("duration", 3.0) or 3.0),
        framing_variant=str((segment or {}).get("framingVariant") or "center"),
    )


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
    try:
        upload_timeout_seconds = max(120, int(os.getenv("FIREBASE_UPLOAD_TIMEOUT_SECONDS", "900") or 900))
    except (TypeError, ValueError):
        upload_timeout_seconds = 900

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
        blob.chunk_size = 8 * 1024 * 1024
        blob.upload_from_filename(local_path, timeout=upload_timeout_seconds)

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
        logger.error(
            "Firebase Upload CRITICAL: %s (timeout=%ss, path=%s)",
            e,
            upload_timeout_seconds,
            local_path,
        )
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


SMART_PROMO_VISUAL_WORKFLOW_TYPE = "smart_promo_visual_v1"
SMART_PROMO_PODCAST_WORKFLOW_TYPE = "podcast_v1"
SMART_PROMO_WORKFLOW_TYPE = SMART_PROMO_VISUAL_WORKFLOW_TYPE
SMART_PROMO_PIPELINE_VERSION = "2026-05-visual-v3"


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
MEDIA_WORKER_JOB_TIMEOUT_SECONDS = max(120, int(os.getenv("MEDIA_WORKER_JOB_TIMEOUT_SECONDS", "14400")))
MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS = max(
    30,
    int(os.getenv("MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS", "14400")),
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

async def detect_silence_intervals(input_path, threshold="-30dB", duration=0.5, start_time=0.0, analysis_duration=None):
    """
    Returns list of (start, end) tuples for SILENCE.
    """
    cmd = ["ffmpeg"]
    safe_start = max(0.0, float(start_time or 0.0))
    safe_duration = float(analysis_duration or 0.0)
    if safe_start > 0.0:
        cmd.extend(["-ss", str(safe_start)])
    if safe_duration > 0.0:
        cmd.extend(["-t", str(safe_duration)])
    cmd.extend([
        "-i", input_path,
        "-af", f"silencedetect=noise={threshold}:d={duration}",
        "-f", "null", "-",
    ])
    
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
        intervals.append((safe_start + s, safe_start + e))
        
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
    Accepts video_url (http/https) or local_path (direct filesystem path from upload-source).
    """
    start_time = time.time()
    video_url = request.get("video_url") or ""
    local_path = request.get("local_path") or ""
    force_fresh = bool(request.get("force_fresh"))
    scan_nonce = str(request.get("scan_nonce") or "")

    # If local_path is provided and exists, use it as the video source
    if local_path and os.path.exists(local_path):
        video_url = local_path
        logger.info(f"Using local source path for analysis: {local_path}")
    elif not video_url:
        raise HTTPException(status_code=400, detail="video_url or local_path is required")

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
        raw_input_path = await materialize_video_input(video_url, raw_input_path, keep_audio=True)
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

        for index, candidate in enumerate(ranked_candidates):
            studio_package = build_find_viral_studio_package(candidate, index)
            candidate["hookText"] = studio_package["hookText"]
            candidate["captionSuggestion"] = studio_package["captionSuggestion"]
            candidate["titleSuggestion"] = studio_package["titleSuggestion"]
            candidate["hookTreatment"] = studio_package["hookTreatment"]
            candidate["renderDefaults"] = studio_package["renderDefaults"]
            candidate["viralClipStudioPackage"] = studio_package
            candidate["creativeWhy"] = studio_package["creativeWhy"]

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
    sync_rate: Optional[float] = None
    syncRate: Optional[float] = None
    rotation_degrees: Optional[float] = 0.0
    rotationDegrees: Optional[float] = None
    name: Optional[str] = None
    size: Optional[float] = None
    duration: Optional[float] = None
    cache_key: Optional[str] = None
    sync_trim_start: Optional[float] = 0.0
    sync_trim_duration: Optional[float] = None

class ExternalCleanAudioInput(BaseModel):
    url: str
    name: Optional[str] = None
    size: Optional[float] = None
    duration: Optional[float] = None
    offset_seconds: float = 0.0
    cache_key: Optional[str] = None
    sync_trim_start: Optional[float] = 0.0
    sync_trim_duration: Optional[float] = None

class RenderExternalAudioInput(BaseModel):
    url: str
    offset_seconds: float = 0.0
    mix_mode: str = "external_only"
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
    layout_mode: str = "cut"
    layoutMode: Optional[str] = None

class MultiCamSegment(BaseModel):
    camera_id: str
    timeline_start: float = 0.0
    timeline_end: float = 0.0
    source_start: float = 0.0
    source_end: float = 0.0
    layout_mode: str = "cut"
    layoutMode: Optional[str] = None

class RenderMultiCamRequest(BaseModel):
    sources: List[MultiCamSource]
    segments: Optional[List[MultiCamSegment]] = None
    switches: Optional[List[MultiCamSwitch]] = None
    render_tier: str = "premium"
    renderTier: Optional[str] = None
    auto_switch: bool = False
    audio_based_auto_switch: bool = True
    auto_switch_interval: float = 5.0
    auto_switch_aggressiveness: str = "balanced"
    primary_audio_camera_id: Optional[str] = None
    primaryAudioCameraId: Optional[str] = None
    external_audio_url: Optional[str] = None
    external_audio_offset_seconds: float = 0.0
    external_audio_mix_mode: str = "external_only"
    external_audio_cache_key: Optional[str] = None
    externalAudio: Optional[RenderExternalAudioInput] = None
    overlap_start: float = 0.0
    overlap_duration: float = 0.0
    overlapStart: float = 0.0
    overlapDuration: float = 0.0
    timeline_start: Optional[float] = None
    timelineStart: Optional[float] = None
    output_aspect_ratio: str = "9:16"
    outputAspectRatio: Optional[str] = None
    pre_sync_clap_alignment: bool = True
    preSyncClapAlignment: Optional[bool] = None
    pre_sync_min_confidence: float = 0.55
    preSyncMinConfidence: Optional[float] = None
    burn_captions: Optional[bool] = None
    burnCaptions: Optional[bool] = None
    caption_style: str = "podcast_clean"
    captionStyle: Optional[str] = None
    brand_watermark: Optional[bool] = None
    brandWatermark: Optional[bool] = None
    watermark_text: Optional[str] = None
    watermarkText: Optional[str] = None
    generate_thumbnail: Optional[bool] = None
    generateThumbnail: Optional[bool] = None
    job_id: Optional[str] = None
    async_mode: bool = False

MULTICAM_ENFORCE_PROD_LIMITS = env_flag("MULTICAM_ENFORCE_PROD_LIMITS", default=IS_PRODUCTION_ENV)
MULTICAM_BETA_MAX_CAMERAS = max(2, int(os.getenv("MULTICAM_BETA_MAX_CAMERAS", "3") or 3))
MULTICAM_BETA_MAX_SECONDS = max(60, int(os.getenv("MULTICAM_BETA_MAX_SECONDS", "1200") or 1200))
MULTICAM_BETA_MAX_SEGMENTS = max(20, int(os.getenv("MULTICAM_BETA_MAX_SEGMENTS", "450") or 450))
MULTICAM_STRICT_SEGMENT_DURATIONS = env_flag("MULTICAM_STRICT_SEGMENT_DURATIONS", default=IS_PRODUCTION_ENV)
MULTICAM_ALLOW_QUESTIONABLE_SYNC = env_flag("MULTICAM_ALLOW_QUESTIONABLE_SYNC", default=not IS_PRODUCTION_ENV)
MULTICAM_ALLOW_SKIPPED_SYNC_NO_AUDIO = env_flag("MULTICAM_ALLOW_SKIPPED_SYNC_NO_AUDIO", default=not IS_PRODUCTION_ENV)
MULTICAM_POST_RENDER_SYNC_AUDIT = env_flag("MULTICAM_POST_RENDER_SYNC_AUDIT", default=True)
MULTICAM_STRICT_POST_RENDER_SYNC = env_flag("MULTICAM_STRICT_POST_RENDER_SYNC", default=IS_PRODUCTION_ENV)
MULTICAM_POST_RENDER_SYNC_MAX_SAMPLES = max(
    3,
    int(os.getenv("MULTICAM_POST_RENDER_SYNC_MAX_SAMPLES", "21") or 21),
)
MULTICAM_POST_RENDER_SYNC_GOOD_SECONDS = max(
    0.03,
    float(os.getenv("MULTICAM_POST_RENDER_SYNC_GOOD_SECONDS", "0.08") or 0.08),
)
MULTICAM_POST_RENDER_SYNC_UNSAFE_SECONDS = max(
    MULTICAM_POST_RENDER_SYNC_GOOD_SECONDS,
    float(os.getenv("MULTICAM_POST_RENDER_SYNC_UNSAFE_SECONDS", "0.20") or 0.20),
)
MULTICAM_POST_RENDER_SYNC_MIN_CORRELATION = clamp_float(
    float(os.getenv("MULTICAM_POST_RENDER_SYNC_MIN_CORRELATION", "0.45") or 0.45),
    0.1,
    0.95,
)
MULTICAM_POST_RENDER_SYNC_SAMPLE_SECONDS = clamp_float(
    float(os.getenv("MULTICAM_POST_RENDER_SYNC_SAMPLE_SECONDS", "8.0") or 8.0),
    2.0,
    20.0,
)
MULTICAM_BRAND_WATERMARK_DEFAULT = env_flag("MULTICAM_BRAND_WATERMARK_DEFAULT", default=True)
MULTICAM_GENERATE_THUMBNAIL_DEFAULT = env_flag("MULTICAM_GENERATE_THUMBNAIL_DEFAULT", default=True)
VIRAL_BRAND_WATERMARK_DEFAULT = env_flag("VIRAL_BRAND_WATERMARK_DEFAULT", default=True)
MULTICAM_CONTINUOUS_SYNC_ANCHORS = env_flag("MULTICAM_CONTINUOUS_SYNC_ANCHORS", default=True)
MULTICAM_CONTINUOUS_SYNC_INTERVAL_SECONDS = max(
    60.0,
    float(os.getenv("MULTICAM_CONTINUOUS_SYNC_INTERVAL_SECONDS", "300") or 300),
)
MULTICAM_CONTINUOUS_SYNC_SAMPLE_SECONDS = clamp_float(
    float(os.getenv("MULTICAM_CONTINUOUS_SYNC_SAMPLE_SECONDS", "8.0") or 8.0),
    2.0,
    20.0,
)
MULTICAM_CONTINUOUS_SYNC_MAX_SHIFT_SECONDS = clamp_float(
    float(os.getenv("MULTICAM_CONTINUOUS_SYNC_MAX_SHIFT_SECONDS", "1.0") or 1.0),
    0.1,
    5.0,
)
MULTICAM_CONTINUOUS_SYNC_MAX_ACCEPTED_RESIDUAL_SECONDS = clamp_float(
    float(os.getenv("MULTICAM_CONTINUOUS_SYNC_MAX_ACCEPTED_RESIDUAL_SECONDS", "0.50") or 0.50),
    0.05,
    2.0,
)
MULTICAM_CONTINUOUS_SYNC_MIN_CORRELATION = clamp_float(
    float(os.getenv("MULTICAM_CONTINUOUS_SYNC_MIN_CORRELATION", "0.25") or 0.25),
    0.05,
    0.95,
)
MULTICAM_BURN_CAPTIONS_DEFAULT = env_flag("MULTICAM_BURN_CAPTIONS_DEFAULT", default=True)
MULTICAM_SAFE_PODCAST_DIRECTOR = env_flag("MULTICAM_SAFE_PODCAST_DIRECTOR", default=False)
MULTICAM_AUDIO_OWNER_MIN_ACTIVITY = clamp_float(
    float(os.getenv("MULTICAM_AUDIO_OWNER_MIN_ACTIVITY", "0.20") or 0.20),
    0.05,
    0.9,
)
MULTICAM_AUDIO_OWNER_MIN_GAP = clamp_float(
    float(os.getenv("MULTICAM_AUDIO_OWNER_MIN_GAP", "0.09") or 0.09),
    0.02,
    0.5,
)
MULTICAM_REACTION_MIN_COMPANION_ACTIVITY = clamp_float(
    float(os.getenv("MULTICAM_REACTION_MIN_COMPANION_ACTIVITY", "0.16") or 0.16),
    0.0,
    0.8,
)
MULTICAM_SEGMENT_DURATION_TOLERANCE_SECONDS = max(
    0.05,
    float(os.getenv("MULTICAM_SEGMENT_DURATION_TOLERANCE_SECONDS", "0.25") or 0.25),
)

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
            "primary_bonus": 0.0,
            "switch_threshold": 0.24,
            "low_confidence_threshold": 0.14,
            "low_confidence_hold": max(16.0, safe_interval * 2.4),
            "low_confidence_proximity": 0.04,
            "min_hold_factor": 1.9,
            "min_hold_floor": 10.0,
            "min_hold_cap": 18.0,
            "min_primary_hold_seconds": 14.0,
            "decisive_audio_gap": 0.2,
            "decisive_visual_gap": 0.06,
            "opening_primary_hold_seconds": 20.0,
            "uncertain_primary_hold": 18.0,
            "uncertain_switch_gap": 0.15,
            "placeholder_penalty_weight": 0.62,
            "placeholder_source_penalty_weight": 0.38,
        },
        "dynamic": {
            "audio_bonus": 0.31,
            "continuity_bonus": 0.03,
            "primary_bonus": 0.03,
            "switch_threshold": 0.13,
            "low_confidence_threshold": 0.22,
            "low_confidence_hold": max(5.0, safe_interval * 1.0),
            "low_confidence_proximity": 0.12,
            "min_hold_factor": 1.15,
            "min_hold_floor": 4.0,
            "min_hold_cap": 8.0,
            "min_primary_hold_seconds": 5.0,
            "decisive_audio_gap": 0.15,
            "decisive_visual_gap": 0.045,
            "opening_primary_hold_seconds": 12.0,
            "uncertain_primary_hold": 7.0,
            "uncertain_switch_gap": 0.1,
            "placeholder_penalty_weight": 0.52,
            "placeholder_source_penalty_weight": 0.26,
        },
        "balanced": {
            "audio_bonus": 0.28,
            "continuity_bonus": 0.09,
            "primary_bonus": 0.0,
            "switch_threshold": 0.2,
            "low_confidence_threshold": 0.18,
            "low_confidence_hold": max(13.0, safe_interval * 2.0),
            "low_confidence_proximity": 0.08,
            "min_hold_factor": 1.65,
            "min_hold_floor": 8.0,
            "min_hold_cap": 15.0,
            "min_primary_hold_seconds": 11.0,
            "decisive_audio_gap": 0.19,
            "decisive_visual_gap": 0.055,
            "opening_primary_hold_seconds": 18.0,
            "uncertain_primary_hold": 15.0,
            "uncertain_switch_gap": 0.14,
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
        def _roi_motion(gray_frame, prev_gray_frame, roi):
            if prev_gray_frame is None or prev_gray_frame.shape != gray_frame.shape:
                return 0.0
            x1, y1, x2, y2 = roi
            h, w = gray_frame.shape[:2]
            x1 = int(clamp_float(x1, 0, max(0, w - 1)))
            x2 = int(clamp_float(x2, x1 + 1, w))
            y1 = int(clamp_float(y1, 0, max(0, h - 1)))
            y2 = int(clamp_float(y2, y1 + 1, h))
            if x2 <= x1 or y2 <= y1:
                return 0.0
            current_crop = gray_frame[y1:y2, x1:x2]
            previous_crop = prev_gray_frame[y1:y2, x1:x2]
            if current_crop.size == 0 or previous_crop.size == 0:
                return 0.0
            return clamp_float(float(np.mean(cv2.absdiff(current_crop, previous_crop))) / 28.0, 0.0, 1.0)

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
            lower_face_motion = 0.0
            upper_body_motion = 0.0
            visual_speaking_score = 0.0
            visual_speaking_confidence = 0.0
            face_area_ratio = 0.0
            if success and frame is not None:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                placeholder_penalty = estimate_multicam_placeholder_penalty(frame)
                primary_face = None
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
                        face_area_ratio = clamp_float(face_area / frame_area, 0.0, 1.0)
                        face_score = min(1.0, (face_count * 0.22) + ((face_area / frame_area) * 8.0))
                        primary_face = max(faces, key=lambda item: item[2] * item[3])

                if previous_gray is not None and previous_gray.shape == gray.shape:
                    motion_delta = cv2.absdiff(gray, previous_gray)
                    motion_score = min(1.0, float(np.mean(motion_delta)) / 28.0)
                    height, width = gray.shape[:2]
                    if primary_face is not None:
                        x, y, w, h = [int(v) for v in primary_face]
                        lower_face_motion = _roi_motion(
                            gray,
                            previous_gray,
                            (x + (w * 0.12), y + (h * 0.48), x + (w * 0.88), y + (h * 1.05)),
                        )
                        upper_body_motion = _roi_motion(
                            gray,
                            previous_gray,
                            (x - (w * 0.35), y + (h * 0.45), x + (w * 1.35), y + (h * 2.35)),
                        )
                        visual_speaking_confidence = clamp_float(0.45 + (face_score * 0.45), 0.0, 1.0)
                    else:
                        # If the face detector misses a turned/partial face, use the speaker-safe center band
                        # as a fallback instead of blindly trusting noisy camera audio.
                        lower_face_motion = _roi_motion(
                            gray,
                            previous_gray,
                            (width * 0.28, height * 0.18, width * 0.72, height * 0.68),
                        )
                        upper_body_motion = _roi_motion(
                            gray,
                            previous_gray,
                            (width * 0.18, height * 0.30, width * 0.82, height * 0.90),
                        )
                        visual_speaking_confidence = 0.28 if upper_body_motion > 0.04 else 0.12

                    visual_speaking_score = clamp_float(
                        (lower_face_motion * 0.62)
                        + (upper_body_motion * 0.26)
                        + (motion_score * 0.12),
                        0.0,
                        1.0,
                    )
                previous_gray = gray

            windows.append(
                {
                    "start_time": round(current_start, 3),
                    "end_time": round(current_end, 3),
                    "sample_time": round(midpoint, 3),
                    "face_score": round(face_score, 4),
                    "motion_score": round(motion_score, 4),
                    "lower_face_motion": round(lower_face_motion, 4),
                    "upper_body_motion": round(upper_body_motion, 4),
                    "visual_speaking_score": round(visual_speaking_score, 4),
                    "visual_speaking_confidence": round(visual_speaking_confidence, 4),
                    "face_area_ratio": round(face_area_ratio, 4),
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
        item["layout_mode"] = normalize_multicam_layout_mode(item.get("layout_mode", "cut"))
        if deduped and abs(float(deduped[-1]["start_time"]) - float(item["start_time"])) < 0.01:
            deduped[-1] = item
            continue
        if (
            deduped
            and deduped[-1].get("camera_id") == item.get("camera_id")
            and normalize_multicam_layout_mode(deduped[-1].get("layout_mode", "cut"))
            == normalize_multicam_layout_mode(item.get("layout_mode", "cut"))
        ):
            continue
        deduped.append(item)
    return deduped

def normalize_multicam_layout_mode(layout_mode):
    raw = str(layout_mode or "cut").strip().lower().replace("_", "-").replace(" ", "-")
    aliases = {
        "auto": "cut",
        "hero": "cut",
        "single": "cut",
        "single-speaker": "cut",
        "single-lens": "cut",
        "camera": "cut",
        "cut": "cut",
        "wide": "scene-grid",
        "wide-view": "scene-grid",
        "show-everyone": "scene-grid",
        "show-all": "scene-grid",
        "grid": "scene-grid",
        "scene-grid": "scene-grid",
        "scene-matrix": "scene-grid",
        "shared": "split-vertical",
        "shared-moment": "split-vertical",
        "shared-moment-split": "split-vertical",
        "dual": "split-vertical",
        "duet": "split-vertical",
        "split": "split-vertical",
        "split-vertical": "split-vertical",
        "reaction": "pip",
        "catch-reaction": "pip",
        "catch-reactions": "pip",
        "reaction-window": "pip",
        "reaction-cut": "pip",
        "pip": "pip",
        "picture-in-picture": "pip",
    }
    return aliases.get(raw, raw if raw in {"scene-grid", "split-vertical", "pip", "cut"} else "cut")

def get_model_layout_mode(item, fallback="cut"):
    return normalize_multicam_layout_mode(
        getattr(item, "layout_mode", None) or getattr(item, "layoutMode", None) or fallback
    )

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

            layout_reason = str(current[index].get("layout_reason", "") or "")
            if (
                current[index].get("audio_decision_reliable")
                and normalize_multicam_layout_mode(current[index].get("layout_mode", "cut")) == "cut"
                and layout_reason in {"clear_audio_owner", "dominant_speaker_cut", "speaker_owned_cut"}
            ):
                # Do not smooth away a short but high-confidence speaker handoff.
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
                current[index]["layout_mode"] = normalize_multicam_layout_mode(previous_item.get("layout_mode", "cut"))
                current[index]["layout_reason"] = previous_item.get("layout_reason", "")
                current[index]["secondary_camera_id"] = previous_item.get("secondary_camera_id")
                current[index]["layout_confidence"] = previous_item.get("layout_confidence", 0.0)
                current[index]["score"] = max(current_score, previous_score)
                for metadata_key in (
                    "audio_leader_camera_id",
                    "raw_audio_leader_camera_id",
                    "audio_leader_activity",
                    "audio_second_activity",
                    "audio_leader_gap",
                    "audio_decision_reliable",
                    "audio_decision_reason",
                    "ranked_sources",
                ):
                    current[index][metadata_key] = previous_item.get(metadata_key)
            else:
                current.pop(index)

            current = dedupe_multicam_switches(current)
            changed = True
            break

    return current

def cap_multicam_auto_layout_accents(switches, overlap_duration, max_accent_seconds=4.0):
    """
    Keep automatic accent layouts as accents.
    If the active speaker stays the same, release PiP/grid/split back to a clean cut
    instead of letting an overlay layout stretch across a long speaking run.
    """
    safe_duration = max(0.0, float(overlap_duration or 0.0))
    safe_cap = max(1.0, float(max_accent_seconds or 4.0))
    min_release_seconds = max(2.0, safe_cap * 0.5)
    ordered = dedupe_multicam_switches(list(switches))
    capped = []

    for index, item in enumerate(ordered):
        capped.append(item)
        layout_mode = normalize_multicam_layout_mode(item.get("layout_mode", "cut"))
        if layout_mode in {"cut", "pip"}:
            # PiP is the permanent reaction safety net on single-speaker cuts.
            # Do not "release" it back to a plain cut, because that creates
            # nervous layout churn and removes the other speaker.
            continue
        layout_reason = str(item.get("layout_reason", "") or "")
        if layout_reason in {"uncertain_speaker_coverage", "safe_shared_coverage", "shared_reaction_accent", "shared_moment_safety"}:
            # These are safety coverage layouts, not decorative overlays. Releasing
            # them back to a cut can strand the viewer on a guessed inactive camera.
            continue
        start_time = float(item.get("start_time", 0.0))
        next_start = (
            float(ordered[index + 1].get("start_time", safe_duration))
            if index + 1 < len(ordered)
            else safe_duration
        )
        release_time = round(start_time + safe_cap, 3)
        if release_time >= next_start - 0.01 or release_time >= safe_duration - 0.01:
            continue
        if next_start - release_time < min_release_seconds:
            continue

        release_item = dict(item)
        release_item["start_time"] = release_time
        release_item["layout_mode"] = "cut"
        release_item["layout_reason"] = "accent_release"
        release_item["secondary_camera_id"] = None
        release_item["layout_confidence"] = 0.0
        capped.append(release_item)

    return dedupe_multicam_switches(capped)

def is_time_in_silence(target_time, intervals):
    safe_time = float(target_time or 0.0)
    for start_time, end_time in intervals or []:
        if safe_time >= float(start_time) and safe_time < float(end_time):
            return True
    return False

def choose_multicam_attention_layout(primary_camera_id, ranked_sources, source_count=0):
    """
    Pick an accent layout without stealing ownership from the active speaker.
    The active speaker remains the first/primary source; companion cameras only
    earn screen time for shared energy or visible/listenable reactions.
    """
    if not primary_camera_id or int(source_count or 0) < 2 or not ranked_sources:
        return {
            "layout_mode": "cut",
            "reason": "single_owner",
            "secondary_camera_id": None,
            "confidence": 0.0,
        }

    primary = next(
        (item for item in ranked_sources if item.get("camera_id") == primary_camera_id),
        None,
    )
    companions = [
        item for item in ranked_sources
        if item.get("camera_id") and item.get("camera_id") != primary_camera_id
    ]
    if not primary or not companions:
        return {
            "layout_mode": "cut",
            "reason": "no_companion",
            "secondary_camera_id": None,
            "confidence": 0.0,
        }

    companion = max(
        companions,
        key=lambda item: (
            (float(item.get("audio_activity", 0.0)) * 0.56)
            + (float(item.get("visual_speaking_score", 0.0)) * 0.46)
            + (float(item.get("visual_score", 0.0)) * 0.18)
            + (float(item.get("onset_lift", 0.0)) * 0.1)
            - (float(item.get("source_placeholder_penalty", 0.0)) * 0.28)
        ),
    )
    primary_activity = float(primary.get("audio_activity", 0.0))
    companion_activity = float(companion.get("audio_activity", 0.0))
    primary_visual_speaking = float(primary.get("visual_speaking_score", 0.0))
    companion_visual_speaking = float(companion.get("visual_speaking_score", 0.0))
    companion_visual = float(companion.get("visual_score", 0.0))
    companion_placeholder = float(companion.get("source_placeholder_penalty", 0.0))
    audio_gap = primary_activity - companion_activity
    visual_speaking_gap = primary_visual_speaking - companion_visual_speaking
    source_total = int(source_count or 0)
    shared_confidence = clamp_float(
        min(primary_activity, companion_activity) + max(0.0, 0.18 - abs(audio_gap)),
        0.0,
        1.0,
    )
    reaction_confidence = clamp_float(
        (primary_activity * 0.42)
        + (companion_activity * 0.28)
        + (companion_visual * 0.22)
        + (float(companion.get("onset_lift", 0.0)) * 0.08)
        - (companion_placeholder * 0.18),
        0.0,
        1.0,
    )
    speaker_ownership_confidence = clamp_float(
        max(
            ((primary_activity - companion_activity) + 0.04) / 0.26,
            ((primary_visual_speaking - companion_visual_speaking) + 0.025) / 0.10,
        ),
        0.0,
        1.0,
    )
    clear_speaker_owner = bool(
        (
            primary_visual_speaking >= 0.10
            and visual_speaking_gap >= 0.025
        )
        or (
            primary_activity >= MULTICAM_AUDIO_OWNER_MIN_ACTIVITY
            and audio_gap >= MULTICAM_AUDIO_OWNER_MIN_GAP
            and companion_activity <= max(0.38, primary_activity - 0.065)
            and primary_visual_speaking >= max(0.035, companion_visual_speaking - 0.025)
        )
    )

    companion_signal = max(companion_activity, companion_visual_speaking, companion_visual * 0.65)

    if (
        clear_speaker_owner
        and source_total == 2
        and companion_signal >= 0.18
        and speaker_ownership_confidence < 0.72
    ):
        return {
            "layout_mode": "pip",
            "reason": "reaction_safety_net",
            "secondary_camera_id": companion.get("camera_id"),
            "confidence": round(max(reaction_confidence, companion_signal), 4),
        }

    if clear_speaker_owner:
        return {
            "layout_mode": "cut",
            "reason": "dominant_speaker_cut",
            "secondary_camera_id": None,
            "confidence": round(max(speaker_ownership_confidence, primary_activity), 4),
        }

    if (
        source_total >= 2
        and primary_activity >= 0.3
        and companion_activity >= max(0.2, MULTICAM_REACTION_MIN_COMPANION_ACTIVITY)
        and abs(audio_gap) <= 0.09
        and shared_confidence >= 0.4
        and max(primary_visual_speaking, companion_visual_speaking) >= 0.035
    ):
        return {
            "layout_mode": "split-vertical",
            "reason": "shared_reaction_accent",
            "secondary_camera_id": companion.get("camera_id"),
            "confidence": round(max(shared_confidence, reaction_confidence), 4),
        }

    if (
        primary_activity >= 0.46
        and companion_activity >= 0.42
        and abs(audio_gap) <= 0.08
        and shared_confidence >= 0.56
    ):
        return {
            "layout_mode": "split-vertical",
            "reason": "shared_reaction_accent",
            "secondary_camera_id": companion.get("camera_id"),
            "confidence": round(shared_confidence, 4),
        }

    if (
        source_total >= 2
        and primary_activity >= 0.22
        and companion_activity >= 0.2
        and abs(audio_gap) <= 0.075
        and shared_confidence >= 0.35
    ):
        return {
            "layout_mode": "split-vertical" if source_total == 2 else "scene-grid",
            "reason": "uncertain_speaker_coverage",
            "secondary_camera_id": companion.get("camera_id"),
            "confidence": round(max(shared_confidence, reaction_confidence), 4),
        }

    if (
        primary_activity >= 0.3
        and audio_gap >= 0.055
        and audio_gap <= 0.14
        and companion_placeholder <= 0.45
        and (
            companion_activity >= 0.18
            or companion_visual >= 0.2
            or float(companion.get("onset_lift", 0.0)) >= 0.08
        )
        and reaction_confidence >= 0.24
    ):
        return {
            "layout_mode": "pip",
            "reason": "reaction_accent",
            "secondary_camera_id": companion.get("camera_id"),
            "confidence": round(reaction_confidence, 4),
        }

    if (
        source_total >= 3
        and primary_activity >= 0.28
        and len([item for item in ranked_sources if float(item.get("audio_activity", 0.0)) >= 0.2]) >= 3
    ):
        return {
            "layout_mode": "scene-grid",
            "reason": "room_energy",
            "secondary_camera_id": companion.get("camera_id"),
            "confidence": round(shared_confidence, 4),
        }

    earned_shared_coverage = bool(
        MULTICAM_SAFE_PODCAST_DIRECTOR
        and source_total >= 2
        and companion_signal >= 0.18
        and primary_activity >= 0.18
        and companion_activity >= 0.16
        and shared_confidence >= 0.32
    )
    return {
        "layout_mode": ("split-vertical" if source_total == 2 else "scene-grid") if earned_shared_coverage else "cut",
        "reason": "safe_shared_coverage" if earned_shared_coverage else (
            "dominant_speaker_cut" if speaker_ownership_confidence >= 0.58 else "speaker_owned_cut"
        ),
        "secondary_camera_id": companion.get("camera_id") if earned_shared_coverage else None,
        "confidence": round(max(shared_confidence, reaction_confidence, speaker_ownership_confidence), 4),
    }

def normalize_multicam_switches(request, prepared_sources, overlap_duration):
    safe_duration = max(0.0, float(overlap_duration or 0.0))
    source_ids = [source["id"] for source in prepared_sources]
    source_map = {source["id"]: source for source in prepared_sources}
    default_camera_id = request.primary_audio_camera_id or (source_ids[0] if source_ids else None)

    if not default_camera_id:
        return []

    aggressiveness = normalize_multicam_aggressiveness(request.auto_switch_aggressiveness)
    requested_interval = clamp_float(request.auto_switch_interval, 1.0, 10.0)
    interval_floor = {
        "steady": 5.0,
        "balanced": 4.0,
        "dynamic": 2.5,
    }.get(aggressiveness, 4.0)
    interval = max(requested_interval, interval_floor)
    tuning = get_multicam_switch_tuning(aggressiveness, interval)
    switches = []

    if request.auto_switch:
        current_time = 0.0
        current_camera_id = None
        opening_camera_id = None
        source_cursor = 0
        last_switch_time = 0.0
        min_layout_hold_seconds = max(tuning["min_primary_hold_seconds"], interval * 2.5)
        opening_primary_hold_seconds = max(
            0.0,
            float(os.getenv(
                "MULTICAM_OPENING_PRIMARY_HOLD_SECONDS",
                str(tuning.get("opening_primary_hold_seconds", 18.0)),
            ) or tuning.get("opening_primary_hold_seconds", 18.0)),
        )

        while current_time < safe_duration - 0.01:
            decision_context = {}
            audio_leader = None
            audio_decision_reliable = False
            audio_decision_reason = ""
            if any(source.get("window_scores") for source in prepared_sources):
                ranked_sources = []
                raw_audio_leader = None
                audio_leader_activity = 0.0
                audio_second_activity = 0.0
                audio_leader_gap = 0.0
                visual_leader = None
                visual_leader_score = 0.0
                visual_second_score = 0.0
                visual_leader_gap = 0.0
                audio_decision_reason = "no_audio_scores"
                for source in prepared_sources:
                    relative_time = get_source_start_for_timeline(
                        source,
                        float(request.overlap_start or 0.0),
                        current_time,
                    )
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
                    raw_visual_speaking_score = float(slot.get("visual_speaking_score", 0.0))
                    visual_speaking_confidence = float(slot.get("visual_speaking_confidence", 0.0))
                    placeholder_penalty = float(slot.get("placeholder_penalty", 0.0))
                    source_placeholder_penalty = float(source.get("placeholder_score", 0.0))
                    visual_score = max(
                        0.0,
                        raw_visual_score
                        - (placeholder_penalty * tuning["placeholder_penalty_weight"])
                        - (source_placeholder_penalty * tuning["placeholder_source_penalty_weight"]),
                    )
                    timeline_audio_windows = source.get("timeline_audio_activity_windows") or []
                    if timeline_audio_windows:
                        current_audio_activity = get_audio_activity_score_near_source_time(
                            timeline_audio_windows,
                            current_time,
                            window_seconds=1.1,
                        )
                        upcoming_audio_activity = get_audio_activity_score_near_source_time(
                            timeline_audio_windows,
                            current_time + 0.45,
                            window_seconds=0.8,
                        )
                    else:
                        current_audio_activity = get_audio_activity_score_near_source_time(
                            source.get("audio_activity_windows") or [],
                            relative_time,
                            window_seconds=1.1,
                        )
                        upcoming_audio_activity = get_audio_activity_score_near_source_time(
                            source.get("audio_activity_windows") or [],
                            relative_time + 0.45,
                            window_seconds=0.8,
                        )
                    audio_activity = max(current_audio_activity, upcoming_audio_activity * 0.92)
                    speaking = (
                        audio_activity >= 0.12
                        if timeline_audio_windows
                        else source["has_audio"] and not is_time_in_silence(
                            relative_time, source.get("silence_intervals")
                        )
                    )
                    continuity_bonus = tuning["continuity_bonus"] if source["id"] == current_camera_id else 0.0
                    primary_bonus = tuning["primary_bonus"] if source["id"] == request.primary_audio_camera_id else 0.0

                    ranked_sources.append(
                        {
                            "camera_id": source["id"],
                            "score": 0.0,
                            "visual_score": visual_score,
                            "raw_visual_score": raw_visual_score,
                            "visual_speaking_score": max(0.0, raw_visual_speaking_score - (placeholder_penalty * 0.18)),
                            "visual_speaking_confidence": visual_speaking_confidence,
                            "lower_face_motion": float(slot.get("lower_face_motion", 0.0)),
                            "upper_body_motion": float(slot.get("upper_body_motion", 0.0)),
                            "placeholder_penalty": placeholder_penalty,
                            "source_placeholder_penalty": source_placeholder_penalty,
                            "speaking": speaking,
                            "audio_activity": audio_activity,
                            "current_audio_activity": current_audio_activity,
                            "upcoming_audio_activity": upcoming_audio_activity,
                            "onset_lift": max(0.0, upcoming_audio_activity - current_audio_activity),
                            "continuity_bonus": continuity_bonus,
                            "primary_bonus": primary_bonus,
                        }
                    )

                if request.audio_based_auto_switch and ranked_sources:
                    ordered_by_audio = sorted(
                        ranked_sources,
                        key=lambda item: float(item.get("audio_activity", 0.0)),
                        reverse=True,
                    )
                    ordered_by_visual_speaking = sorted(
                        ranked_sources,
                        key=lambda item: (
                            float(item.get("visual_speaking_score", 0.0))
                            + (float(item.get("visual_speaking_confidence", 0.0)) * 0.035)
                            + (float(item.get("onset_lift", 0.0)) * 0.12)
                        ),
                        reverse=True,
                    )
                    raw_audio_leader = ordered_by_audio[0]
                    audio_leader_activity = float(raw_audio_leader.get("audio_activity", 0.0))
                    audio_second_activity = float(ordered_by_audio[1].get("audio_activity", 0.0)) if len(ordered_by_audio) > 1 else 0.0
                    audio_leader_gap = audio_leader_activity - audio_second_activity
                    visual_leader = ordered_by_visual_speaking[0]
                    visual_leader_score = float(visual_leader.get("visual_speaking_score", 0.0))
                    visual_second_score = float(ordered_by_visual_speaking[1].get("visual_speaking_score", 0.0)) if len(ordered_by_visual_speaking) > 1 else 0.0
                    visual_leader_gap = visual_leader_score - visual_second_score
                    audio_visual_agree = bool(
                        visual_leader
                        and raw_audio_leader
                        and visual_leader.get("camera_id") == raw_audio_leader.get("camera_id")
                    )
                    strong_isolated_audio_owner = bool(
                        any(source.get("audio_activity_source") == "external_isolated_channel" for source in prepared_sources)
                        and audio_leader_activity >= 0.34
                        and audio_leader_gap >= 0.16
                    )
                    if strong_isolated_audio_owner:
                        # Isolated Behringer channels are more trustworthy than
                        # visual mouth/motion heuristics. When one mic clearly
                        # owns the moment, do not let visual noise create a
                        # favorite-camera cut.
                        audio_leader = raw_audio_leader
                        audio_decision_reliable = True
                        audio_decision_reason = "strong_isolated_audio_owner"
                    elif (
                        visual_leader_score >= 0.105
                        and visual_leader_gap >= 0.028
                        and float(visual_leader.get("visual_speaking_confidence", 0.0)) >= 0.16
                    ):
                        audio_leader = visual_leader
                        audio_decision_reliable = True
                        audio_decision_reason = "visual_speaker_owner"
                    elif (
                        audio_visual_agree
                        and audio_leader_activity >= 0.145
                        and audio_leader_gap >= 0.045
                        and visual_leader_score >= 0.055
                    ):
                        audio_leader = raw_audio_leader
                        audio_decision_reliable = True
                        audio_decision_reason = "audio_visual_agree"
                    elif (
                        audio_leader_activity >= 0.24
                        and audio_leader_gap >= 0.11
                        and float(raw_audio_leader.get("onset_lift", 0.0)) >= 0.045
                        and visual_leader_score < 0.11
                    ):
                        audio_leader = raw_audio_leader
                        audio_decision_reliable = True
                        audio_decision_reason = "question_onset_audio_owner"
                    elif (
                        audio_leader_activity >= 0.34
                        and audio_leader_gap >= 0.16
                        and visual_leader_score < 0.055
                    ):
                        audio_leader = raw_audio_leader
                        audio_decision_reliable = True
                        audio_decision_reason = "strong_audio_owner_no_visual"
                    elif audio_leader_activity < 0.14:
                        audio_decision_reason = "low_audio_activity"
                    else:
                        audio_decision_reason = "close_audio_gap"
                    for item in ranked_sources:
                        conversation_score = get_conversation_audio_score(
                            item.get("audio_activity", 0.0),
                            audio_leader_activity,
                            audio_second_activity,
                        )
                        # For podcasts, the mic/camera that is winning the audio should own the cut.
                        # Camera audio can bleed badly, so visible face/body speech owns the cut when present.
                        item["conversation_audio_score"] = conversation_score
                        visual_speech_score = float(item.get("visual_speaking_score", 0.0))
                        visual_speech_confidence = float(item.get("visual_speaking_confidence", 0.0))
                        owner_bonus = 0.0
                        if audio_decision_reliable and audio_leader and item.get("camera_id") == audio_leader.get("camera_id"):
                            owner_bonus = 0.18
                        item["score"] = (
                            (visual_speech_score * 0.58)
                            + (conversation_score * 0.34)
                            + (visual_speech_confidence * 0.06)
                            + (float(item.get("onset_lift", 0.0)) * 0.10)
                            + (float(item.get("visual_score", 0.0)) * 0.03)
                            + owner_bonus
                            + float(item.get("continuity_bonus", 0.0))
                        )
                else:
                    for item in ranked_sources:
                        audio_bonus = tuning["audio_bonus"] if item.get("speaking") else 0.0
                        item["score"] = (
                            float(item.get("visual_score", 0.0))
                            + audio_bonus
                            + float(item.get("continuity_bonus", 0.0))
                            + float(item.get("primary_bonus", 0.0))
                        )

                ranked_sources.sort(key=lambda item: item["score"], reverse=True)
                best_choice = ranked_sources[0]["camera_id"] if ranked_sources else current_camera_id
                current_choice = next(
                    (item for item in ranked_sources if item["camera_id"] == current_camera_id),
                    None,
                )
                low_confidence_mode = bool(ranked_sources) and max(
                    item["visual_score"] + (0.22 * float(item.get("audio_activity", 0.0))) for item in ranked_sources
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
                    if audio_decision_reliable and audio_leader and audio_leader.get("camera_id"):
                        # A clear mic owner should win immediately. Reaction shots are
                        # accents; they must not trap the edit on the non-active camera.
                        next_camera_id = audio_leader["camera_id"]
                    elif (
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
                if (
                    request.audio_based_auto_switch
                    and ranked_sources
                    and not audio_decision_reliable
                    and raw_audio_leader
                    and raw_audio_leader.get("camera_id")
                ):
                    # Uncertain audio should widen coverage, not whip the primary
                    # camera around. Hold the current primary until the raw leader is
                    # sustained enough to earn a handoff; Shared Moment/PiP protects
                    # the viewer while confidence is still low.
                    raw_leader_id = raw_audio_leader["camera_id"]
                    raw_leader_can_take_over = bool(
                        not current_camera_id
                        or raw_leader_id == current_camera_id
                        or (
                            time_since_last_switch >= tuning["uncertain_primary_hold"]
                            and audio_leader_gap >= tuning["uncertain_switch_gap"]
                        )
                    )
                    if raw_leader_can_take_over:
                        next_camera_id = raw_leader_id
                        winning_score = float(raw_audio_leader.get("score", winning_score))
                    else:
                        next_camera_id = current_camera_id
                        if current_choice:
                            winning_score = float(current_choice.get("score", winning_score))

                if current_camera_id and next_camera_id and next_camera_id != current_camera_id:
                    decisive_handoff = bool(
                        audio_decision_reliable
                        and audio_leader
                        and audio_leader.get("camera_id") == next_camera_id
                        and (
                            audio_leader_gap >= tuning["decisive_audio_gap"]
                            or (
                                visual_leader
                                and visual_leader.get("camera_id") == next_camera_id
                                and visual_leader_score >= 0.12
                                and visual_leader_gap >= tuning["decisive_visual_gap"]
                            )
                        )
                    )
                    opening_handoff_is_unmistakable = bool(
                        decisive_handoff
                        and audio_leader_activity >= 0.92
                        and audio_leader_gap >= 0.72
                        and (
                            visual_leader
                            and visual_leader.get("camera_id") == next_camera_id
                            and visual_leader_score >= 0.18
                            and visual_leader_gap >= 0.34
                        )
                    )
                    if (
                        opening_camera_id
                        and current_camera_id == opening_camera_id
                        and current_time < opening_primary_hold_seconds
                        and not opening_handoff_is_unmistakable
                    ):
                        next_camera_id = opening_camera_id
                        if current_choice:
                            winning_score = float(current_choice.get("score", winning_score))
                    if (
                        time_since_last_switch < tuning["min_primary_hold_seconds"]
                        and not decisive_handoff
                    ):
                        next_camera_id = current_camera_id
                        if current_choice:
                            winning_score = float(current_choice.get("score", winning_score))

                if True:
                    if (
                        audio_decision_reliable
                        and audio_leader
                        and audio_leader.get("camera_id") == next_camera_id
                        and (
                            audio_leader_gap >= 0.12
                            or audio_decision_reason in {"visual_speaker_owner", "audio_visual_agree"}
                        )
                    ):
                        companion = next(
                            (item for item in ranked_sources if item.get("camera_id") != next_camera_id),
                            None,
                        )
                        companion_audio = float(companion.get("audio_activity", 0.0)) if companion else 0.0
                        companion_visual = float(companion.get("visual_score", 0.0)) if companion else 0.0
                        companion_visual_speaking = float(companion.get("visual_speaking_score", 0.0)) if companion else 0.0
                        companion_signal = max(
                            companion_audio,
                            companion_visual_speaking * 1.25,
                            companion_visual * 0.6,
                        )
                        coverage_slot = int(current_time / max(interval, 1.0))
                        owner_certainty = clamp_float(
                            max(
                                audio_leader_gap / 0.18 if audio_leader_gap > 0 else 0.0,
                                visual_leader_gap / 0.045 if visual_leader_gap > 0 else 0.0,
                            ),
                            0.0,
                            1.0,
                        )
                        visual_disagreement = bool(
                            visual_leader
                            and visual_leader.get("camera_id") != next_camera_id
                            and visual_leader_score >= 0.075
                            and visual_leader_gap >= 0.024
                        )
                        shared_safety_due = bool(
                            len(prepared_sources) == 2
                            and companion
                            and companion_signal >= 0.18
                            and (
                                audio_leader_gap < 0.075
                                or (visual_disagreement and owner_certainty < 0.82)
                            )
                        )
                        reaction_safety_due = bool(
                            companion
                            and companion_signal >= 0.20
                            and time_since_last_switch >= max(28.0, interval * 6.0)
                        )
                        if shared_safety_due:
                            attention_layout = {
                                "layout_mode": "split-vertical",
                                "reason": "shared_moment_safety",
                                "secondary_camera_id": companion.get("camera_id"),
                                "confidence": round(clamp_float(max(companion_signal, 1.0 - owner_certainty), 0.0, 1.0), 4),
                            }
                        elif reaction_safety_due:
                            attention_layout = {
                                "layout_mode": "pip",
                                "reason": "reaction_safety_net",
                                "secondary_camera_id": companion.get("camera_id"),
                                "confidence": round(clamp_float(max(companion_signal, 0.25), 0.0, 1.0), 4),
                            }
                        else:
                            attention_layout = {
                                "layout_mode": "cut",
                                "reason": audio_decision_reason if audio_decision_reason else "dominant_speaker_cut",
                                "secondary_camera_id": None,
                                "confidence": round(clamp_float(max(audio_leader_activity, visual_leader_score), 0.0, 1.0), 4),
                            }
                    else:
                        attention_layout = choose_multicam_attention_layout(
                            next_camera_id,
                            ranked_sources,
                            len(prepared_sources),
                        )
                decision_context = {
                    "audio_leader_camera_id": audio_leader.get("camera_id") if audio_leader else None,
                    "raw_audio_leader_camera_id": raw_audio_leader.get("camera_id") if raw_audio_leader else None,
                    "audio_leader_activity": round(audio_leader_activity, 4),
                    "audio_second_activity": round(audio_second_activity, 4),
                    "audio_leader_gap": round(audio_leader_gap, 4),
                    "visual_leader_camera_id": visual_leader.get("camera_id") if visual_leader else None,
                    "visual_leader_score": round(visual_leader_score, 4),
                    "visual_second_score": round(visual_second_score, 4),
                    "visual_leader_gap": round(visual_leader_gap, 4),
                    "audio_decision_reliable": audio_decision_reliable,
                    "audio_decision_reason": audio_decision_reason,
                    "ranked_sources": [
                        {
                            "camera_id": item.get("camera_id"),
                            "score": round(float(item.get("score", 0.0)), 4),
                            "audio_activity": round(float(item.get("audio_activity", 0.0)), 4),
                            "current_audio_activity": round(float(item.get("current_audio_activity", 0.0)), 4),
                            "upcoming_audio_activity": round(float(item.get("upcoming_audio_activity", 0.0)), 4),
                            "visual_score": round(float(item.get("visual_score", 0.0)), 4),
                            "visual_speaking_score": round(float(item.get("visual_speaking_score", 0.0)), 4),
                            "visual_speaking_confidence": round(float(item.get("visual_speaking_confidence", 0.0)), 4),
                        }
                        for item in ranked_sources[:4]
                    ],
                }
            else:
                next_camera_id = source_ids[source_cursor % len(source_ids)]
                source_cursor += 1
                winning_score = 0.0
                attention_layout = {
                    "layout_mode": "cut",
                    "reason": "interval_cycle",
                    "secondary_camera_id": None,
                    "confidence": 0.0,
                }

            next_layout_mode = normalize_multicam_layout_mode(attention_layout.get("layout_mode", "cut"))
            if (
                switches
                and switches[-1]["camera_id"] == next_camera_id
                and normalize_multicam_layout_mode(switches[-1].get("layout_mode", "cut")) != next_layout_mode
                and current_time - float(switches[-1].get("start_time", 0.0)) < min_layout_hold_seconds
            ):
                current_camera_id = next_camera_id
                current_time += interval
                continue
            switch_start_time = current_time
            if (
                switches
                and switches[-1].get("camera_id") != next_camera_id
                and audio_decision_reliable
                and audio_leader
                and audio_leader.get("camera_id") == next_camera_id
                and audio_decision_reason in {
                    "strong_isolated_audio_owner",
                    "audio_visual_agree",
                    "question_onset_audio_owner",
                    "strong_audio_owner_no_visual",
                }
                and any(source.get("audio_activity_source") == "external_isolated_channel" for source in prepared_sources)
            ):
                previous_switch_start = float(switches[-1].get("start_time", last_switch_time or 0.0))
                minimum_backdated_start = previous_switch_start + max(4.0, min(float(interval or 5.0), 6.0))
                switch_start_time = estimate_multicam_isolated_handoff_start(
                    prepared_sources,
                    next_camera_id,
                    switches[-1].get("camera_id"),
                    current_time,
                    interval,
                    minimum_start_time=minimum_backdated_start,
                )
            if (
                not switches
                or switches[-1]["camera_id"] != next_camera_id
                or normalize_multicam_layout_mode(switches[-1].get("layout_mode", "cut")) != next_layout_mode
            ):
                if opening_camera_id is None and next_camera_id:
                    opening_camera_id = next_camera_id
                switches.append({
                    "camera_id": next_camera_id,
                    "start_time": round(switch_start_time, 3),
                    "score": round(winning_score, 4),
                    "layout_mode": next_layout_mode,
                    "layout_reason": attention_layout.get("reason", "speaker_owned_cut"),
                    "secondary_camera_id": attention_layout.get("secondary_camera_id"),
                    "layout_confidence": attention_layout.get("confidence", 0.0),
                    **decision_context,
                })
                logger.info(
                    "AUTO_DIRECTOR_DECISION t=%.3fs primary=%s layout=%s reason=%s "
                    "secondary=%s score=%.4f layout_confidence=%.3f placed_at=%.3fs",
                    current_time,
                    next_camera_id,
                    next_layout_mode,
                    attention_layout.get("reason", "speaker_owned_cut"),
                    attention_layout.get("secondary_camera_id"),
                    winning_score,
                    float(attention_layout.get("confidence", 0.0) or 0.0),
                    switch_start_time,
                )
                last_switch_time = switch_start_time
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
                "layout_mode": get_model_layout_mode(switch),
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
	            aggressiveness,
        )
        deduped = cap_multicam_auto_layout_accents(deduped, safe_duration, max_accent_seconds=4.0)

    return [
        {
            "camera_id": item["camera_id"],
            "start_time": round(float(item["start_time"]), 3),
            "layout_mode": normalize_multicam_layout_mode(item.get("layout_mode", "cut") or "cut"),
            "layout_reason": item.get("layout_reason", ""),
            "secondary_camera_id": item.get("secondary_camera_id"),
            "layout_confidence": item.get("layout_confidence", 0.0),
            "score": item.get("score", 0.0),
            "audio_leader_camera_id": item.get("audio_leader_camera_id"),
            "raw_audio_leader_camera_id": item.get("raw_audio_leader_camera_id"),
            "audio_leader_activity": item.get("audio_leader_activity"),
            "audio_second_activity": item.get("audio_second_activity"),
            "audio_leader_gap": item.get("audio_leader_gap"),
            "audio_decision_reliable": item.get("audio_decision_reliable"),
            "audio_decision_reason": item.get("audio_decision_reason"),
            "ranked_sources": item.get("ranked_sources"),
        }
        for item in deduped
    ]

def build_multicam_segments_from_switches(request, prepared_sources, overlap_start, overlap_duration):
    switches = normalize_multicam_switches(request, prepared_sources, overlap_duration)
    if not switches:
        return []

    source_map = {source["id"]: source for source in prepared_sources}
    channel_mapped_sources = sorted(
        [
            source
            for source in prepared_sources
            if source.get("id") and source.get("audio_activity_channel_index") is not None
        ],
        key=lambda source: int(source.get("audio_activity_channel_index") or 0),
    )
    director_channel_camera_ids = [source.get("id") for source in channel_mapped_sources if source.get("id")]
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

        source_start, source_end, _raw_source_duration = get_source_range_for_timeline(
            source,
            overlap_start,
            timeline_start,
            segment_duration,
        )
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
                "layout_mode": normalize_multicam_layout_mode(switch.get("layout_mode", "cut") or "cut"),
                "layout_reason": switch.get("layout_reason", ""),
                "secondary_camera_id": switch.get("secondary_camera_id"),
                "layout_confidence": switch.get("layout_confidence", 0.0),
                "director_score": switch.get("score", 0.0),
                "audio_leader_camera_id": switch.get("audio_leader_camera_id"),
                "raw_audio_leader_camera_id": switch.get("raw_audio_leader_camera_id"),
                "audio_leader_activity": switch.get("audio_leader_activity"),
                "audio_second_activity": switch.get("audio_second_activity"),
                "audio_leader_gap": switch.get("audio_leader_gap"),
                "audio_decision_reliable": switch.get("audio_decision_reliable"),
                "audio_decision_reason": switch.get("audio_decision_reason"),
                "ranked_sources": switch.get("ranked_sources"),
                "director_channel_camera_ids": director_channel_camera_ids,
            }
        )

    return enforce_reaction_overlay_on_multicam_segments(segments, prepared_sources)


def pick_multicam_reaction_secondary_camera_id(
    primary_camera_id,
    prepared_sources,
    ranked_sources=None,
    preferred_secondary_camera_id=None,
):
    primary_id = str(primary_camera_id or "")
    preferred_id = str(preferred_secondary_camera_id or "")
    valid_source_ids = {
        str(source.get("id") or "")
        for source in (prepared_sources or [])
        if source.get("id")
    }
    if preferred_id and preferred_id != primary_id and preferred_id in valid_source_ids:
        return preferred_id

    for candidate in ranked_sources or []:
        camera_id = str(candidate.get("camera_id") or "")
        if camera_id and camera_id != primary_id and camera_id in valid_source_ids:
            return camera_id

    for source in prepared_sources or []:
        camera_id = str(source.get("id") or "")
        if camera_id and camera_id != primary_id:
            return camera_id
    return None


def enforce_reaction_overlay_on_multicam_segments(segments, prepared_sources):
    if len(prepared_sources or []) < 2:
        return list(segments or [])

    enforced = []
    for segment in segments or []:
        updated = dict(segment)
        layout_mode = normalize_multicam_layout_mode(updated.get("layout_mode", "cut") or "cut")
        if layout_mode == "cut":
            secondary_camera_id = pick_multicam_reaction_secondary_camera_id(
                updated.get("camera_id"),
                prepared_sources,
                ranked_sources=updated.get("ranked_sources"),
                preferred_secondary_camera_id=updated.get("secondary_camera_id"),
            )
            if secondary_camera_id:
                prior_reason = str(updated.get("layout_reason", "") or "")
                updated["layout_mode"] = "pip"
                updated["secondary_camera_id"] = secondary_camera_id
                updated["layout_reason"] = (
                    f"reaction_attached_to_cut:{prior_reason}"
                    if prior_reason
                    else "reaction_attached_to_cut"
                )
                updated["layout_confidence"] = round(
                    max(0.25, float(updated.get("layout_confidence", 0.0) or 0.0)),
                    4,
                )
        enforced.append(updated)
    return enforced

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

        requested_timeline_start = max(0.0, float(segment.timeline_start or 0.0))
        timeline_start = max(requested_timeline_start, timeline_cursor)
        timeline_end = min(safe_duration, timeline_start + requested_duration) if safe_duration > 0.0 else timeline_start + requested_duration
        actual_duration = timeline_end - timeline_start
        if actual_duration <= 0.02:
            continue

        sync_rate = max(0.001, float(source.get("sync_rate") or 1.0))
        if source_has_active_continuous_sync_map(source):
            source_start, source_end, actual_source_duration = get_source_range_for_timeline(
                source,
                overlap_start,
                timeline_start,
                actual_duration,
            )
            source_start = clamp_float(source_start, 0.0, max(0.0, float(source["duration"]) - 0.02))
            source_end = clamp_float(source_end, source_start + 0.02, float(source["duration"]))
            actual_source_duration = source_end - source_start
        else:
            requested_source_duration = max(
                0.0,
                float(segment.source_end or 0.0) - float(segment.source_start or 0.0),
            )
            requested_source_duration = requested_source_duration or (actual_duration * sync_rate)
            if requested_source_duration <= 0.02:
                continue

            source_start = clamp_float(
                float(segment.source_start or 0.0),
                0.0,
                max(0.0, float(source["duration"]) - requested_source_duration),
            )
            source_available = max(0.0, float(source["duration"]) - source_start)
            actual_source_duration = min(requested_source_duration, source_available, actual_duration * sync_rate)
            if actual_source_duration <= 0.02:
                continue

        normalized_segments.append(
            {
                "camera_id": source["id"],
                "timeline_start": round(timeline_start, 3),
                "timeline_end": round(timeline_end, 3),
                "source_start": round(source_start, 3),
                "source_end": round(source_start + actual_source_duration, 3),
                "layout_mode": get_model_layout_mode(segment),
            }
        )
        timeline_cursor = timeline_end

        if safe_duration > 0.0 and timeline_cursor >= safe_duration - 0.001:
            break

    return enforce_reaction_overlay_on_multicam_segments(normalized_segments, prepared_sources)

async def render_multicam_audio_bed(
    input_path,
    output_path,
    raw_trim_start,
    duration,
    job_id,
    bitrate="192k",
):
    safe_duration = max(0.01, float(duration or 0.0))
    raw_start = float(raw_trim_start or 0.0)
    receipt = {
        "input_path": input_path,
        "output_path": output_path,
        "raw_trim_start_seconds": round(raw_start, 6),
        "requested_duration_seconds": round(safe_duration, 3),
        "bitrate": bitrate,
        "mode": "trim" if raw_start >= 0 else "delay",
        "applied_delay_ms": 0,
    }
    if raw_start >= 0:
        await run_subprocess_async(
            [
                "ffmpeg",
                "-ss",
                str(raw_start),
                "-i",
                input_path,
                "-t",
                str(safe_duration),
                "-vn",
                "-ac",
                "2",
                "-c:a",
                "aac",
                "-b:a",
                bitrate,
                "-y",
                output_path,
            ],
            check=True,
            job_context=job_id,
        )
        return receipt

    # If the master timeline begins before this audio source is live, preserve
    # the same timing as the browser preview by padding silence at the front.
    delay_ms = max(0, int(round(abs(raw_start) * 1000)))
    receipt["applied_delay_ms"] = delay_ms
    await run_subprocess_async(
        [
            "ffmpeg",
            "-i",
            input_path,
            "-filter:a",
            f"adelay={delay_ms}:all=1,apad,atrim=0:{safe_duration}",
            "-vn",
            "-ac",
            "2",
            "-c:a",
            "aac",
            "-b:a",
            bitrate,
            "-y",
            output_path,
        ],
        check=True,
        job_context=job_id,
    )
    return receipt

def build_multicam_switches_from_segments(segments):
    switches = []
    last_signature = None
    for segment in segments or []:
        camera_id = segment.get("camera_id")
        layout_mode = normalize_multicam_layout_mode(segment.get("layout_mode", "cut") or "cut")
        signature = (camera_id, layout_mode)
        if not camera_id or signature == last_signature:
            continue
        switches.append(
            {
                "camera_id": camera_id,
                "start_time": round(float(segment.get("timeline_start", 0.0)), 3),
                "layout_mode": layout_mode,
            }
        )
        last_signature = signature
    return switches

def normalize_multicam_render_tier(request):
    raw_tier = str(getattr(request, "renderTier", None) or getattr(request, "render_tier", None) or "premium")
    tier = raw_tier.strip().lower().replace("-", "_")
    return tier if tier in {"simple", "premium", "studio"} else "premium"

def enforce_multicam_production_limits(request, overlap_duration, segment_count=None):
    tier = normalize_multicam_render_tier(request)
    limits = {
        "enabled": bool(MULTICAM_ENFORCE_PROD_LIMITS),
        "tier": tier,
        "max_cameras": MULTICAM_BETA_MAX_CAMERAS,
        "max_duration_seconds": MULTICAM_BETA_MAX_SECONDS,
        "max_segments": MULTICAM_BETA_MAX_SEGMENTS,
        "camera_count": len(request.sources or []),
        "duration_seconds": round(float(overlap_duration or 0.0), 3),
        "segment_count": segment_count,
    }
    if not MULTICAM_ENFORCE_PROD_LIMITS:
        return limits
    if len(request.sources or []) > MULTICAM_BETA_MAX_CAMERAS:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Cam Combiner beta camera limit exceeded",
                "limits": limits,
            },
        )
    if float(overlap_duration or 0.0) > MULTICAM_BETA_MAX_SECONDS:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Cam Combiner beta duration limit exceeded",
                "limits": limits,
            },
        )
    if segment_count is not None and int(segment_count) > MULTICAM_BETA_MAX_SEGMENTS:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Cam Combiner segment plan is too complex for beta",
                "limits": limits,
            },
        )
    return limits

def validate_multicam_segment_duration(segment_path, expected_duration, segment_index, strict=None):
    actual_duration = get_media_duration(segment_path)
    expected = max(0.0, float(expected_duration or 0.0))
    tolerance = max(MULTICAM_SEGMENT_DURATION_TOLERANCE_SECONDS, expected * 0.03)
    delta = actual_duration - expected
    receipt = {
        "segment_index": segment_index,
        "path": segment_path,
        "expected_duration_seconds": round(expected, 3),
        "actual_duration_seconds": round(actual_duration, 3),
        "delta_seconds": round(delta, 3),
        "tolerance_seconds": round(tolerance, 3),
        "ok": bool(abs(delta) <= tolerance),
    }
    if not receipt["ok"]:
        message = (
            f"Multicam segment duration mismatch: segment={segment_index} "
            f"expected={expected:.3f}s actual={actual_duration:.3f}s"
        )
        strict_mode = MULTICAM_STRICT_SEGMENT_DURATIONS if strict is None else bool(strict)
        if strict_mode:
            raise HTTPException(status_code=500, detail={"message": message, "segment": receipt})
        logger.warning(message)
    return receipt

def validate_multicam_output_streams(output_path, expected_duration, job_id):
    summary = probe_media_stream_summary(output_path)
    streams = summary.get("streams") or []
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    fmt = summary.get("format") or {}
    duration = float(fmt.get("duration") or 0.0)
    expected = max(0.0, float(expected_duration or 0.0))
    duration_delta = duration - expected
    receipt = {
        "path": output_path,
        "duration_seconds": round(duration, 3),
        "expected_duration_seconds": round(expected, 3),
        "duration_delta_seconds": round(duration_delta, 3),
        "has_video_stream": bool(video_streams),
        "has_audio_stream": bool(audio_streams),
        "video_streams": video_streams,
        "audio_streams": audio_streams,
        "format": fmt,
    }
    logger.info("MULTICAM OUTPUT VALIDATION %s: %s", job_id, json.dumps(receipt, default=str))
    if not video_streams:
        raise HTTPException(status_code=500, detail={"message": "Multicam output has no video stream", "validation": receipt})
    if expected > 0.0 and abs(duration_delta) > max(1.0, expected * 0.01):
        raise HTTPException(status_code=500, detail={"message": "Multicam output duration does not match timeline", "validation": receipt})
    return receipt

def multicam_source_has_auditable_audio(source):
    if not source:
        return False
    if source.get("audio_audit_has_audio") is not None:
        return bool(source.get("audio_audit_has_audio"))
    return bool(source.get("has_audio"))

def pick_multicam_post_render_sync_samples(segments, source_map, overlap_start, max_samples=None):
    candidates = []
    max_count = max_samples or MULTICAM_POST_RENDER_SYNC_MAX_SAMPLES
    for index, segment in enumerate(segments or []):
        timeline_start = float(segment.get("timeline_start", 0.0) or 0.0)
        timeline_end = float(segment.get("timeline_end", 0.0) or 0.0)
        duration = timeline_end - timeline_start
        if duration < 0.8:
            continue

        # Long shared/show-everyone segments need more than one proof point. A single
        # start sample can miss drift that appears later in the same visible layout.
        if duration >= 24.0:
            sample_offsets = [0.0, max(0.0, (duration - 3.0) / 2.0), max(0.0, duration - 3.25)]
        elif duration >= 8.0:
            sample_offsets = [0.0, max(0.0, duration - 3.25)]
        else:
            sample_offsets = [0.0]

        def append_samples(source, role):
            if not source or not multicam_source_has_auditable_audio(source):
                return
            for sample_offset in sample_offsets:
                output_start = timeline_start + sample_offset
                remaining_duration = max(0.0, duration - sample_offset)
                if remaining_duration < 0.8:
                    continue
                candidates.append({
                    "segment_index": index,
                    "role": role,
                    "camera_id": source.get("id"),
                    "camera_label": source.get("label"),
                    "sample_position": (
                        "start"
                        if sample_offset <= 0.01
                        else "end"
                        if sample_offset >= max(0.0, duration - 3.5)
                        else "middle"
                    ),
                    "output_start_seconds": output_start,
                    "source_start_seconds": get_source_start_for_timeline(source, overlap_start, output_start),
                    "duration_seconds": remaining_duration,
                })

        primary = source_map.get(segment.get("camera_id"))
        append_samples(primary, "primary")

        secondary_id = segment.get("secondary_camera_id")
        secondary = source_map.get(secondary_id)
        append_samples(secondary, "secondary")

    if len(candidates) <= max_count:
        return candidates

    # Keep a spread across the full render instead of only auditing the start.
    selected = []
    for idx in np.linspace(0, len(candidates) - 1, num=max_count):
        candidate = candidates[int(round(idx))]
        if candidate not in selected:
            selected.append(candidate)
    return selected


async def audit_multicam_render_sync(output_path, segments, source_map, overlap_start, job_id):
    receipt = {
        "enabled": bool(MULTICAM_POST_RENDER_SYNC_AUDIT),
        "path": output_path,
        "status": "skipped_disabled" if not MULTICAM_POST_RENDER_SYNC_AUDIT else "pending",
        "samples": [],
        "sample_count": 0,
        "usable_sample_count": 0,
        "max_abs_residual_seconds": None,
        "avg_correlation": 0.0,
        "thresholds": {
            "good_seconds": MULTICAM_POST_RENDER_SYNC_GOOD_SECONDS,
            "unsafe_seconds": MULTICAM_POST_RENDER_SYNC_UNSAFE_SECONDS,
            "min_correlation": MULTICAM_POST_RENDER_SYNC_MIN_CORRELATION,
            "sample_seconds": MULTICAM_POST_RENDER_SYNC_SAMPLE_SECONDS,
        },
    }
    if not MULTICAM_POST_RENDER_SYNC_AUDIT:
        return receipt
    if not has_audio_stream(output_path):
        receipt["status"] = "unsafe"
        receipt["message"] = "Final output has no audio stream to audit"
        return receipt

    samples = pick_multicam_post_render_sync_samples(
        segments,
        source_map,
        overlap_start,
        max_samples=MULTICAM_POST_RENDER_SYNC_MAX_SAMPLES,
    )
    receipt["sample_count"] = len(samples)
    if not samples:
        receipt["status"] = "skipped_no_camera_audio"
        receipt["message"] = "No audible camera scratch-audio samples were available for post-render sync audit"
        return receipt

    sample_seconds = MULTICAM_POST_RENDER_SYNC_SAMPLE_SECONDS
    usable = []
    for sample_index, sample in enumerate(samples):
        source = source_map.get(sample.get("camera_id"))
        if not source:
            continue
        source_audio_path = source.get("audio_audit_path") or source.get("path")
        if not source_audio_path or not os.path.exists(source_audio_path):
            sample_receipt = {
                **sample,
                "sample_duration_seconds": round(sample_seconds, 3),
                "status": "error",
                "detail": "Camera audio audit source is missing",
                "audio_audit_path": source_audio_path,
            }
            receipt["samples"].append(sample_receipt)
            continue
        duration = max(0.5, min(sample_seconds, float(sample.get("duration_seconds", sample_seconds)) - 0.25))
        source_clip = os.path.join(os.path.dirname(output_path), f"{job_id}_postsync_src_{sample_index}.wav")
        output_clip = os.path.join(os.path.dirname(output_path), f"{job_id}_postsync_out_{sample_index}.wav")
        sample_receipt = {
            **sample,
            "sample_duration_seconds": round(duration, 3),
            "audio_audit_path": source_audio_path,
            "status": "pending",
        }
        try:
            await run_subprocess_async(
                [
                    "ffmpeg", "-nostdin",
                    "-ss", f"{float(sample['source_start_seconds']):.6f}",
                    "-t", f"{duration:.6f}",
                    "-i", source_audio_path,
                    "-vn", "-ac", "1", "-ar", "8000",
                    "-acodec", "pcm_s16le", "-f", "wav", "-y", source_clip,
                ],
                check=True,
                timeout_seconds=30,
                job_context=job_id,
            )
            await run_subprocess_async(
                [
                    "ffmpeg", "-nostdin",
                    "-ss", f"{float(sample['output_start_seconds']):.6f}",
                    "-t", f"{duration:.6f}",
                    "-i", output_path,
                    "-vn", "-ac", "1", "-ar", "8000",
                    "-acodec", "pcm_s16le", "-f", "wav", "-y", output_clip,
                ],
                check=True,
                timeout_seconds=30,
                job_context=job_id,
            )
            source_signal, _ = read_wav_mono_float(source_clip)
            output_signal, _ = read_wav_mono_float(output_clip)
            shift, correlation = cross_correlate_offsets(
                output_signal,
                source_signal,
                max_shift_seconds=3.0,
                sample_rate=8000,
            )
            sample_receipt.update({
                "status": "ok",
                "estimated_residual_seconds": round(float(shift), 3),
                "abs_residual_seconds": round(abs(float(shift)), 3),
                "correlation": round(float(correlation), 4),
            })
            usable.append(sample_receipt)
        except Exception as audit_error:
            sample_receipt.update({
                "status": "error",
                "detail": str(audit_error),
            })
        finally:
            for clip_path in [source_clip, output_clip]:
                try:
                    if os.path.exists(clip_path):
                        os.remove(clip_path)
                except OSError:
                    pass
        receipt["samples"].append(sample_receipt)

    usable = [
        item
        for item in usable
        if float(item.get("correlation", 0.0) or 0.0) >= MULTICAM_POST_RENDER_SYNC_MIN_CORRELATION
    ]
    receipt["usable_sample_count"] = len(usable)
    if not usable:
        receipt["status"] = "questionable"
        receipt["message"] = "Post-render sync audit could not find strong camera/output audio correlation"
        logger.warning("MULTICAM POST-RENDER SYNC AUDIT %s: %s", job_id, json.dumps(receipt, default=str))
        return receipt

    max_residual = max(float(item.get("abs_residual_seconds", 0.0) or 0.0) for item in usable)
    avg_corr = sum(float(item.get("correlation", 0.0) or 0.0) for item in usable) / max(1, len(usable))
    receipt["max_abs_residual_seconds"] = round(max_residual, 3)
    receipt["avg_correlation"] = round(avg_corr, 4)
    if max_residual <= MULTICAM_POST_RENDER_SYNC_GOOD_SECONDS:
        receipt["status"] = "good"
    elif max_residual >= MULTICAM_POST_RENDER_SYNC_UNSAFE_SECONDS:
        receipt["status"] = "unsafe"
        receipt["message"] = f"Final render sync residual is {max_residual:.3f}s, above safe threshold"
    else:
        receipt["status"] = "questionable"
        receipt["message"] = f"Final render sync residual is {max_residual:.3f}s; visual review required"
    logger.info("MULTICAM POST-RENDER SYNC AUDIT %s: %s", job_id, json.dumps(receipt, default=str))
    return receipt


def enforce_multicam_post_render_sync_audit(audit_receipt):
    status = (audit_receipt or {}).get("status")
    if status == "good" or status in {"skipped_disabled"}:
        return
    if status == "questionable" and MULTICAM_ALLOW_QUESTIONABLE_SYNC:
        logger.warning("Post-render sync audit questionable but allowed: %s", json.dumps(audit_receipt, default=str))
        return
    if status == "skipped_no_camera_audio" and MULTICAM_ALLOW_SKIPPED_SYNC_NO_AUDIO:
        logger.warning("Post-render sync audit skipped because camera audio is unavailable: %s", json.dumps(audit_receipt, default=str))
        return
    if MULTICAM_STRICT_POST_RENDER_SYNC:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Post-render sync audit failed; refusing Cam Combiner output",
                "post_render_sync_audit": audit_receipt,
            },
        )
    logger.warning("Post-render sync audit did not pass but strict mode is off: %s", json.dumps(audit_receipt, default=str))


def get_multicam_output_dimensions(output_aspect_ratio):
    return (1920, 1080) if str(output_aspect_ratio or "9:16") != "9:16" else (1080, 1920)

def normalize_multicam_rotation_degrees(value):
    try:
        degrees = float(value or 0.0)
    except Exception:
        degrees = 0.0
    normalized = int(round(degrees / 90.0) * 90) % 360
    return normalized if normalized in {0, 90, 180, 270} else 0

def multicam_rotation_filter(value):
    rotation = normalize_multicam_rotation_degrees(value)
    if rotation == 90:
        return "transpose=1,"
    if rotation == 180:
        return "hflip,vflip,"
    if rotation == 270:
        return "transpose=2,"
    return ""

def multicam_crop_filter(input_index, width, height, label, setpts_factor=1.0, rotation_degrees=0):
    """Scale source to fit target cell, preserving aspect ratio without cropping faces.
    Uses decrease+pad so the full frame is visible inside the cell."""
    safe_setpts = clamp_float(float(setpts_factor or 1.0), 0.25, 4.0)
    return (
        f"[{input_index}:v]{multicam_rotation_filter(rotation_degrees)}"
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,"
        f"setpts={safe_setpts:.9f}*PTS,fps=30[{label}]"
    )

def multicam_prepare_video_branches(
    input_index,
    prefix,
    setpts_factor=1.0,
    branches=1,
    trim_start=0.0,
    trim_duration=None,
    rotation_degrees=0,
    color_filter=None,
):
    safe_setpts = clamp_float(float(setpts_factor or 1.0), 0.25, 4.0)
    safe_branches = max(1, int(branches or 1))
    safe_trim_start = max(0.0, float(trim_start or 0.0))
    trim_prefix = ""
    if trim_duration is not None:
        safe_trim_duration = max(0.02, float(trim_duration or 0.02))
        trim_prefix = (
            f"trim=start={safe_trim_start:.6f}:duration={safe_trim_duration:.6f},"
            "setpts=PTS-STARTPTS,"
        )
    elif safe_trim_start > 0.0001:
        trim_prefix = f"trim=start={safe_trim_start:.6f},setpts=PTS-STARTPTS,"

    rotation_prefix = multicam_rotation_filter(rotation_degrees)
    color_chain = str(color_filter or "").strip().strip(",")
    color_prefix = f"{color_chain}," if color_chain else ""
    if safe_branches == 1:
        return [f"[{input_index}:v]{rotation_prefix}{trim_prefix}setpts={safe_setpts:.9f}*PTS,fps=30,{color_prefix}setsar=1[{prefix}0]"]
    outputs = "".join(f"[{prefix}{idx}]" for idx in range(safe_branches))
    return [f"[{input_index}:v]{rotation_prefix}{trim_prefix}setpts={safe_setpts:.9f}*PTS,fps=30,{color_prefix}setsar=1,split={safe_branches}{outputs}"]

def multicam_blurred_canvas_filter(input_label, width, height, output_label, blur=24):
    blur_width = max(2, int(width) // 10)
    blur_height = max(2, int(height) // 10)
    return (
        f"[{input_label}]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},scale={blur_width}:{blur_height},boxblur={max(2, int(blur) // 4)}:1,"
        f"scale={width}:{height},"
        f"eq=brightness=-0.14:saturation=0.88,setsar=1[{output_label}]"
    )

def multicam_modern_card_filter(input_label, width, height, output_label, margin=0, blur=18, focus_x=0.5, focus_y=0.48):
    # Keep each platform card as one clean surface. The older treatment used a
    # blurred in-card fill plus a smaller foreground video, which looked like a
    # second rectangular frame inside the rounded card.
    safe_focus_x = clamp_float(float(0.5 if focus_x is None else focus_x), 0.06, 0.94)
    safe_focus_y = clamp_float(float(0.48 if focus_y is None else focus_y), 0.12, 0.82)
    return (
        f"[{input_label}]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height}:(iw-ow)*{safe_focus_x:.4f}:(ih-oh)*{safe_focus_y:.4f},"
        f"setsar=1[{output_label}]"
    )

def multicam_fit_card_filter(input_label, width, height, output_label, blur=18):
    blur_width = max(2, int(width) // 8)
    blur_height = max(2, int(height) // 8)
    return (
        f"[{input_label}]split=2[{output_label}bgsrc][{output_label}fgsrc];"
        f"[{output_label}bgsrc]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},scale={blur_width}:{blur_height},boxblur={max(2, int(blur) // 4)}:1,"
        f"scale={width}:{height},eq=brightness=-0.16:saturation=0.86,setsar=1[{output_label}bg];"
        f"[{output_label}fgsrc]scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"setsar=1[{output_label}fg];"
        f"[{output_label}bg][{output_label}fg]overlay=(W-w)/2:(H-h)/2:shortest=1[{output_label}]"
    )

def multicam_portrait_focus_card_filter(
    input_label,
    width,
    height,
    output_label,
    focus_x=0.5,
    focus_y=0.48,
    blur=18,
    content_width_ratio=1.0,
    content_height_ratio=1.0,
    content_y_ratio=0.5,
):
    safe_focus_x = clamp_float(float(0.5 if focus_x is None else focus_x), 0.18, 0.82)
    safe_focus_y = clamp_float(float(0.48 if focus_y is None else focus_y), 0.18, 0.72)
    safe_content_width_ratio = clamp_float(float(1.0 if content_width_ratio is None else content_width_ratio), 0.52, 1.0)
    safe_content_height_ratio = clamp_float(float(1.0 if content_height_ratio is None else content_height_ratio), 0.42, 1.0)
    safe_content_y_ratio = clamp_float(float(0.5 if content_y_ratio is None else content_y_ratio), 0.0, 1.0)
    blur_width = max(2, int(width) // 8)
    blur_height = max(2, int(height) // 8)
    inner_width = max(2, min(int(width), int(int(width) * safe_content_width_ratio)))
    inner_height = max(2, min(int(height), int(int(height) * safe_content_height_ratio)))
    available_y = max(0, int(height) - inner_height)
    content_y = max(0, min(available_y, int(available_y * safe_content_y_ratio)))
    return (
        f"[{input_label}]split=2[{output_label}bgsrc][{output_label}fgsrc];"
        f"[{output_label}bgsrc]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},scale={blur_width}:{blur_height},boxblur={max(2, int(blur) // 4)}:1,"
        f"scale={width}:{height},eq=brightness=-0.12:saturation=0.9,setsar=1[{output_label}bg];"
        f"[{output_label}fgsrc]scale={inner_width}:{inner_height}:force_original_aspect_ratio=increase,"
        f"crop={inner_width}:{inner_height}:(iw-ow)*{safe_focus_x:.4f}:(ih-oh)*{safe_focus_y:.4f},"
        f"setsar=1[{output_label}fg];"
        f"[{output_label}bg][{output_label}fg]overlay=(W-w)/2:{content_y}:shortest=1[{output_label}]"
    )

def multicam_rounded_card_filter(input_label, width, height, output_label, radius=30):
    safe_radius = max(8, min(int(radius or 30), int(width) // 4, int(height) // 4))
    mask_label = f"{output_label}mask"
    rgba_label = f"{output_label}rgba"
    mask_path = multicam_rounded_mask_path(width, height, safe_radius)
    escaped_mask_path = str(mask_path).replace("\\", "\\\\").replace(":", "\\:")
    return (
        f"movie={escaped_mask_path},format=gray,loop=loop=-1:size=1:start=0,setpts=N/30/TB[{mask_label}];"
        f"[{input_label}]format=rgba[{rgba_label}];"
        f"[{rgba_label}][{mask_label}]alphamerge[{output_label}]"
    )


def multicam_rounded_mask_path(width, height, radius):
    safe_width = max(2, int(width))
    safe_height = max(2, int(height))
    safe_radius = max(1, int(radius))
    cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp/multicam-mask-cache"))
    os.makedirs(cache_dir, exist_ok=True)
    mask_path = os.path.join(cache_dir, f"rounded_{safe_width}x{safe_height}_r{safe_radius}.png")
    if not os.path.exists(mask_path):
        mask = Image.new("L", (safe_width, safe_height), 0)
        draw = ImageDraw.Draw(mask)
        draw.rounded_rectangle((0, 0, safe_width - 1, safe_height - 1), radius=safe_radius, fill=255)
        mask.save(mask_path)
    return mask_path

def multicam_source_focus_x(source, fallback=0.5):
    source_id = str((source or {}).get("id") or "").lower()
    source_label = str((source or {}).get("label") or "").lower()
    source_key = f"{source_id} {source_label}"
    if "cam1" in source_key or "camera 1" in source_key:
        return 0.88
    if "cam2" in source_key or "camera 2" in source_key:
        return 0.3
    return fallback

def multicam_shared_moment_focus_x(source, fallback=0.5):
    source_id = str((source or {}).get("id") or "").lower()
    source_label = str((source or {}).get("label") or "").lower()
    source_key = f"{source_id} {source_label}"
    # Shared Moment puts two wide cameras into narrower cards, so use a more
    # protective edge focus than single-camera cuts to keep both speakers alive.
    if "cam1" in source_key or "camera 1" in source_key:
        return 0.94
    if "cam2" in source_key or "camera 2" in source_key:
        return 0.06
    return multicam_source_focus_x(source, fallback)

def multicam_overlay_card_filters(base_label, card_label, x, y, width, height, output_label, border_color="white@0.10", radius=None):
    rounded = f"{output_label}rounded"
    # Keep the exported platform frame clean: no rectangular border plate,
    # only a real alpha-rounded card over the blurred canvas.
    if radius is None:
        radius = max(82, min(220, min(int(width), int(height)) // 4))
    return [
        multicam_rounded_card_filter(card_label, width, height, rounded, radius=radius),
        f"[{base_label}][{rounded}]overlay=x={int(x)}:y={int(y)}:shortest=1[{output_label}]",
    ]

def multicam_single_cut_filter(input_label, width, height, output_label, is_vertical_output=True):
    if not is_vertical_output:
        card_margin_x = max(36, int(width * 0.035))
        card_margin_y = max(28, int(height * 0.045))
        card_width = max(2, int(width) - (card_margin_x * 2))
        card_height = max(2, int(height) - (card_margin_y * 2))
        card_x = int((int(width) - card_width) / 2)
        card_y = int((int(height) - card_height) / 2)
        return ";".join(
            [
                f"[{input_label}]split=2[cutwidebgsrc][cutwidecardsrc]",
                multicam_blurred_canvas_filter("cutwidebgsrc", width, height, "cutwidecanvas", blur=20),
                multicam_modern_card_filter("cutwidecardsrc", card_width, card_height, "cutwidecard", margin=0, blur=12),
                *multicam_overlay_card_filters(
                    "cutwidecanvas",
                    "cutwidecard",
                    card_x,
                    card_y,
                    card_width,
                    card_height,
                    output_label,
                    radius=72,
                ),
            ]
        )

    card_width = int(width) - 72
    card_height = max(2, int(card_width * 9 / 16))
    card_x = int((int(width) - card_width) / 2)
    card_y = int((int(height) - card_height) / 2)
    return ";".join(
        [
            f"[{input_label}]split=2[cutbgsrc][cutcardsrc]",
            multicam_blurred_canvas_filter("cutbgsrc", width, height, "cutcanvas", blur=26),
            multicam_modern_card_filter("cutcardsrc", card_width, card_height, "cutcard", margin=0, blur=18),
            *multicam_overlay_card_filters("cutcanvas", "cutcard", card_x, card_y, card_width, card_height, output_label),
        ]
    )

def source_has_active_continuous_sync_map(source):
    sync_map = (source or {}).get("continuous_sync_map") or {}
    return bool(sync_map.get("active") and len(sync_map.get("anchors") or []) >= 2)


def map_timeline_to_source_with_continuous_sync(source, absolute_timeline):
    sync_map = (source or {}).get("continuous_sync_map") or {}
    anchors = sorted(
        [
            anchor
            for anchor in (sync_map.get("anchors") or [])
            if anchor.get("status") == "accepted"
            and anchor.get("source_position_seconds") is not None
            and anchor.get("corrected_timeline_seconds") is not None
        ],
        key=lambda item: float(item.get("corrected_timeline_seconds") or 0.0),
    )
    if len(anchors) < 2:
        return None

    timeline_value = float(absolute_timeline)

    def point(anchor):
        return (
            float(anchor.get("corrected_timeline_seconds") or 0.0),
            float(anchor.get("source_position_seconds") or 0.0),
        )

    if timeline_value <= float(anchors[0]["corrected_timeline_seconds"]):
        left, right = point(anchors[0]), point(anchors[1])
    elif timeline_value >= float(anchors[-1]["corrected_timeline_seconds"]):
        left, right = point(anchors[-2]), point(anchors[-1])
    else:
        left, right = point(anchors[0]), point(anchors[-1])
        for index in range(len(anchors) - 1):
            candidate_left = point(anchors[index])
            candidate_right = point(anchors[index + 1])
            if candidate_left[0] <= timeline_value <= candidate_right[0]:
                left, right = candidate_left, candidate_right
                break

    timeline_delta = right[0] - left[0]
    if abs(timeline_delta) < 1e-6:
        return None
    ratio = (timeline_value - left[0]) / timeline_delta
    return left[1] + (ratio * (right[1] - left[1]))


def get_source_start_for_timeline(source, overlap_start, timeline_start):
    absolute_timeline = float(overlap_start) + float(timeline_start)
    mapped_source_start = map_timeline_to_source_with_continuous_sync(source, absolute_timeline)
    if mapped_source_start is not None:
        return mapped_source_start
    sync_rate = float(source.get("sync_rate") or 1.0)
    return (absolute_timeline - float(source["offset_seconds"])) * sync_rate


def get_source_range_for_timeline(source, overlap_start, timeline_start, duration):
    source_start = get_source_start_for_timeline(source, overlap_start, timeline_start)
    source_end = get_source_start_for_timeline(
        source,
        overlap_start,
        float(timeline_start) + float(duration),
    )
    if source_end <= source_start:
        source_end = source_start + (float(duration) * float(source.get("sync_rate") or 1.0))
    return source_start, source_end, max(0.02, source_end - source_start)

def pick_layout_sources(
    primary_source,
    prepared_sources,
    overlap_start,
    timeline_start,
    duration,
    max_sources=3,
    preferred_secondary_camera_id=None,
):
    picked = [primary_source]
    preferred_id = str(preferred_secondary_camera_id or "")
    ordered_candidates = sorted(
        prepared_sources,
        key=lambda candidate: 0 if preferred_id and candidate.get("id") == preferred_id else 1,
    )
    for candidate in ordered_candidates:
        if candidate["id"] == primary_source["id"]:
            continue
        candidate_start, candidate_end, candidate_duration = get_source_range_for_timeline(
            candidate,
            overlap_start,
            timeline_start,
            duration,
        )
        # Clamp negative start to 0 — source IS available at 0, timeline just starts before
        # the source's valid window due to offset. Don't skip the camera.
        candidate_start = max(0.0, candidate_start)
        candidate_end = candidate_start + candidate_duration
        candidate_limit = float(candidate["duration"]) + 0.5  # lenient: allow 0.5s overhang
        if candidate_end > candidate_limit:
            logger.info(
                f"pick_layout_sources: skip {candidate['label']} — "
                f"start={candidate_start:.2f}s end={candidate_end:.2f}s "
                f"limit={candidate_limit:.2f}s offset={candidate['offset_seconds']:.2f}s"
            )
            continue
        picked.append(candidate)
        if len(picked) >= max_sources:
            break
    logger.info(
        f"pick_layout_sources: layout_sources={len(picked)} "
        f"ids={[s['id'][:8] for s in picked]}"
    )
    return picked

async def render_multicam_layout_segment(
    segment_output_path,
    layout_mode,
    layout_sources,
    overlap_start,
    timeline_start,
    duration,
    output_width,
    output_height,
    job_id,
    primary_source_start=None,
    primary_source_end=None,
    segment_index=None,
):
    layout_mode = normalize_multicam_layout_mode(layout_mode)
    if len(layout_sources) < 2 or layout_mode not in {"scene-grid", "split-vertical", "pip"}:
        return False

    cmd = ["ffmpeg", "-y", "-nostdin"]
    setpts_factors = []
    trim_values = []
    fine_seek_values = []
    trim_duration_values = []
    rotation_values = []
    color_filter_values = []
    for idx, source in enumerate(layout_sources):
        # Use exact segment source_start for primary camera (matches preview)
        if idx == 0 and primary_source_start is not None:
            trim_start = max(0.0, float(primary_source_start))
            if primary_source_end is not None and float(primary_source_end) > trim_start:
                raw_duration = max(0.02, float(primary_source_end) - trim_start)
            else:
                _range_start, _range_end, raw_duration = get_source_range_for_timeline(
                    source,
                    overlap_start,
                    timeline_start,
                    duration,
                )
        else:
            trim_start, _range_end, raw_duration = get_source_range_for_timeline(
                source,
                overlap_start,
                timeline_start,
                duration,
            )
            trim_start = max(0.0, trim_start)
        render_time_shift = max(0.0, float(source.get("render_time_shift_seconds", 0.0) or 0.0))
        render_trim_start = max(0.0, trim_start - render_time_shift)
        seek_preroll = min(1.5, render_trim_start)
        input_seek = max(0.0, render_trim_start - seek_preroll)
        fine_seek = max(0.0, render_trim_start - input_seek)
        input_duration = raw_duration + fine_seek + 0.25
        setpts_factors.append(float(duration) / raw_duration)
        fine_seek_values.append(fine_seek)
        trim_duration_values.append(raw_duration)
        rotation_values.append(normalize_multicam_rotation_degrees(source.get("render_rotation_degrees", source.get("rotation_degrees", 0))))
        color_filter_values.append(source.get("render_visual_filter", source.get("source_visual_filter") or source.get("color_match_filter") or ""))
        render_path = source.get("render_path") or source["path"]
        trim_values.append(
            (
                source["label"],
                source["id"],
                trim_start,
                trim_start + raw_duration,
                source.get("offset_seconds", 0),
                input_seek,
                fine_seek,
            )
        )
        cmd.extend([
            "-fflags", "+genpts+igndts",
            "-ss", str(input_seek),
            "-t", str(input_duration),
            "-i", render_path,
        ])

    # TRACE: log per-camera trim_start and offset for debugging sync
    primary_label, primary_id, primary_trim, primary_end, primary_offset, primary_input_seek, primary_fine_seek = trim_values[0] if trim_values else ("?", "?", 0, 0, 0, 0, 0)
    secondary_label, secondary_id, secondary_trim, secondary_end, secondary_offset, secondary_input_seek, secondary_fine_seek = trim_values[1] if len(trim_values) > 1 else ("?", "?", 0, 0, 0, 0, 0)
    logger.info(
        f"LAYOUT_TRACE segment_index={segment_index if segment_index is not None else '?'} "
        f"layout_mode={layout_mode} timeline_start={timeline_start:.3f}s dur={duration:.3f}s "
        f"overlap_start={overlap_start:.3f} "
        f"PRIMARY={primary_label}({primary_id[:8]}) source_start={primary_trim:.3f}s "
        f"source_end={primary_end:.3f}s manual_offset={primary_offset:.3f}s "
        f"input_seek={primary_input_seek:.3f}s fine_seek={primary_fine_seek:.3f}s "
        f"SECONDARY={secondary_label}({secondary_id[:8]}) source_start={secondary_trim:.3f}s "
        f"source_end={secondary_end:.3f}s manual_offset={secondary_offset:.3f}s "
        f"input_seek={secondary_input_seek:.3f}s fine_seek={secondary_fine_seek:.3f}s "
        f"primary_source_start_param={primary_source_start}"
    )

    filters = []
    is_vertical_output = output_height > output_width
    if layout_mode == "pip" and is_vertical_output:
        hero_width = output_width - 64
        hero_height = int(hero_width * 9 / 16)
        hero_x = 32
        hero_y = 128
        pip_width = int(output_width * 0.54)
        pip_height = int(pip_width * 9 / 16)
        pip_x = output_width - pip_width - 38
        pip_y = hero_y + hero_height + 42

        filters.extend(multicam_prepare_video_branches(0, "p0", setpts_factors[0], branches=2, trim_start=fine_seek_values[0], trim_duration=trim_duration_values[0], rotation_degrees=rotation_values[0], color_filter=color_filter_values[0]))
        filters.extend(multicam_prepare_video_branches(1, "p1", setpts_factors[1], branches=1, trim_start=fine_seek_values[1], trim_duration=trim_duration_values[1], rotation_degrees=rotation_values[1], color_filter=color_filter_values[1]))
        filters.append(multicam_blurred_canvas_filter("p00", output_width, output_height, "canvas", blur=26))
        filters.append(multicam_modern_card_filter("p01", hero_width, hero_height, "hero", margin=8, blur=18, focus_x=multicam_source_focus_x(layout_sources[0])))
        filters.append(multicam_modern_card_filter("p10", pip_width, pip_height, "pip", margin=8, blur=14, focus_x=multicam_source_focus_x(layout_sources[1])))
        filters.extend(
            multicam_overlay_card_filters(
                "canvas",
                "hero",
                hero_x,
                hero_y,
                hero_width,
                hero_height,
                "pip_base",
                border_color="0xF8FAFC@0.26",
                radius=118,
            )
        )
        filters.extend(
            multicam_overlay_card_filters(
                "pip_base",
                "pip",
                pip_x,
                pip_y,
                pip_width,
                pip_height,
                "v",
                border_color="0xF8FAFC@0.42",
                radius=58,
            )
        )
    elif layout_mode == "scene-grid" and is_vertical_output:
        filters.extend(multicam_prepare_video_branches(0, "g0", setpts_factors[0], branches=2, trim_start=fine_seek_values[0], trim_duration=trim_duration_values[0], rotation_degrees=rotation_values[0], color_filter=color_filter_values[0]))
        for index in range(1, min(3, len(layout_sources))):
            filters.extend(multicam_prepare_video_branches(index, f"g{index}", setpts_factors[index], branches=1, trim_start=fine_seek_values[index], trim_duration=trim_duration_values[index], rotation_degrees=rotation_values[index], color_filter=color_filter_values[index]))
        filters.append(multicam_blurred_canvas_filter("g00", output_width, output_height, "canvas", blur=26))

        if len(layout_sources) >= 3:
            top_width = output_width - 64
            top_height = int(output_height * 0.34)
            bottom_width = (output_width - 84) // 2
            bottom_height = int(output_height * 0.34)
            top_x = 32
            top_y = 180
            left_x = 32
            right_x = left_x + bottom_width + 20
            bottom_y = top_y + top_height + 44
            filters.append(multicam_modern_card_filter("g01", top_width, top_height, "card0", margin=8, blur=18, focus_x=multicam_source_focus_x(layout_sources[0])))
            filters.append(multicam_modern_card_filter("g10", bottom_width, bottom_height, "card1", margin=8, blur=18, focus_x=multicam_source_focus_x(layout_sources[1])))
            filters.append(multicam_modern_card_filter("g20", bottom_width, bottom_height, "card2", margin=8, blur=18, focus_x=multicam_source_focus_x(layout_sources[2])))
            filters.extend(multicam_overlay_card_filters("canvas", "card0", top_x, top_y, top_width, top_height, "grid_a", "0x38BDF8@0.32"))
            filters.extend(multicam_overlay_card_filters("grid_a", "card1", left_x, bottom_y, bottom_width, bottom_height, "grid_b", "0x22C55E@0.32"))
            filters.extend(multicam_overlay_card_filters("grid_b", "card2", right_x, bottom_y, bottom_width, bottom_height, "v", "0xA855F7@0.32"))
        else:
            card_width = output_width - 64
            card_height = int(card_width * 9 / 16)
            top_x = 32
            card_gap = 70
            top_y = int((output_height - (card_height * 2) - card_gap) / 2)
            bottom_y = top_y + card_height + card_gap
            filters.append(multicam_modern_card_filter("g01", card_width, card_height, "card0", margin=8, blur=18, focus_x=multicam_source_focus_x(layout_sources[0])))
            filters.append(multicam_modern_card_filter("g10", card_width, card_height, "card1", margin=8, blur=18, focus_x=multicam_source_focus_x(layout_sources[1])))
            filters.extend(multicam_overlay_card_filters("canvas", "card0", top_x, top_y, card_width, card_height, "grid_a", "0x38BDF8@0.32", radius=112))
            filters.extend(multicam_overlay_card_filters("grid_a", "card1", top_x, bottom_y, card_width, card_height, "v", "0x22C55E@0.32", radius=112))
    elif layout_mode == "split-vertical" and is_vertical_output:
        filters.extend(multicam_prepare_video_branches(0, "s0", setpts_factors[0], branches=2, trim_start=fine_seek_values[0], trim_duration=trim_duration_values[0], rotation_degrees=rotation_values[0], color_filter=color_filter_values[0]))
        filters.extend(multicam_prepare_video_branches(1, "s1", setpts_factors[1], branches=1, trim_start=fine_seek_values[1], trim_duration=trim_duration_values[1], rotation_degrees=rotation_values[1], color_filter=color_filter_values[1]))
        side_margin = max(24, int(output_width * 0.024))
        top_margin = max(72, int(output_height * 0.038))
        card_gap = max(22, int(output_width * 0.02))
        card_width = max(2, int((output_width - (side_margin * 2) - card_gap) / 2))
        card_height = max(2, output_height - (top_margin * 2))
        card_radius = max(54, min(126, int(min(card_width, card_height) * 0.15)))
        right_x = side_margin + card_width + card_gap

        # Shared Moment is true split-screen coverage: two people at the same
        # level, equal presence, with no stacked "show both" treatment.
        filters.append(multicam_blurred_canvas_filter("s00", output_width, output_height, "canvas", blur=26))
        filters.append(multicam_fit_card_filter("s01", card_width, card_height, "shared_left", blur=18))
        filters.append(multicam_fit_card_filter("s10", card_width, card_height, "shared_right", blur=16))
        filters.extend(multicam_overlay_card_filters("canvas", "shared_left", side_margin, top_margin, card_width, card_height, "split_a", radius=card_radius))
        filters.extend(multicam_overlay_card_filters("split_a", "shared_right", right_x, top_margin, card_width, card_height, "v", radius=card_radius))
    elif layout_mode == "pip":
        filters.extend(multicam_prepare_video_branches(0, "p0", setpts_factors[0], branches=2, trim_start=fine_seek_values[0], trim_duration=trim_duration_values[0], rotation_degrees=rotation_values[0], color_filter=color_filter_values[0]))
        filters.extend(multicam_prepare_video_branches(1, "p1", setpts_factors[1], branches=1, trim_start=fine_seek_values[1], trim_duration=trim_duration_values[1], rotation_degrees=rotation_values[1], color_filter=color_filter_values[1]))
        base_margin_x = max(44, int(output_width * 0.035))
        base_margin_y = max(34, int(output_height * 0.045))
        base_width = output_width - (base_margin_x * 2)
        base_height = output_height - (base_margin_y * 2)
        pip_width = max(260, int(output_width * 0.32))
        pip_height = max(160, int(output_height * 0.28))
        pip_x = output_width - pip_width - base_margin_x - 22
        pip_y = output_height - pip_height - base_margin_y - 22
        filters.append(multicam_blurred_canvas_filter("p00", output_width, output_height, "canvas", blur=20))
        filters.append(multicam_modern_card_filter("p01", base_width, base_height, "basecard", margin=0, blur=12, focus_x=multicam_source_focus_x(layout_sources[0])))
        filters.append(multicam_modern_card_filter("p10", pip_width, pip_height, "pipcard", margin=4, blur=12, focus_x=multicam_source_focus_x(layout_sources[1])))
        filters.extend(multicam_overlay_card_filters("canvas", "basecard", base_margin_x, base_margin_y, base_width, base_height, "pip_a", radius=72))
        filters.extend(multicam_overlay_card_filters("pip_a", "pipcard", pip_x, pip_y, pip_width, pip_height, "v", radius=44))
    elif layout_mode == "scene-grid":
        filters.extend(multicam_prepare_video_branches(0, "g0", setpts_factors[0], branches=2, trim_start=fine_seek_values[0], trim_duration=trim_duration_values[0], rotation_degrees=rotation_values[0], color_filter=color_filter_values[0]))
        filters.extend(multicam_prepare_video_branches(1, "g1", setpts_factors[1], branches=1, trim_start=fine_seek_values[1], trim_duration=trim_duration_values[1], rotation_degrees=rotation_values[1], color_filter=color_filter_values[1]))
        gap = max(30, int(output_height * 0.032))
        side_margin = max(74, int(output_width * 0.045))
        top_margin = max(46, int(output_height * 0.052))
        card_width = max(2, output_width - (side_margin * 2))
        card_height = max(2, int((output_height - (top_margin * 2) - gap) / 2))
        bottom_y = top_margin + card_height + gap
        card_radius = max(72, min(180, int(card_height * 0.28)))
        filters.append(multicam_blurred_canvas_filter("g00", output_width, output_height, "canvas", blur=20))
        filters.append(multicam_modern_card_filter("g01", card_width, card_height, "gridcard0", margin=0, blur=12, focus_x=multicam_source_focus_x(layout_sources[0])))
        filters.append(multicam_modern_card_filter("g10", card_width, card_height, "gridcard1", margin=0, blur=12, focus_x=multicam_source_focus_x(layout_sources[1])))
        filters.extend(multicam_overlay_card_filters("canvas", "gridcard0", side_margin, top_margin, card_width, card_height, "grid_a", radius=card_radius))
        filters.extend(multicam_overlay_card_filters("grid_a", "gridcard1", side_margin, bottom_y, card_width, card_height, "v", radius=card_radius))
    elif layout_mode == "split-vertical" and output_width > output_height:
        filters.extend(multicam_prepare_video_branches(0, "s0", setpts_factors[0], branches=2, trim_start=fine_seek_values[0], trim_duration=trim_duration_values[0], rotation_degrees=rotation_values[0], color_filter=color_filter_values[0]))
        filters.extend(multicam_prepare_video_branches(1, "s1", setpts_factors[1], branches=1, trim_start=fine_seek_values[1], trim_duration=trim_duration_values[1], rotation_degrees=rotation_values[1], color_filter=color_filter_values[1]))
        side_margin = max(16, int(output_width * 0.009))
        card_gap = max(10, int(output_width * 0.005))
        card_width = max(2, int((output_width - (side_margin * 2) - card_gap) / 2))
        card_height = max(2, int(card_width * 9 / 16))
        top_margin = max(42, int((output_height - card_height) / 2))
        card_radius = max(72, min(140, int(card_height * 0.22)))
        right_x = side_margin + card_width + card_gap

        # Shared Moment in landscape should feel like two equal people in the
        # same beat, not a stacked "show both" strip.
        filters.append(multicam_blurred_canvas_filter("s00", output_width, output_height, "canvas", blur=20))
        filters.append(multicam_fit_card_filter("s01", card_width, card_height, "shared_left", blur=12))
        filters.append(multicam_fit_card_filter("s10", card_width, card_height, "shared_right", blur=12))
        filters.extend(multicam_overlay_card_filters("canvas", "shared_left", side_margin, top_margin, card_width, card_height, "split_a", radius=card_radius))
        filters.extend(multicam_overlay_card_filters("split_a", "shared_right", right_x, top_margin, card_width, card_height, "v", radius=card_radius))
    elif layout_mode == "split-vertical":
        filters.extend(multicam_prepare_video_branches(0, "s0", setpts_factors[0], branches=2, trim_start=fine_seek_values[0], trim_duration=trim_duration_values[0], rotation_degrees=rotation_values[0], color_filter=color_filter_values[0]))
        filters.extend(multicam_prepare_video_branches(1, "s1", setpts_factors[1], branches=1, trim_start=fine_seek_values[1], trim_duration=trim_duration_values[1], rotation_degrees=rotation_values[1], color_filter=color_filter_values[1]))
        side_margin = max(44, int(output_width * 0.025))
        gap = max(24, int(output_width * 0.014))
        card_width = max(2, int((output_width - (side_margin * 2) - gap) / 2))
        card_height = min(max(2, output_height - 96), max(2, int(card_width * 0.84)))
        top_margin = max(42, int((output_height - card_height) / 2))
        second_x = side_margin + card_width + gap
        card_radius = max(88, min(180, int(card_height * 0.18)))
        filters.append(multicam_blurred_canvas_filter("s00", output_width, output_height, "canvas", blur=20))
        filters.append(multicam_fit_card_filter("s01", card_width, card_height, "splitcard0", blur=12))
        filters.append(multicam_fit_card_filter("s10", card_width, card_height, "splitcard1", blur=12))
        filters.extend(multicam_overlay_card_filters("canvas", "splitcard0", side_margin, top_margin, card_width, card_height, "split_a", radius=card_radius))
        filters.extend(multicam_overlay_card_filters("split_a", "splitcard1", second_x, top_margin, card_width, card_height, "v", radius=card_radius))

    cmd.extend([
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[v]",
        "-t",
        str(max(0.02, float(duration))),
        *build_multicam_segment_encode_args(),
        "-an",
        "-movflags",
        "+faststart",
        "-vsync", "cfr",
        segment_output_path,
    ])
    await run_subprocess_async(cmd, check=True, job_context=job_id)
    return True


MULTICAM_SYNC_SAMPLE_RATE = max(4000, int(os.getenv("MULTICAM_SYNC_SAMPLE_RATE", "16000")))
MULTICAM_SYNC_ANALYSIS_SECONDS = max(60, int(os.getenv("MULTICAM_SYNC_ANALYSIS_SECONDS", "900")))
MULTICAM_SYNC_MAX_SHIFT_SECONDS = max(5, int(os.getenv("MULTICAM_SYNC_MAX_SHIFT_SECONDS", "45")))
MULTICAM_PREFLIGHT_BOOTSTRAP_MAX_SHIFT_SECONDS = max(
    30.0,
    float(os.getenv("MULTICAM_PREFLIGHT_BOOTSTRAP_MAX_SHIFT_SECONDS", "900") or 900),
)
MULTICAM_PREFLIGHT_BOOTSTRAP_MIN_CORRELATION = clamp_float(
    float(os.getenv("MULTICAM_PREFLIGHT_BOOTSTRAP_MIN_CORRELATION", "0.25") or 0.25),
    0.05,
    0.95,
)
MULTICAM_SYNC_CLAP_WINDOW_SECONDS = max(5, int(os.getenv("MULTICAM_SYNC_CLAP_WINDOW_SECONDS", "18")))
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


def cross_correlate_offsets(ref_signal, test_signal, max_shift_seconds=15.0, sample_rate=8000):
    """Cross-correlate two mono float waveforms, return best shift and correlation score.
    Positive shift means test_signal is delayed relative to ref_signal.
    """
    ref = ref_signal - np.mean(ref_signal)
    tst = test_signal - np.mean(test_signal)

    min_len = min(ref.size, tst.size)
    if min_len < sample_rate:
        return 0.0, 0.0

    ref = ref[:min_len]
    tst = tst[:min_len]

    max_shift_samples = int(max_shift_seconds * sample_rate)
    corr = np.correlate(ref, tst, mode="full")
    mid = corr.size // 2
    search_half = min(max_shift_samples, mid - 1)
    if search_half <= 0:
        return 0.0, 0.0

    region = corr[mid - search_half : mid + search_half + 1]
    best_idx = int(np.argmax(np.abs(region)))
    best_lag = (best_idx - search_half) / sample_rate
    best_score = float(region[best_idx])

    norm = float(np.linalg.norm(ref) * np.linalg.norm(tst)) or 1.0
    confidence = clamp_float((best_score / norm + 1) / 2, 0.0, 1.0)

    return best_lag, confidence


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
    peak_ratio = peak_value / max(mean_e, 0.001)
    p95 = float(np.percentile(window, 95)) if window.size else 0.0
    p95_ratio = peak_value / max(p95, 0.001)
    radius = max(2, int(0.5 * bins_per_second))
    lo = max(0, best_idx - radius)
    hi = min(window.size, best_idx + radius + 1)
    before = window[lo:max(lo, best_idx - 1)]
    after = window[min(hi, best_idx + 2):hi]
    surrounding = np.concatenate([before, after]) if before.size or after.size else np.array([], dtype=np.float32)
    surrounding_mean = float(np.mean(surrounding)) if surrounding.size else mean_e
    sharpness = peak_value / max(surrounding_mean, 0.001)
    confidence = clamp_float(
        0.25
        + min(0.35, (peak_ratio - 2.5) / 14.0)
        + min(0.25, (sharpness - 2.0) / 12.0)
        + min(0.15, (p95_ratio - 1.0) / 8.0)
        + max(0.0, dominance) * 0.15,
        0.0,
        0.99,
    )
    logger.info(
        f"Clap candidate: peak@{best_idx / bins_per_second:.2f}s val={peak_value:.4f} "
        f"mean={mean_e:.4f} ratio={peak_ratio:.1f}x p95ratio={p95_ratio:.1f}x "
        f"sharpness={sharpness:.1f}x dominance={dominance:.2f} confidence={confidence:.2f}"
    )
    if peak_ratio < 3.0 or sharpness < 2.5 or p95_ratio < 1.2:
        logger.info(
            "Clap rejected: not transient enough "
            f"(ratio={peak_ratio:.2f}, sharpness={sharpness:.2f}, p95ratio={p95_ratio:.2f})"
        )
        return None
    return {
        "seconds": round(best_idx / bins_per_second, 3),
        "strength": round(min(1.0, peak_value), 4),
        "dominance": round(dominance, 4),
        "peak_ratio": round(peak_ratio, 4),
        "p95_ratio": round(p95_ratio, 4),
        "sharpness": round(sharpness, 4),
        "confidence": round(confidence, 3),
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

    clean_signal = float(np.max(np.abs(clean_envelope))) if clean_envelope.size else 0.0
    camera_signal = float(np.max(np.abs(camera_envelope))) if camera_envelope.size else 0.0
    clean_variance = float(np.std(clean_envelope)) if clean_envelope.size else 0.0
    camera_variance = float(np.std(camera_envelope)) if camera_envelope.size else 0.0
    if clean_signal < 0.001 or camera_signal < 0.001 or clean_variance < 0.0001 or camera_variance < 0.0001:
        logger.warning(
            "Sync rejected: unusable audio signal "
            f"(clean_signal={clean_signal:.6f}, camera_signal={camera_signal:.6f}, "
            f"clean_std={clean_variance:.6f}, camera_std={camera_variance:.6f})"
        )
        return 0.0, 0.0, "silent_audio"

    method = "vad"
    best_offset = 0.0
    best_confidence = 0.0
    clap_offset = None
    clap_confidence = 0.0

    def finish(candidate_offset, candidate_confidence, candidate_method):
        """
        Clap is a useful hint, but it is not enough to green-light sync.
        Random room transients can look like a clap, so only trust it when
        VAD/waveform correlation lands in the same place.
        """
        nonlocal clap_offset, clap_confidence
        candidate_offset = float(candidate_offset or 0.0)
        candidate_confidence = float(candidate_confidence or 0.0)
        candidate_method = candidate_method or "fallback"
        if clap_offset is None:
            return round(candidate_offset, 3), round(candidate_confidence, 3), candidate_method

        clap_gap = abs(candidate_offset - clap_offset)
        if candidate_confidence >= 0.2 and clap_gap <= 1.25:
            validated_confidence = max(candidate_confidence, min(clap_confidence, 0.9))
            logger.info(
                f"Clap validated by {candidate_method}: clap_offset={clap_offset:.3f}s "
                f"candidate_offset={candidate_offset:.3f}s gap={clap_gap:.3f}s "
                f"conf={validated_confidence:.3f}"
            )
            return (
                round(candidate_offset, 3),
                round(validated_confidence, 3),
                f"clap_validated_{candidate_method}",
            )

        if candidate_confidence >= 0.65 and "waveform" in candidate_method:
            logger.warning(
                f"Strong {candidate_method} match overrides clap disagreement: "
                f"clap_offset={clap_offset:.3f}s candidate_offset={candidate_offset:.3f}s "
                f"gap={clap_gap:.3f}s candidate_conf={candidate_confidence:.3f}"
            )
            return (
                round(candidate_offset, 3),
                round(candidate_confidence, 3),
                f"{candidate_method}_clap_ignored",
            )

        if candidate_confidence >= 0.2:
            capped_confidence = min(candidate_confidence, 0.5)
            logger.warning(
                f"Clap disagrees with {candidate_method}: clap_offset={clap_offset:.3f}s "
                f"candidate_offset={candidate_offset:.3f}s gap={clap_gap:.3f}s; "
                f"capping confidence at {capped_confidence:.3f}"
            )
            return (
                round(candidate_offset, 3),
                round(capped_confidence, 3),
                f"{candidate_method}_clap_disagreed",
            )

        capped_clap_confidence = min(clap_confidence, 0.42)
        logger.warning(
            f"Clap candidate was not validated by VAD/waveform: "
            f"clap_offset={clap_offset:.3f}s candidate={candidate_offset:.3f}s "
            f"candidate_conf={candidate_confidence:.3f}; returning review-only clap"
        )
        return round(clap_offset, 3), round(capped_clap_confidence, 3), "clap_unverified"

    # === STAGE 1: Clap/spike ===
    clean_peak = detect_sync_peak(clean_envelope, bins_per_second)
    camera_peak = detect_sync_peak(camera_envelope, bins_per_second)
    if clean_peak and camera_peak:
        clap_offset = float(camera_peak["seconds"] - clean_peak["seconds"])
        clap_confidence = min(
            0.98,
            0.55
            + (float(clean_peak.get("confidence") or 0.0) + float(camera_peak.get("confidence") or 0.0)) / 4,
        )
        logger.info(
            f"CLAP CANDIDATE: clean@{clean_peak['seconds']}s (str={clean_peak['strength']:.3f}), "
            f"camera@{camera_peak['seconds']}s (str={camera_peak['strength']:.3f}), "
            f"offset={clap_offset:.3f}s, conf={clap_confidence:.3f}; validating with waveform"
        )
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
            max_shift = min(int(MULTICAM_SYNC_MAX_SHIFT_SECONDS * bins_vad), max(cv.size, camv.size) - 1)
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
            max_shift_bins = min(int(MULTICAM_SYNC_MAX_SHIFT_SECONDS * bins_ds), max(clean.size, camera.size) - 1)
            correlation = np.correlate(camera, clean, mode="full")
            mid = correlation.size // 2
            search_bins = min(max_shift_bins, mid - 1)
            if search_bins > 0:
                search_region = correlation[mid - search_bins : mid + search_bins + 1]
                best_idx = int(np.argmax(search_region))
                best_offset = (best_idx - search_bins) / bins_ds
                best_score = float(search_region[best_idx])
                norm = float(np.linalg.norm(clean) * np.linalg.norm(camera))
                if norm < 1e-9 or abs(best_score) < 1e-9:
                    logger.warning(
                        "Sync rejected: waveform correlation has no usable peak "
                        f"(score={best_score:.9f}, norm={norm:.9f})"
                    )
                    return round(best_offset, 3), 0.0, "no_correlation"
                best_confidence = clamp_float((best_score / norm + 1) / 2, 0.05, 0.7)

    # === STAGE 4: Fine refinement ===
    if best_confidence < 0.12:
        return finish(best_offset, best_confidence, "fallback")

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
                return finish(fine_offset, fine_confidence, method)

    return finish(best_offset, best_confidence, method)


async def extract_presync_clap_wav(input_path, output_wav_path, job_id):
    analysis_seconds = max(8.0, float(MULTICAM_SYNC_CLAP_WINDOW_SECONDS) + 4.0)
    await run_subprocess_async(
        [
            "ffmpeg",
            "-nostdin",
            "-i",
            input_path,
            "-vn",
            "-t",
            str(analysis_seconds),
            "-ac",
            "1",
            "-ar",
            str(MULTICAM_SYNC_SAMPLE_RATE),
            "-acodec",
            "pcm_s16le",
            "-f",
            "wav",
            "-y",
            output_wav_path,
        ],
        check=True,
        job_context=job_id,
        timeout_seconds=90,
    )
    return output_wav_path


async def detect_presync_clap(input_path, label, work_dir, job_id):
    wav_path = os.path.join(work_dir, f"{label}_clap_scan.wav")
    await extract_presync_clap_wav(input_path, wav_path, job_id)
    envelope, bins_per_second = build_sync_envelope(wav_path)
    peak = detect_sync_peak(envelope, bins_per_second)
    if not peak:
        return {
            "label": label,
            "status": "not_found",
            "clap_time_seconds": None,
            "confidence": 0.0,
            "input_path": input_path,
            "scan_wav_path": wav_path,
        }
    return {
        "label": label,
        "status": "detected",
        "clap_time_seconds": round(float(peak["seconds"]), 3),
        "confidence": round(float(peak.get("confidence") or 0.0), 3),
        "strength": peak.get("strength"),
        "dominance": peak.get("dominance"),
        "peak_ratio": peak.get("peak_ratio"),
        "p95_ratio": peak.get("p95_ratio"),
        "sharpness": peak.get("sharpness"),
        "input_path": input_path,
        "scan_wav_path": wav_path,
    }


async def prepare_presync_media_input(source_url, local_path, keep_audio=True):
    source = str(source_url or "").strip()
    if not source:
        raise HTTPException(status_code=400, detail="source_url is required")
    if not IS_PRODUCTION_ENV and not source.startswith(("http://", "https://")):
        absolute_source = os.path.abspath(source)
        allowed_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tmp"))
        if absolute_source.startswith(allowed_dir + os.sep) and os.path.exists(absolute_source):
            return absolute_source
    return await materialize_video_input(source, local_path, keep_audio=keep_audio)


def validate_presync_clap_pair(external_detection, camera_detection):
    external_wav = external_detection.get("scan_wav_path")
    camera_wav = camera_detection.get("scan_wav_path")
    external_clap = external_detection.get("clap_time_seconds")
    camera_clap = camera_detection.get("clap_time_seconds")
    if not external_wav or not camera_wav or external_clap is None or camera_clap is None:
        return {"status": "missing", "confidence": 0.0}

    clean_samples, clean_rate = read_wav_mono_float(external_wav)
    camera_samples, camera_rate = read_wav_mono_float(camera_wav)
    if clean_rate != camera_rate:
        return {"status": "sample_rate_mismatch", "confidence": 0.0}

    pre_roll = 1.0
    post_roll = 4.0
    clean_start = max(0, int((float(external_clap) - pre_roll) * clean_rate))
    clean_end = min(clean_samples.size, int((float(external_clap) + post_roll) * clean_rate))
    camera_start = max(0, int((float(camera_clap) - pre_roll) * camera_rate))
    camera_end = min(camera_samples.size, int((float(camera_clap) + post_roll) * camera_rate))
    if clean_end - clean_start < clean_rate or camera_end - camera_start < camera_rate:
        return {"status": "too_short", "confidence": 0.0}

    shift, correlation = cross_correlate_offsets(
        clean_samples[clean_start:clean_end],
        camera_samples[camera_start:camera_end],
        max_shift_seconds=1.0,
        sample_rate=clean_rate,
    )
    abs_shift = abs(float(shift))
    pair_confidence = clamp_float(float(correlation) - min(0.25, abs_shift * 0.1), 0.0, 0.99)
    refined_camera_clap = max(0.0, float(camera_clap) + float(shift))
    status = "validated" if float(correlation) >= 0.35 and abs_shift <= 1.0 else "low_confidence"
    return {
        "status": status,
        "residual_shift_seconds": round(float(shift), 3),
        "correlation": round(float(correlation), 4),
        "confidence": round(pair_confidence, 3),
        "refined_camera_clap_time_seconds": round(refined_camera_clap, 3),
    }


async def align_multicam_sources_to_clap(
    request,
    external_audio_url,
    external_audio_cache_key,
    shared_tmp_dir,
    job_id,
    min_confidence=0.55,
):
    """
    Non-destructively trim camera/external temp copies so t=0 is the same clap.
    Originals are never overwritten. Low-confidence detections only warn.
    """
    work_dir = os.path.join(shared_tmp_dir, f"{job_id}_presync_clap")
    os.makedirs(work_dir, exist_ok=True)
    min_confidence = clamp_float(float(min_confidence or 0.55), 0.0, 0.99)
    result = {
        "status": "skipped",
        "message": "",
        "min_confidence": round(min_confidence, 3),
        "detections": {},
        "calculated_offsets": {},
        "calculated_trims": {},
        "aligned_paths": {},
        "warnings": [],
    }

    try:
        external_input_path = os.path.join(work_dir, "external_master_input")
        external_input_path = await prepare_presync_media_input(
            external_audio_url,
            external_input_path,
            keep_audio=True,
        )
        if not has_audio_stream(external_input_path):
            result["status"] = "low_confidence"
            result["message"] = "External clean audio has no readable audio stream"
            result["warnings"].append(result["message"])
            logger.warning(f"PRESYNC CLAP WARNING: {result['message']}")
            return result

        source_inputs = []
        for index, source in enumerate(request.sources or []):
            source_id = source.id or f"cam{index + 1}"
            input_path = os.path.join(work_dir, f"{source_id}_input.mp4")
            input_path = await prepare_presync_media_input(source.url, input_path, keep_audio=True)
            if not has_audio_stream(input_path):
                result["detections"][source_id] = {
                    "label": source.label or source_id,
                    "status": "no_audio_stream",
                    "confidence": 0.0,
                    "input_path": input_path,
                }
                result["warnings"].append(f"{source.label or source_id} has no camera audio; clap align skipped")
            source_inputs.append((source, source_id, input_path))

        external_detection = await detect_presync_clap(
            external_input_path,
            "external_master",
            work_dir,
            job_id,
        )
        result["detections"]["external_master"] = external_detection

        for source, source_id, input_path in source_inputs:
            if not has_audio_stream(input_path):
                continue
            result["detections"][source_id] = await detect_presync_clap(
                input_path,
                source_id,
                work_dir,
                job_id,
            )

        detections = result["detections"]
        required_keys = ["external_master"] + [source_id for _source, source_id, _path in source_inputs]
        missing = [
            key
            for key in required_keys
            if detections.get(key, {}).get("status") != "detected"
        ]
        low_confidence = [
            key
            for key in required_keys
            if float(detections.get(key, {}).get("confidence") or 0.0) < min_confidence
        ]
        if missing or low_confidence:
            result["status"] = "low_confidence"
            if missing:
                result["warnings"].append(f"Missing clap detection for: {', '.join(missing)}")
            if low_confidence:
                result["warnings"].append(
                    f"Low clap confidence for: {', '.join(low_confidence)} "
                    f"(min {min_confidence:.2f})"
                )
            result["message"] = "; ".join(result["warnings"])
            logger.warning(f"PRESYNC CLAP WARNING: {json.dumps(result, default=str)}")
            return result

        pair_validation = {}
        invalid_pairs = []
        for _source, source_id, _input_path in source_inputs:
            validation = validate_presync_clap_pair(external_detection, detections[source_id])
            pair_validation[source_id] = validation
            if validation.get("status") != "validated":
                invalid_pairs.append(source_id)
                continue
            detections[source_id]["raw_clap_time_seconds"] = detections[source_id]["clap_time_seconds"]
            detections[source_id]["clap_time_seconds"] = validation["refined_camera_clap_time_seconds"]
            detections[source_id]["pair_validation_confidence"] = validation["confidence"]
            if float(validation.get("confidence") or 0.0) < min_confidence:
                result["warnings"].append(
                    f"{source_id} clap pair validation is moderate "
                    f"({float(validation.get('confidence') or 0.0):.2f} < {min_confidence:.2f}); "
                    "aligned output was created but should be visually checked."
                )
        result["pair_validation"] = pair_validation
        if invalid_pairs:
            result["status"] = "low_confidence"
            result["warnings"].append(
                "Clap pair validation failed for: "
                + ", ".join(invalid_pairs)
                + ". Not trimming because a loud peak may not be the shared sync clap."
            )
            result["message"] = "; ".join(result["warnings"])
            logger.warning(f"PRESYNC CLAP WARNING: {json.dumps(result, default=str)}")
            return result

        external_clap = float(external_detection["clap_time_seconds"])
        external_aligned_path = os.path.join(work_dir, "external_master_aligned.wav")
        await run_subprocess_async(
            [
                "ffmpeg",
                "-nostdin",
                "-ss",
                f"{external_clap:.6f}",
                "-i",
                external_input_path,
                "-vn",
                "-ac",
                "2",
                "-ar",
                "48000",
                "-acodec",
                "pcm_s16le",
                "-f",
                "wav",
                "-y",
                external_aligned_path,
            ],
            check=True,
            job_context=job_id,
            timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS,
        )
        result["aligned_paths"]["external_master"] = external_aligned_path
        result["calculated_trims"]["external_master"] = round(external_clap, 3)

        for index, (source, source_id, input_path) in enumerate(source_inputs, start=1):
            detection = detections[source_id]
            clap_time = float(detection["clap_time_seconds"])
            output_name = "cam1_aligned_cfr.mp4" if index == 1 else "cam2_aligned_cfr.mp4" if index == 2 else f"{source_id}_aligned_cfr.mp4"
            aligned_path = os.path.join(work_dir, output_name)
            await run_subprocess_async(
                [
                    "ffmpeg",
                    "-nostdin",
                    "-ss",
                    f"{clap_time:.6f}",
                    "-i",
                    input_path,
                    "-map",
                    "0:v:0",
                    "-map",
                    "0:a:0?",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "128k",
                    "-avoid_negative_ts",
                    "make_zero",
                    "-movflags",
                    "+faststart",
                    "-y",
                    aligned_path,
                ],
                check=True,
                job_context=job_id,
                timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS,
            )
            result["aligned_paths"][source_id] = aligned_path
            result["calculated_trims"][source_id] = round(clap_time, 3)
            result["calculated_offsets"][source_id] = round(clap_time - external_clap, 3)
            result.setdefault("alignment_modes", {})[source_id] = "fast_stream_copy_then_segment_cfr"

        result["status"] = "aligned"
        result["message"] = (
            "Sources clap-aligned successfully with warnings"
            if result.get("warnings")
            else "Sources clap-aligned successfully"
        )
        logger.info(
            "PRESYNC CLAP ALIGNMENT: "
            f"detected={json.dumps(result['detections'], default=str)} "
            f"trims={json.dumps(result['calculated_trims'], default=str)} "
            f"offsets={json.dumps(result['calculated_offsets'], default=str)} "
            f"paths={json.dumps(result['aligned_paths'], default=str)}"
        )
        return result
    except Exception as exc:
        result["status"] = "low_confidence"
        result["message"] = f"Clap alignment failed: {exc}"
        result["warnings"].append(result["message"])
        logger.warning(f"PRESYNC CLAP WARNING: {result['message']}", exc_info=True)
        return result


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
        external_path = os.path.join(shared_tmp_dir, "external_audio_input.wav")
        external_path = await materialize_cached_audio_input(
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
            local_path = os.path.join(shared_tmp_dir, f"camera_{index}_input.wav")
            local_path = await materialize_cached_audio_input(
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
            camera_sync_trim_start = float(getattr(source, "sync_trim_start", 0.0) or 0.0)
            external_sync_trim_start = float(getattr(request.external_audio, "sync_trim_start", 0.0) or 0.0)
            # When the browser uploads a trimmed sync snippet, the correlation delta is
            # relative to that snippet. Convert it back to original-media time before
            # applying the offset to preview/render mapping.
            full_media_delta = (camera_sync_trim_start - external_sync_trim_start) + float(delta or 0.0)

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

            # SANITY CHECK: for same-event multicam, offsets should stay relatively close.
            max_reasonable_offset = min(
                float(MULTICAM_SYNC_MAX_SHIFT_SECONDS),
                max(12.0, min(camera_duration, clean_duration) * 0.03),
            )
            abs_delta = abs(full_media_delta)
            abs_trim_delta = abs(delta)
            # A match that lands exactly on the search boundary usually means
            # correlation ran out of room, not that the true offset is safe.
            offset_rejected = (
                abs_delta >= max_reasonable_offset > 1.0
                or abs_trim_delta >= max_reasonable_offset > 1.0
            )

            external_audio_base_offset = float(request.external_audio.offset_seconds or 0.0)

            if confidence < 0.25 or offset_rejected:
                if method == "silent_audio":
                    warning = "Camera sync audio is silent — re-extract camera audio before Auto Director"
                elif method == "no_correlation":
                    warning = "Camera sync audio has no usable match — verify the uploaded sync audio"
                else:
                    warning = "Low confidence — review and nudge manually" if not offset_rejected else f"Offset rejected ({abs_delta:.1f}s >= {max_reasonable_offset:.1f}s max) — place manually"
                status_label = "needs_review"
                applied_offset = 0.0  # Do NOT apply bad offsets
            elif confidence < 0.55:
                warning = "Moderate confidence — verify alignment"
                status_label = "needs_review"
                applied_offset = round(external_audio_base_offset + full_media_delta, 3)
            elif drift and drift.get("hasDrift"):
                warning = drift.get("warning", "Possible drift detected")
                status_label = "synced_with_warning"
                applied_offset = round(external_audio_base_offset + full_media_delta, 3)
            else:
                warning = None
                status_label = "synced"
                applied_offset = round(external_audio_base_offset + full_media_delta, 3)

            message = "Synced with high confidence." if status_label == "synced" else (warning or "Synced.")

            # DEBUG LOG
            logger.info(
                f"SYNC_DEBUG {cam_label}: "
                f"cam_dur={camera_duration:.1f}s clean_dur={clean_duration:.1f}s "
                f"trim_delta={delta:.3f}s full_delta={full_media_delta:.3f}s "
                f"cam_trim={camera_sync_trim_start:.3f}s clean_trim={external_sync_trim_start:.3f}s "
                f"abs_delta={abs_delta:.1f}s max_ok={max_reasonable_offset:.1f}s "
                f"rejected={offset_rejected} conf={confidence:.3f} method={method} "
                f"applied_offset={applied_offset:.3f}s"
            )

            offsets.append({
                "sourceId": source.id, "label": cam_label,
                "offsetSeconds": applied_offset,
                "delta": round(full_media_delta, 3),
                "trimDelta": round(float(delta or 0.0), 3),
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
                    "rawDelta": round(full_media_delta, 3),
                    "trimDelta": round(float(delta or 0.0), 3),
                    "cameraSyncTrimStart": round(camera_sync_trim_start, 3),
                    "externalSyncTrimStart": round(external_sync_trim_start, 3),
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

        # Sync cameras to each other only to rescue unresolved cameras.
        # Pick the strongest clean-audio match as the absolute anchor.
        if len(camera_wav_paths) >= 2:
            resolved_reference_candidates = [
                item
                for item in offsets
                if item.get("sourceId")
                and item.get("status") in {"synced", "synced_with_warning"}
                and float(item.get("confidence") or 0.0) >= 0.45
            ]
            if resolved_reference_candidates:
                ref_offset_entry = max(
                    resolved_reference_candidates,
                    key=lambda item: (
                        float(item.get("confidence") or 0.0),
                        0 if item.get("status") == "synced" else -1,
                    ),
                )
                ref_id = ref_offset_entry.get("sourceId")
                ref_path = next((p for sid, p in camera_wav_paths if sid == ref_id), None)
            else:
                ref_id, ref_path = None, None
                ref_offset_entry = None

            if ref_id and ref_path and os.path.exists(ref_path):
                ref_env, bps = build_sync_envelope(ref_path)
                reference_absolute_offset = round(
                    float(ref_offset_entry.get("offsetSeconds", 0.0)) if ref_offset_entry else 0.0,
                    3,
                )
                for o in offsets:
                    if o.get("sourceId") == ref_id:
                        o["offsetSeconds"] = reference_absolute_offset
                        o["intercamOffsetSeconds"] = 0.0
                        o["confidence"] = max(float(o.get("confidence") or 0.0), 0.95)
                        o["method"] = f"{o.get('method') or 'clean_audio'}+intercam_ref"
                        o["status"] = "synced" if o.get("status") != "needs_review" else "needs_review"
                        o["message"] = "Reference camera anchored to clean audio"
                        continue

                    # Keep strong clean-audio matches exactly where they landed.
                    if o.get("status") in {"synced", "synced_with_warning"} and float(o.get("confidence") or 0.0) >= 0.45:
                        o["message"] = "Direct clean-audio sync preserved"
                        continue

                    match = next((p for sid, p in camera_wav_paths if sid == o.get("sourceId")), None)
                    if match and os.path.exists(match):
                        cam_env, _ = build_sync_envelope(match)
                        delta, conf, method = estimate_envelope_offset(ref_env, cam_env, bps)
                        ref_source = next((s for s in request.sources if s.id == ref_id), None)
                        cam_source = next((s for s in request.sources if s.id == o.get("sourceId")), None)
                        ref_trim_start = float(getattr(ref_source, "sync_trim_start", 0.0) or 0.0) if ref_source else 0.0
                        cam_trim_start = float(getattr(cam_source, "sync_trim_start", 0.0) or 0.0) if cam_source else 0.0
                        full_intercam_delta = (cam_trim_start - ref_trim_start) + float(delta or 0.0)
                        if conf > 0.2:
                            o["intercamOffsetSeconds"] = round(full_intercam_delta, 3)
                            o["intercamTrimDelta"] = round(float(delta or 0.0), 3)
                            o["offsetSeconds"] = round(reference_absolute_offset + full_intercam_delta, 3)
                            o["confidence"] = max(float(o.get("confidence") or 0.0), conf)
                            o["method"] = f"intercam_{method}"
                            o["status"] = "synced_with_warning" if conf < 0.45 else "synced"
                            o["message"] = f"Recovered from reference camera ({method}) while preserving clean-audio anchor"
                            if conf < 0.45:
                                o["warning"] = "Recovered by inter-camera sync — verify before export"
                        else:
                            o["intercamOffsetSeconds"] = None
                            o["status"] = "needs_review"
                            o["message"] = "Could not sync to reference camera"
                    else:
                        o["intercamOffsetSeconds"] = None
                        o["status"] = "needs_review"
                        o["message"] = "Sync WAV not found"
                logger.info(
                    f"Inter-camera sync: rescued unresolved cameras using reference {ref_id} "
                    f"(clean conf={float(ref_offset_entry.get('confidence') or 0.0):.3f})"
                )
            else:
                logger.info("Inter-camera sync skipped: no trustworthy clean-audio reference camera found")
        else:
            for o in offsets:
                o["offsetSeconds"] = round(float(o.get("offsetSeconds", 0.0)), 3)
                o["confidence"] = max(float(o.get("confidence") or 0.0), 0.95)
                o["method"] = f"{o.get('method') or 'clean_audio'}+single_cam"
                if o.get("status") != "needs_review":
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


@app.post("/multicam/preflight-sync")
async def multicam_preflight_sync(request: RenderMultiCamRequest):
    """Fast sync preflight: sample audio at start/mid/end, cross-correlate, detect drift.
    Returns confidence per camera so the frontend can warn before full render."""
    if not request.external_audio_url:
        raise HTTPException(status_code=400, detail="external_audio_url required for preflight")

    job_id = request.job_id or str(uuid.uuid4())
    shared_tmp = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    source_paths = []
    source_offsets = []

    for idx, source in enumerate(request.sources or []):
        local = os.path.join(shared_tmp, f"{job_id}_preflight_src_{idx}.wav")
        local = await materialize_audio_input(source.url, local)
        source_paths.append(local)
        source_offsets.append(float(source.offset_seconds or 0.0))

    ext_local = os.path.join(shared_tmp, f"{job_id}_preflight_ext.wav")
    ext_local = await materialize_audio_input(request.external_audio_url, ext_local)

    try:
        source_sync_rates = []
        for source in request.sources or []:
            raw_sync_rate = source.sync_rate if source.sync_rate is not None else source.syncRate
            source_sync_rates.append(clamp_float(float(raw_sync_rate or 1.0), 0.95, 1.05))

        nested_external_audio = request.externalAudio
        external_audio_offset_seconds = float(
            request.external_audio_offset_seconds
            if request.external_audio_offset_seconds not in (None, 0.0)
            else (nested_external_audio.offset_seconds if nested_external_audio else 0.0)
        )
        result = await preflight_multicam_sync(
            source_paths,
            source_offsets,
            ext_local,
            job_id,
            source_sync_rates,
            external_audio_offset_seconds=external_audio_offset_seconds,
            timeline_start_seconds=(
                request.timeline_start
                if request.timeline_start is not None
                else (request.timelineStart if request.timelineStart is not None else request.overlap_start)
            ),
            timeline_duration_seconds=(
                request.overlap_duration
                if request.overlap_duration
                else (request.overlapDuration if request.overlapDuration else None)
            ),
        )
        logger.info(
            "PREFLIGHT_SYNC_RESULT job=%s status=%s cameras=%s",
            job_id,
            result.get("status"),
            json.dumps(
                {
                    key: {
                        "confidence": value.get("confidence"),
                        "avg_correlation": value.get("avg_correlation"),
                        "max_residual_offset_seconds": value.get("max_residual_offset_seconds"),
                        "suggested_offset_seconds": value.get("suggested_offset_seconds"),
                        "bootstrap_sync": value.get("bootstrap_sync"),
                    }
                    for key, value in (result.get("cameras") or {}).items()
                },
                default=str,
            ),
        )
        return result
    finally:
        for f in source_paths + [ext_local]:
            try:
                if os.path.exists(f):
                    os.remove(f)
            except OSError:
                pass


@app.post("/multicam/pre-sync-clap-align")
async def multicam_pre_sync_clap_align(request: RenderMultiCamRequest):
    """Detect clap spikes and create non-destructive aligned temp media files."""
    if not request.external_audio_url:
        raise HTTPException(status_code=400, detail="external_audio_url required for clap alignment")
    if len(request.sources or []) < 2:
        raise HTTPException(status_code=400, detail="At least two camera sources are required")

    job_id = request.job_id or f"pre-sync-clap-{uuid.uuid4().hex[:10]}"
    shared_tmp = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    min_confidence = (
        float(request.preSyncMinConfidence)
        if request.preSyncMinConfidence is not None
        else float(request.pre_sync_min_confidence or 0.55)
    )
    result = await align_multicam_sources_to_clap(
        request,
        request.external_audio_url,
        request.external_audio_cache_key,
        shared_tmp,
        job_id,
        min_confidence=min_confidence,
    )
    return result


@app.post("/render-multicam")
async def render_multicam(request: RenderMultiCamRequest, background_tasks: BackgroundTasks):
    if request.async_mode:
        job_id = request.job_id or str(uuid.uuid4())
        logger.info(f"Queuing ASYNC multicam render job {job_id}")
        background_tasks.add_task(render_multicam_impl, request, job_id)
        return {"status": "processing", "job_id": job_id, "mode": "async"}

    return await render_multicam_impl(request)


def estimate_sync_fit(window_results, current_offset, current_sync_rate):
    fit_points = []
    for value in window_results.values():
        if "estimated_offset_seconds" not in value:
            continue
        source_pos = float(value["camera_source_position_seconds"])
        timeline_pos = float(value["timeline_position_seconds"])
        residual = float(value["estimated_offset_seconds"])
        fit_points.append((source_pos, timeline_pos + residual))

    if len(fit_points) < 2:
        if len(fit_points) == 1:
            source_pos, corrected_timeline = fit_points[0]
            suggested_offset = corrected_timeline - (source_pos / max(0.001, float(current_sync_rate or 1.0)))
            return {
                "status": "single_point",
                "suggested_offset_seconds": round(suggested_offset, 6),
                "suggested_sync_rate": round(float(current_sync_rate or 1.0), 9),
                "fit_points": [
                    {
                        "source_position_seconds": round(source_pos, 3),
                        "corrected_timeline_seconds": round(corrected_timeline, 3),
                    }
                ],
            }
        return {
            "status": "insufficient_points",
            "suggested_offset_seconds": round(float(current_offset or 0.0), 6),
            "suggested_sync_rate": round(float(current_sync_rate or 1.0), 9),
            "fit_points": [],
        }

    n = float(len(fit_points))
    sum_x = sum(point[0] for point in fit_points)
    sum_y = sum(point[1] for point in fit_points)
    sum_xx = sum(point[0] * point[0] for point in fit_points)
    sum_xy = sum(point[0] * point[1] for point in fit_points)
    denominator = (n * sum_xx) - (sum_x * sum_x)
    if abs(denominator) < 1e-9:
        slope = 1.0 / max(0.001, float(current_sync_rate or 1.0))
    else:
        slope = ((n * sum_xy) - (sum_x * sum_y)) / denominator
    if abs(slope) < 1e-9:
        slope = 1.0 / max(0.001, float(current_sync_rate or 1.0))
    intercept = (sum_y - (slope * sum_x)) / n
    suggested_sync_rate = clamp_float(1.0 / slope, 0.95, 1.05)
    predicted = [(slope * x) + intercept for x, _y in fit_points]
    fit_error = max(abs(pred - y) for pred, (_x, y) in zip(predicted, fit_points))
    return {
        "status": "fit",
        "suggested_offset_seconds": round(intercept, 6),
        "suggested_sync_rate": round(suggested_sync_rate, 9),
        "timeline_slope_seconds_per_source_second": round(slope, 9),
        "max_fit_error_seconds": round(fit_error, 3),
        "fit_points": [
            {
                "source_position_seconds": round(source_pos, 3),
                "corrected_timeline_seconds": round(corrected_timeline, 3),
            }
            for source_pos, corrected_timeline in fit_points
        ],
    }


def estimate_broad_proxy_sync_offset(
    source_path,
    external_audio_path,
    current_offset,
    sync_rate,
    external_audio_offset_seconds=0.0,
    max_shift_seconds=None,
):
    """
    Bootstrap a camera-to-clean-audio offset from the full audio proxy.

    The strict preflight windows need a reasonable starting offset. For the
    common podcast case, cameras may start well before Audacity/Behringer clean
    audio, so a 0s seed can be minutes wrong. This broad pass finds the proxy
    time delta first, then the strict start/middle/end pass proves it.
    """
    try:
        camera_envelope, bins_per_second = build_sync_envelope(source_path, bins_per_second=20)
        clean_envelope, clean_bins = build_sync_envelope(external_audio_path, bins_per_second=20)
    except Exception as exc:
        return {"status": "error", "detail": str(exc), "confidence": 0.0}

    if (
        camera_envelope.size < bins_per_second * 10
        or clean_envelope.size < clean_bins * 10
        or bins_per_second <= 0
    ):
        return {"status": "too_short", "confidence": 0.0}

    downsample = max(1, int(bins_per_second / 5))
    camera = camera_envelope[::downsample].astype(np.float64)
    clean = clean_envelope[::downsample].astype(np.float64)
    bins = float(bins_per_second) / float(downsample)
    min_len = min(camera.size, clean.size)
    if min_len < bins * 10:
        return {"status": "too_short", "confidence": 0.0}

    camera = camera[:min_len] - np.mean(camera[:min_len])
    clean = clean[:min_len] - np.mean(clean[:min_len])
    norm = float(np.linalg.norm(camera) * np.linalg.norm(clean))
    if norm < 1e-9:
        return {"status": "silent_audio", "confidence": 0.0}

    max_shift = float(max_shift_seconds or MULTICAM_PREFLIGHT_BOOTSTRAP_MAX_SHIFT_SECONDS)
    max_shift_bins = min(int(max_shift * bins), max(camera.size, clean.size) - 1)
    if max_shift_bins <= 0:
        return {"status": "too_short", "confidence": 0.0}

    correlation = np.correlate(camera, clean, mode="full")
    mid = correlation.size // 2
    search = min(max_shift_bins, mid - 1)
    if search <= 0:
        return {"status": "too_short", "confidence": 0.0}

    region = correlation[mid - search : mid + search + 1]
    best_idx = int(np.argmax(region))
    best_score = float(region[best_idx])
    camera_minus_external_seconds = (best_idx - search) / bins
    confidence = clamp_float((best_score / norm + 1.0) / 2.0, 0.0, 1.0)
    safe_sync_rate = max(0.001, float(sync_rate or 1.0))
    suggested_offset = float(external_audio_offset_seconds or 0.0) - (
        float(camera_minus_external_seconds) / safe_sync_rate
    )

    return {
        "status": "usable" if confidence >= MULTICAM_PREFLIGHT_BOOTSTRAP_MIN_CORRELATION else "low_confidence",
        "camera_minus_external_seconds": round(float(camera_minus_external_seconds), 3),
        "suggested_offset_seconds": round(float(suggested_offset), 6),
        "current_offset_seconds": round(float(current_offset or 0.0), 6),
        "offset_delta_seconds": round(float(suggested_offset) - float(current_offset or 0.0), 6),
        "correlation": round(float(confidence), 4),
        "confidence": round(float(confidence), 4),
        "max_shift_seconds": round(float(max_shift), 3),
        "method": "broad_audio_proxy_envelope_correlation",
    }


async def preflight_multicam_sync(
    source_paths,
    source_offsets,
    external_audio_path,
    job_id,
    source_sync_rates=None,
    external_audio_offset_seconds=0.0,
    timeline_start_seconds=None,
    timeline_duration_seconds=None,
):
    """
    Fast sync preflight: sample short audio windows at start/mid/end of each camera,
    cross-correlate with clean audio. Returns per-camera confidence and drift detection.
    """
    SAMPLE_SECONDS = 10.0
    MAX_SHIFT = 15.0  # max seconds to shift in cross-correlation

    external_duration = get_media_duration(external_audio_path)
    results = {}
    source_sync_rates = source_sync_rates or [1.0] * len(source_paths)
    external_offset = float(external_audio_offset_seconds or 0.0)
    has_timeline_window = (
        timeline_duration_seconds is not None
        and float(timeline_duration_seconds or 0.0) > SAMPLE_SECONDS + 1.0
    )
    timeline_start = float(timeline_start_seconds or 0.0)
    timeline_duration = float(timeline_duration_seconds or 0.0)

    def build_window_positions(source_duration, offset, sync_rate):
        if has_timeline_window:
            timeline_windows = {
                "start": timeline_start + 5.0,
                "middle": timeline_start + max(5.0, (timeline_duration - SAMPLE_SECONDS) / 2.0),
                "end": timeline_start + max(5.0, timeline_duration - SAMPLE_SECONDS - 5.0),
            }
            return {
                label: {
                    "source_pos": (timeline_pos - float(offset)) * sync_rate,
                    "timeline_pos": timeline_pos,
                    "rendered_external_pos": timeline_pos - external_offset,
                }
                for label, timeline_pos in timeline_windows.items()
            }

        return {
            "start": {
                "source_pos": 5.0,
                "timeline_pos": (5.0 / sync_rate) + float(offset),
                "rendered_external_pos": ((5.0 / sync_rate) + float(offset)) - external_offset,
            },
            "middle": {
                "source_pos": max(5.0, (source_duration - SAMPLE_SECONDS) / 2.0),
                "timeline_pos": (max(5.0, (source_duration - SAMPLE_SECONDS) / 2.0) / sync_rate) + float(offset),
                "rendered_external_pos": (
                    (max(5.0, (source_duration - SAMPLE_SECONDS) / 2.0) / sync_rate) + float(offset)
                ) - external_offset,
            },
            "end": {
                "source_pos": max(5.0, source_duration - SAMPLE_SECONDS - 5.0),
                "timeline_pos": (max(5.0, source_duration - SAMPLE_SECONDS - 5.0) / sync_rate) + float(offset),
                "rendered_external_pos": (
                    (max(5.0, source_duration - SAMPLE_SECONDS - 5.0) / sync_rate) + float(offset)
                ) - external_offset,
            },
        }

    async def measure_source_windows(path, cam_idx, offset, sync_rate, mode_label):
        dur = get_media_duration(path)
        if dur <= SAMPLE_SECONDS * 2:
            return {
                "window_results": {},
                "receipt": {"status": "skip", "reason": "source too short"},
            }

        window_results = {}
        windows = build_window_positions(dur, offset, sync_rate)
        for label, positions in windows.items():
            source_pos = float(positions["source_pos"])
            timeline_pos = float(positions["timeline_pos"])
            rendered_external_pos = float(positions["rendered_external_pos"])
            if source_pos < 0 or source_pos + SAMPLE_SECONDS > dur:
                window_results[label] = {
                    "status": "source_out_of_bounds",
                    "camera_source_position_seconds": round(source_pos, 1),
                    "timeline_position_seconds": round(timeline_pos, 1),
                    "mode": mode_label,
                }
                continue
            if rendered_external_pos < 0 or rendered_external_pos + SAMPLE_SECONDS > external_duration:
                window_results[label] = {
                    "status": "external_out_of_bounds",
                    "camera_source_position_seconds": round(source_pos, 1),
                    "timeline_position_seconds": round(timeline_pos, 1),
                    "rendered_external_audio_position_seconds": round(rendered_external_pos, 1),
                    "external_audio_offset_seconds": round(external_offset, 3),
                }
                continue

            src_clip = None
            ref_clip = None
            try:
                # Extract source audio clip — skip if source has no audio track
                src_clip = os.path.join(
                    os.path.dirname(path), f"{job_id}_preflight_src_{cam_idx}_{mode_label}_{label}.wav"
                )
                try:
                    await run_subprocess_async(
                        ["ffmpeg", "-nostdin", "-ss", str(source_pos), "-t", str(SAMPLE_SECONDS),
                         "-i", path, "-vn", "-ac", "1", "-ar", "8000",
                         "-acodec", "pcm_s16le", "-f", "wav", "-y", src_clip],
                        check=True, timeout_seconds=30,
                    )
                except Exception:
                    window_results[label] = {"status": "no_audio_track", "detail": "source has no audio stream"}
                    continue

                # Extract clean audio clip at same timeline position
                ref_clip = os.path.join(
                    os.path.dirname(path), f"{job_id}_preflight_ref_{cam_idx}_{mode_label}_{label}.wav"
                )
                await run_subprocess_async(
                    ["ffmpeg", "-nostdin", "-ss", str(rendered_external_pos), "-t", str(SAMPLE_SECONDS),
                     "-i", external_audio_path, "-vn", "-ac", "1", "-ar", "8000",
                     "-acodec", "pcm_s16le", "-f", "wav", "-y", ref_clip],
                    check=True, timeout_seconds=30,
                )

                # Cross-correlate
                src_signal, _src_rate = read_wav_mono_float(src_clip)
                ref_signal, _ref_rate = read_wav_mono_float(ref_clip)
                shift, corr = cross_correlate_offsets(ref_signal, src_signal, max_shift_seconds=MAX_SHIFT, sample_rate=8000)

                window_results[label] = {
                    "estimated_offset_seconds": round(shift, 3),
                    "correlation": round(corr, 4),
                    "manual_offset_seconds": round(float(offset), 3),
                    "sync_rate": round(sync_rate, 9),
                    "camera_source_position_seconds": round(source_pos, 1),
                    "timeline_position_seconds": round(timeline_pos, 1),
                    "rendered_external_audio_position_seconds": round(rendered_external_pos, 1),
                    "external_audio_offset_seconds": round(external_offset, 3),
                    "mode": mode_label,
                }
            except Exception as e:
                window_results[label] = {"status": "error", "detail": str(e)}
            finally:
                for clip_var in ["src_clip", "ref_clip"]:
                    clip_path = locals().get(clip_var)
                    if clip_path and os.path.exists(str(clip_path)):
                        try:
                            os.remove(str(clip_path))
                        except OSError:
                            pass

        return {"window_results": window_results, "receipt": summarize_preflight_windows(window_results, offset, sync_rate)}

    def summarize_preflight_windows(window_results, offset, sync_rate):
        # Detect drift: compare start vs end offset estimates
        offsets = [
            w.get("estimated_offset_seconds", 0)
            for w in [window_results.get("start"), window_results.get("middle"), window_results.get("end")]
            if w and "estimated_offset_seconds" in w
        ]
        drift = max(offsets) - min(offsets) if len(offsets) >= 2 else 0
        max_residual_offset = max([abs(float(value)) for value in offsets] or [0.0])
        sync_fit = estimate_sync_fit(window_results, offset, sync_rate)

        # Confidence: based on residual sync error first, then correlation/drift.
        # Different camera mics can correlate modestly even when the timing is correct.
        all_errors = [v for v in window_results.values() if "status" in v]
        avg_corr = 0.0
        if all_errors and all(e.get("status") == "no_audio_track" for e in all_errors):
            confidence = "skipped_no_audio"
        else:
            avg_corr = (
                sum(w.get("correlation", 0) for w in window_results.values() if "correlation" in w)
                / max(1, sum(1 for w in window_results.values() if "correlation" in w))
            )
            confidence = "good" if avg_corr > 0.25 and drift < 0.15 and max_residual_offset < 0.15 else (
                "questionable" if avg_corr > 0.25 and drift < 1.0 and max_residual_offset < 0.5 else "unsafe"
            )

        return {
            "windows": {k: v for k, v in window_results.items() if "status" not in v},
            "errors": {k: v for k, v in window_results.items() if "status" in v},
            "drift_seconds": round(drift, 3),
            "max_residual_offset_seconds": round(max_residual_offset, 3),
            "avg_correlation": round(avg_corr, 4),
            "confidence": confidence,
            "current_offset": offset,
            "current_sync_rate": round(sync_rate, 9),
            "external_audio_offset_seconds": round(external_offset, 3),
            "suggested_offset_seconds": sync_fit.get("suggested_offset_seconds"),
            "suggested_sync_rate": sync_fit.get("suggested_sync_rate"),
            "sync_fit": sync_fit,
            "timeline_window": {
                "active": bool(has_timeline_window),
                "timeline_start_seconds": round(timeline_start, 3),
                "timeline_duration_seconds": round(timeline_duration, 3),
            },
        }

    def get_fit_correction(receipt, current_offset, current_sync_rate):
        fit = receipt.get("sync_fit") or {}
        if fit.get("status") != "fit":
            return None
        try:
            suggested_offset = float(fit.get("suggested_offset_seconds"))
            suggested_sync_rate = clamp_float(float(fit.get("suggested_sync_rate") or current_sync_rate), 0.95, 1.05)
        except (TypeError, ValueError):
            return None

        raw_max_fit_error = fit.get("max_fit_error_seconds")
        max_fit_error = 999.0 if raw_max_fit_error is None else float(raw_max_fit_error)
        avg_corr = float(receipt.get("avg_correlation", 0.0) or 0.0)
        offset_delta = abs(suggested_offset - float(current_offset or 0.0))
        if max_fit_error > 0.2 or avg_corr < 0.25 or offset_delta > MULTICAM_PREFLIGHT_BOOTSTRAP_MAX_SHIFT_SECONDS:
            return None
        return suggested_offset, suggested_sync_rate

    for cam_idx, (path, offset) in enumerate(zip(source_paths, source_offsets)):
        sync_rate = max(0.001, float(source_sync_rates[cam_idx] if cam_idx < len(source_sync_rates) else 1.0))
        current_measurement = await measure_source_windows(path, cam_idx, offset, sync_rate, "current")
        receipt = current_measurement["receipt"]
        bootstrap = None

        if receipt.get("confidence") == "unsafe":
            bootstrap = estimate_broad_proxy_sync_offset(
                path,
                external_audio_path,
                offset,
                sync_rate,
                external_audio_offset_seconds=external_offset,
            )
            if bootstrap.get("status") == "usable":
                boot_offset = float(bootstrap.get("suggested_offset_seconds") or offset)
                boot_measurement = await measure_source_windows(path, cam_idx, boot_offset, sync_rate, "bootstrap")
                boot_receipt = boot_measurement["receipt"]
                if boot_receipt.get("confidence") != "unsafe":
                    receipt = boot_receipt
                else:
                    receipt["bootstrap_attempt"] = boot_receipt

        if receipt.get("confidence") != "good":
            receipt_offset = float(receipt.get("current_offset", offset) or 0.0)
            receipt_sync_rate = float(receipt.get("current_sync_rate", sync_rate) or sync_rate)
            fit_correction = get_fit_correction(receipt, receipt_offset, receipt_sync_rate)
            if fit_correction:
                fit_offset, fit_sync_rate = fit_correction
                fit_measurement = await measure_source_windows(path, cam_idx, fit_offset, fit_sync_rate, "fit")
                fit_receipt = fit_measurement["receipt"]
                previous_receipt = dict(receipt)
                if fit_receipt.get("confidence") == "good":
                    fit_receipt["corrected_from"] = previous_receipt
                    receipt = fit_receipt
                else:
                    receipt["fit_correction_attempt"] = fit_receipt

        if bootstrap:
            receipt["bootstrap_sync"] = bootstrap
        receipt["initial_preflight"] = current_measurement["receipt"] if receipt is not current_measurement["receipt"] else None
        results[f"cam_{cam_idx}"] = {
            k: v for k, v in receipt.items() if v is not None
        }

    # Overall verdict
    confidences = [r.get("confidence") for r in results.values() if "confidence" in r]
    if all(c == "skipped_no_audio" for c in confidences):
        overall = "skipped_no_audio"
    elif not confidences:
        overall = "unsafe"
    else:
        overall = "unsafe" if "unsafe" in confidences else (
            "questionable" if "questionable" in confidences else "good"
        )

    return {"status": overall, "cameras": results}


def build_continuous_sync_checkpoints(overlap_duration, sample_seconds, interval_seconds):
    safe_duration = max(0.0, float(overlap_duration or 0.0))
    if safe_duration <= sample_seconds + 0.5:
        return []

    max_start = max(0.0, safe_duration - sample_seconds - 0.5)
    checkpoints = [0.0]

    # Drift has shown up most visibly near the first few minutes and the final
    # couple of minutes, so keep the 5-minute cadence but add guard anchors at
    # both ends instead of trusting only the middle of the episode.
    edge_guards = [120.0, 240.0]
    for guard in edge_guards:
        if guard < max_start - 1.0:
            checkpoints.append(guard)

    cursor = float(interval_seconds)
    while cursor < max_start - 1.0:
        checkpoints.append(cursor)
        cursor += float(interval_seconds)

    for guard_from_end in reversed(edge_guards):
        guard = max_start - guard_from_end
        if guard > 0.0:
            checkpoints.append(guard)
    checkpoints.append(max_start)

    deduped = []
    for value in sorted(checkpoints):
        bounded = clamp_float(float(value), 0.0, max_start)
        if not any(abs(bounded - existing) < 8.0 for existing in deduped):
            deduped.append(bounded)
    return deduped


def activate_continuous_sync_map(source, anchors):
    accepted = [
        anchor
        for anchor in anchors
        if anchor.get("status") == "accepted"
        and anchor.get("source_position_seconds") is not None
        and anchor.get("corrected_timeline_seconds") is not None
    ]
    accepted = sorted(accepted, key=lambda item: float(item.get("corrected_timeline_seconds") or 0.0))

    monotonic = []
    for anchor in accepted:
        if not monotonic:
            monotonic.append(anchor)
            continue
        previous = monotonic[-1]
        if (
            float(anchor["corrected_timeline_seconds"]) > float(previous["corrected_timeline_seconds"]) + 1.0
            and float(anchor["source_position_seconds"]) > float(previous["source_position_seconds"]) + 1.0
        ):
            monotonic.append(anchor)

    active = len(monotonic) >= 2
    source["continuous_sync_map"] = {
        "active": active,
        "mode": "piecewise_5_minute_anchors",
        "measurement": "camera_scratch_audio_to_external_audio_correlation",
        "word_anchor_status": "whisper_word_timestamps_supported; audio correlation is used as sample-accurate guard",
        "anchor_count": len(monotonic),
        "anchors": monotonic if active else accepted,
        "rejected_anchor_count": len([anchor for anchor in anchors if anchor.get("status") != "accepted"]),
    }
    return source["continuous_sync_map"]


async def build_continuous_sync_anchor_maps(
    prepared_sources,
    external_audio_path,
    overlap_start,
    overlap_duration,
    job_id,
    external_audio_offset_seconds=0.0,
):
    receipt = {
        "enabled": bool(MULTICAM_CONTINUOUS_SYNC_ANCHORS),
        "status": "skipped_disabled" if not MULTICAM_CONTINUOUS_SYNC_ANCHORS else "pending",
        "mode": "piecewise_5_minute_anchors",
        "anchor_interval_seconds": round(float(MULTICAM_CONTINUOUS_SYNC_INTERVAL_SECONDS), 3),
        "sample_seconds": round(float(MULTICAM_CONTINUOUS_SYNC_SAMPLE_SECONDS), 3),
        "min_correlation": round(float(MULTICAM_CONTINUOUS_SYNC_MIN_CORRELATION), 3),
        "max_accepted_residual_seconds": round(float(MULTICAM_CONTINUOUS_SYNC_MAX_ACCEPTED_RESIDUAL_SECONDS), 3),
        "word_anchor_status": "Whisper word timestamps are available in the pipeline; this pass uses audio correlation for frame-accurate anchor measurement.",
        "protected_drift_zones": {
            "first_minutes": 4,
            "final_minutes": 2,
            "strategy": "5-minute cadence plus early and final guard anchors",
        },
        "cameras": {},
    }
    if not MULTICAM_CONTINUOUS_SYNC_ANCHORS:
        return receipt
    if not external_audio_path or not os.path.exists(external_audio_path):
        receipt["status"] = "skipped_no_external_audio"
        receipt["message"] = "External audio path was not available for continuous sync anchors"
        return receipt

    sample_seconds = float(MULTICAM_CONTINUOUS_SYNC_SAMPLE_SECONDS)
    checkpoints = build_continuous_sync_checkpoints(
        overlap_duration,
        sample_seconds,
        MULTICAM_CONTINUOUS_SYNC_INTERVAL_SECONDS,
    )
    receipt["checkpoints_relative_seconds"] = [round(value, 3) for value in checkpoints]
    if len(checkpoints) < 2:
        receipt["status"] = "skipped_too_short"
        return receipt

    external_duration = get_media_duration(external_audio_path)
    accepted_camera_count = 0
    for cam_idx, source in enumerate(prepared_sources or []):
        source_audio_path = source.get("audio_audit_path") or source.get("path")
        camera_receipt = {
            "camera_id": source.get("id"),
            "camera_label": source.get("label"),
            "source_audio_path": source_audio_path,
            "status": "pending",
            "anchors": [],
            "accepted_anchor_count": 0,
        }
        receipt["cameras"][source.get("id") or f"cam_{cam_idx}"] = camera_receipt
        if not source_audio_path or not os.path.exists(source_audio_path):
            camera_receipt["status"] = "skipped_missing_camera_audio"
            continue
        if source.get("audio_audit_has_audio") is False:
            camera_receipt["status"] = "skipped_no_camera_audio"
            continue

        source_duration = float(source.get("duration") or get_media_duration(source_audio_path) or 0.0)
        sync_rate = max(0.001, float(source.get("sync_rate") or 1.0))
        offset = float(source.get("offset_seconds") or 0.0)
        external_offset = float(external_audio_offset_seconds or 0.0)
        anchors = []
        for anchor_index, relative_timeline in enumerate(checkpoints):
            absolute_timeline = float(overlap_start) + float(relative_timeline)
            source_pos = (absolute_timeline - offset) * sync_rate
            external_pos = absolute_timeline - external_offset
            anchor_receipt = {
                "checkpoint_index": anchor_index,
                "timeline_relative_seconds": round(relative_timeline, 3),
                "timeline_absolute_seconds": round(absolute_timeline, 3),
                "source_position_seconds": round(source_pos, 3),
                "external_audio_position_seconds": round(external_pos, 3),
                "status": "pending",
            }

            if source_pos < 0 or source_pos + sample_seconds > source_duration:
                anchor_receipt["status"] = "source_out_of_bounds"
                anchors.append(anchor_receipt)
                continue
            if external_pos < 0 or external_pos + sample_seconds > external_duration:
                anchor_receipt["status"] = "external_out_of_bounds"
                anchors.append(anchor_receipt)
                continue

            source_clip = os.path.join(
                os.path.dirname(source_audio_path),
                f"{job_id}_continuous_sync_src_{cam_idx}_{anchor_index}.wav",
            )
            ref_clip = os.path.join(
                os.path.dirname(source_audio_path),
                f"{job_id}_continuous_sync_ref_{cam_idx}_{anchor_index}.wav",
            )
            try:
                await run_subprocess_async(
                    [
                        "ffmpeg", "-nostdin",
                        "-ss", f"{source_pos:.6f}",
                        "-t", f"{sample_seconds:.6f}",
                        "-i", source_audio_path,
                        "-vn", "-ac", "1", "-ar", "8000",
                        "-acodec", "pcm_s16le", "-f", "wav", "-y", source_clip,
                    ],
                    check=True,
                    timeout_seconds=30,
                    job_context=job_id,
                )
                await run_subprocess_async(
                    [
                        "ffmpeg", "-nostdin",
                        "-ss", f"{external_pos:.6f}",
                        "-t", f"{sample_seconds:.6f}",
                        "-i", external_audio_path,
                        "-vn", "-ac", "1", "-ar", "8000",
                        "-acodec", "pcm_s16le", "-f", "wav", "-y", ref_clip,
                    ],
                    check=True,
                    timeout_seconds=30,
                    job_context=job_id,
                )
                src_signal, _ = read_wav_mono_float(source_clip)
                ref_signal, _ = read_wav_mono_float(ref_clip)
                shift, correlation = cross_correlate_offsets(
                    ref_signal,
                    src_signal,
                    max_shift_seconds=MULTICAM_CONTINUOUS_SYNC_MAX_SHIFT_SECONDS,
                    sample_rate=8000,
                )
                anchor_receipt.update({
                    "estimated_residual_seconds": round(float(shift), 4),
                    "abs_residual_seconds": round(abs(float(shift)), 4),
                    "correlation": round(float(correlation), 4),
                    "corrected_timeline_seconds": round(absolute_timeline + float(shift), 4),
                    "word_anchor": {
                        "status": "guarded_by_audio_correlation",
                        "note": "Whisper word timestamps can identify the spoken word; correlation supplies sample-accurate trim correction.",
                    },
                })
                if (
                    float(correlation) >= MULTICAM_CONTINUOUS_SYNC_MIN_CORRELATION
                    and abs(float(shift)) <= MULTICAM_CONTINUOUS_SYNC_MAX_ACCEPTED_RESIDUAL_SECONDS
                ):
                    anchor_receipt["status"] = "accepted"
                else:
                    anchor_receipt["status"] = "rejected_low_confidence"
                anchors.append(anchor_receipt)
            except Exception as sync_error:
                anchor_receipt.update({
                    "status": "error",
                    "detail": str(sync_error),
                })
                anchors.append(anchor_receipt)
            finally:
                for clip_path in [source_clip, ref_clip]:
                    try:
                        if os.path.exists(clip_path):
                            os.remove(clip_path)
                    except OSError:
                        pass

        sync_map = activate_continuous_sync_map(source, anchors)
        camera_receipt["anchors"] = anchors
        camera_receipt["accepted_anchor_count"] = int(sync_map.get("anchor_count") or 0)
        camera_receipt["active"] = bool(sync_map.get("active"))
        camera_receipt["status"] = "active" if sync_map.get("active") else "insufficient_anchors"
        if sync_map.get("active"):
            accepted_camera_count += 1

    receipt["active_camera_count"] = accepted_camera_count
    receipt["status"] = "active" if accepted_camera_count > 0 else "skipped_no_active_camera_maps"
    logger.info("CONTINUOUS SYNC ANCHORS %s: %s", job_id, json.dumps(receipt, default=str))
    return receipt


def analyze_multicam_color_profile(video_path, sample_start=0.0, sample_duration=90.0, pre_filter=""):
    width = 64
    height = 36
    frame_bytes = width * height * 3
    safe_start = max(0.0, float(sample_start or 0.0))
    safe_duration = max(1.0, float(sample_duration or 1.0))
    analysis_filter = combine_multicam_filter_chains(
        pre_filter,
        f"fps=1/5,scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},format=rgb24",
    )
    cmd = [
        "ffmpeg",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{safe_start:.3f}",
        "-t",
        f"{safe_duration:.3f}",
        "-i",
        video_path,
        "-vf",
        analysis_filter,
        "-f",
        "rawvideo",
        "-",
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or b"").decode("utf-8", errors="ignore")[-500:] or "ffmpeg color analysis failed")
    usable_bytes = len(result.stdout) - (len(result.stdout) % frame_bytes)
    if usable_bytes <= 0:
        raise RuntimeError("ffmpeg color analysis returned no video frames")

    pixels = np.frombuffer(result.stdout[:usable_bytes], dtype=np.uint8).reshape((-1, 3)).astype(np.float32)
    red = pixels[:, 0]
    green = pixels[:, 1]
    blue = pixels[:, 2]
    luma = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
    chroma = np.sqrt(((red - luma) ** 2) + ((blue - luma) ** 2))
    return {
        "sample_start_seconds": round(safe_start, 3),
        "sample_duration_seconds": round(safe_duration, 3),
        "sample_frame_count": int(usable_bytes / frame_bytes),
        "mean_r": round(float(np.mean(red)), 3),
        "mean_g": round(float(np.mean(green)), 3),
        "mean_b": round(float(np.mean(blue)), 3),
        "mean_luma": round(float(np.mean(luma)), 3),
        "contrast_luma": round(float(np.std(luma)), 3),
        "mean_chroma": round(float(np.mean(chroma)), 3),
        "warmth": round(float((np.mean(red) - np.mean(blue)) / 255.0), 5),
        "green_bias": round(float((np.mean(green) - ((np.mean(red) + np.mean(blue)) / 2.0)) / 255.0), 5),
    }


def build_multicam_color_match_filter(reference_profile, source_profile):
    ref_luma = float(reference_profile.get("mean_luma") or 0.0)
    src_luma = float(source_profile.get("mean_luma") or ref_luma or 1.0)
    ref_contrast = max(1.0, float(reference_profile.get("contrast_luma") or 1.0))
    src_contrast = max(1.0, float(source_profile.get("contrast_luma") or ref_contrast))
    ref_chroma = max(1.0, float(reference_profile.get("mean_chroma") or 1.0))
    src_chroma = max(1.0, float(source_profile.get("mean_chroma") or ref_chroma))

    brightness = clamp_float((ref_luma - src_luma) / 255.0, -0.018, 0.018)
    contrast = clamp_float(ref_contrast / src_contrast, 0.985, 1.025)
    saturation = clamp_float(ref_chroma / src_chroma, 0.97, 1.015)
    red_shift = clamp_float((float(reference_profile.get("mean_r") or 0.0) - float(source_profile.get("mean_r") or 0.0)) / 255.0, -0.018, 0.018)
    green_shift = clamp_float((float(reference_profile.get("mean_g") or 0.0) - float(source_profile.get("mean_g") or 0.0)) / 255.0, -0.012, 0.012)
    blue_shift = clamp_float((float(reference_profile.get("mean_b") or 0.0) - float(source_profile.get("mean_b") or 0.0)) / 255.0, -0.018, 0.018)

    # Keep the correction gentle: iPhone auto-exposure varies during a take, so
    # this nudges global camera character without chasing every moment.
    return (
        "colorbalance="
        f"rs={red_shift:.5f}:gs={green_shift:.5f}:bs={blue_shift:.5f}:"
        f"rm={red_shift * 0.72:.5f}:gm={green_shift * 0.72:.5f}:bm={blue_shift * 0.72:.5f},"
        f"eq=brightness={brightness:.5f}:contrast={contrast:.5f}:saturation={saturation:.5f}"
    )


def is_multicam_hdr_source(color_metadata):
    metadata = color_metadata or {}
    transfer = str(metadata.get("color_transfer") or "").lower()
    primaries = str(metadata.get("color_primaries") or "").lower()
    color_space = str(metadata.get("color_space") or "").lower()
    pix_fmt = str(metadata.get("pix_fmt") or "").lower()
    return (
        transfer in {"arib-std-b67", "smpte2084"}
        or primaries == "bt2020"
        or color_space.startswith("bt2020")
        or "10le" in pix_fmt
    )


def build_multicam_base_color_filter(color_metadata):
    if is_multicam_hdr_source(color_metadata):
        return (
            "zscale=t=linear:npl=100,"
            "format=gbrpf32le,"
            "tonemap=tonemap=hable:desat=0.35,"
            "zscale=p=bt709:t=bt709:m=bt709:r=tv,"
            "format=yuv420p"
        )
    return ""


def build_multicam_cinematic_polish_filter():
    return (
        "hqdn3d=0.30:0.24:0.70:0.52,"
        "eq=contrast=1.018:brightness=-0.002:saturation=1.005:gamma=1.000,"
        "colorbalance=rs=0.00150:bs=-0.00100:rm=0.00200:bm=-0.00150:rh=0.00100:bh=-0.00080,"
        "unsharp=3:3:0.16:3:3:0.04,"
        "vignette=angle=PI/16:eval=init"
    )


def combine_multicam_filter_chains(*chains):
    parts = []
    for chain in chains:
        safe_chain = str(chain or "").strip().strip(",")
        if safe_chain:
            parts.append(safe_chain)
    return ",".join(parts)


def multicam_visual_proxy_cache_path(source_path, visual_filter, width=1920, height=1080):
    cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp/multicam-visual-cache"))
    os.makedirs(cache_dir, exist_ok=True)
    stat = os.stat(source_path)
    key = json.dumps(
        {
            "path": os.path.abspath(source_path),
            "mtime": round(stat.st_mtime, 3),
            "size": stat.st_size,
            "filter": str(visual_filter or ""),
            "width": int(width),
            "height": int(height),
            "encoder": GPU_VIDEO_ENCODER,
            "version": 5,
        },
        sort_keys=True,
    )
    digest = hashlib.md5(key.encode("utf-8")).hexdigest()
    return os.path.join(cache_dir, f"{digest}_{int(width)}x{int(height)}.mp4")


def is_valid_multicam_visual_proxy(cache_path, minimum_duration=0.0):
    if not cache_path or not os.path.exists(cache_path) or os.path.getsize(cache_path) <= 1024 * 1024:
        return False
    try:
        duration = get_media_duration(cache_path)
        return duration >= max(0.5, float(minimum_duration or 0.0) * 0.80)
    except Exception:
        return False


def build_multicam_proxy_visual_filter(source, proxy_width, proxy_height):
    # Proxy rendering is the speed path: do color safety first, resize once, then
    # run expensive polish at 1080p instead of on 4K iPhone frames.
    return combine_multicam_filter_chains(
        multicam_rotation_filter(source.get("rotation_degrees", 0)).strip(","),
        source.get("base_color_filter"),
        source.get("color_match_filter"),
        f"scale={int(proxy_width)}:{int(proxy_height)}:force_original_aspect_ratio=decrease",
        f"pad={int(proxy_width)}:{int(proxy_height)}:(ow-iw)/2:(oh-ih)/2",
        "setsar=1",
        source.get("cinematic_polish_filter"),
        "fps=30",
    )


async def prepare_multicam_visual_proxy_sources(prepared_sources, overlap_start, overlap_duration, output_width, output_height, job_id):
    if os.getenv("MULTICAM_VISUAL_PROXY_CACHE", "1").strip().lower() in {"0", "false", "no", "off"}:
        return {"status": "disabled"}

    proxy_width = 1920 if int(output_width or 0) >= int(output_height or 0) else 1080
    proxy_height = 1080 if int(output_width or 0) >= int(output_height or 0) else 1920
    receipts = []
    for source in prepared_sources or []:
        proxy_start = max(0.0, get_source_start_for_timeline(source, overlap_start, 0.0) - 2.0)
        proxy_duration = min(
            max(0.25, float(source.get("duration") or 0.0) - proxy_start),
            max(1.0, float(source.get("sync_rate") or 1.0) * float(overlap_duration or 0.0) + 4.0),
        )
        if proxy_duration <= 1.0:
            proxy_duration = max(0.25, float(source.get("duration") or 0.0) - proxy_start)
        render_filter = build_multicam_proxy_visual_filter(source, proxy_width, proxy_height)
        cache_path = multicam_visual_proxy_cache_path(
            source["path"],
            f"{render_filter}:start={proxy_start:.3f}:duration={proxy_duration:.3f}",
            proxy_width,
            proxy_height,
        )
        cache_hit = is_valid_multicam_visual_proxy(cache_path, proxy_duration)
        if not cache_hit:
            await run_subprocess_async(
                [
                    "ffmpeg",
                    "-y",
                    "-nostdin",
                    "-fflags",
                    "+genpts",
                    "-ss",
                    f"{proxy_start:.6f}",
                    "-t",
                    f"{proxy_duration:.6f}",
                    "-i",
                    source["path"],
                    "-map",
                    "0:v:0",
                    "-vf",
                    render_filter,
                    *build_multicam_segment_encode_args(),
                    "-an",
                    "-movflags",
                    "+faststart",
                    "-vsync",
                    "cfr",
                    cache_path,
                ],
                check=True,
                job_context=job_id,
                timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS,
            )
        source["render_path"] = cache_path
        source["render_time_shift_seconds"] = proxy_start
        source["render_rotation_degrees"] = 0
        source["render_visual_filter"] = ""
        receipts.append(
            {
                "camera_id": source.get("id"),
                "camera_label": source.get("label"),
                "path": cache_path,
                "cache_hit": cache_hit,
                "source_start_seconds": round(proxy_start, 3),
                "duration_seconds": round(proxy_duration, 3),
                "width": proxy_width,
                "height": proxy_height,
            }
        )

    return {
        "status": "active",
        "mode": "per_camera_polished_1080p_proxy",
        "source_count": len(receipts),
        "sources": receipts,
    }


async def apply_multicam_color_matching(prepared_sources, overlap_start, overlap_duration, job_id, reference_index=0):
    cinematic_polish_filter = build_multicam_cinematic_polish_filter()
    receipt = {
        "status": "skipped",
        "reference_source_id": None,
        "reference_source_label": None,
        "base_normalization": {
            "status": "active",
            "target": "bt709_sdr",
            "hdr_method": "zscale_linear_hable_tonemap",
        },
        "cinematic_polish": {
            "status": "active",
            "filter": cinematic_polish_filter,
            "stages": ["noise_reduction", "contrast_lift", "warm_grade", "saturation_balance", "sharpening", "vignette"],
        },
        "sources": [],
    }
    if len(prepared_sources or []) < 2:
        return receipt

    safe_reference_index = min(max(0, int(reference_index or 0)), len(prepared_sources) - 1)
    reference_source = prepared_sources[safe_reference_index]
    receipt["reference_source_id"] = reference_source.get("id")
    receipt["reference_source_label"] = reference_source.get("label")

    sample_duration = max(1.0, min(120.0, float(overlap_duration or 1.0)))
    for index, source in enumerate(prepared_sources):
        color_metadata = source.get("color_metadata") or probe_video_color_metadata(source["path"])
        base_color_filter = build_multicam_base_color_filter(color_metadata)
        source["color_metadata"] = color_metadata
        source["base_color_filter"] = base_color_filter
        source["color_match_filter"] = ""
        source["cinematic_polish_filter"] = cinematic_polish_filter
        source["source_visual_filter"] = combine_multicam_filter_chains(base_color_filter, cinematic_polish_filter)
        source["color_match_reference_id"] = reference_source.get("id")
        source["color_match_applied"] = False
        try:
            sample_start = get_source_start_for_timeline(source, overlap_start, 0.0)
            max_duration = max(1.0, float(source.get("duration") or 0.0) - max(0.0, sample_start))
            profile = analyze_multicam_color_profile(
                source["path"],
                sample_start=max(0.0, sample_start),
                sample_duration=min(sample_duration, max_duration),
                pre_filter=base_color_filter,
            )
            source["color_profile"] = profile
            receipt["sources"].append({
                "id": source.get("id"),
                "label": source.get("label"),
                "role": "reference" if index == safe_reference_index else "matched",
                "color_metadata": color_metadata,
                "base_color_filter": base_color_filter,
                "profile": profile,
                "filter": "",
                "cinematic_polish_filter": cinematic_polish_filter,
                "source_visual_filter": source.get("source_visual_filter") or "",
                "applied": False,
            })
        except Exception as color_error:
            source["color_profile"] = None
            receipt["sources"].append({
                "id": source.get("id"),
                "label": source.get("label"),
                "role": "reference" if index == safe_reference_index else "matched",
                "status": "analysis_failed",
                "error": str(color_error),
                "color_metadata": color_metadata,
                "base_color_filter": base_color_filter,
                "filter": "",
                "cinematic_polish_filter": cinematic_polish_filter,
                "source_visual_filter": source.get("source_visual_filter") or "",
                "applied": False,
            })

    reference_profile = reference_source.get("color_profile")
    if not reference_profile:
        receipt["status"] = "skipped_reference_analysis_failed"
        logger.warning("MULTICAM COLOR MATCH skipped %s: %s", job_id, json.dumps(receipt, default=str))
        return receipt

    applied_count = 0
    for index, source in enumerate(prepared_sources):
        if index == safe_reference_index or not source.get("color_profile"):
            continue
        color_filter = build_multicam_color_match_filter(reference_profile, source["color_profile"])
        source["color_match_filter"] = color_filter
        source["source_visual_filter"] = combine_multicam_filter_chains(
            source.get("base_color_filter"),
            color_filter,
            source.get("cinematic_polish_filter"),
        )
        source["color_match_applied"] = True
        applied_count += 1
        for item in receipt["sources"]:
            if item.get("id") == source.get("id"):
                item["filter"] = color_filter
                item["source_visual_filter"] = source.get("source_visual_filter") or ""
                item["applied"] = True
                break

    for index, source in enumerate(prepared_sources):
        if index == safe_reference_index:
            source["source_visual_filter"] = combine_multicam_filter_chains(
                source.get("base_color_filter"),
                source.get("cinematic_polish_filter"),
            )
        for item in receipt["sources"]:
            if item.get("id") == source.get("id"):
                item["base_color_filter"] = source.get("base_color_filter") or ""
                item["cinematic_polish_filter"] = source.get("cinematic_polish_filter") or ""
                item["source_visual_filter"] = source.get("source_visual_filter") or ""
                break

    receipt["matched_source_count"] = applied_count
    receipt["status"] = "active" if applied_count else "skipped_no_matchable_sources"
    logger.info("MULTICAM COLOR MATCH %s: %s", job_id, json.dumps(receipt, default=str))
    return receipt


async def render_multicam_impl(request: RenderMultiCamRequest, provided_job_id: str = None):
    if len(request.sources or []) < 2:
        raise HTTPException(status_code=400, detail="At least two camera sources are required")

    job_id = provided_job_id or str(uuid.uuid4())
    render_tier = normalize_multicam_render_tier(request)
    primary_audio_camera_id = request.primary_audio_camera_id or request.primaryAudioCameraId
    has_explicit_segments = bool(request.segments)
    has_requested_overlap_start = request.overlap_start is not None or request.overlapStart is not None
    has_requested_timeline_start = request.timeline_start is not None or request.timelineStart is not None
    requested_overlap_start = float(
        request.overlap_start
        if request.overlap_start is not None
        else request.overlapStart
        if request.overlapStart is not None
        else 0.0
    )
    requested_overlap_duration = float(
        request.overlap_duration
        if request.overlap_duration not in (None, 0.0)
        else request.overlapDuration or 0.0
    )
    requested_timeline_start = (
        float(request.timeline_start)
        if request.timeline_start is not None
        else float(request.timelineStart)
        if request.timelineStart is not None
        else requested_overlap_start
    )
    output_aspect_ratio = request.output_aspect_ratio or request.outputAspectRatio or "9:16"
    nested_external_audio = request.externalAudio
    external_audio_url = request.external_audio_url or (nested_external_audio.url if nested_external_audio else None)
    external_audio_offset_seconds = float(
        request.external_audio_offset_seconds
        if request.external_audio_offset_seconds not in (None, 0.0)
        else (nested_external_audio.offset_seconds if nested_external_audio else 0.0)
    )
    external_audio_mix_mode = request.external_audio_mix_mode or (
        nested_external_audio.mix_mode if nested_external_audio else "external_only"
    )
    external_audio_cache_key = request.external_audio_cache_key or (
        nested_external_audio.cache_key if nested_external_audio else None
    )
    pre_sync_clap_alignment = (
        bool(request.preSyncClapAlignment)
        if request.preSyncClapAlignment is not None
        else bool(request.pre_sync_clap_alignment)
    )
    pre_sync_min_confidence = (
        float(request.preSyncMinConfidence)
        if request.preSyncMinConfidence is not None
        else float(request.pre_sync_min_confidence or 0.55)
    )
    shared_tmp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(shared_tmp_dir):
        os.makedirs(shared_tmp_dir)

    concat_list_path = os.path.join(shared_tmp_dir, f"{job_id}_multicam_concat.txt")
    output_path = os.path.join(shared_tmp_dir, f"{job_id}_multicam.mp4")
    video_only_output_path = os.path.join(shared_tmp_dir, f"{job_id}_multicam_video.mp4")
    primary_audio_output_path = os.path.join(shared_tmp_dir, f"{job_id}_multicam_audio.m4a")
    external_audio_input_path = os.path.join(shared_tmp_dir, f"{job_id}_external_audio_input")
    external_audio_materialized_path = external_audio_input_path
    prepared_sources = []
    segment_paths = []
    segment_duration_receipts = []
    pre_sync_result = None
    preflight = None
    continuous_sync_receipt = None
    color_match_receipt = None
    visual_proxy_receipt = None
    director_audio_receipt = None
    audio_bed_receipt = None
    caption_receipt = None
    brand_watermark_receipt = None
    thumbnail_receipt = None
    output_validation = None
    post_render_sync_audit = None
    source_url_overrides = {}
    source_offset_overrides = {}
    effective_external_audio_url = external_audio_url
    effective_external_audio_offset_seconds = external_audio_offset_seconds

    if request.async_mode:
        try:
            update_firestore_job(job_id, {"status": "processing", "progress": 0, "detail": "Preparing sources"})
        except Exception:
            pass

    try:
        if external_audio_url and pre_sync_clap_alignment:
            if request.async_mode:
                update_firestore_job(job_id, {"progress": 5, "detail": "Detecting clap alignment"})
            pre_sync_result = await align_multicam_sources_to_clap(
                request,
                external_audio_url,
                external_audio_cache_key,
                shared_tmp_dir,
                job_id,
                min_confidence=pre_sync_min_confidence,
            )
            logger.info(f"PRESYNC CLAP RESULT: {json.dumps(pre_sync_result, default=str)}")
            if pre_sync_result.get("status") == "aligned":
                effective_external_audio_url = pre_sync_result["aligned_paths"].get("external_master") or external_audio_url
                effective_external_audio_offset_seconds = 0.0
                for source in request.sources or []:
                    aligned_path = pre_sync_result["aligned_paths"].get(source.id)
                    if aligned_path:
                        source_url_overrides[source.id] = aligned_path
                        # Once every source starts on the same clap, old large offsets would double-apply.
                        source_offset_overrides[source.id] = 0.0
                logger.info(
                    "PRESYNC CLAP APPLIED: "
                    f"external={effective_external_audio_url} source_overrides={source_url_overrides}"
                )
            else:
                logger.warning(
                    "PRESYNC CLAP NOT APPLIED: "
                    f"{pre_sync_result.get('message') or pre_sync_result.get('warnings')}"
                )

        for index, source in enumerate(request.sources):
            local_path = os.path.join(shared_tmp_dir, f"{job_id}_multicam_src_{index}.mp4")
            source_url = source_url_overrides.get(source.id, source.url)
            audio_analysis_path = None
            if source.id in source_url_overrides:
                local_path = os.path.abspath(source_url)
                audio_analysis_path = local_path
                logger.info(f"Pre-sync aligned source ready for {source.label or source.id}: {local_path}")
            else:
                cfr_cache_path = await materialize_to_cfr_cache(source_url, keep_audio=True)
                logger.info(f"CFR source ready for {source.label or source.id}: {cfr_cache_path}")
                local_path = link_or_copy_cached_media(cfr_cache_path, local_path)
                if request.auto_switch:
                    # Use the same CFR timeline that video rendering cuts from. Using
                    # original-camera audio here can hide drift introduced while
                    # normalizing VFR phone footage to CFR.
                    audio_analysis_path = local_path
            source_duration = get_media_duration(local_path)
            if source_duration <= 0.1:
                raise HTTPException(status_code=400, detail=f"Source {source.label or source.id} has no readable duration")
            raw_sync_rate = source.sync_rate if source.sync_rate is not None else source.syncRate
            sync_rate = clamp_float(float(raw_sync_rate or 1.0), 0.95, 1.05)
            raw_rotation = source.rotation_degrees if source.rotation_degrees is not None else source.rotationDegrees
            rotation_degrees = normalize_multicam_rotation_degrees(raw_rotation)
            metadata_rotation_degrees = get_video_rotation_degrees(local_path)
            if metadata_rotation_degrees:
                logger.info(
                    "Cam Combiner source %s has display rotation metadata: %s degrees; "
                    "leaving FFmpeg autorotation in charge",
                    source.label or source.id,
                    metadata_rotation_degrees,
                )
            color_metadata = probe_video_color_metadata(local_path)

            prepared_sources.append(
                {
                    "id": source.id,
                    "label": source.label or source.id,
                    "path": local_path,
                    "audio_analysis_path": audio_analysis_path or local_path,
                    "duration": source_duration,
                    "offset_seconds": float(source_offset_overrides.get(source.id, source.offset_seconds or 0.0)),
                    "sync_rate": sync_rate,
                    "rotation_degrees": rotation_degrees,
                    "metadata_rotation_degrees": metadata_rotation_degrees,
                    "color_metadata": color_metadata,
                    "has_audio": has_audio_stream(audio_analysis_path or local_path),
                    "silence_intervals": [],
                    "pre_sync_aligned": bool(source.id in source_url_overrides),
                }
            )

        if request.async_mode:
            update_firestore_job(job_id, {"progress": 20, "detail": "Sources ready"})

        calculated_overlap_start = max(source["offset_seconds"] for source in prepared_sources)
        calculated_overlap_end = min(
            source["offset_seconds"] + source["duration"] for source in prepared_sources
        )

        if has_explicit_segments:
            overlap_start = float(requested_timeline_start or 0.0)
            segment_timeline_end = max(
                [float(segment.timeline_end or 0.0) for segment in (request.segments or [])] or [0.0]
            )
            overlap_duration = float(requested_overlap_duration or segment_timeline_end or 0.0)
            overlap_end = overlap_start + overlap_duration
        else:
            if has_requested_overlap_start:
                overlap_anchor = float(requested_overlap_start)
            elif external_audio_url:
                # External clean audio is the master timeline. Do not let a
                # negative camera offset become the output start, because that
                # pads/delays the master audio and creates visible lip drift.
                overlap_anchor = 0.0
            else:
                overlap_anchor = float(calculated_overlap_start)
            overlap_start = max(calculated_overlap_start, overlap_anchor)
            overlap_end = calculated_overlap_end
            if float(requested_overlap_duration or 0.0) > 0:
                overlap_end = min(overlap_end, overlap_start + float(requested_overlap_duration))
            overlap_duration = max(0.0, overlap_end - overlap_start)

        if overlap_duration <= 0.25:
            raise HTTPException(status_code=400, detail="The selected camera offsets do not produce a usable overlap")

        production_limits = enforce_multicam_production_limits(request, overlap_duration)
        output_width, output_height = get_multicam_output_dimensions(output_aspect_ratio)
        skip_visual_proxy = (
            render_tier == "simple"
            or env_flag("MULTICAM_SKIP_VISUAL_PROXY", default=False)
        )
        if skip_visual_proxy:
            color_match_receipt = {
                "status": "skipped_fast_proof_tier",
                "reason": "render_tier_simple_or_MULTICAM_SKIP_VISUAL_PROXY",
                "reference_source_id": prepared_sources[0].get("id") if prepared_sources else None,
                "sources": [
                    {
                        "id": source.get("id"),
                        "label": source.get("label"),
                        "source_visual_filter": "",
                        "applied": False,
                    }
                    for source in prepared_sources
                ],
            }
            visual_proxy_receipt = {
                "status": "skipped_fast_proof_tier",
                "mode": "direct_source_render",
                "reason": "render_tier_simple_or_MULTICAM_SKIP_VISUAL_PROXY",
                "source_count": len(prepared_sources),
            }
            for source in prepared_sources:
                source["base_color_filter"] = ""
                source["color_match_filter"] = ""
                source["cinematic_polish_filter"] = ""
                source["source_visual_filter"] = ""
                source["render_visual_filter"] = ""
        else:
            color_match_receipt = await apply_multicam_color_matching(
                prepared_sources,
                overlap_start,
                overlap_duration,
                job_id,
                reference_index=0,
            )
            if request.async_mode:
                update_firestore_job(job_id, {"progress": 28, "detail": "Preparing fast visual proxies"})
            visual_proxy_receipt = await prepare_multicam_visual_proxy_sources(
                prepared_sources,
                overlap_start,
                overlap_duration,
                output_width,
                output_height,
                job_id,
            )

        # -------- Preflight sync check (when external audio is available) --------
        if external_audio_url:
            source_paths = []
            cleanup_paths = []
            source_offsets = [s["offset_seconds"] for s in prepared_sources]
            source_sync_rates = [s["sync_rate"] for s in prepared_sources]
            for idx, original_source in enumerate(request.sources or []):
                prepared_source = next((item for item in prepared_sources if item.get("id") == original_source.id), None)
                if original_source.id in source_url_overrides:
                    preflight_src = source_url_overrides[original_source.id]
                else:
                    preflight_src = prepared_source["path"] if prepared_source is not None else None
                    if not preflight_src or not has_audio_stream(preflight_src):
                        preflight_src = os.path.join(shared_tmp_dir, f"{job_id}_preflight_src_audio_{idx}.mp4")
                        preflight_src = await prepare_presync_media_input(
                            original_source.url,
                            preflight_src,
                            keep_audio=True,
                        )
                        if os.path.abspath(preflight_src).startswith(os.path.abspath(shared_tmp_dir) + os.sep) and os.path.basename(preflight_src).startswith(f"{job_id}_preflight"):
                            cleanup_paths.append(preflight_src)
                if prepared_source is not None:
                    prepared_source["audio_audit_path"] = preflight_src
                    prepared_source["audio_audit_has_audio"] = has_audio_stream(preflight_src)
                    prepared_source["audio_audit_cleanup"] = preflight_src in cleanup_paths
                source_paths.append(preflight_src)
            if pre_sync_result and pre_sync_result.get("status") == "aligned":
                ext_local = effective_external_audio_url
            else:
                ext_local = os.path.join(shared_tmp_dir, f"{job_id}_preflight_ext_audio")
                ext_local = await prepare_presync_media_input(effective_external_audio_url, ext_local, keep_audio=True)
                if os.path.abspath(ext_local).startswith(os.path.abspath(shared_tmp_dir) + os.sep) and os.path.basename(ext_local).startswith(f"{job_id}_preflight"):
                    cleanup_paths.append(ext_local)
            try:
                preflight = await preflight_multicam_sync(
                    source_paths,
                    source_offsets,
                    ext_local,
                    job_id,
                    source_sync_rates,
                    external_audio_offset_seconds=effective_external_audio_offset_seconds,
                )
                logger.info(f"PREFLIGHT: {preflight['status']} — {preflight}")
                if preflight["status"] == "unsafe":
                    raise HTTPException(
                        status_code=422,
                        detail={
                            "message": "Sync preflight failed: camera sync does not match clean audio",
                            "preflight": preflight,
                        }
                    )
                elif preflight["status"] == "skipped_no_audio":
                    if not MULTICAM_ALLOW_SKIPPED_SYNC_NO_AUDIO:
                        raise HTTPException(
                            status_code=422,
                            detail={
                                "message": "Sync preflight could not verify camera audio; refusing public Cam Combiner render",
                                "preflight": preflight,
                            },
                        )
                    logger.info(
                        "PREFLIGHT: skipped — camera sources have no audio track (expected with CFR), "
                        "relying on manual offsets"
                    )
                elif preflight["status"] == "questionable":
                    if not MULTICAM_ALLOW_QUESTIONABLE_SYNC:
                        raise HTTPException(
                            status_code=422,
                            detail={
                                "message": "Sync preflight is questionable; refusing public Cam Combiner render",
                                "preflight": preflight,
                            },
                        )
                    logger.warning(
                        f"PREFLIGHT WARNING: questionable sync — preflight={preflight}. "
                        "Render will proceed but result may have sync issues."
                    )
                continuous_sync_receipt = await build_continuous_sync_anchor_maps(
                    prepared_sources,
                    ext_local,
                    overlap_start,
                    overlap_duration,
                    job_id,
                    external_audio_offset_seconds=effective_external_audio_offset_seconds,
                )
                director_audio_receipt = apply_external_director_channel_activity(
                    prepared_sources,
                    ext_local,
                    overlap_start,
                    overlap_duration,
                    external_audio_offset_seconds=effective_external_audio_offset_seconds,
                    segment_duration=max(0.25, min(1.0, float(request.auto_switch_interval or 1.0) / 2.0)),
                    job_id=job_id,
                )
                logger.info("MULTICAM DIRECTOR AUDIO %s: %s", job_id, json.dumps(director_audio_receipt, default=str))
            finally:
                # Keep camera scratch-audio files available until the post-render sync audit runs.
                protected_audio_paths = {
                    os.path.abspath(source.get("audio_audit_path"))
                    for source in prepared_sources
                    if source.get("audio_audit_path")
                }
                for cleanup_path in cleanup_paths:
                    try:
                        if os.path.abspath(cleanup_path) not in protected_audio_paths and os.path.exists(cleanup_path):
                            os.remove(cleanup_path)
                    except OSError:
                        pass
        # -----------------------------------------------------------------

        if request.auto_switch:
            if request.async_mode:
                update_firestore_job(job_id, {"progress": 35, "detail": "Scoring faces, motion, and speech"})
            for source in prepared_sources:
                source["window_scores"] = analyze_multicam_visual_windows(
                    source.get("render_path") or source["path"],
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
                    audio_analysis_path = source.get("audio_analysis_path") or source["path"]
                    audio_window_start = max(
                        0.0,
                        get_source_start_for_timeline(source, overlap_start, 0.0) - 1.0,
                    )
                    audio_window_duration = min(
                        float(source.get("duration") or 0.0) - audio_window_start,
                        max(1.0, float(overlap_duration or 0.0) * float(source.get("sync_rate") or 1.0) + 2.5),
                    )
                    audio_window_duration = max(0.25, audio_window_duration)
                    source["silence_intervals"] = await detect_silence_intervals(
                        audio_analysis_path,
                        threshold="-32dB",
                        duration=0.45,
                        start_time=audio_window_start,
                        analysis_duration=audio_window_duration,
                    )
                    if request.audio_based_auto_switch:
                        raw_audio_windows = analyze_audio_energy(
                            audio_analysis_path,
                            segment_duration=max(0.25, min(1.0, float(request.auto_switch_interval or 1.0) / 2.0)),
                            start_time=audio_window_start,
                            analysis_duration=audio_window_duration,
                        )
                        source["audio_activity_windows"] = normalize_audio_energy_windows(raw_audio_windows)
                else:
                    source["audio_activity_windows"] = []

        render_request = request
        if pre_sync_result and pre_sync_result.get("status") == "aligned" and request.segments:
            rebased_segments = []
            for segment in request.segments or []:
                duration = max(0.0, float(segment.timeline_end or 0.0) - float(segment.timeline_start or 0.0))
                if duration <= 0.02:
                    continue
                source = next((item for item in prepared_sources if item["id"] == segment.camera_id), None)
                if not source:
                    continue
                timeline_absolute_start = float(overlap_start) + float(segment.timeline_start or 0.0)
                source_start = max(
                    0.0,
                    timeline_absolute_start - float(source.get("offset_seconds") or 0.0),
                )
                source_end = source_start + duration * float(source.get("sync_rate") or 1.0)
                rebased_segments.append(
                    MultiCamSegment(
                        camera_id=segment.camera_id,
                        timeline_start=float(segment.timeline_start or 0.0),
                        timeline_end=float(segment.timeline_end or 0.0),
                        source_start=round(source_start, 3),
                        source_end=round(source_end, 3),
                        layout_mode=get_model_layout_mode(segment),
                    )
                )
            render_request = request.copy(update={"segments": rebased_segments})
            logger.info(
                "PRESYNC CLAP REBASED SEGMENTS: "
                f"count={len(rebased_segments)} overlap_start={overlap_start:.3f}"
            )

        # ===== TRACE: raw request segments (pre-normalization, first 8) =====
        raw_segs = render_request.segments or []
        logger.info("TRACE_RAW_REQUEST segments=%d", len(raw_segs))
        for idx, rs in enumerate(raw_segs[:8]):
            lm = getattr(rs, "layout_mode", None) or getattr(rs, "layoutMode", None) or "MISSING"
            logger.info(
                "TRACE_RAW[%d] camera=%s layout=%s "
                "timeline=%.3f→%.3f source=%.3f→%.3f",
                idx, getattr(rs, "camera_id", "?"), lm,
                float(getattr(rs, "timeline_start", 0)), float(getattr(rs, "timeline_end", 0)),
                float(getattr(rs, "source_start", 0)), float(getattr(rs, "source_end", 0)),
            )
        # ===== END TRACE =====

        segments = normalize_multicam_segments(render_request, prepared_sources, overlap_start, overlap_duration)
        if not segments:
            raise HTTPException(status_code=400, detail="No valid multicam segment plan could be generated")
        production_limits = enforce_multicam_production_limits(request, overlap_duration, segment_count=len(segments))

        # Write segment plan to a FILE so terminal scroll doesn't lose it
        debug_log_path = os.path.join(shared_tmp_dir, f"{job_id}_debug_segment_plan.json")
        layout_summary = {}
        for seg in segments:
            lm = seg.get("layout_mode", "cut")
            layout_summary[lm] = layout_summary.get(lm, 0) + 1
        with open(debug_log_path, "w") as df:
            json.dump({
                "segment_count": len(segments),
                "render_tier": render_tier,
                "production_limits": production_limits,
                "layout_summary": layout_summary,
                "all_layout_modes": [seg.get("layout_mode", "cut") for seg in segments],
                "sources": [
                    {
                        "label": s["label"],
                        "offset": round(s["offset_seconds"], 1),
                        "sync_rate": round(s["sync_rate"], 4),
                        "has_audio": bool(s.get("has_audio")),
                        "audio_analysis_path": s.get("audio_analysis_path"),
                        "audio_activity_source": s.get("audio_activity_source") or "camera_scratch_audio",
                        "audio_activity_channel_index": s.get("audio_activity_channel_index"),
                        "pre_sync_aligned": bool(s.get("pre_sync_aligned")),
                        "render_path": s.get("render_path") or s.get("path"),
                        "visual_proxy_active": bool(s.get("render_path")),
                        "continuous_sync_active": bool((s.get("continuous_sync_map") or {}).get("active")),
                        "continuous_sync_anchor_count": int((s.get("continuous_sync_map") or {}).get("anchor_count") or 0),
                        "color_match_applied": bool(s.get("color_match_applied")),
                        "color_metadata": s.get("color_metadata") or {},
                        "base_color_filter": s.get("base_color_filter") or "",
                        "color_match_filter": s.get("color_match_filter") or "",
                        "cinematic_polish_filter": s.get("cinematic_polish_filter") or "",
                        "source_visual_filter": s.get("source_visual_filter") or "",
                        "color_profile": s.get("color_profile"),
                    }
                    for s in prepared_sources
                ],
                "segments": segments,
                "first_5_segments": segments[:5],
                "pre_sync_clap": pre_sync_result,
                "sync_preflight": preflight,
                "continuous_sync_anchors": continuous_sync_receipt,
                "color_match": color_match_receipt,
                "visual_proxy": visual_proxy_receipt,
                "director_audio": director_audio_receipt,
                "has_flow_segments": bool(render_request.segments),
                "flow_segment_count": len(render_request.segments or []),
            }, df, indent=2)
        logger.info(f"SEGMENT_PLAN written to {debug_log_path} — layout_modes={layout_summary}")
        switches = build_multicam_switches_from_segments(segments)
        master_duration = float(segments[-1]["timeline_end"])

        output_width, output_height = get_multicam_output_dimensions(output_aspect_ratio)
        normalize_vf = (
            f"scale={output_width}:{output_height}:force_original_aspect_ratio=decrease,"
            f"pad={output_width}:{output_height}:(ow-iw)/2:(oh-ih)/2"
        )

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
            raw_segment_duration = max(0.02, trim_end - trim_start)
            layout_mode = normalize_multicam_layout_mode(segment.get("layout_mode", "cut") or "cut")

            if trim_start < 0 or trim_end > source["duration"] + 0.01:
                raise HTTPException(status_code=400, detail=f"Segment exceeds source bounds for {source['label']}")

            segment_output_path = os.path.join(shared_tmp_dir, f"{job_id}_multicam_segment_{index}.mp4")
            layout_sources = pick_layout_sources(
                source,
                prepared_sources,
                overlap_start,
                segment_start,
            segment_duration,
            max_sources=3,
            preferred_secondary_camera_id=segment.get("secondary_camera_id"),
        )
            logger.info(
                f"Segment {index}: camera={source['label']} layout={layout_mode} "
                f"reason={segment.get('layout_reason', '')} "
                f"secondary={segment.get('secondary_camera_id')} "
                f"timeline={segment_start:.1f}s→{segment_end:.1f}s sources={len(layout_sources)}"
            )
            rendered_composite = await render_multicam_layout_segment(
                segment_output_path,
                layout_mode,
                layout_sources,
                overlap_start,
                segment_start,
                segment_duration,
                output_width,
                output_height,
                job_id,
                primary_source_start=trim_start,
                primary_source_end=trim_end,
                segment_index=index,
            )
            if not rendered_composite:
                logger.info(
                    f"Segment {index}: FALLBACK to single-camera — layout={layout_mode} "
                    f"layout_sources={len(layout_sources)} reason={'not_enough_sources' if len(layout_sources)<2 else 'layout_mode_not_applicable'}"
                )
            if not rendered_composite:
                single_setpts = clamp_float(segment_duration / raw_segment_duration, 0.25, 4.0)
                single_render_path = source.get("render_path") or source["path"]
                single_render_shift = max(0.0, float(source.get("render_time_shift_seconds", 0.0) or 0.0))
                single_render_trim_start = max(0.0, trim_start - single_render_shift)
                single_rotation = source.get("render_rotation_degrees", source.get("rotation_degrees", 0))
                single_visual_filter = str(source.get("render_visual_filter", source.get("source_visual_filter") or "") or "").strip().strip(",")
                single_prefix = (
                    f"{multicam_rotation_filter(single_rotation)}"
                    f"setpts={single_setpts:.9f}*PTS,fps=30,"
                    f"{single_visual_filter + ',' if single_visual_filter else ''}"
                )
                single_filter = ";".join(
                    [
                        (
                            f"[0:v]{single_prefix}setsar=1[cutsrc]"
                        ),
                        multicam_single_cut_filter(
                            "cutsrc",
                            output_width,
                            output_height,
                            "v",
                            is_vertical_output=output_height > output_width,
                        ),
                    ]
                )
                await run_subprocess_async(
                    [
                        "ffmpeg",
                        "-fflags", "+genpts",
                        "-ss",
                        str(single_render_trim_start),
                        "-i",
                        single_render_path,
                        "-t",
                        str(raw_segment_duration),
                        "-filter_complex",
                        single_filter,
                        "-map",
                        "[v]",
                        *build_multicam_segment_encode_args(),
                        "-an",
                        "-movflags",
                        "+faststart",
                        "-vsync", "cfr",
                        "-y",
                        segment_output_path,
                    ],
                    check=True,
                    job_context=job_id,
                )
            segment_duration_receipts.append(
                validate_multicam_segment_duration(
                    segment_output_path,
                    segment_duration,
                    index,
                )
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

        if external_audio_url:
            if request.async_mode:
                update_firestore_job(job_id, {"progress": 88, "detail": "Preparing external clean audio"})
            if pre_sync_result and pre_sync_result.get("status") == "aligned":
                external_audio_materialized_path = effective_external_audio_url
            else:
                external_audio_materialized_path = await materialize_cached_media_input(
                    effective_external_audio_url,
                    external_audio_input_path,
                    external_audio_cache_key or effective_external_audio_url,
                    keep_audio=True,
                )
            external_audio_anchor = overlap_start - float(effective_external_audio_offset_seconds or 0.0)
            audio_bed_receipt = await render_multicam_audio_bed(
                external_audio_materialized_path,
                primary_audio_output_path,
                external_audio_anchor,
                master_duration,
                job_id,
                bitrate="192k",
            )
            audio_bed_receipt.update({
                "source": "external_clean_audio",
                "timeline_start_seconds": round(float(requested_timeline_start or 0.0), 6),
                "overlap_start_seconds": round(float(overlap_start or 0.0), 6),
                "external_audio_offset_seconds": round(float(effective_external_audio_offset_seconds or 0.0), 6),
                "external_audio_anchor_seconds": round(float(external_audio_anchor or 0.0), 6),
            })
            logger.info("MULTICAM AUDIO BED RECEIPT: %s", json.dumps(audio_bed_receipt, default=str))

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
            audio_source = source_map.get(primary_audio_camera_id or "")
            if not audio_source or not audio_source.get("has_audio"):
                audio_source = next((source for source in prepared_sources if source.get("has_audio")), None)

            if audio_source and audio_source.get("has_audio"):
                audio_anchor = overlap_start - float(audio_source["offset_seconds"])
                primary_segments = [segment for segment in segments if segment["camera_id"] == audio_source["id"]]
                if primary_segments:
                    inferred_anchor = float(primary_segments[0]["source_start"]) - float(primary_segments[0]["timeline_start"])
                    if inferred_anchor >= -0.01:
                        audio_anchor = inferred_anchor
                audio_bed_receipt = await render_multicam_audio_bed(
                    audio_source["path"],
                    primary_audio_output_path,
                    audio_anchor,
                    master_duration,
                    job_id,
                    bitrate="128k",
                )
                audio_bed_receipt.update({
                    "source": "camera_audio",
                    "camera_id": audio_source.get("id"),
                    "camera_label": audio_source.get("label"),
                    "timeline_start_seconds": round(float(requested_timeline_start or 0.0), 6),
                    "overlap_start_seconds": round(float(overlap_start or 0.0), 6),
                    "audio_anchor_seconds": round(float(audio_anchor or 0.0), 6),
                })
                logger.info("MULTICAM AUDIO BED RECEIPT: %s", json.dumps(audio_bed_receipt, default=str))

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

        brand_watermark_enabled, brand_watermark_text = resolve_multicam_branding_request(request)
        brand_watermark_filter = (
            build_multicam_brand_watermark_filter(output_width, output_height, brand_watermark_text)
            if brand_watermark_enabled
            else None
        )

        burn_captions, caption_style = resolve_multicam_caption_request(request)
        if burn_captions:
            if request.async_mode:
                update_firestore_job(job_id, {"progress": 91, "detail": "Burning word-level captions"})
            caption_receipt = await burn_multicam_word_captions(
                output_path,
                job_id,
                output_width,
                output_height,
                style_name=caption_style,
                render_segments=segments,
                extra_video_filter=brand_watermark_filter,
            )
            if brand_watermark_enabled:
                brand_watermark_receipt = {
                    "enabled": True,
                    "status": "burned_in_with_captions",
                    "text": brand_watermark_text,
                    "placement": "top_right",
                    "style": "subtle_glass_pill",
                    "video_encoder": caption_receipt.get("video_encoder"),
                }
        else:
            caption_receipt = {
                "enabled": False,
                "status": "disabled_by_request",
                "message": "Captions are normally mandatory for multicam podcast renders.",
            }

        if brand_watermark_enabled and not brand_watermark_receipt:
            if request.async_mode:
                update_firestore_job(job_id, {"progress": 92, "detail": "Adding AutoPromote branding"})
            brand_watermark_receipt = await apply_multicam_brand_watermark(
                output_path,
                job_id,
                output_width,
                output_height,
                text=brand_watermark_text,
            )
        elif not brand_watermark_enabled:
            brand_watermark_receipt = {
                "enabled": False,
                "status": "disabled_by_request",
                "message": "AutoPromote watermark disabled for this render.",
            }

        output_validation = validate_multicam_output_streams(output_path, master_duration, job_id)
        post_render_sync_audit = await audit_multicam_render_sync(
            output_path,
            segments,
            source_map,
            overlap_start,
            job_id,
        )
        enforce_multicam_post_render_sync_audit(post_render_sync_audit)

        generate_thumbnail = resolve_multicam_thumbnail_request(request)
        if generate_thumbnail:
            if request.async_mode:
                update_firestore_job(job_id, {"progress": 93, "detail": "Generating AutoPromote thumbnail"})
            thumbnail_receipt = await generate_multicam_thumbnail_asset(
                output_path,
                job_id,
                master_duration,
                segments=segments,
            )
        else:
            thumbnail_receipt = {
                "enabled": False,
                "status": "disabled_by_request",
                "message": "AutoPromote thumbnail generation disabled for this render.",
            }

        if request.async_mode:
            update_firestore_job(job_id, {"progress": 94, "detail": "Preparing local master"})

        os.makedirs(LOCAL_MEDIA_OUTPUT_DIR, exist_ok=True)
        local_output_name = f"multicam_{job_id}.mp4"
        local_output_path = os.path.join(LOCAL_MEDIA_OUTPUT_DIR, local_output_name)
        shutil.copy2(output_path, local_output_path)
        local_output_url = f"{LOCAL_MEDIA_OUTPUT_BASE_URL}/local-output/{local_output_name}"
        local_thumbnail_path = ""
        local_thumbnail_url = ""
        if thumbnail_receipt and thumbnail_receipt.get("status") == "created" and thumbnail_receipt.get("path"):
            local_thumbnail_name = f"multicam_{job_id}_thumbnail.jpg"
            local_thumbnail_path = os.path.join(LOCAL_MEDIA_OUTPUT_DIR, local_thumbnail_name)
            shutil.copy2(thumbnail_receipt["path"], local_thumbnail_path)
            local_thumbnail_url = f"{LOCAL_MEDIA_OUTPUT_BASE_URL}/local-output/{local_thumbnail_name}"

        public_url = ""
        public_thumbnail_url = ""
        output_storage_path = ""
        thumbnail_storage_path = ""
        if os.getenv("MULTICAM_UPLOAD_FIREBASE", "").strip().lower() in {"1", "true", "yes"}:
            if request.async_mode:
                update_firestore_job(job_id, {"progress": 94, "detail": "Uploading master"})
            output_storage_path = f"processed/multicam_{job_id}.mp4"
            public_url = upload_file_to_firebase(output_path, output_storage_path) or ""
            if thumbnail_receipt and thumbnail_receipt.get("status") == "created" and thumbnail_receipt.get("path"):
                thumbnail_storage_path = f"processed/thumbnails/multicam_{job_id}.jpg"
                public_thumbnail_url = (
                    upload_file_to_firebase(thumbnail_receipt["path"], thumbnail_storage_path)
                    or ""
                )

        try:
            retention_days = max(1, int(os.getenv("MULTICAM_MASTER_RETENTION_DAYS", "4") or "4"))
        except Exception:
            retention_days = 4
        import datetime
        expires_at = (
            datetime.datetime.now(datetime.timezone.utc)
            + datetime.timedelta(days=retention_days)
        ).isoformat()

        result_data = {
            "status": "completed",
            "job_id": job_id,
            "render_tier": render_tier,
            "output_path": os.path.abspath(output_path),
            "output_url": public_url or local_output_url,
            "local_output_url": local_output_url,
            "firebase_output_url": public_url,
            "output_storage_path": output_storage_path,
            "thumbnail_path": os.path.abspath(local_thumbnail_path) if local_thumbnail_path else "",
            "thumbnail_url": public_thumbnail_url or local_thumbnail_url,
            "local_thumbnail_url": local_thumbnail_url,
            "firebase_thumbnail_url": public_thumbnail_url,
            "thumbnail_storage_path": thumbnail_storage_path,
            "expires_at": expires_at,
            "expiresAt": expires_at,
            "retention_days": retention_days,
            "duration": round(master_duration, 3),
            "segments": segments,
            "switches": switches,
            "pre_sync_clap": pre_sync_result,
            "sync_preflight": preflight,
            "continuous_sync_anchors": continuous_sync_receipt,
            "color_match": color_match_receipt,
            "visual_proxy": visual_proxy_receipt,
            "director_audio": director_audio_receipt,
            "captions": caption_receipt,
            "brand_watermark": brand_watermark_receipt,
            "thumbnail": thumbnail_receipt,
            "render_receipt": {
                "production_limits": production_limits,
                "color_match": color_match_receipt,
                "visual_proxy": visual_proxy_receipt,
                "director_audio": director_audio_receipt,
                "captions": caption_receipt,
                "brand_watermark": brand_watermark_receipt,
                "thumbnail": thumbnail_receipt,
                "audio_bed": audio_bed_receipt,
                "output_validation": output_validation,
                "post_render_sync_audit": post_render_sync_audit,
                "continuous_sync_anchors": continuous_sync_receipt,
                "segment_duration_summary": {
                    "checked": len(segment_duration_receipts),
                    "failed": sum(1 for item in segment_duration_receipts if not item.get("ok")),
                    "max_abs_delta_seconds": round(
                        max([abs(float(item.get("delta_seconds", 0.0))) for item in segment_duration_receipts] or [0.0]),
                        3,
                    ),
                },
                "segment_duration_checks": segment_duration_receipts[:25],
            },
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
        # Safety net: if ffmpeg produced the final master but anything after that fails
        # (browser disconnect, worker restart, optional upload failure), preserve a
        # downloadable local copy before cleaning the temporary render files.
        try:
            if os.path.exists(output_path) and os.path.getsize(output_path) > 1024 * 1024:
                os.makedirs(LOCAL_MEDIA_OUTPUT_DIR, exist_ok=True)
                rescue_output_path = os.path.join(LOCAL_MEDIA_OUTPUT_DIR, f"multicam_{job_id}.mp4")
                if not os.path.exists(rescue_output_path):
                    shutil.copy2(output_path, rescue_output_path)
                    logger.info("Recovered multicam master before cleanup: %s", rescue_output_path)
        except Exception as rescue_error:
            logger.warning("Could not preserve multicam master before cleanup: %s", rescue_error)

        for source in prepared_sources:
            if os.path.exists(source["path"]):
                os.remove(source["path"])
            audio_audit_path = source.get("audio_audit_path")
            if (
                audio_audit_path
                and source.get("audio_audit_cleanup")
                and os.path.abspath(audio_audit_path) != os.path.abspath(source.get("path") or "")
                and os.path.exists(audio_audit_path)
            ):
                os.remove(audio_audit_path)
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
        if external_audio_materialized_path != external_audio_input_path and os.path.exists(external_audio_materialized_path):
            os.remove(external_audio_materialized_path)
        thumbnail_temp_path = (thumbnail_receipt or {}).get("path")
        if thumbnail_temp_path and os.path.exists(thumbnail_temp_path):
            os.remove(thumbnail_temp_path)
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
    Accepts video_url (http/https) or local_path (direct filesystem path from upload-source).
    """
    video_url = request.get("video_url") or ""
    local_path = request.get("local_path") or ""

    # If local_path is provided and exists, use it as the video source
    if local_path and os.path.exists(local_path):
        video_url = local_path
        logger.info(f"Using local source path: {local_path}")
    elif not video_url:
        raise HTTPException(status_code=400, detail="video_url or local_path is required")

    job_id = request.get("job_id") or str(uuid.uuid4())
    max_clips = min(int(request.get("max_clips", 5)), 10)
    output_mode = str(request.get("output_mode", "campaign_set")).strip().lower()
    if output_mode not in {"campaign_set", "story_edit", "visual_edit"}:
        output_mode = "campaign_set"
    target_duration_cap = 300 if output_mode in {"story_edit", "visual_edit"} else 60
    target_duration = max(6, min(int(request.get("target_duration", 30)), target_duration_cap))
    caption_style = str(request.get("caption_style", "bold_pop")).strip()
    smart_crop_mode = str(request.get("smart_crop_mode", "center")).strip()
    target_aspect = str(request.get("target_aspect_ratio", "9:16")).strip()
    template_name = str(request.get("template", "")).strip()
    style_hint = str(
        request.get("style")
        or ((request.get("creative_brief") or {}).get("style") if isinstance(request.get("creative_brief"), dict) else "")
        or "clean"
    ).strip().lower()
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
            style_hint,
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
    style_hint="clean",
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
        update_firestore_job(job_id, {
            "status": "analyzing",
            "progress": 10,
            "stage": "analyzing_original_video",
            "detail": "Analyzing original video",
        })

        # 1b. Normalize a cheaper analysis copy so odd source timing does not
        # stall Whisper / scene detect / energy scoring.
        await create_promo_analysis_copy(input_path, analysis_path)
        update_firestore_job(job_id, {
            "status": "analyzing",
            "progress": 20,
            "stage": "analyzing_original_video",
            "detail": "Preparing analysis copy",
        })

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

        has_cached_visual_plan = workflow_type == SMART_PROMO_VISUAL_WORKFLOW_TYPE and bool(cached_story_master_plan)
        if artifact and (artifact.get("rankedCandidates") or has_cached_visual_plan):
            ranked = artifact.get("rankedCandidates") or []
            visual_notes = artifact.get("visualNotes") or []
            analysis_reused = True
            update_firestore_job(job_id, {
                "status": "analyzing",
                "progress": 40,
                "stage": "creating_visual_edit_timeline" if workflow_type == SMART_PROMO_VISUAL_WORKFLOW_TYPE else "analyzing",
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
            visual_workflow = workflow_type == SMART_PROMO_VISUAL_WORKFLOW_TYPE
            podcast_workflow = workflow_type == SMART_PROMO_PODCAST_WORKFLOW_TYPE
            transcription_limit = 300.0 if output_mode in {"story_edit", "visual_edit"} else 120.0
            allow_full_transcription = audio_present and analysis_duration > 0 and analysis_duration <= transcription_limit
            analysis_transcription_timeout = min(
                210,
                max(
                    75,
                    int(analysis_duration * (0.55 if output_mode in {"story_edit", "visual_edit"} else 0.4)) + 45,
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
            if visual_workflow:
                logger.info(
                    f"Promo job {job_id} is using visual-edit mode; preserving continuous audio and planning only visual reframes."
                )
                update_firestore_job(job_id, {
                    "status": "analyzing",
                    "progress": 28,
                    "stage": "detecting_subjects",
                    "detail": "Detecting faces and subjects",
                    "analysisReused": False,
                })

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
                face_positions = []
            elif visual_workflow:
                transcription_segments = []
                scene_list = []
                visual_notes = []
                update_firestore_job(job_id, {
                    "status": "analyzing",
                    "progress": 34,
                    "stage": "reading_audio_energy",
                    "detail": "Reading audio energy and movement",
                    "analysisReused": False,
                })
                audio_energy, motion_scores_data, subject_tracking_samples = await asyncio.gather(
                    run_analysis_task("audio_energy", analyze_audio_energy, analysis_path, 1.0, timeout_seconds=20, fallback_value=[]),
                    run_analysis_task("visual_motion", analyze_visual_motion, analysis_path, 1.0, timeout_seconds=20, fallback_value=[]),
                    run_analysis_task("speaker_tracking", detect_speaker_positions, analysis_path, 1.5, True, timeout_seconds=35, fallback_value=[]),
                )
                face_positions = [
                    (float(sample.get("time", 0.0) or 0.0), float(sample.get("x", 0.5) or 0.5), float(sample.get("y", 0.5) or 0.5))
                    for sample in (subject_tracking_samples or [])
                    if isinstance(sample, dict)
                ]
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
                face_positions = []
            transcription_segments = annotate_transcription_segments(transcription_segments)

            update_firestore_job(job_id, {
                "status": "analyzing",
                "progress": 44 if visual_workflow else 40,
                "stage": "building_virtual_camera_moves" if visual_workflow else "analyzing",
                "detail": "Building virtual camera moves" if visual_workflow else None,
                "analysisReused": False,
            })

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
                content_type="podcast_conversation" if workflow_type == SMART_PROMO_PODCAST_WORKFLOW_TYPE else "general",
            )
            if workflow_type == SMART_PROMO_PODCAST_WORKFLOW_TYPE:
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
            elif visual_workflow:
                ranked = []
                transcript_quality = {}
                artifact_id = store_analysis_artifact(
                    analysis_cache_key,
                    {
                        "sourceDuration": round(source_duration, 2),
                        "analysisDuration": round(analysis_duration, 2),
                        "rankedCandidates": [],
                        "visualNotes": [],
                        "analysisSummary": {
                            "candidateCount": 0,
                            "visualNoteCount": 0,
                            "transcriptQuality": {},
                            "trackingSamples": len(face_positions or []),
                            "groupSamples": len([sample for sample in (subject_tracking_samples or []) if isinstance(sample, dict) and int(sample.get("faceCount", 0) or 0) >= 4]),
                        },
                    },
                    workflow_type=workflow_type,
                    pipeline_version=SMART_PROMO_PIPELINE_VERSION,
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
                if output_mode in {"story_edit", "visual_edit"}:
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
        if output_mode in {"story_edit", "visual_edit"}:
            if analysis_reused and cached_story_master_plan:
                story_master_clip = dict(cached_story_master_plan)
                derived_short_clips = [dict(clip) for clip in cached_derived_short_plans]
            elif workflow_type == SMART_PROMO_VISUAL_WORKFLOW_TYPE:
                story_master_clip = build_visual_edit_master_plan(
                    get_media_duration(render_source_path),
                    target_duration,
                    audio_energy=audio_energy,
                    motion_scores=motion_scores_data,
                    face_positions=face_positions,
                    subject_samples=subject_tracking_samples,
                    style_hint=style_hint,
                )
            else:
                story_master_clip = build_podcast_story_master_plan(
                    original_ranked,
                    target_duration,
                    source_duration=get_media_duration(render_source_path),
                    visual_notes=visual_notes,
                )
            if story_master_clip:
                if not derived_short_clips:
                    if workflow_type == SMART_PROMO_VISUAL_WORKFLOW_TYPE:
                        derived_short_clips = derive_shorts_from_visual_master(
                            story_master_clip,
                            max_shorts=max(1, min(3, max_clips - 1 if max_clips > 1 else 3)),
                        )
                    else:
                        derived_short_clips = derive_shorts_from_story_master(
                            story_master_clip,
                            max_shorts=max(1, min(3, max_clips - 1 if max_clips > 1 else 3)),
                        )
                confidence_summary = (
                    build_visual_confidence_summary(
                        story_master_clip,
                        derived_short_clips,
                        analysis_reused=analysis_reused,
                    )
                    if workflow_type == SMART_PROMO_VISUAL_WORKFLOW_TYPE
                    else build_story_confidence_summary(
                        story_master_clip,
                        derived_short_clips,
                        transcript_quality,
                        analysis_reused=analysis_reused,
                    )
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
            "stage": "creating_visual_edit_timeline" if workflow_type == SMART_PROMO_VISUAL_WORKFLOW_TYPE else "rendering",
            "detail": "Creating visual edit timeline" if workflow_type == SMART_PROMO_VISUAL_WORKFLOW_TYPE else None,
            "clipSuggestions": ranked,
            "plannedEditTimeline": (
                list((story_master_clip or {}).get("segments") or [])
                if workflow_type == SMART_PROMO_VISUAL_WORKFLOW_TYPE
                else []
            ),
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
        render_width, render_height = get_video_dimensions(render_source_path)
        smart_promo_encode_args = build_smart_promo_video_encode_args(render_width, render_height)
        def build_story_outputs(clips):
            story_master = next((entry for entry in clips if entry.get("storyMaster")), None)
            derived = [entry for entry in clips if not entry.get("storyMaster")]
            return story_master, derived

        for idx, clip in enumerate(ranked):
            try:
                update_firestore_job(job_id, {
                    "status": "rendering",
                    "progress": min(94, 50 + int(42 * idx / max(1, len(ranked)))),
                    "stage": "rendering_final_output",
                    "detail": f"Rendering output {idx + 1} of {len(ranked)}",
                    "activeClipIndex": idx,
                })
                clip_output = os.path.join(SHARED_TMP_DIR, f"{job_id}_clip_{idx}.mp4")
                trimmed = os.path.join(SHARED_TMP_DIR, f"{job_id}_trim_{idx}.mp4")
                trimmed_visual = os.path.join(SHARED_TMP_DIR, f"{job_id}_trim_visual_{idx}.mp4")
                passthrough_audio = os.path.join(SHARED_TMP_DIR, f"{job_id}_audio_{idx}.m4a")
                duration = clip["end"] - clip["start"]
                segment_paths = []
                concat_list_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_concat_{idx}.txt")
                is_story_master_render = bool(clip.get("storyMaster"))
                visual_only_render = bool(clip.get("visualOnly"))

                # Smart Promo preserves the whole useful frame for demos and screen recordings.
                vf = build_promo_video_filter(target_aspect, "promo_fit", render_width, render_height)

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
                            build_visual_segment_filter(segment, target_aspect, render_width, render_height)
                            if visual_only_render
                            else vf,
                            *smart_promo_encode_args,
                            *(["-an"] if visual_only_render else ["-c:a", "aac"]),
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
                        *smart_promo_encode_args,
                        *(["-an"] if visual_only_render else ["-c:a", "aac"]),
                        "-y",
                        trimmed_visual if visual_only_render else trimmed,
                    ], check=True, job_context=job_id, timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS)
                    duration = clip.get("duration", duration)
                else:
                    single_visual_filter = vf
                    if visual_only_render and clip.get("segments"):
                        single_visual_filter = build_visual_segment_filter(
                            (clip.get("segments") or [clip])[0],
                            target_aspect,
                            render_width,
                            render_height,
                        )
                    await run_subprocess_async([
                        "ffmpeg", "-ss", str(clip["start"]), "-i", render_source_path,
                        "-t", str(duration), "-vf", single_visual_filter,
                        *smart_promo_encode_args,
                        *(["-an"] if visual_only_render else ["-c:a", "aac"]),
                        "-y",
                        trimmed_visual if visual_only_render else trimmed,
                    ], check=True, job_context=job_id, timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS)

                if visual_only_render:
                    if has_audio_stream(render_source_path):
                        try:
                            await run_subprocess_async([
                                "ffmpeg",
                                "-ss",
                                str(clip["start"]),
                                "-i",
                                render_source_path,
                                "-t",
                                str(duration),
                                "-vn",
                                "-c:a",
                                "copy",
                                "-y",
                                passthrough_audio,
                            ], check=True, job_context=job_id, timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS)
                            await run_subprocess_async([
                                "ffmpeg",
                                "-i",
                                trimmed_visual,
                                "-i",
                                passthrough_audio,
                                "-map",
                                "0:v:0",
                                "-map",
                                "1:a:0",
                                "-c:v",
                                "copy",
                                "-c:a",
                                "copy",
                                "-shortest",
                                "-y",
                                trimmed,
                            ], check=True, job_context=job_id, timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS)
                        except Exception as visual_audio_err:
                            logger.warning(
                                "Visual-only audio passthrough failed for clip %s; falling back to AAC mux: %s",
                                idx,
                                visual_audio_err,
                            )
                            await run_subprocess_async([
                                "ffmpeg",
                                "-ss",
                                str(clip["start"]),
                                "-i",
                                render_source_path,
                                "-i",
                                trimmed_visual,
                                "-t",
                                str(duration),
                                "-map",
                                "1:v:0",
                                "-map",
                                "0:a:0",
                                "-c:v",
                                "copy",
                                "-c:a",
                                "aac",
                                "-shortest",
                                "-y",
                                trimmed,
                            ], check=True, job_context=job_id, timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS)
                    else:
                        shutil.copy(trimmed_visual, trimmed)

                if caption_style in CAPTION_STYLES and not visual_only_render:

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
                                *smart_promo_encode_args, *audio_args, "-y", clip_output
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
                                *smart_promo_encode_args, "-c:a", "copy", "-y", clip_output
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
                        "stage": "rendering_final_output",
                        "detail": f"Generating thumbnails and promo posters for output {idx + 1}",
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
                    if visual_only_render:
                        hook_text = (
                            clip.get("campaignRoleLabel")
                            or ("Master Visual Edit" if clip.get("storyMaster") else "Visual Preview")
                        )
                    # --- GPT creative social captions ---
                    gpt_captions = None
                    try:
                        content_type = clip.get("contentType") or "general"
                        if not visual_only_render:
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
                    if visual_only_render:
                        subtitle_text = "Original audio preserved with dynamic visual pacing."
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
                if os.path.exists(trimmed_visual):
                    try:
                        os.remove(trimmed_visual)
                    except Exception:
                        pass
                if os.path.exists(passthrough_audio):
                    try:
                        os.remove(passthrough_audio)
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
    bRollMode: Optional[str] = None
    b_roll_mode: Optional[str] = None
    bRollPlaceholder: bool = False
    bRollTone: Optional[str] = None
    bRollKicker: Optional[str] = None
    bRollTitle: Optional[str] = None
    bRollSubtitle: Optional[str] = None
    opacity: float = 1.0
    coverMainVideo: bool = False
    muteMainAudio: bool = False
    useOverlayAudio: bool = False
    overlayAudioVolume: float = 0.7
    audioDucking: bool = False
    audioDuckingStrength: float = 0.35

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
    smart_crop_mode: str = "center"  # "center", "speaker_track", "ai_director"
    visual_enhance: bool = False  # Use Smart Promo dynamic visual pipeline (face zoom, movement tracking, reframing)
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
    brand_watermark: Optional[bool] = None
    brandWatermark: Optional[bool] = None
    watermark_text: Optional[str] = None
    watermarkText: Optional[str] = None
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
        
        # 2.45. Visual Enhance — Smart Promo dynamic reframing pipeline
        working_path = trimmed_path
        if request.visual_enhance:
            logger.info("Applying Smart Promo visual enhancement (dynamic reframing + motion tracking)")
            dyn_cropped_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_dyn_crop.mp4")
            try:
                src_w, src_h = get_video_dimensions(trimmed_path)
                clip_duration = request.end_time - request.start_time
                style_hint = str(request.caption_style or "clean").strip().lower()

                loop = asyncio.get_running_loop()
                # Run audio energy + face tracking in parallel
                audio_energy_future = loop.run_in_executor(None, analyze_audio_energy, trimmed_path, 0.5)
                subject_samples_future = loop.run_in_executor(
                    None, lambda: detect_speaker_positions(trimmed_path, 0.3, return_metadata=True)
                )
                audio_energy, subject_raw = await asyncio.gather(
                    audio_energy_future, subject_samples_future, return_exceptions=True
                )
                if isinstance(audio_energy, Exception):
                    logger.warning(f"Audio energy analysis failed: {audio_energy}")
                    audio_energy = []
                if isinstance(subject_raw, Exception):
                    logger.warning(f"Subject detection failed: {subject_raw}")
                    subject_raw = []

                # Convert subject positions to the format clean_visual_story_plan expects
                subject_samples = [
                    {
                        "time": float(p[0]),
                        "x": float(p[1]),
                        "y": float(p[2]),
                        "faceCount": int(p[3]) if len(p) > 3 else 1,
                        "sceneType": "lead" if len(p) <= 3 or int(p[3] if len(p) > 3 else 1) <= 2 else "group",
                        "safeZoom": max(0.75, 1.0 - (float(p[3]) * 0.06 if len(p) > 3 else 0.06)),
                        "leadSizeRatio": 0.06,
                    }
                    for p in subject_raw
                ] if subject_raw else []

                motion_scores = []
                try:
                    motion_scores = await loop.run_in_executor(None, analyze_visual_motion, trimmed_path, 0.5)
                except Exception:
                    pass

                logger.info(
                    f"Visual enhance analysis: {len(audio_energy if isinstance(audio_energy, list) else [])} audio samples, "
                    f"{len(subject_samples)} subject detections, {len(motion_scores if isinstance(motion_scores, list) else [])} motion samples"
                )

                # Build dynamic visual edit timeline
                plan = build_visual_edit_master_plan(
                    source_duration=clip_duration,
                    target_duration=clip_duration,
                    audio_energy=audio_energy if isinstance(audio_energy, list) else [],
                    motion_scores=motion_scores if isinstance(motion_scores, list) else [],
                    face_positions=None,
                    subject_samples=subject_samples,
                    style_hint=style_hint,
                )
                segments = (plan or {}).get("segments", []) if plan else []

                if segments and len(segments) >= 2:
                    logger.info(
                        f"Applying {len(segments)} dynamic visual segments "
                        f"(avg zoom={sum(s.get('zoom',0.9) for s in segments)/len(segments):.2f})"
                    )

                    # Build sendcmd keyframes for dynamic crop
                    min_crop_w, min_crop_h = 480, 854
                    safe_segments = []
                    for seg in segments:
                        seg_start = float(seg.get("start", 0))
                        seg_end = float(seg.get("end", 0))
                        seg_dur = max(0.2, seg_end - seg_start)
                        focus_x = float(seg.get("focusX", 0.5))
                        focus_y = float(seg.get("focusY", 0.5))
                        zoom = float(seg.get("zoom", 0.9))
                        start_fx = float(seg.get("startFocusX", focus_x))
                        start_fy = float(seg.get("startFocusY", focus_y))
                        end_fx = float(seg.get("endFocusX", focus_x))
                        end_fy = float(seg.get("endFocusY", focus_y))
                        safe_segments.append((seg_start, seg_end, seg_dur, focus_x, focus_y, zoom, start_fx, start_fy, end_fx, end_fy))

                    keyframe_lines = []
                    for seg in safe_segments:
                        seg_start, seg_end, seg_dur, fx, fy, z, sfx, sfy, efx, efy = seg
                        crop_w = max(min_crop_w, min(int(src_w), int(src_w * z)))
                        crop_h = max(min_crop_h, min(int(src_h), int(src_h * z)))
                        # Start crop position
                        sx = max(0, int(sfx * src_w - crop_w / 2))
                        sy = max(0, int(sfy * src_h - crop_h / 2))
                        # End crop position
                        ex = max(0, int(efx * src_w - crop_w / 2))
                        ey = max(0, int(efy * src_h - crop_h / 2))
                        # Emit keyframe at segment start
                        ts = f"{seg_start:.3f}"
                        keyframe_lines.append(f"{ts} crop x {int(sx)}")
                        keyframe_lines.append(f"{ts} crop y {int(sy)}")
                        keyframe_lines.append(f"{ts} crop w {crop_w}")
                        keyframe_lines.append(f"{ts} crop h {crop_h}")
                        # Smooth transition for longer segments
                        if seg_dur > 0.3 and (abs(ex - sx) > 2 or abs(ey - sy) > 2):
                            mid_ts = f"{seg_start + seg_dur * 0.5:.3f}"
                            mid_x = int((sx + ex) / 2)
                            mid_y = int((sy + ey) / 2)
                            keyframe_lines.append(f"{mid_ts} crop x {mid_x}")
                            keyframe_lines.append(f"{mid_ts} crop y {mid_y}")
                        end_ts = f"{seg_end:.3f}"
                        keyframe_lines.append(f"{end_ts} crop x {int(ex)}")
                        keyframe_lines.append(f"{end_ts} crop y {int(ey)}")

                    sendcmd_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_visual_edit_sendcmd.txt")
                    with open(sendcmd_path, "w") as f:
                        f.write("\n".join(keyframe_lines))

                    encode_args = build_smart_promo_video_encode_args(src_w, src_h)
                    await run_subprocess_async(
                        [
                            "ffmpeg", "-i", trimmed_path,
                            "-vf", f"sendcmd=f='{sendcmd_path}',scale=1080:1920:flags=lanczos,setsar=1",
                            *encode_args, "-c:a", "copy", "-y", dyn_cropped_path,
                        ],
                        check=True,
                        job_context=job_id,
                        timeout_seconds=MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS,
                    )
                    working_path = dyn_cropped_path
                    logger.info("Visual enhancement render complete")
                else:
                    logger.info("Not enough dynamic segments for visual enhancement; falling back to center crop")
                    vf_crop = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
                    await run_subprocess_async(
                        ["ffmpeg", "-i", trimmed_path, "-vf", vf_crop, "-c:v", "libx264", "-c:a", "copy", "-y", dyn_cropped_path],
                        check=True,
                    )
                    working_path = dyn_cropped_path
            except Exception as viz_err:
                logger.warning(f"Visual enhancement failed: {viz_err}. Falling back to original aspect.")
                # working_path stays as trimmed_path

        # 2.5. Smart Crop (Vertical 9:16) - OPTIONAL (skipped if visual_enhance was used)
        if request.smart_crop and not request.visual_enhance:
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

        def get_broll_mode(overlay):
            return str(
                getattr(overlay, "bRollMode", None)
                or getattr(overlay, "b_roll_mode", None)
                or ""
            ).strip().lower()

        def get_overlay_enable_expr(overlay):
            if overlay.start_time is None or overlay.duration is None:
                return ""
            rel_start = max(0.0, float(overlay.start_time))
            rel_end = rel_start + max(0.05, float(overlay.duration))
            return f":enable='between(t,{rel_start:.3f},{rel_end:.3f})'"

        def get_overlay_xy_expr(overlay):
            if get_broll_mode(overlay) == "fullscreen" or getattr(overlay, "coverMainVideo", False):
                return "0", "0"
            return f"(W*{overlay.x/100})-(w/2)", f"(H*{overlay.y/100})-(h/2)"

        def build_overlay_scale_filter(input_label, output_label, overlay):
            width_percent = float(overlay.width) if overlay.width is not None else None
            height_percent = float(overlay.height) if overlay.height is not None else None
            opacity = clamp_float(float(getattr(overlay, "opacity", 1.0) or 1.0), 0.0, 1.0)

            if get_broll_mode(overlay) == "fullscreen" or getattr(overlay, "coverMainVideo", False):
                filter_body = (
                    f"[{input_label}]scale=w={base_width}:h={base_height}:"
                    f"force_original_aspect_ratio=increase,"
                    f"crop={base_width}:{base_height},setsar=1"
                )
            else:
                target_width = max(2, int(base_width * width_percent / 100.0)) if width_percent else -1
                target_height = max(2, int(base_height * height_percent / 100.0)) if height_percent else -1

                if target_width > 0 and target_height > 0:
                    filter_body = (
                        f"[{input_label}]scale=w={target_width}:h={target_height}:"
                        f"force_original_aspect_ratio=decrease"
                    )
                elif target_width > 0:
                    filter_body = f"[{input_label}]scale=w={target_width}:h=-1"
                elif target_height > 0:
                    filter_body = f"[{input_label}]scale=w=-1:h={target_height}"
                else:
                    filter_body = f"[{input_label}]scale=w=iw*0.3:h=-1"

            if opacity < 0.999:
                filter_body += f",format=rgba,colorchannelmixer=aa={opacity:.3f}"
            return f"{filter_body}[{output_label}];"

        # Process Video Overlays
        video_overlays = [o for o in request.overlays if o.type == 'video' and o.src]
        overlay_audio_specs = []
        
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
                overlay_input_idx = input_idx
                if getattr(ov, "useOverlayAudio", False) and has_audio_stream(ov_path):
                    overlay_audio_specs.append((overlay_input_idx, ov))
                scale_filter = build_overlay_scale_filter(f"{overlay_input_idx}:v", f"ov{overlay_input_idx}", ov)
                
                x_expr, y_expr = get_overlay_xy_expr(ov)
                
                enable_expr = get_overlay_enable_expr(ov)

                overlay_filter = f"[{current_v_label}][ov{overlay_input_idx}]overlay=x={x_expr}:y={y_expr}:eof_action=pass{enable_expr}[v{overlay_input_idx}];"
                
                filter_chain.append(scale_filter)
                filter_chain.append(overlay_filter)
                current_v_label = f"v{overlay_input_idx}"
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
                
                x_expr, y_expr = get_overlay_xy_expr(ov)
                
                enable_expr = get_overlay_enable_expr(ov)

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

        def escape_drawtext_text(value):
            return (
                str(value or "")
                .replace("\\", "\\\\")
                .replace(":", "\\:")
                .replace("'", "\\'")
                .replace(",", "\\,")
                .replace("[", "\\[")
                .replace("]", "\\]")
                .replace("%", "\\%")
            )

        def sanitize_ffmpeg_color(value, fallback="black@0.5"):
            raw = str(value or fallback).strip()
            if raw.startswith("rgba"):
                return fallback
            return raw.replace(",", "\\,")

        def append_drawtext(input_label, output_label, text, *, x_expr, y_expr, fontsize, color="white", box=False, boxcolor="black@0.5", enable_expr=""):
            safe_font_path = font_path.replace(":", "\\\\:")
            font_arg = f"fontfile='{safe_font_path}'"
            drawtext_cmd = (
                f"drawtext="
                f"{font_arg}:"
                f"text='{escape_drawtext_text(text)}':"
                f"fontcolor={sanitize_ffmpeg_color(color, 'white')}:"
                f"fontsize={fontsize}:"
                f"x={x_expr}:"
                f"y={y_expr}"
            )
            if box:
                drawtext_cmd += (
                    f":box=1:"
                    f"boxcolor={sanitize_ffmpeg_color(boxcolor, 'black@0.5')}:"
                    f"boxborderw=20"
                )
            drawtext_cmd += enable_expr
            filter_chain.append(f"[{input_label}]{drawtext_cmd}[{output_label}]")

        brand_watermark_raw = (
            request.brand_watermark
            if request.brand_watermark is not None
            else request.brandWatermark
        )
        brand_watermark_enabled = (
            VIRAL_BRAND_WATERMARK_DEFAULT
            if brand_watermark_raw is None
            else bool(brand_watermark_raw)
        )
        if brand_watermark_enabled:
            brand_label = "brand_watermark"
            brand_text = (
                request.watermark_text
                or request.watermarkText
                or os.getenv("VIRAL_BRAND_WATERMARK_TEXT")
                or "AUTOPROMOTE"
            )
            append_drawtext(
                current_v_label,
                brand_label,
                brand_text,
                x_expr="w-tw-44",
                y_expr="44",
                fontsize="max(32,h/34)",
                color="white",
                box=True,
                boxcolor="0xff2a26@0.92",
            )
            current_v_label = brand_label

        broll_tone_colors = {
            "proof": "0x091220@0.92",
            "detail": "0x0c1118@0.92",
            "reaction": "0x120d19@0.92",
            "payoff": "0x1a0d0a@0.92",
        }

        for idx, txt in enumerate(text_overlays):
            enable_expr = get_overlay_enable_expr(txt)
            mode = get_broll_mode(txt)

            if mode == "fullscreen" or getattr(txt, "coverMainVideo", False):
                tone = str(getattr(txt, "bRollTone", "") or "").strip().lower()
                bg_color = broll_tone_colors.get(tone, "black@0.90")
                bg_label = f"broll_text_bg_{idx}"
                filter_chain.append(
                    f"[{current_v_label}]drawbox=x=0:y=0:w=iw:h=ih:color={bg_color}:t=fill{enable_expr}[{bg_label}]"
                )
                current_v_label = bg_label

                kicker = getattr(txt, "bRollKicker", None) or "B-ROLL"
                title = getattr(txt, "bRollTitle", None) or txt.text or "CUTAWAY"
                subtitle = getattr(txt, "bRollSubtitle", None) or ""
                lines = [
                    (kicker, "h/44", "(w*0.12)", "(h*0.39)", "0xfacc15"),
                    (title, "h/18", "(w*0.12)", "(h*0.45)", "white"),
                    (subtitle, "h/36", "(w*0.12)", "(h*0.58)", "0xdbeafe"),
                ]
                for line_index, (line_text, font_size, x_expr, y_expr, line_color) in enumerate(lines):
                    if not str(line_text or "").strip():
                        continue
                    next_label = f"broll_text_{idx}_{line_index}"
                    append_drawtext(
                        current_v_label,
                        next_label,
                        line_text,
                        x_expr=x_expr,
                        y_expr=y_expr,
                        fontsize=font_size,
                        color=line_color,
                        box=False,
                        enable_expr=enable_expr,
                    )
                    current_v_label = next_label
                continue

            x_val = txt.x / 100.0
            y_val = txt.y / 100.0
            next_label = f"text_overlay_{idx}"
            append_drawtext(
                current_v_label,
                next_label,
                txt.text,
                x_expr=f"(w*{x_val})-(tw/2)",
                y_expr=f"(h*{y_val})-(th/2)",
                fontsize="h/20",
                color=txt.color or "white",
                box=True,
                boxcolor=sanitize_ffmpeg_color(txt.bg, "black@0.5"),
                enable_expr=enable_expr,
            )
            current_v_label = next_label

        # Make sure we have an output label
        if current_v_label != "output":
             # We should probably assign the last label to [output] for simplicity
             # But if filter chain is empty (no overlays), we just copy
             pass 

        background_audio = request.background_audio if request.background_audio and request.background_audio.enabled else None
        audio_filter_chain = []
        has_main_audio = has_audio_stream(working_path)
        audio_mix_labels = []

        if has_main_audio:
            main_audio_label = "0:a"
            ducking_overlays = [
                overlay
                for overlay in request.overlays
                if overlay.start_time is not None
                and overlay.duration is not None
                and (getattr(overlay, "muteMainAudio", False) or getattr(overlay, "audioDucking", False))
            ]
            for duck_index, overlay in enumerate(ducking_overlays):
                rel_start = max(0.0, float(overlay.start_time))
                rel_end = rel_start + max(0.05, float(overlay.duration))
                if getattr(overlay, "muteMainAudio", False):
                    gain = 0.0
                else:
                    duck_strength = clamp_float(float(getattr(overlay, "audioDuckingStrength", 0.35) or 0.35), 0.05, 0.95)
                    gain = max(0.05, 1.0 - duck_strength)
                next_label = f"main_audio_duck_{duck_index}"
                audio_filter_chain.append(
                    f"[{main_audio_label}]volume={gain:.3f}:enable='between(t,{rel_start:.3f},{rel_end:.3f})'[{next_label}]"
                )
                main_audio_label = next_label
            audio_mix_labels.append(f"[{main_audio_label}]")

        for audio_index, (overlay_input_idx, overlay) in enumerate(overlay_audio_specs):
            if overlay.start_time is None or overlay.duration is None:
                continue
            delay_ms = max(0, int(float(overlay.start_time) * 1000))
            audio_duration = max(0.05, float(overlay.duration))
            volume = clamp_float(float(getattr(overlay, "overlayAudioVolume", 0.7) or 0.7), 0.0, 1.5)
            output_label = f"overlay_audio_{audio_index}"
            audio_filter_chain.append(
                f"[{overlay_input_idx}:a]atrim=0:{audio_duration:.3f},asetpts=PTS-STARTPTS,"
                f"volume={volume:.3f},adelay={delay_ms}|{delay_ms}[{output_label}]"
            )
            audio_mix_labels.append(f"[{output_label}]")

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
                if background_audio_mode == "replace":
                    audio_mix_labels = ["[bg_track]"] + [
                        label for label in audio_mix_labels if label.startswith("[overlay_audio")
                    ]
                elif background_audio_mode == "duck_original" and has_main_audio:
                    main_gain = max(0.05, 1.0 - ducking_strength)
                    next_label = "main_audio_bg_ducked"
                    main_labels = [
                        label
                        for label in audio_mix_labels
                        if label == "[0:a]" or label.startswith("[main_audio")
                    ]
                    if main_labels:
                        audio_filter_chain.append(f"{main_labels[-1]}volume={main_gain:.2f}[{next_label}]")
                        audio_mix_labels = [
                            f"[{next_label}]" if label == main_labels[-1] else label
                            for label in audio_mix_labels
                        ]
                    audio_mix_labels.append("[bg_track]")
                else:
                    audio_mix_labels.append("[bg_track]")

        if audio_mix_labels:
            if len(audio_mix_labels) == 1:
                audio_filter_chain.append(f"{audio_mix_labels[0]}anull[a_mix]")
            else:
                audio_filter_chain.append(
                    f"{''.join(audio_mix_labels)}amix=inputs={len(audio_mix_labels)}:"
                    f"duration=first:dropout_transition=2:normalize=0[a_mix]"
                )

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

             # Some legacy filter builders include trailing semicolons; normalize
             # them before joining so FFmpeg does not see empty filters.
             complex_filter = ";".join(
                 part.strip().rstrip(";")
                 for part in (filter_chain + audio_filter_chain)
                 if part and part.strip().rstrip(";")
             )
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
                "brand_watermark": brand_watermark_enabled,
                "watermark_text": (
                    request.watermark_text
                    or request.watermarkText
                    or os.getenv("VIRAL_BRAND_WATERMARK_TEXT")
                    or "AUTOPROMOTE"
                ) if brand_watermark_enabled else None,
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

            # For local-worker sync jobs, serve the tiny WAV immediately instead of
            # waiting on a Firebase upload. The sync worker can read local-output URLs.
            if audio_only or is_audio_file:
                os.makedirs(LOCAL_MEDIA_OUTPUT_DIR, exist_ok=True)
                local_name = f"{uuid.uuid4().hex}_{os.path.basename(sync_audio_path)}"
                local_path = os.path.join(LOCAL_MEDIA_OUTPUT_DIR, local_name)
                shutil.copy2(sync_audio_path, local_path)
                sync_audio_url = f"http://127.0.0.1:8000/local-output/{local_name}"
                logger.info(f"{label}: serving sync WAV locally (no Firebase upload)")
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
            "videoUrl": firebase_url or "",
            "syncAudioUrl": sync_audio_url,
            "original_size": total_bytes,
            "transcoded_size": transcoded_size if not audio_only else 0,
            "size_saved_pct": pct_saved if not audio_only else 100,
            "mode": mode,
        }
    except Exception as e:
        logger.error(f"Ingest job {job_id} failed: {e}")
        _ingest_jobs[job_id] = {"status": "failed", "error": str(e), "label": label}


@app.post("/api/media/upload-source")
async def upload_source_file(file: UploadFile = File(...)):
    """
    Simple source file upload for Smart Promo.
    Saves the file locally and returns a local URL the worker can process directly.
    No Firebase, no transcoding — just save and return path.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", file.filename or "source").strip("._")
    tmp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp/worker_inputs"))
    os.makedirs(tmp_dir, exist_ok=True)
    local_path = os.path.join(tmp_dir, f"{uuid.uuid4().hex[:8]}_{safe_name}")

    total_bytes = 0
    try:
        with open(local_path, "wb") as f:
            while True:
                chunk = await file.read(8 * 1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
                total_bytes += len(chunk)
    except Exception as e:
        if os.path.exists(local_path):
            os.remove(local_path)
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    file_mb = total_bytes / (1024 * 1024)
    # Keep this endpoint instant after the byte copy. Duration probing on multi-GB
    # iPhone MOV files can make the browser sit at 100% and look frozen.
    logger.info(f"Smart Promo source uploaded: {file_mb:.1f}MB → {local_path}")

    return {
        "ok": True,
        "localPath": local_path,
        "localUrl": f"file://{local_path}",
        "size": total_bytes,
        "duration": None,
    }


@app.post("/api/media/ingest-local")
async def ingest_local_file(
    file: UploadFile = File(...),
    uid: str = Form(...),
    label: str = Form("source"),
    mode: str = Form("auto"),
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

    requested_mode = (mode or "auto").strip().lower()
    if requested_mode not in {"auto", "audio_only", "full"}:
        raise HTTPException(status_code=400, detail="mode must be one of: auto, audio_only, full")

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
            "videoUrl": firebase_url or f"http://127.0.0.1:8000/local-output/{os.path.basename(cached_mp4)}",
            "original_size": total_bytes,
            "transcoded_size": cached_size,
            "size_saved_pct": round((1 - cached_size / max(total_bytes, 1)) * 100),
            "cached": True,
            "mode": "full",
        }

    # --- CACHE MISS: spin up background job ---
    job_id = uuid.uuid4().hex[:12]
    is_audio_file = safe_name.lower().endswith(('.wav', '.mp3', '.aac', '.ogg', '.flac', '.m4a', '.wma'))
    if requested_mode == "audio_only":
        ingest_mode = "audio_only"
    elif requested_mode == "full":
        ingest_mode = "audio_only" if is_audio_file else "full"
    else:
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
