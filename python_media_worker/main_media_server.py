Warning: truncated output (original token count: 330239)
... 272380 bytes omitted ...

from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks, Request, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import tempfile
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
import math
import re  # Added for parsing silence output
import hashlib
import hmac
import itertools
import urllib.request
import urllib.parse
import warnings
import cv2  # OpenCV (Phase 1)
import numpy as np
import ffmpeg  # FFmpeg (Phase 1)
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import firebase_admin
from firebase_admin import credentials, storage, firestore
try:
    from scenedetect import SceneManager, open_video
    from scenedetect.detectors import ContentDetector
except ImportError:
    SceneManager = None
    open_video = None
    ContentDetector = None
from dotenv import load_dotenv

try:
    from .multicam_chunking import (
        build_multicam_chunk_plan,
        multicam_chunk_checkpoint_paths,
        multicam_chunk_plan_fingerprint,
    )
except ImportError:
    from multicam_chunking import (
        build_multicam_chunk_plan,
        multicam_chunk_checkpoint_paths,
        multicam_chunk_plan_fingerprint,
    )

try:
    from .viral_render_contract import (
        build_caption_override_transcript,
        build_segment_transition_filters,
        build_speed_filter_complex,
        map_timeline_time,
        normalize_speed_plan,
        resolve_caption_layout,
        speed_plan_changes_timing,
        speed_plan_output_duration,
    )
except ImportError:
    from viral_render_contract import (
        build_caption_override_transcript,
        build_segment_transition_filters,
        build_speed_filter_complex,
        map_timeline_time,
        normalize_speed_plan,
        resolve_caption_layout,
        speed_plan_changes_timing,
        speed_plan_output_duration,
    )

try:
    from .viral_creative_effects import build_creative_filter_complex, normalize_creative_plan
except ImportError:
    from viral_creative_effects import build_creative_filter_complex, normalize_creative_plan

try:
    from .viral_motion_graphics import render_motion_and_sound, validate_design
except ImportError:
    from viral_motion_graphics import render_motion_and_sound, validate_design

try:
    from .viral_audio_remix import normalize_audio_remix, render_audio_remix
