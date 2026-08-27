#!/usr/bin/env python3
"""Run the real viral renderer locally and retain its output for release inspection."""

import argparse
import asyncio
import json
import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKER_ROOT = PROJECT_ROOT / "python_media_worker"
sys.path.insert(0, str(WORKER_ROOT))

import main_media_server as worker  # noqa: E402


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


async def run():
    args = parse_args()
    request_path = args.request.resolve()
    output_path = args.output.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    request_data = json.loads(request_path.read_text(encoding="utf-8"))

    def retain_render(local_path, destination_path=None):
        source = Path(local_path).resolve()
        target = output_path
        if destination_path and str(destination_path).lower().endswith((".jpg", ".jpeg", ".png")):
            target = output_path.with_suffix(Path(destination_path).suffix or ".jpg")
        shutil.copy2(source, target)
        return target.as_uri()

    worker.upload_file_to_firebase = retain_render
    result = await worker.render_viral_clip_impl(worker.RenderViralRequest(**request_data))
    metadata_path = output_path.with_suffix(".json")
    metadata_path.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    print(json.dumps({"output": str(output_path), "metadata": str(metadata_path)}, indent=2))


if __name__ == "__main__":
    asyncio.run(run())
