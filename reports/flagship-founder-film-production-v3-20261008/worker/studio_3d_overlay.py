"""The existing CPU render worker only composites pre-rendered 3D alpha clips."""
import os
import json
import re
import subprocess
from urllib.parse import unquote, urlparse
from urllib.request import urlopen

MAX_OVERLAY_BYTES = 750 * 1024 * 1024
ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def validate_resolved_overlays(items):
    if items is None:
        return []
    if not isinstance(items, list) or len(items) > 8:
        raise ValueError("Invalid 3D overlay list")
    result = []
    for item in items:
        if not isinstance(item, dict) or set(item) != {"id", "jobId", "ownerUid", "startTime", "duration", "layerOrder", "overlayUrl"}:
            raise ValueError("Invalid 3D overlay fields")
        if not all(isinstance(item.get(key), str) and ID.fullmatch(item[key]) for key in ("id", "jobId", "ownerUid")):
            raise ValueError("Invalid 3D overlay identity")
        for key, low, high in (("startTime", 0, 86400), ("duration", .5, 10), ("layerOrder", 0, 100)):
            value = item.get(key)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
                raise ValueError(f"Invalid 3D {key}")
        url = item["overlayUrl"]
        if not isinstance(url, str) or len(url) > 4096:
            raise ValueError("Invalid 3D overlay URL")
        parsed = urlparse(url)
        path = unquote(parsed.path)
        expected = f"/temp_studio_3d/{item['ownerUid']}/{item['jobId']}/overlay.mov"
        if parsed.scheme != "https" or parsed.hostname != "storage.googleapis.com" or not path.endswith(expected) or ".." in path or not parsed.query or parsed.username or parsed.password:
            raise ValueError("3D overlay URL is not an owned signed storage object")
        result.append(item)
    return sorted(result, key=lambda item: item["layerOrder"])


def download_overlay(item, destination):
    validate_resolved_overlays([item])
    count = 0
    with urlopen(item["overlayUrl"], timeout=60) as response, open(destination, "wb") as output:
        if response.status != 200:
            raise ValueError("3D overlay download failed")
        size = response.headers.get("Content-Length")
        if size and int(size) > MAX_OVERLAY_BYTES:
            raise ValueError("3D overlay exceeds size limit")
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            count += len(chunk)
            if count > MAX_OVERLAY_BYTES:
                raise ValueError("3D overlay exceeds size limit")
            output.write(chunk)
    if count < 1000 or not os.path.isfile(destination):
        raise ValueError("3D overlay is empty")
    return destination


def validate_overlay_media(path, expected_duration):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,pix_fmt,width,height,codec_type", "-show_entries", "format=duration", "-of", "json", path],
        capture_output=True, text=True, timeout=30, check=False,
    )
    if result.returncode:
        raise ValueError("3D overlay video is corrupt")
    try:
        data = json.loads(result.stdout)
        streams = data["streams"]
        video = next(stream for stream in streams if stream["codec_type"] == "video")
        duration = float(data["format"]["duration"])
        width, height = int(video["width"]), int(video["height"])
    except (KeyError, ValueError, StopIteration, TypeError) as exc:
        raise ValueError("3D overlay metadata is invalid") from exc
    if len(streams) != 1 or video["codec_name"] != "qtrle" or video["pix_fmt"] != "argb" or width * height > 1280 * 720 or min(width, height) < 160 or duration < expected_duration - .15 or duration > 10.2:
        raise ValueError("3D overlay format or duration is invalid")
    return True
