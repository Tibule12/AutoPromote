"""Bounded second-pass ASR; retain every original candidate for review."""
import argparse
import json
from pathlib import Path
from python_media_worker import main_media_server as worker
from viral_motion_graphics import run

parser = argparse.ArgumentParser()
parser.add_argument("--source", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--no-prompt", action="store_true", help="Diagnostic: compare the model without transcription instructions")
args = parser.parse_args()
out = Path(args.output).resolve()
out.mkdir(parents=True, exist_ok=False)
results = []
plain_model = None
if args.no_prompt:
    from faster_whisper import WhisperModel
    plain_model = WhisperModel("digiphyte/swivuriso-turbo", device="cpu", compute_type="int8", cpu_threads=4, local_files_only=True)
for start, end in [(12.2, 17.2), (37.5, 41), (49.3, 57.5)]:
    audio = out / f"speech-{start}.wav"
    run(["ffmpeg", "-v", "error", "-ss", str(start), "-i", args.source, "-t", str(end-start),
         "-vn", "-ar", "16000", "-ac", "1", "-n", str(audio)])
    if plain_model:
        segments, info = plain_model.transcribe(str(audio), language=None, beam_size=5,
            word_timestamps=True, condition_on_previous_text=False)
        data = {"language": info.language, "segments": [segment._asdict() for segment in segments]}
    else:
        data = worker.transcribe_with_hints(str(audio), word_timestamps=True, model_name="digiphyte/swivuriso-turbo",
            prompt_hint="Unmuted Podcast. Lisakhanya Mdoda. Siphamandla Tsephe. Khayelitsha. Harare.")
    results.append({"sourceStart": start, "sourceEnd": end, "transcript": data})
(out / "candidates.json").write_text(json.dumps(results, indent=2))
print(str(out / "candidates.json"))
