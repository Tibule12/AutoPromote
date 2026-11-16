"""Reuse an image's exact bytes across occurrences in one render request."""
from pathlib import Path
import shutil
import time
import urllib.request
import urllib.parse
import base64
import io
import re
import subprocess
import xml.etree.ElementTree as ET
import tempfile
import struct


def normalize_studio_image_colour(destination):
    """Preserve the browser's SDR appearance for Rec709-tagged PNG assets.

    Pillow exposes gAMA but currently omits cICP. A cICP Rec709 transfer takes
    precedence over that fallback gamma; Chromium displays it with the BT.1886
    2.4 transfer. Convert a derived render copy to sRGB, never the uploaded file.
    Untagged, sRGB, unsupported HDR and other image formats retain their bytes.
    """
    target=Path(destination)
    with target.open('rb') as source:
        if source.read(8)!=b'\x89PNG\r\n\x1a\n':return destination
        profile=None
        while True:
            header=source.read(8)
            if len(header)!=8:break
            size,kind=struct.unpack('>I4s',header)
            if kind in (b'IDAT',b'IEND'):break
            if kind==b'cICP' and size==4:
                profile=source.read(4);break
            source.seek(size+4,1)
    if profile!=bytes((1,1,0,1)):return destination
    from PIL import Image,PngImagePlugin
    with Image.open(target) as source:
        if source.width>16384 or source.height>16384 or source.width*source.height>64*1024*1024:
            raise ValueError('Studio image exceeds the colour conversion pixel budget')
        image=source.convert('RGBA')
    def transfer(value):
        linear=(value/255)**2.4
        encoded=linear*12.92 if linear<=.0031308 else 1.055*linear**(1/2.4)-.055
        return max(0,min(255,round(encoded*255)))
    table=[transfer(value) for value in range(256)]
    channels=image.split()
    converted=Image.merge('RGBA',tuple(channel.point(table) for channel in channels[:3])+(channels[3],))
    metadata=PngImagePlugin.PngInfo();metadata.add(b'sRGB',b'\x00')
    partial=str(target)+'.colour.png'
    try:
        converted.save(partial,format='PNG',pnginfo=metadata)
        Path(partial).replace(target)
    finally:
        Path(partial).unlink(missing_ok=True)
    return destination


def materialize_inline_image(source, destination):
    """Decode the self-contained image surfaces produced by native rigs."""
    if len(source)>12*1024*1024:raise ValueError('Inline image exceeds the source limit')
    header,encoded=source.split(',',1)
    mime=header[5:].split(';')[0].lower()
    if mime not in ('image/png','image/jpeg','image/webp','image/svg+xml'):raise ValueError('Unsupported inline image')
    payload=base64.b64decode(encoded,validate=True) if header.endswith(';base64') else urllib.parse.unquote_to_bytes(encoded)
    if len(payload)>8*1024*1024:raise ValueError('Inline image exceeds the source limit')
    if mime=='image/svg+xml':
        if re.search(br'<!DOCTYPE|<!ENTITY',payload,re.I):raise ValueError('SVG must be self-contained')
        root=ET.fromstring(payload)
        allowed={'svg','g','defs','rect','circle','ellipse','path','polygon','polyline','line','text','tspan','linearGradient','radialGradient','stop','clipPath','mask'}
        for node in root.iter():
            if node.tag.rsplit('}',1)[-1] not in allowed:raise ValueError('Unsupported SVG element')
            for key,value in node.attrib.items():
                references=re.findall(r'url\(([^)]*)\)',value,re.I)
                if key.rsplit('}',1)[-1].lower().startswith(('on','href')) or any(not ref.strip().strip('\'"').startswith('#') for ref in references):raise ValueError('SVG must be self-contained')
        if root.tag.rsplit('}',1)[-1]!='svg':raise ValueError('Invalid SVG image')
        for name in ('width','height'):
            value=root.get(name,'')
            if not re.fullmatch(r'\d+(?:\.\d+)?(?:px)?',value) or not 0<float(value.removesuffix('px'))<=4096:raise ValueError('SVG dimensions must be between 1 and 4096')
        with tempfile.NamedTemporaryFile(suffix='.svg',dir=Path(destination).parent) as svg:
            svg.write(payload);svg.flush()
            subprocess.run(['ffmpeg','-nostdin','-v','error','-protocol_whitelist','file','-c:v','librsvg','-i',svg.name,'-frames:v','1','-threads','2','-c:v','png','-f','image2','-y',str(destination)],check=True,capture_output=True,timeout=30)
    else:
        from PIL import Image
        with Image.open(io.BytesIO(payload)) as image:
            if image.width>4096 or image.height>4096:raise ValueError('Inline image dimensions exceed 4096')
            image.verify()
        Path(destination).write_bytes(payload)
    return normalize_studio_image_colour(destination)


def materialize_studio_image(source, destination, sources):
    # This map belongs to the current render, never another project/owner/job.
    # A split changes occurrence identity, not the bytes of its source image.
    existing = sources.get(source)
    if existing and Path(existing).is_file():
        return existing
    if source.startswith('data:'):
        result=materialize_inline_image(source,destination)
        sources[source]=result
        return result
    for attempt in range(3):
        try:
            with urllib.request.urlopen(source, timeout=30) as response, open(destination, "wb") as target:
                shutil.copyfileobj(response, target)
            normalize_studio_image_colour(destination)
            sources[source] = destination
            return destination
        except OSError:
            if attempt == 2:
                raise
            time.sleep(.25 * (attempt + 1))
