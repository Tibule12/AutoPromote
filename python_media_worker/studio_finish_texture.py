"""Versioned Finish texture equations, also used by the native programme canvas."""
import math
import subprocess
import tempfile
import numpy as np


def prepare_finish_texture_noise(output, width, height, duration, fps, grain):
    """Compute the shared integer noise once per pixel, outside FFmpeg's evaluator.

    The RGB source is eight-bit, so round(source + noise) is exactly source +
    round(noise), followed by clipping. A bounded lossless gray stream shares
    that offset among all channels instead of interpreting its hash three times.
    """
    width, height = int(width), int(height)
    frames = math.ceil(float(duration)*float(fps)-1e-7)
    if min(width,height,frames)<=0 or width*height*frames>512*1024*1024:
        raise ValueError('Finish texture exceeds the bounded pixel budget')
    spatial = np.arange(width,dtype=np.int64)[None,:]*73856093 + np.arange(height,dtype=np.int64)[:,None]*19349663
    command=['ffmpeg','-nostdin','-v','error','-f','rawvideo','-pix_fmt','gray',
        '-s',f'{width}x{height}','-r',str(fps),'-i','pipe:0','-an',
        '-c:v','ffv1','-threads','2','-pix_fmt','gray','-y',str(output)]
    with tempfile.TemporaryFile() as errors:
        process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=errors)
        try:
            for frame in range(frames):
                hashed=((spatial+frame*83492791)%65521*25173+13849)%65521
                offsets=np.floor((hashed/65520-.5)*max(0,min(1,float(grain)))*26+.5)
                process.stdin.write((128+offsets).astype(np.uint8).tobytes())
            process.stdin.close()
            if process.wait(timeout=30):
                errors.seek(0);raise RuntimeError(errors.read(2000).decode(errors='replace'))
        finally:
            if process.poll() is None:process.kill();process.wait()


def finish_texture_shift_filter(texture):
    chromatic=max(0,min(1,float(texture.get('chromatic_aberration',0) or 0)))
    shift=max(1,int(chromatic*9+.5)) if chromatic>.005 else 0
    return f'format=gbrp,rgbashift=rh={shift}:bh={-shift}:edge=smear'


def finish_texture_filter(texture):
    grain=max(0,min(1,float(texture.get('film_grain',0) or 0)))
    chromatic=max(0,min(1,float(texture.get('chromatic_aberration',0) or 0)))
    if grain<=.005 and chromatic<=.005:return ''
    shift=max(1,int(chromatic*9+.5)) if chromatic>.005 else 0
    hash_value='mod(mod(X*73856093+Y*19349663+N*83492791,65521)*25173+13849,65521)'
    noise=f'({hash_value}/65520-0.5)*{grain*26:.8f}' if grain>.005 else '0'
    expressions=[f"{channel}(clip(X{offset:+d},0,W-1),Y)+({noise})" for channel,offset in [('r',-shift),('g',0),('b',shift)]]
    return "format=gbrp,geq=interpolation=nearest:"+':'.join(f"{channel}='floor(clip({expr},0,255)+0.5)'" for channel,expr in zip('rgb',expressions))
