"""Reclaim duplicate immutable media storage; preserve every pathname and byte."""
from pathlib import Path
import os,stat,hashlib,json,time
from collections import defaultdict
root=Path(__file__).resolve().parent
folders=[Path('/home/tibule12/Projects/AutoPromte'),Path('/home/tibule12/Videos'),Path('/home/tibule12/.local/share/autopromote-qa')]
allowed={'.mp4','.webm','.mkv','.mov','.png','.jpg','.jpeg','.wav','.mp3','.onnx','.safetensors','.ttf','.woff2'}
sizes=defaultdict(list);seen=set();started=time.time();before=os.statvfs(root).f_bavail*os.statvfs(root).f_frsize
for folder in folders:
 for directory,ds,fs in os.walk(folder):
  ds[:]=[d for d in ds if d not in {'.git','node_modules','.venv','venv','__pycache__'}]
  for name in fs:
   p=Path(directory)/name
   if p.suffix.lower() not in allowed:continue
   try:s=p.lstat()
   except OSError:continue
   if not stat.S_ISREG(s.st_mode) or s.st_size<65536 or s.st_uid!=os.getuid():continue
   inode=(s.st_dev,s.st_ino)
   if inode in seen:continue
   seen.add(inode);sizes[(s.st_dev,s.st_size,stat.S_IMODE(s.st_mode))].append((p,s))
changes=[];reclaimed=0
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024**2),b''):h.update(b)
 return h.hexdigest()
for size,files in sizes.items():
 if len(files)<2:continue
 hashes={}
 for p,s in files:
  # Existing hard-linked files can have other names; retain those untouched.
  h=digest(p)
  if h not in hashes:hashes[h]=p;continue
  source=hashes[h];current=p.lstat();src=source.lstat()
  if current.st_ino==src.st_ino or current.st_nlink!=1:continue
  assert (current.st_size,current.st_mtime_ns)==(s.st_size,s.st_mtime_ns)
  temporary=p.with_name(p.name+'.dedup-private-tmp');assert not temporary.exists()
  try:os.link(source,temporary);os.replace(temporary,p)
  except PermissionError:continue
  assert digest(p)==h
  reclaimed+=s.st_blocks*512;changes.append({'path':str(p),'sameBytesAs':str(source),'sha256':h,'allocatedBytesReclaimed':s.st_blocks*512})
  if len(changes)%100==0:print('Deduplicated',len(changes),'reclaimed GiB',round(reclaimed/1024**3,2),flush=True)
result={'startedAt':started,'seconds':time.time()-started,'filesDeduplicated':len(changes),'samePathAndBytesPreserved':True,'allocatedBytesReclaimed':reclaimed,'beforeAvailableBytes':before,'afterAvailableBytes':os.statvfs(root).f_bavail*os.statvfs(root).f_frsize,'changes':changes}
(root/'private/deduplication.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='changes'}),flush=True)
