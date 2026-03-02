from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
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
import re  # Added for parsing silence output
import cv2  # OpenCV (Phase 1)
import ffmpeg  # FFmpeg (Phase 1)
import firebase_admin
from firebase_admin import credentials, storage
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

# Initialize Whisper model (lazy load or global)
# 'tiny' is fast but less accurate. 'base' or 'small' are better for production.
# We will load it on first request to avoid slow startup.
model_whisper = None

def get_whisper_model():
    global model_whisper
    if model_whisper is None and whisper is not None:
        # Upgrade to 'base' - Better accuracy than tiny, still fast enough for CPU.
        # 'small' is too slow for 2min requirement on CPU.
        logger.info("Loading Whisper model (base) for balanced speed/accuracy...")
        model_whisper = whisper.load_model("base")
    return model_whisper

def upload_file_to_firebase(local_path, destination_path=None):
    """
    Uploads a file to Firebase Storage and returns the public URL.
    """
    try:
        bucket = storage.bucket()
        if not destination_path:
            destination_path = f"processed/{os.path.basename(local_path)}"
        
        blob = bucket.blob(destination_path)
        blob.upload_from_filename(local_path)
        blob.make_public()
        logger.info(f"Uploaded to Firebase: {blob.public_url}")
        return blob.public_url
    except Exception as e:
        logger.error(f"Firebase Upload Failed: {e}")
        return None


def download_youtube_audio(query, output_path):
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
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            if not query.startswith("http"):
                query = f"ytsearch1:{query}" # Search logic
            
            logger.info(f"Searching/Downloading song: {query}")
            ydl.download([query])
            
            # yt-dlp appends extension, so check file
            final_path = base_output + ".mp3"
            if os.path.exists(final_path):
                return final_path
            return None
    except Exception as e:
        logger.error(f"yt-dlp error: {e}")
        return None

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

class VideoProcessRequest(BaseModel):
    video_url: str
    smart_crop: bool = False
    crop_style: str = "blur"
    silence_removal: bool = False
    montage_segments: Optional[List[dict]] = None  # NEW: For concatenating clips
    captions: bool = False
    add_music: bool = False
    music_file: str = "upbeat.mp3"  # Fixed default
    mute_audio: bool = False
    add_hook: bool = False
    hook_text: str = ""
    volume: float = 0.15
    is_search: bool = False
    safe_search: bool = True

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

