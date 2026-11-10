"""Launch this shot only with a credential-free local Blender environment."""
import os
from pathlib import Path
import subprocess
import sys

root=Path(__file__).resolve().parent
label='animation' if len(sys.argv)==1 else 'still-'+sys.argv[-1]
env={'PATH':os.environ['PATH'],'HOME':str(root/'private'),'LANG':'C.UTF-8',
    'OMP_NUM_THREADS':'4','OPENBLAS_NUM_THREADS':'1','__NV_PRIME_RENDER_OFFLOAD':'1',
    '__GLX_VENDOR_LIBRARY_NAME':'nvidia',
    '__EGL_VENDOR_LIBRARY_FILENAMES':'/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
    'XDG_CACHE_HOME':str(root.parent/'private-local/engine/graphics-cache')}
command=['/home/tibule12/.cache/autopromote-cinematic-runtime/blender-4.5.9-linux-x64/blender',
    '-b','--factory-startup','--disable-autoexec','-t','4','--python-exit-code','1',
    '--python',str(root/'correct-shot.py'),'--',*sys.argv[1:]]
with (root/'private'/f'{label}.log').open('w') as log:
    subprocess.run(command,env=env,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=900)
print(label,'completed',flush=True)
