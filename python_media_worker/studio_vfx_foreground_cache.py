"""Optional local cache of exact prepared foreground pixels.

The server controls its directory. Background selection never enters this
cache: source RGB, original alpha, active foreground commands and renderer
implementation identify every entry. Missing/corrupt entries are recomputed.
"""
import hashlib
import json
import os
from pathlib import Path
import uuid
from PIL import Image, PngImagePlugin


class ForegroundFrameCache:
    def __init__(self, implementation):
        configured=os.environ.get('STUDIO_VFX_FOREGROUND_CACHE_DIR')
        self.root=Path(configured).resolve() if configured else None
        self.implementation=implementation
        self.hits=0
        self.misses=0
        if self.root:
            self.root.mkdir(parents=True,exist_ok=True,mode=0o700)

    def prepare(self, frame, alpha, effects, compute):
        if not self.root:
            return compute()
        digest=hashlib.sha256()
        digest.update(self.implementation.encode())
        digest.update(json.dumps({'size':frame.size,'effects':effects},sort_keys=True,separators=(',',':')).encode())
        digest.update(frame.tobytes())
        digest.update(alpha.tobytes())
        key=digest.hexdigest()
        file=self.root/(key+'.png')
        try:
            if file.stat().st_size<=64*1024**2:
                with Image.open(file) as cached:
                    if cached.format=='PNG' and cached.mode=='RGBA' and cached.size==frame.size:
                        expected=cached.info.get('foreground_sha256')
                        cached.load()
                        if expected==hashlib.sha256(cached.tobytes()).hexdigest():
                            self.hits+=1
                            return cached.convert('RGB'),cached.getchannel('A')
        except (OSError,ValueError):
            pass
        self.misses+=1
        foreground,prepared_alpha=compute()
        # Cache allocation must preserve the same 5 GiB reserve as local QA.
        free=os.statvfs(self.root)
        if free.f_bavail*free.f_frsize<5*1024**3+frame.width*frame.height*8:
            return foreground,prepared_alpha
        rgba=foreground.convert('RGBA')
        rgba.putalpha(prepared_alpha)
        metadata=PngImagePlugin.PngInfo()
        metadata.add_text('foreground_sha256',hashlib.sha256(rgba.tobytes()).hexdigest())
        temporary=self.root/(key+'.'+uuid.uuid4().hex+'.tmp')
        try:
            with temporary.open('xb') as stream:
                os.chmod(temporary,0o600)
                rgba.save(stream,format='PNG',pnginfo=metadata,compress_level=1)
            temporary.replace(file)
        finally:
            temporary.unlink(missing_ok=True)
        return foreground,prepared_alpha