@app.post("/process-video")
async def process_video_pipeline(request: VideoProcessRequest):
    """
    Master pipeline that runs multiple AI enhancements sequentially without intermediate uploads.
    1. Download
    2. Smart Crop (if enabled)
    3. Silence Removal (if enabled)
    4. Viral Hook Intro (if enabled) - NEW
    5. Mute Audio (if enabled)
    6. Add Music (if enabled)
    7. Captions (if enabled)
    Returns the final local path.
    """
    logger.info(f"Received efficient pipeline request: {request}")
    
    job_id = str(uuid.uuid4())
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR):
        os.makedirs(SHARED_TMP_DIR)


    # Initial Download
    current_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_step0.mp4")
    
    # Auto-Kill existing job if busy (Last-Write-Wins for single user UX)
    if current_job_info["status"] == "busy":
        logger.warning(f"Worker busy with {current_job_info['job_id']}. New request {job_id} effectively cancels it.")
        reset_worker()
        # clear_current_process() is called by reset_worker

    try:
        # Step 0: Download
        logger.info(f"Step 0: Downloading video from {request.video_url}")

        # Check for HTTP 404 upfront before invoking ffmpeg which fails hard
        import urllib.request
        try:
             # Use a custom User-Agent to mimic a browser, avoiding potential 403s on strict servers
             req = urllib.request.Request(request.video_url, headers={'User-Agent': 'Mozilla/5.0'})
             with urllib.request.urlopen(req) as response:
                  if response.getcode() == 404:
                       raise HTTPException(status_code=404, detail="Video URL not found/accessible (404)")
        except Exception as e:
             # If simple check fails, we proceed to try ffmpeg or handle as error
             # But for Firebase storage specifically, 404 is common if token invalid
             logger.warning(f"URL check warning: {e}")

        # Use -headers for authenticated URLs if needed, but for public/signed URLs standard input is usually ok.
        # Adding user agent sometimes helps with strict CDNs
        await run_subprocess_async(
            ["ffmpeg", "-user_agent", "Mozilla/5.0", "-i", request.video_url, "-c", "copy", "-y", current_path],
            check=True
        )
        
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
           logger.info(f"Step {step_count}: Removing Silence (Structural Edit)")

           next_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_step{step_count}.mp4")
           
           silences = await detect_silence_intervals(current_path)
           
           if silences:
               # ... [Keep existing silence logic] ...
               # Invert to Keep Segments
               total_duration = 0.0
               try:
                   probe = await run_subprocess_async(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", current_path], check=True, stdout=subprocess.PIPE, text=True)
                   total_duration = float(probe.stdout.strip())
               except: pass
               
               keep_segments = []
               last_pos = 0.0
               for s_start, s_end in silences:
                   if s_start > last_pos: keep_segments.append((last_pos, s_start))
                   last_pos = s_end
               if last_pos < total_duration: keep_segments.append((last_pos, total_duration))
                   
                   
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
        final_pass_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_final_pass.mp4")
        
        main_filters = []     # List of filter strings
        input_args = ["-i", current_path] 
        input_map = 0            # Index of main video
        audio_map_idx = 0        # Index of audio stream
        
        next_input_idx = 1
        
        # 1. Prepare CAPTION file (if needed) - Must be done BEFORE ffmpeg call
        ass_filter = ""
        if request.captions and whisper:
             logger.info("Generating Captions for single-pass burn...")
             model = get_whisper_model()
             # We need to transcribe current_path (which might be silence-removed)
             result = model.transcribe(current_path, word_timestamps=True, fp16=False)
             
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

        # B. Viral Hook (Drawtext)
        if request.add_hook and request.hook_text:
             safe_text = request.hook_text.replace("'", "").replace(":", "")
             # We apply drawtext directly to the stream
             # Need fonts
             font = "font='Impact'"
             dt_base = f"fontsize=(h/15):x=(w-text_w)/2:y=(h-text_h)/2:borderw=5:bordercolor=black:shadowx=3:shadowy=3:{font}"
             # 5 colors
             colors = ["magenta", "cyan", "yellow", "green", "red"]
             hook_filters = []
             hook_filters.append(f"eq=brightness=-0.3:enable='between(t,0,3.5)'")
             for i, col in enumerate(colors):
                 start_t = i * 0.7
                 end_t = (i + 1) * 0.7
                 hook_filters.append(f"drawtext=text='{safe_text}':fontcolor={col}:{dt_base}:enable='between(t,{start_t},{end_t})'")
             
             # Chain them: [in]dt1,dt2,dt3...[out]
             hook_chain = ",".join(hook_filters)
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
             # Download song logic...
             song_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_song.mp3")
             
             final_song_path = None
             # Case 1: Direct path provided
             if not request.music_file.startswith("http") and os.path.exists(request.music_file):
                  final_song_path = request.music_file
             # Case 2: Asset lookup
             elif not request.music_file.startswith("http") and os.path.exists(os.path.join("assets/music", request.music_file)):
                  final_song_path = os.path.join("assets/music", request.music_file)
             # Case 3: URL
             elif request.music_file.startswith("http"):
                  try:
                      loop = asyncio.get_running_loop()
                      final_song_path = await loop.run_in_executor(None, download_youtube_audio, request.music_file, song_path)
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
                      # Apply volume to music stream before mixing
                      main_filters.append(f"[{music_idx}:a]volume={request.volume}[bgm]")
                      # Mix original [current_a] with music [bgm]
                      # 'inputs=2' takes the last 2 labeled inputs or mapped streams
                      # 'weights' allows better control: 1 1 means equal mix. 
                      # But if request.volume is small (0.15), bgm is quiet. Original is 100%.
                      main_filters.append(f"{current_a}[bgm]amix=inputs=2:duration=first:dropout_transition=2[a_out]")
                 
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
        else:
             filter_str = ";".join(main_filters)
             # Map the last labels
             cmd = ["ffmpeg"] + input_args
             
             cmd.extend(["-filter_complex", filter_str])
             
             # Map outputs
             # If we didn't touch audio, map 0:a
             if "[a_out]" in filter_str:
                 cmd.extend(["-map", current_v, "-map", "[a_out]"])
             else:
                 cmd.extend(["-map", current_v, "-map", "0:a"])

             cmd.extend(["-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac", "-y", final_pass_path])
             
             await run_subprocess_async(cmd, check=True)
        
        current_path = final_pass_path

        # Final Result
        final_output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_final.mp4")
        if os.path.exists(current_path):
            os.rename(current_path, final_output_path)
            # Clean up temp ass file
            if 'ass_path' in locals() and os.path.exists(ass_path):
                 try: os.remove(ass_path)
                 except: pass

            return {
                "status": "completed", 
                "job_id": job_id, 
                "output_path": final_output_path,
                "output_url": upload_file_to_firebase(final_output_path)
            }
        else:
            raise HTTPException(status_code=500, detail="Pipeline failed to produce output")

    except Exception as e:
        logger.error(f"Pipeline Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
async def remove_silence(request: CropRequest): # Reusing CropRequest just for video_url
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
        # We'll use a threshold of -35dB and min duration of 0.5s.
        logger.info("Detecting silence segments...")
        detect_cmd = [
            "ffmpeg", "-i", input_path,
            "-af", "silencedetect=noise=-35dB:d=0.75", 
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
        duration_cmd = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration", 
            "-of", "default=noprint_wrappers=1:nokey=1", input_path
        ]
        duration_res = subprocess.run(duration_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            total_duration = float(duration_res.stdout.strip())
        except:
            # Fallback if ffprobe fails
            total_duration = 3600.0 

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
                logger.info("Task [Whisper]: Starting...")
                # Extract audio first for speed? No, Whisper handles it.
                # Use threads=4 to prevent hogging all cores?
                res = get_whisper_model().transcribe(input_path, fp16=False)
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
        scenes = [] # Ensure scenes list is initialized
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
                
                # Score based on keywords
                keyword_boost = 0
                found_keywords = []
                
                for kw, boost in VIRAL_KEYWORDS.items():
                    if kw in full_text:
                        keyword_boost += boost
                        if len(found_keywords) < 3: found_keywords.append(kw)
                
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
                "start": start_time_sec,
                "end": end_time_sec,
                "duration": duration_sec,
                "viralScore": score,
                "reason": " + ".join(reason_parts),
                "text": scene_text or f"Scene {i+1} (No speech detected)"
            })
        
        # Sort by Viral Score (Descending) to show best clips first
        scenes.sort(key=lambda x: x["viralScore"], reverse=True)
        
        # Limit to top 15 suggestions
        return {
            "status": "completed",
            "job_id": job_id,
            "scenes": scenes,
            "clipSuggestions": scenes[:15]
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

    if request.is_search:
        # Step 1: Search and Download from YouTube
        song_output_path = os.path.join(temp_dir, f"song_search_{uuid.uuid4().hex[:8]}")
        
        # Safety Logic: Append keywords if searching and safety is on
        search_query = request.music_file
        if request.safe_search and not "http" in search_query:
            if "royalty free" not in search_query.lower() and "nocopyright" not in search_query.lower():
                search_query += " royalty free bgm"
        
        # Call helper (without .mp3 suffix, yt-dlp adds it)
        try:
            downloaded = download_youtube_audio(search_query, song_output_path)
            if downloaded and os.path.exists(downloaded):
                music_path = downloaded
                downloaded_song = downloaded
            else:
                raise HTTPException(status_code=404, detail=f"Could not find music for query: {request.music_file}")
        except Exception as e:
             raise HTTPException(status_code=500, detail=f"Music search failed: {str(e)}")

    else:
        # Step 1: Use Local Preset
        music_path = os.path.join(BASE_DIR, "assets", "music", request.music_file)
        if not os.path.exists(music_path):
            cwd_music_path = os.path.join(os.getcwd(), "assets", "music", request.music_file)
            if os.path.exists(cwd_music_path): music_path = cwd_music_path
            else: raise HTTPException(status_code=404, detail=f"Preset music '{request.music_file}' not found")

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
            # amix=inputs=2:duration=first (ends when video ends)
            # volume filter to lower music volume
            # We chain filters: [1:a]volume=0.15[music];[0:a][music]amix...
            filter_complex = f"[1:a]volume={request.volume}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]"
            cmd_map = ["-filter_complex", filter_complex, "-map", "0:v", "-map", "[aout]", "-shortest"]
        else:
            # No original audio, just use music (looped)
            # Reduce volume of music
            filter_complex = f"[1:a]volume={request.volume}[aout]"
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
    bg: Optional[str] = None 
    color: Optional[str] = None
    start_time: Optional[float] = None
    duration: Optional[float] = None

class RenderViralRequest(BaseModel):
    video_url: str
    start_time: float
    end_time: float
    overlays: List[ViralOverlay] = []
    auto_captions: bool = False

@app.post("/render-viral-clip")
async def render_viral_clip(request: RenderViralRequest):
    """
    Renders a clip with overlays (PiP, Text) and cuts it to specific time.
    """
    logger.info(f"Rendering viral clip for {request.video_url} with {len(request.overlays)} overlays")

    job_id = str(uuid.uuid4())
    SHARED_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../tmp"))
    if not os.path.exists(SHARED_TMP_DIR): os.makedirs(SHARED_TMP_DIR)

    input_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_input.mp4")
    trimmed_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_trimmed.mp4")
    output_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_viral.mp4")

    try:
        # 1. Download/Prepare Main Video (Async)
        try:
            if request.video_url.startswith("http"):
                 await run_subprocess_async(["ffmpeg", "-user_agent", "Mozilla/5.0", "-i", request.video_url, "-c", "copy", "-y", input_path], check=True)
            else:
                 shutil.copy(request.video_url, input_path)
        except Exception as e:
             raise HTTPException(status_code=400, detail=f"Failed to load video: {str(e)}")

        # 2. Pre-trim to duration (Async)
        duration = request.end_time - request.start_time
        try:
            await run_subprocess_async([
                "ffmpeg", "-ss", str(request.start_time), "-i", input_path, 
                "-t", str(duration), "-c", "copy", "-y", trimmed_path
            ], check=True)
        except:
            # Fallback re-encode if copy fails (keyframes issue)
            await run_subprocess_async([
                "ffmpeg", "-ss", str(request.start_time), "-i", input_path, 
                "-t", str(duration), "-c:v", "libx264", "-y", trimmed_path
            ], check=True)

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
                        trimmed_path, 
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

        inputs = ["-i", trimmed_path]
        filter_chain = []
        current_v_label = "0:v"
        input_idx = 1
        
        # Process Video Overlays
        video_overlays = [o for o in request.overlays if o.type == 'video' and o.src]
        
        for ov in video_overlays: 
            ov_path = ""
            if ov.src.startswith("http"):
                 ov_dl_path = os.path.join(SHARED_TMP_DIR, f"{job_id}_ov_{input_idx}.mp4")
                 # Async download
                 await run_subprocess_async(["ffmpeg", "-i", ov.src, "-c", "copy", "-y", ov_dl_path], check=True)
                 ov_path = ov_dl_path
            
            if ov_path:
                inputs.extend(["-i", ov_path])
                w_scale = (ov.width or 30) / 100.0
                scale_filter = f"[{input_idx}:v]scale=w=iw*{w_scale}:h=-1[ov{input_idx}];"
                
                x_expr = f"W*{ov.x/100}"
                y_expr = f"H*{ov.y/100}"
                
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
                
                w_scale = (ov.width or 80) / 100.0 
                # Scale image
                scale_filter = f"[{input_idx}:v]scale=w=iw*{w_scale}:h=-1[img{input_idx}];"
                
                x_expr = f"W*{ov.x/100}"
                y_expr = f"H*{ov.y/100}"
                
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
                f"x=(w*0.5)-(tw/2):"      # Force center X for now based on your previous logic (w*0.28 was specific)
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

        # Build Command
        cmd = ["ffmpeg"]
        cmd.extend(inputs)
             
        if not filter_chain:
             # Just Trim? We already trimmed. So this is a no-op / copy.
             cmd.extend(["-c", "copy", "-y", output_path])
        else:
             # Handle case where output label was not set (e.g., intermediate filters)
             if current_v_label != "output":
                 # Alias the last label to [output]
                 filter_chain.append(f"[{current_v_label}]null[output]")
            
             # Join filter chain with semicolons
             complex_filter = ";".join(filter_chain)
             cmd.extend(["-filter_complex", complex_filter, "-map", "[output]", "-map", "0:a", "-shortest", "-c:v", "libx264", "-c:a", "copy", "-y", output_path])
        
        logger.info(f"Running FFmpeg: {' '.join(cmd)}")
        await run_subprocess_async(cmd, check=True)

        if os.path.exists(output_path):
            return {
                "status": "completed", 
                "job_id": job_id, 
                "output_path": output_path,
                "output_url": upload_file_to_firebase(output_path)
            }
        else:
             raise Exception("Output viral video not generated")

    except Exception as e:
        logger.error(f"Render Viral Error: {e}")
        # Cleanup
        if os.path.exists(trimmed_path): os.remove(trimmed_path)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup inputs
        if os.path.exists(input_path): os.remove(input_path)

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
        model = get_whisper_model()
        if not model:
            raise HTTPException(status_code=500, detail="Whisper model not allocated")
            
        result = model.transcribe(input_path, fp16=False)
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
