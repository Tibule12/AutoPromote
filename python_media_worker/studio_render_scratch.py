"""Operator-selected transient storage for the existing Studio renderer."""
import os


def studio_render_scratch_directory(worker_directory):
    configured = str(os.environ.get("MEDIA_WORKER_STUDIO_TMP_DIR") or "").strip()
    if configured and not os.path.isabs(configured):
        raise ValueError("MEDIA_WORKER_STUDIO_TMP_DIR must be an absolute directory")
    directory = os.path.realpath(configured or os.path.join(worker_directory, "../tmp"))
    if directory == os.path.abspath(os.sep):
        raise ValueError("Studio render scratch cannot be the filesystem root")
    if os.path.exists(directory) and not os.path.isdir(directory):
        raise ValueError("Studio render scratch must be a directory")
    return directory
