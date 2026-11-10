"""Consolidate exact immutable asset copies in generated /tmp test builds.

Source trees, HTML/configuration, browser state and verification evidence are
excluded. Every build path remains. Only identical regular files with matching
ownership/mode are linked. Generated asset copies must not be edited in place.
"""
import argparse,hashlib,json,os,re,stat,time
from pathlib import Path
from collections import defaultdict

p=argparse.ArgumentParser();p.add_argument('receipt',type=Path);p.add_argument('--execute',action='store_true');a=p.parse_args()
assert not a.receipt.exists()
roots=sorted(Path('/tmp').glob('autopromote-community-browser-*/build'))
media={'.mp4','.webm','.png','.jpg','.jpeg','.svg','.woff','.woff2','.ttf','.otf','.gif','.ico','.avif','.webp','.mp3','.wav'}
groups=defaultdict(list)
for root in roots:
 assert root.parent.parent==Path('/tmp')
 if root.is_symlink() or root.resolve()!=root:continue # Source/build aliases remain independent.
 for file in sorted(root.rglob('*')):
  if not file.is_file() or file.is_symlink() or not file.resolve().is_relative_to(root):continue
  hashed_code=file.suffix in {'.js','.css','.map'} and re.search(r'\.[0-9a-f]{8,}\.',file.name)
  if file.suffix not in media and not hashed_code:continue
  s=file.stat()
  # Existing multi-link files may share a source inode outside these builds.
  # Start only with independent copies; links created in this pass are known.
  if s.st_uid!=os.getuid() or s.st_nlink!=1 or s.st_size<4096 or time.time()-s.st_mtime<120:continue
  groups[(s.st_dev,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_size)].append(file)
def digest(file):
 with file.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
changes=[];scanned=0;verified=[];before=os.statvfs('/tmp')
for files in groups.values():
 if len(files)<2:continue
 known={}
 for file in files:
  s=file.stat();h=digest(file);scanned+=1
  if file.stat().st_mtime_ns!=s.st_mtime_ns:continue
  if h not in known:known[h]=(file,s);continue
  canonical,reference=known[h]
  if s.st_ino==reference.st_ino or s.st_nlink!=1:continue
  if canonical.stat().st_mtime_ns!=reference.st_mtime_ns or digest(canonical)!=h:continue
  row={'path':str(file),'sameAs':str(canonical),'sha256':h,'logicalBytes':s.st_size,'allocatedBytesReleased':s.st_blocks*512,'previousMtimeNs':s.st_mtime_ns}
  if a.execute:
   assert file.stat().st_ino==s.st_ino and file.stat().st_mtime_ns==s.st_mtime_ns
   temp=file.with_name(file.name+'.verified-identical-link');assert not temp.exists()
   os.link(canonical,temp);os.replace(temp,file)
   assert file.stat().st_ino==canonical.stat().st_ino and digest(file)==h
  changes.append(row)
after=os.statvfs('/tmp');result={'executed':a.execute,'scope':'Generated temporary browser-build static asset copies only; source, configuration, sessions, HTML, user media and test evidence excluded','buildDirectories':len(roots),'scannedFiles':scanned,'pathsPreserved':len(changes),'allocatedBytesReleased':sum(r['allocatedBytesReleased'] for r in changes) if a.execute else 0,'plannedAllocatedBytes':sum(r['allocatedBytesReleased'] for r in changes),'freeBytesBefore':before.f_bavail*before.f_frsize,'freeBytesAfter':after.f_bavail*after.f_frsize,'contentHashesRechecked':True,'changes':changes}
a.receipt.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='changes'}))
