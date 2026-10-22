"""Reuse an image's exact bytes across occurrences in one render request."""
from pathlib import Path
import shutil
import time
import urllib.request


def materialize_studio_image(source, destination, sources):
    # This map belongs to the current render, never another project/owner/job.
    # A split changes occurrence identity, not the bytes of its source image.
    existing = sources.get(source)
    if existing and Path(existing).is_file():
        return existing
    for attempt in range(3):
        try:
            with urllib.request.urlopen(source, timeout=30) as response, open(destination, "wb") as target:
                shutil.copyfileobj(response, target)
            sources[source] = destination
            return destination
        except OSError:
            if attempt == 2:
                raise
            time.sleep(.25 * (attempt + 1))