except ImportError:
    from viral_audio_remix import normalize_audio_remix, render_audio_remix

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
    whisper = None
    allow_runtime_dependency_install = str(
        os.getenv("ALLOW_RUNTIME_DEPENDENCY_INSTALL", "false" if os.getenv("K_SERVICE") else "true")
    ).strip().lower() in {"1", "true", "yes", "on"}
    if allow_runtime_dependency_install:
        import logging
        logging.getLogger("MediaWorker").warning("Whisper module not found. Installing...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "openai-whisper"])
            import whisper
        except Exception:
            whisper = None

try:
    from faster_whisper import WhisperModel as FasterWhisperModel
except ImportError:
    FasterWhisperModel = None

try:
    import yt_dlp
except ImportError:
    yt_dlp = None
    allow_runtime_dependency_install = str(
        os.getenv("ALLOW_RUNTIME_DEPENDENCY_INSTALL", "false" if os.getenv("K_SERVICE") else "true")
    ).strip().lower() in {"1", "true", "yes", "on"}
    if allow_runtime_dependency_install:
        import logging
        logging.getLogger("MediaWorker").warning("yt_dlp module not found. Installing...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "yt-dlp"])
            import yt_dlp
        except Exception:
            yt_dlp = None

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MediaWorker")


def env_flag(name, default=False):
    raw_value = str(os.getenv(name, "true" if default else "false")).strip().lower()
    return raw_value in {"1", "true", "yes", "on"}


IS_PRODUCTION_ENV = (
    str(os.getenv("NODE_ENV") or os.getenv("ENVIRONMENT") or "").strip().lower() == "production"
    or bool(os.getenv("K_SERVICE"))
)
LOCAL_MEDIA_OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp/worker_outputs"))
LOCAL_MEDIA_OUTPUT_BASE_URL = str(os.getenv("LOCAL_MEDIA_OUTPUT_BASE_URL", "http://127.0.0.1:8000")).rstrip("/")
ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK = env_flag(
    "ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK",
    default=not IS_PRODUCTION_ENV,
)
ALLOW_DIRECT_SOURCE_UPLOAD = env_flag(
    "ALLOW_DIRECT_SOURCE_UPLOAD",
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
model_faster_whisper = {}
AI_RERANK_BACKOFF_UNTIL = 0.0


def get_whisper_device():
    configured = str(os.getenv("WHISPER_DEVICE", "cpu")).strip().lower()
    return configured or "cpu"


def get_transcription_engine():
    configured = str(
        os.getenv("MULTICAM_CAPTION_WHISPER_ENGINE")
        or os.getenv("WHISPER_ENGINE")
        or "faster"
    ).strip().lower()
    if configured in {"faster", "faster-whisper", "ctranslate2"} and FasterWhisperModel is not None:
        return "faster"
    if configured in {"openai", "openai-whisper", "whisper"}:
        return "openai"
    return "faster" if FasterWhisperModel is not None else "openai"


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


def get_faster_whisper_device():
    configured = str(
        os.getenv("FASTER_WHISPER_DEVICE")
        or os.getenv("WHISPER_DEVICE")
        or "auto"
    ).strip().lower()
    if configured and configured != "auto":
        return configured
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def get_faster_whisper_compute_type(device):
    configured = str(os.getenv("FASTER_WHISPER_COMPUTE_TYPE") or "").strip()
    if configured:
        return configured
    # int8 is the safest default across CPU and consumer CUDA installs. Some local
    # CUDA backends report available, then reject float16 at model load time.
    return "int8"


def get_faster_whisper_model(model_name=None):
    global model_faster_whisper
    if FasterWhisperModel is None:
        return None

    resolved_model_name = str(
        model_name
        or os.getenv("FASTER_WHISPER_MODEL")
        or os.getenv("WHISPER_MODEL")
        or "small"
    ).strip().lower() or "small"
    device = get_faster_whisper_device()
    compute_type = get_faster_whisper_compute_type(device)
    cache_key = f"{device}::{compute_type}::{resolved_model_name}"
    cached = model_faster_whisper.get(cache_key)
    if cached is not None:
        return cached

    def load_faster_whisper_model(load_device, load_compute_type):
        logger.info(
            "Loading faster-whisper model (%s) on %s compute_type=%s...",
            resolved_model_name,
            load_device,
            load_compute_type,
        )
        model_cls = FasterWhisperModel
        if model_cls is None:
            raise RuntimeError("faster-whisper is not installed")
        return model_cls(
            resolved_model_name,
            device=load_device,
            compute_type=load_compute_type,
        )

    try:
        loaded = load_faster_whisper_model(device, compute_type)
    except ValueError as exc:
        fallback_device = "cpu"
        fallback_compute_type = "int8"
        fallback_cache_key = f"{fallback_device}::{fallback_compute_type}::{resolved_model_name}"
        fallback_cached = model_faster_whisper.get(fallback_cache_key)
        if fallback_cached is not None:
            logger.warning(
                "faster-whisper load failed on %s/%s (%s); using cached %s/%s model.",
                device,
                compute_type,
                exc,
                fallback_device,
                fallback_compute_type,
            )
            return fallback_cached
        if device == fallback_device and compute_type == fallback_compute_type:
            raise
        logger.warning(
            "faster-whisper load failed on %s/%s (%s); retrying on %s/%s.",
            device,
            compute_type,
            exc,
            fallback_device,
            fallback_compute_type,
        )
        loaded = load_faster_whisper_model(fallback_device, fallback_compute_type)
        model_faster_whisper[fallback_cache_key] = loaded
        return loaded
    model_faster_whisper[cache_key] = loaded
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
    """Check if NVIDIA NVENC can actually encode on this runtime."""
    forced_encoder = os.getenv("VIDEO_ENCODER", "").strip().lower()
    if forced_encoder in {"libx264", "x264", "cpu"}:
        return "libx264"
    if forced_encoder in {"h264_nvenc", "nvenc"} and env_flag("ALLOW_UNPROVEN_NVENC", default=False):
        return "h264_nvenc"

    try:
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True, text=True, timeout=10,
        )
        if "h264_nvenc" not in result.stdout:
            return "libx264"

        # Some Cloud Run images list h264_nvenc because FFmpeg was compiled
        # with it, but the runtime has no NVIDIA device access. Prove a tiny
        # encode before selecting NVENC for real renders.
        probe = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=size=64x64:rate=1:duration=1",
                "-c:v",
                "h264_nvenc",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if probe.returncode == 0:
            return "h264_nvenc"
        logger.warning(
            "NVENC is compiled into FFmpeg but not usable on this runtime; falling back to libx264: %s",
            (probe.stderr or probe.stdout or "").strip()[-500:],
        )
    except Exception:
        pass
    return "libx264"

GPU_VIDEO_ENCODER = _detect_gpu_encoder()
GPU_PRESET = "p4" if GPU_VIDEO_ENCODER == "h264_nvenc" else "fast"
GPU_CQ = "23"  # Constant quality for NVENC

logger.info(f"Video encoder: {GPU_VIDEO_ENCODER} (preset={GPU_PRESET})")

def build_multicam_segment_encode_args():
    """Encode short multicam segments quickly while keeping concat-safe output."""
    color_args = [
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-colorspace",
        "bt709",
    ]
    if GPU_VIDEO_ENCODER == "h264_nvenc":
        fast_composite = multicam_fast_composite_enabled()
        return [
            "-c:v",
            "h264_nvenc",
            "-preset",
            os.getenv("MULTICAM_NVENC_PRESET", "p1"),
            "-rc",
            "vbr",
            "-cq",
            os.getenv("MULTICAM_NVENC_CQ", "24" if fast_composite else "21"),
            "-b:v",
            os.getenv("MULTICAM_NVENC_BITRATE", "5000k" if fast_composite else "7000k"),
            "-maxrate:v",
            os.getenv("MULTICAM_NVENC_MAXRATE", "7000k" if fast_composite else "10000k"),
            "-bufsize:v",
            os.getenv("MULTICAM_NVENC_BUFSIZE", "10000k" if fast_composite else "14000k"),
            "-pix_fmt",
            "yuv420p",
            *color_args,
        ]
    return [
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        # Two four-thread segment encodes keep an 8-vCPU Cloud Run job busy
        # without letting each short FFmpeg process oversubscribe the machine.
        "-threads",
        os.getenv("MULTICAM_X264_THREADS", "4"),
        "-pix_fmt",
        "yuv420p",
        *color_args,
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
            os.getenv("MULTICAM_CAPTION_NVENC_BITRATE", "6000k"),
            "-maxrate:v",
            os.getenv("MULTICAM_CAPTION_NVENC_MAXRATE", "8000k"),
            "-bufsize:v",
            os.getenv("MULTICAM_CAPTION_NVENC_BUFSIZE", "12000k"),
            "-pix_fmt",
            "yuv420p",
        ]
    return [
        "-c:v",
        "libx264",
        "-preset",
        os.getenv("MULTICAM_CAPTION_X264_PRESET", "veryfast"),
        "-crf",
        os.getenv("MULTICAM_CAPTION_X264_CRF", "21"),
        "-maxrate",
        os.getenv("MULTICAM_CAPTION_X264_MAXRATE", "8000k"),
        "-bufsize",
        os.getenv("MULTICAM_CAPTION_X264_BUFSIZE", "16000k"),
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
                "stream=index,codec_type,codec_name,profile,pix_fmt,width,height,avg_frame_rate,time_base,duration,channels,sample_rate,bit_rate",
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
        # Some phone MOV files make ffprobe's CSV writer append an empty
        # rotation field (for example ``1920x1080x``). Splitting on every x
        # threw that valid result away and incorrectly treated landscape video
        # as 1080x1920, which then produced portrait proxies with black bars.
        dimensions = re.search(r"(\d+)x(\d+)", result.stdout or "")
        if not dimensions:
            return 1080, 1920
        return max(320, int(dimensions.group(1))), max(320, int(dimensions.group(2)))
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


def build_audio_delivery_proof(input_path, expected=True):
    """Return browser-delivery audio evidence for a completed media file."""
    summary = probe_media_stream_summary(input_path)
    audio_stream = next(
        (
            stream
            for stream in (summary.get("streams") or [])
            if str(stream.get("codec_type") or "").lower() == "audio"
        ),
        None,
    )
    verified = bool(audio_stream)
    return {
        "expected": bool(expected),
        "verified": verified,
        "codec": str((audio_stream or {}).get("codec_name") or ""),
        "channels": int((audio_stream or {}).get("channels") or 0),
        "sample_rate": int((audio_stream or {}).get("sample_rate") or 0),
        "duration_seconds": round(float((audio_stream or {}).get("duration") or 0.0), 3),
    }


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

def build_cfr_video_filter(max_long_edge=None):
    filters = []
    try:
        max_edge = int(float(max_long_edge or 0))
    except Exception:
        max_edge = 0
    if max_edge > 0:
        filters.append(
            "scale="
            f"'if(gt(iw,ih),min({max_edge},iw),-2)':"
            f"'if(gt(iw,ih),-2,min({max_edge},ih))'"
        )
    filters.append("fps=30")
    return ",".join(filters)


def redact_media_locator_for_logs(value):
    """Remove bearer-style URL query strings before writing media locations to logs."""
    text_value = str(value or "")
    if not text_value.startswith(("http://", "https://")):
        return text_value
    try:
        parsed = urllib.parse.urlsplit(text_value)
        query = "[REDACTED]" if parsed.query else ""
        return urllib.parse.urlunsplit(
            (parsed.scheme, parsed.netloc, parsed.path, query, "")
        )
    except Exception:
        return re.sub(r"\?.*$", "?[REDACTED]", text_value)


def redact_sensitive_urls_in_text(value):
    if value is None:
        return value
    was_bytes = isinstance(value, (bytes, bytearray))
    text_value = value.decode("utf-8", errors="replace") if was_bytes else str(value)
    sanitized = re.sub(
        r"https?://[^\s'\"<>]+",
        lambda match: redact_media_locator_for_logs(match.group(0)),
        text_value,
    )
    return sanitized.encode("utf-8") if was_bytes else sanitized


async def materialize_video_input(video_url, local_path, keep_audio=False, max_long_edge=None):
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
        logger.info("Downloading source video: %s", redact_media_locator_for_logs(source))
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
                    "-vf", build_cfr_video_filter(max_long_edge),
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
                        "-vf", build_cfr_video_filter(max_long_edge),
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
                "-vf", build_cfr_video_filter(max_long_edge),
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
    cache_dir = os.g…242152 tokens truncated…if ov_path:
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
                fontsize=str(max(32, int(base_height / 34))),
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
        has_main_audio = has_audio_stream(working_path) and not request.mute_audio
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
                source_start = max(0.0, float(overlay.start_time))
                source_end = source_start + max(0.05, float(overlay.duration))
                rel_start = rendered_timeline_time(source_start)
                rel_end = max(rel_start + 0.05, rendered_timeline_time(source_end))
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
            source_start = max(0.0, float(overlay.start_time))
            source_end = source_start + max(0.05, float(overlay.duration))
            rendered_start = rendered_timeline_time(source_start)
            rendered_end = max(rendered_start + 0.05, rendered_timeline_time(source_end))
            delay_ms = max(0, int(rendered_start * 1000))
            audio_duration = rendered_end - rendered_start
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
             # Preserve the video stream, but normalize retained audio to AAC so
             # phone/browser playback cannot silently reject an unusual source codec.
             cmd.extend(["-map", "0:v:0"])
             if has_main_audio:
                 cmd.extend(["-map", "0:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k"])
             else:
                 cmd.extend(["-c:v", "copy", "-an"])
             cmd.extend(["-movflags", "+faststart", "-y", output_path])
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
                 cmd.extend(["-map", "[a_mix]", "-c:a", "aac", "-b:a", "160k"])
             elif request.mute_audio:
                 cmd.extend(["-an"])
             else:
                 cmd.extend(["-map", "0:a?", "-c:a", "aac", "-b:a", "160k"])

             cmd.extend(["-shortest", "-c:v", "libx264", "-movflags", "+faststart", "-y", output_path])
        
        report_progress(75, "Rendering final video")
        logger.info(f"Running FFmpeg: {' '.join(cmd)}")
        await run_subprocess_async(cmd, check=True)

        normalized_audio_remix = normalize_audio_remix(request.audio_remix)
        if normalized_audio_remix["enabled"]:
            if not has_audio_stream(output_path):
                raise ValueError("Remix Audio requires an audible source track")
            report_progress(81, "Applying Remix Audio")
            with tempfile.TemporaryDirectory(prefix="viral-audio-remix-", dir=SHARED_TMP_DIR) as remix_dir:
                remixed_path = os.path.join(remix_dir, "remixed.mp4")
                loop = asyncio.get_running_loop()
                audio_remix_receipt = await loop.run_in_executor(
                    None,
                    render_audio_remix,
                    output_path,
                    remixed_path,
                    normalized_audio_remix,
                )
                os.replace(remixed_path, output_path)

        motion_receipt = {"version": 1, "motion_scenes": 0, "sound_cues": 0}
        design_scenes, design_effects = validate_design(request.motion_graphics, request.sound_effects)
        if design_scenes or design_effects:
            report_progress(82, "Compositing motion graphics and sound cues")
            with tempfile.TemporaryDirectory(prefix="viral-design-inputs-", dir=SHARED_TMP_DIR) as design_dir:
                resolved_audio = {}
                for effect in design_effects:
                    if effect.get("builtIn") or effect.get("url") in resolved_audio:
                        continue
                    url = str(effect.get("url") or "")
                    if not url.startswith("https://"):
                        raise ValueError("Uploaded sound effects require an HTTPS media URL")
                    resolved_audio[url] = await materialize_audio_input(
                        url, os.path.join(design_dir, f"cue-{len(resolved_audio)}.wav"), sample_rate=48000
                    )
                designed_path = os.path.join(design_dir, "designed.mp4")
                loop = asyncio.get_running_loop()
                motion_receipt = await loop.run_in_executor(
                    None, render_motion_and_sound, output_path, designed_path,
                    request.motion_graphics, design_effects, speed_plan, resolved_audio
                )
                os.replace(designed_path, output_path)

        if os.path.exists(output_path):
            report_progress(90, "Verifying rendered video and audio")
            audio_expected = bool(
                (source_has_audio and not request.mute_audio)
                or overlay_audio_specs
                or (background_audio and background_audio.url)
                or motion_receipt["sound_cues"] > 0
                or audio_remix_receipt["status"] == "applied"
            )
            audio_proof = build_audio_delivery_proof(output_path, expected=audio_expected)
            if audio_expected and not audio_proof["verified"]:
                raise RuntimeError(
                    "Final viral clip failed audio verification; the silent output was rejected"
                )
            report_progress(95, "Uploading finished video")
            public_url = upload_file_to_firebase(output_path)
            if not public_url:
                raise RuntimeError("Final viral clip could not be published")
            cover_frame_request = request.thumbnail_frame or request.cover_frame
            thumbnail_url = None
            cover_frame_result = None
            thumbnail_frame_result = None

            if cover_frame_request:
                requested_timeline_time = clamp_float(
                    rendered_timeline_time(float(cover_frame_request.timelineTime or 0.0)),
                    0.0,
                    rendered_timeline_duration,
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
                "progress": 100,
                "detail": "Render complete",
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
                "audio_proof": audio_proof,
                "duration": get_media_duration(output_path) or rendered_timeline_duration,
                "speed_plan": speed_plan,
                "creative_receipt": creative_receipt,
                "audio_remix_receipt": audio_remix_receipt,
                "motion_receipt": motion_receipt,
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
        if speed_adjusted_path and os.path.exists(speed_adjusted_path):
            os.remove(speed_adjusted_path)
        if creative_adjusted_path and os.path.exists(creative_adjusted_path):
            os.remove(creative_adjusted_path)
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
    Local-development source upload for tools that explicitly use a local worker.
    Production rejects this route; product uploads must use authenticated storage
    and a backend-issued short-lived read URL.
    """
    if not ALLOW_DIRECT_SOURCE_UPLOAD:
        raise HTTPException(
            status_code=403,
            detail="Direct worker uploads are disabled. Use an authenticated AutoPromote upload.",
        )
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
