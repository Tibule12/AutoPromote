"""Loopback-only media fixture transport with real byte-range support."""
from http.server import SimpleHTTPRequestHandler
import os
import re


class RangeMediaHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def send_head(self):
        self.byte_range = None
        value = self.headers.get("Range")
        if not value:
            return super().send_head()
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
        try:
            if not match or not any(match.groups()): raise ValueError("Unsupported byte range")
            first, last = match.groups()
            if first:
                start, end = int(first), min(int(last), size - 1) if last else size - 1
            else:
                suffix = int(last)
                if suffix <= 0: raise ValueError("Invalid suffix")
                start, end = max(0, size - suffix), size - 1
            if not 0 <= start <= end < size: raise ValueError("Range outside file")
        except ValueError:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        handle = open(path, "rb")
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self.byte_range = (start, end)
        handle.seek(start)
        return handle

    def copyfile(self, source, outputfile):
        try:
            if self.byte_range is None:
                return super().copyfile(source, outputfile)
            remaining = self.byte_range[1] - self.byte_range[0] + 1
            while remaining:
                block = source.read(min(65536, remaining))
                if not block: break
                outputfile.write(block)
                remaining -= len(block)
        except (BrokenPipeError, ConnectionResetError):
            # Seeking/decoder probes may close a valid range before its end.
            return
