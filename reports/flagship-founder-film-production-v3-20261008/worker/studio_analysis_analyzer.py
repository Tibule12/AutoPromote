"""Private, staging-only HTTP adapter for the existing source-shot detector."""

import os
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlsplit, parse_qs

import requests
from fastapi import FastAPI, HTTPException
from starlette.concurrency import run_in_threadpool

from studio_face_tracking import track_faces


app = FastAPI()
MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024


def validate_source_url(raw_url):
    """Accept only signed reads of the staging Studio source prefixes."""
    bucket = os.environ.get("FIREBASE_STORAGE_BUCKET", "")
    if not bucket or not bucket.endswith(".firebasestorage.app"):
        raise ValueError("Staging bucket is not configured")
    parsed = urlsplit(str(raw_url or ""))
    path = unquote(parsed.path)
    prefixes = (
        f"/{bucket}/studio/sources/",
        f"/{bucket}/temp/studio-analysis/",
    )
    query = parse_qs(parsed.query)
    signer_domain = f"@{bucket.removesuffix('.firebasestorage.app')}.iam.gserviceaccount.com"
    v2_signed = ("GoogleAccessId" in query and "Signature" in query
                 and "Expires" in query and
                 query["GoogleAccessId"][0].endswith(signer_domain))
    v4_signed = ("X-Goog-Signature" in query and "X-Goog-Credential" in query
                 and signer_domain in unquote(query["X-Goog-Credential"][0]))
    if (parsed.scheme != "https" or parsed.netloc != "storage.googleapis.com"
            or not path.startswith(prefixes) or ".." in path.split("/")
            or not (v2_signed or v4_signed)):
        raise ValueError("Expected a signed staging Studio source URL")
    return parsed.geturl()


def analyze_source(request):
    url = validate_source_url(request.get("video_url"))
    if request.get("mode") != "source_shots":
        raise ValueError("Only source-shot analysis is supported")
    anchors = request.get("anchors")
    if not isinstance(anchors, dict) or set(anchors) != {"solo"}:
        raise ValueError("One solo anchor is required")
    with tempfile.TemporaryDirectory(prefix="studio-analysis-") as folder:
        source = Path(folder) / "source.mp4"
        with requests.get(url, stream=True, allow_redirects=False, timeout=(15, 120)) as response:
            if response.status_code != 200:
                raise requests.HTTPError(response=response)
            response.raise_for_status()
            size = int(response.headers.get("Content-Length") or 0)
            if size > MAX_SOURCE_BYTES:
                raise ValueError("Studio source exceeds the size limit")
            written = 0
            with source.open("wb") as target:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    written += len(chunk)
                    if written > MAX_SOURCE_BYTES:
                        raise ValueError("Studio source exceeds the size limit")
                    target.write(chunk)
        if written < 1024:
            raise ValueError("Studio source is empty or too small")
        return track_faces(source, anchors, request.get("start", 0),
                           request.get("end"), mode="source_shots")


@app.get("/health")
def health():
    return {"ok": True, "engine": "opencv-yunet-source-shot-follow"}


@app.post("/track-studio-faces")
async def track_studio_faces(request: dict):
    try:
        return await run_in_threadpool(analyze_source, request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except requests.HTTPError as error:
        status = error.response.status_code if error.response is not None else 502
        raise HTTPException(status_code=502, detail=f"Studio source fetch failed ({status})") from error
