"""Read-only source analysis and existing production audio extraction, local output only."""
import argparse
import asyncio
import json
from pathlib import Path
import shutil
from unittest.mock import patch
from python_media_worker import main_media_server as worker
from studio_face_tracking import track_faces


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--donor")
    parser.add_argument("--model", default="base")
    parser.add_argument("--task", choices=["tracking", "transcript", "extract"], required=True)
    args = parser.parse_args()
    out = Path(args.output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"{args.task}.json"
    if target.exists():
        raise ValueError("Use a fresh output folder; analysis already exists")
    if args.task == "tracking":
        data = track_faces(args.source, {"top": {"x": 34, "y": 47}, "bottom": {"x": 89, "y": 17}}, end=60)
    elif args.task == "transcript":
        data = worker.transcribe_with_hints(args.source, word_timestamps=True, model_name=args.model,
            prompt_hint="Unmuted Podcast. Molo. Molweni. South African interview; preserve spoken words.")
    else:
        def deliver(path, *unused):
            dest = out / "extracted-donor.wav"
            if dest.exists():
                raise ValueError("Do not overwrite extracted audio")
            shutil.copyfile(path, dest)
            return str(dest)
        with patch.object(worker, "upload_file_to_firebase", deliver), patch.object(worker, "update_firestore_job", lambda *args: None):
            data = asyncio.run(worker.extract_audio_impl(worker.ExtractAudioRequest(video_url=args.donor, output_format="wav")))
    target.write_text(json.dumps(data, indent=2, default=str))
    print(str(target))


if __name__ == "__main__":
    main()
