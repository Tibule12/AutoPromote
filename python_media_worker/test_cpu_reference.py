"""Load actual CPU reference functions without starting the HTTP/cloud service.

These references still execute the worker's source and real FFmpeg filters.
The complete worker image tests separately import and exercise the service.
"""
import __future__
import ast
import asyncio
import logging
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request

from PIL import Image, ImageDraw

from python_media_worker.studio_ffmpeg_transport import ffmpeg_filter_scripts


def load_worker_cpu_reference(*names):
    allowed = {
        "materialize_video_input", "build_studio_finish_filter",
        "build_reframe_segment_filter", "build_main_video_frame_filter",
    }
    if not names or not set(names).issubset(allowed):
        raise ValueError("Choose a bounded CPU reference function")
    source = Path(__file__).with_name("main_media_server.py")
    tree = ast.parse(source.read_text())
    definitions = {
        node.name: node for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    selected, pending = set(), list(names)
    while pending:
        name = pending.pop()
        if name in selected:
            continue
        selected.add(name)
        references = {
            node.id for node in ast.walk(definitions[name])
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load)
        }
        pending.extend((references & definitions.keys()) - selected)
    namespace = {
        "__file__": str(source), "__package__": "python_media_worker",
        "asyncio": asyncio, "math": math, "os": os, "re": re,
        "shutil": shutil, "subprocess": subprocess, "tempfile": tempfile,
        "time": time, "urllib": urllib, "Image": Image, "ImageDraw": ImageDraw,
        "logger": logging.getLogger("StudioCpuReference"),
        "IS_PRODUCTION_ENV": False, "current_process_lock": threading.Lock(),
        "ffmpeg_filter_scripts": ffmpeg_filter_scripts,
    }
    module = ast.Module(
        body=[node for node in tree.body if getattr(node, "name", None) in selected],
        type_ignores=[],
    )
    exec(compile(module, str(source), "exec",
                 flags=__future__.annotations.compiler_flag), namespace)
    return namespace
