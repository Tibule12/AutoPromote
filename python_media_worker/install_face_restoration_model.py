"""Explicit build-time installation; rendering never downloads model weights."""
import hashlib,json,os,tempfile,urllib.request
from pathlib import Path

def install(directory=None):
    directory=Path(directory or Path(__file__).parent/'models'/'face-restoration')
    manifest=json.loads((Path(__file__).parent/'models'/'face-restoration'/'manifest.json').read_text())
    directory.mkdir(parents=True,exist_ok=True);target=directory/manifest['filename']
    if target.is_file():
        with target.open('rb')as file:
            if hashlib.file_digest(file,'sha256').hexdigest()==manifest['weightsSha256']:return target
    fd,name=tempfile.mkstemp(prefix='face-model-',dir=directory)
    try:
        with os.fdopen(fd,'wb')as file,urllib.request.urlopen(manifest['weightsUrl'],timeout=120)as response:
            digest=hashlib.sha256()
            while block:=response.read(1024*1024):file.write(block);digest.update(block)
        if digest.hexdigest()!=manifest['weightsSha256']:raise RuntimeError('Downloaded face restoration model failed verification')
        os.replace(name,target)
    finally:
        if os.path.exists(name):os.unlink(name)
    return target

if __name__=='__main__':print(install())
