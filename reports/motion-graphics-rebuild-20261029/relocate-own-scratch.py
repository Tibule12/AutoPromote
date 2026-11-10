"""Move only closed intermediates of these two accepted jobs into bounded RAM.
Leave a byte-identical link at each original path. Do not touch the service,
other jobs, source assets, completed movies, project files or authentication.
"""
from pathlib import Path
import json,os,time,hashlib,shutil,re
BASE=Path(__file__).resolve().parent
SOURCE=Path('/home/tibule12/Projects/AutoPromte/AutoPromote-model-runtime-v1/tmp')
DEST=Path('/dev/shm/studio-motion-20261029-accepted-scratch');DEST.mkdir(mode=0o700,exist_ok=True)
jobs=[json.loads((BASE/'proof'/s/'visible-controls/tutorial/accepted.json').read_text())['jobId'] for s in ['logo','transition']]
pattern=re.compile(r'^(?:'+ '|'.join(map(re.escape,jobs)) +r')_(?:image_motion|video_motion|title)_\d+\.mov$')
journal=BASE/'proof/scratch-relocation.private.json';rows=json.loads(journal.read_text()) if journal.exists() else []
# Redirect not-yet-created intermediates before FFmpeg opens them. The RAM
# targets remain absent until the canonical worker writes the actual bytes.
# Existing/open files are handled only by the closed-file path below.
redirects=[]
for job in jobs:
 for kind in ['image_motion','video_motion','title']:
  for index in range(48):
   p=SOURCE/f'{job}_{kind}_{index}.mov';target=DEST/p.name
   if not os.path.lexists(p) and not target.exists():
    os.symlink(target,p);redirects.append(dict(path=str(p),ramPath=str(target),preallocatedRedirect=True))
(BASE/'proof/scratch-preallocated-redirects.private.json').write_text(json.dumps(redirects,indent=2)+'\n')
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
deadline=time.monotonic()+3600
while time.monotonic()<deadline:
 opened=set()
 for p in Path('/proc').glob('[0-9]*/fd/*'):
  try:opened.add(os.readlink(p))
  except (OSError,PermissionError):pass
 for p in SOURCE.iterdir():
  if not pattern.fullmatch(p.name) or p.is_symlink() or not p.is_file():continue
  stat=p.stat()
  if stat.st_size<1024*1024 or str(p) in opened or time.time()-stat.st_mtime<2:continue
  free=os.statvfs(DEST).f_bavail*os.statvfs(DEST).f_frsize
  if free-stat.st_size<5*1024**3:continue
  target=DEST/p.name
  shutil.copyfile(p,target)
  after=p.stat()
  if (stat.st_size,stat.st_mtime_ns)!=(after.st_size,after.st_mtime_ns):target.unlink();continue
  sha=digest(p)
  if digest(target)!=sha:raise RuntimeError('Scratch copy differs')
  link=p.with_name(p.name+'.ram-link');os.symlink(target,link);os.replace(link,p)
  row=dict(path=str(p),ramPath=str(target),bytes=stat.st_size,sha256=sha,closedFileVerified=True,at=time.time())
  rows.append(row);journal.write_text(json.dumps(rows,indent=2)+'\n')
  print(p.name,stat.st_size,flush=True)
 time.sleep(5)
