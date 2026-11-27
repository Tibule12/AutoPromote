"""Bounded, private, content-addressed reuse of expensive pure worker results.

No URLs, caller cache keys, credentials or entitlements are cache identities.
Only successfully materialized local bytes and the complete algorithm/options
identity qualify. flock coalesces requests across worker processes. A cache
miss/error never changes the algorithm or output quality.
"""
import copy
import fcntl
import hashlib
import json
import logging
import os
from pathlib import Path
import tempfile
import time

log = logging.getLogger(__name__)
SCHEMA = 1
_source_revision = None


def source_revision():
    global _source_revision
    if _source_revision is None:
        digest = hashlib.sha256()
        for name in ("main_media_server.py", "caption_transcription.py", "processing_result_cache.py"):
            digest.update(Path(__file__).with_name(name).read_bytes())
        _source_revision = digest.hexdigest()
    return _source_revision


def content_key(file_path, identity):
    digest = hashlib.sha256()
    with open(file_path, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return hashlib.sha256(json.dumps({
        "schema": SCHEMA, "content_sha256": digest.hexdigest(),
        "source_revision": source_revision(), "identity": identity,
    }, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def _bounds():
    ttl = int(os.getenv("PROCESSING_RESULT_CACHE_TTL_SECONDS", "21600"))
    capacity = int(os.getenv("PROCESSING_RESULT_CACHE_MAX_BYTES", str(64 * 1024 * 1024)))
    if not 60 <= ttl <= 86400 or not 1024 * 1024 <= capacity <= 256 * 1024 * 1024:
        raise ValueError("Invalid bounded processing cache policy")
    return ttl, capacity


def cached_result(file_path, identity, compute, *, observer=None):
    if os.getenv("PROCESSING_RESULT_CACHE_ENABLED", "true").lower() != "true":
        return compute()
    try:
        ttl, capacity = _bounds()
        root = Path(os.getenv("PROCESSING_RESULT_CACHE_DIR", "/tmp/autopromote-processing-results"))
        if root.is_symlink():
            raise ValueError("Cache must be a private directory")
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if root.stat().st_uid != os.getuid() or root.stat().st_mode & 0o077:
            raise ValueError("Cache must be private to the worker identity")
        key = content_key(file_path, identity)
        # One permanent bounded lock avoids deleting a held lock and splitting
        # concurrent work across two inodes. Results occupy only capped *.json.
        lock_fd = os.open(root / ".lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    except (OSError, ValueError, TypeError) as error:
        log.warning("Result cache unavailable: %s", type(error).__name__)
        return compute()
    with os.fdopen(lock_fd, "a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        target = root / (key + ".json")
        now = time.time()
        try:
            if not target.is_symlink() and now - target.stat().st_mtime <= ttl:
                with target.open() as stream:
                    record = json.load(stream)
                if record.get("key") == key and record.get("schema") == SCHEMA:
                    if observer:
                        observer({"hit": True, "key": key})
                    return copy.deepcopy(record["value"])
        except (OSError, ValueError, KeyError, TypeError):
            pass
        # Never catch/turn a processing failure into a cached success.
        value = compute()
        if observer:
            observer({"hit": False, "key": key})
        try:
            data = json.dumps({"schema": SCHEMA, "key": key, "value": value}, allow_nan=False).encode()
            entries = []
            for candidate in root.glob("*.json"):
                if candidate.is_symlink():
                    candidate.unlink()
                    continue
                stat = candidate.stat()
                if now - stat.st_mtime > ttl or candidate == target:
                    candidate.unlink()
                else:
                    entries.append((stat.st_mtime, stat.st_size, candidate))
            total = sum(item[1] for item in entries)
            if len(data) <= min(capacity, 4 * 1024 * 1024):
                for _, size, candidate in sorted(entries):
                    if total + len(data) <= capacity:
                        break
                    candidate.unlink()
                    total -= size
                with tempfile.NamedTemporaryFile(dir=root, prefix=".write-", delete=False) as stream:
                    partial = Path(stream.name)
                    try:
                        stream.write(data)
                        stream.flush()
                        os.fsync(stream.fileno())
                        os.replace(partial, target)
                    finally:
                        partial.unlink(missing_ok=True)
        except (OSError, ValueError, TypeError):
            log.warning("Result cache write skipped")
        return value


def transcription_identity(options):
    prefixes = ("WHISPER_", "FASTER_WHISPER_", "MULTICAM_CAPTION_WHISPER_", "AUTOPROMOTE_REALITY_WHISPER_")
    return {"operation": "local-transcription", "options": options,
            "environment": {key: value for key, value in sorted(os.environ.items())
                            if key.startswith(prefixes) or key in {
                                "PROMO_WHISPER_MODEL", "VIRAL_CAPTION_GENERAL_WHISPER_MODEL",
                                "PROCESSING_TRANSCRIPTION_MODEL_REVISION"}}}
