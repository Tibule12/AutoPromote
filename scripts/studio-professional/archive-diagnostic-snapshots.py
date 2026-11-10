"""Lossless disk recovery for old, untracked QA snapshots; never media or native backups."""
from pathlib import Path
import argparse, gzip, hashlib, json, os, shutil, stat, subprocess, time
ROOT=Path('/home/tibule12/Projects/AutoPromte')
REPORT=ROOT/'AutoPromote-ae-fusion-20261031/reports/disk-cleanup-20261103'
ALLOWED={'AutoPromote-model-runtime-v1','AutoPromote-main-integration-20261013','AutoPromote-ae-fusion-20261031','AutoPromote-hook-templates-20261026','AutoPromote-analytics-diagnosis-20261028','AutoPromote-monetization-continuation-20261027','AutoPromote-frontend-production-20261022'}
def digest(path,opener=open):
 h=hashlib.sha256()
 with opener(path,'rb') as f:
  for block in iter(lambda:f.read(1024**2),b''):h.update(block)
 return h.hexdigest()
def open_files():
 found=set()
 for proc in Path('/proc').iterdir():
  if not proc.name.isdigit():continue
  try:
   for fd in (proc/'fd').iterdir():
    try:found.add(os.readlink(fd))
    except OSError:pass
  except OSError:pass
 return found
parser=argparse.ArgumentParser();parser.add_argument('--restore',action='store_true');parser.add_argument('--path',help='Restore only this original snapshot path');parser.add_argument('--limit-gib',type=float,default=9);args=parser.parse_args()
manifest=REPORT/'archived-diagnostic-snapshots.json';rows=json.loads(manifest.read_text()) if manifest.exists() else []
if args.restore:
 selected=[row for row in rows if not args.path or row['path']==str(Path(args.path).absolute())]
 if args.path and not selected:raise SystemExit('That original path is not in this archive manifest.')
 required=sum(row['sourceBytes'] for row in selected if not Path(row['path']).exists())
 if shutil.disk_usage(ROOT).free-required<5*1024**3:
  raise SystemExit('Restoration would breach the 5 GiB reserve. Restore one snapshot with --path, or free more space first.')
 for row in selected:
  source=Path(row['path']);archive=Path(row['archive'])
  assert source.name.endswith('-project.private.json') and source.parts[len(ROOT.parts)] in ALLOWED
  if source.exists():
   assert digest(source)==row['sha256'];continue
  assert digest(archive,gzip.open)==row['sha256']
  temp=source.with_name(source.name+'.restore-part')
  with gzip.open(archive,'rb') as src,open(temp,'xb') as dst:
   for block in iter(lambda:src.read(1024**2),b''):dst.write(block)
  assert digest(temp)==row['sha256'];temp.chmod(row['mode']);os.utime(temp,ns=(row['mtimeNs'],row['mtimeNs']));os.replace(temp,source)
 print('Original snapshot paths restored; verified archives retained.');raise SystemExit
busy=open_files();candidates=[]
for name in ALLOWED:
 tree=ROOT/name
 if not (tree/'reports').is_dir():continue
 tracked=set(subprocess.check_output(['git','ls-files','-z','reports'],cwd=tree).decode().split('\0'))
 for p in (tree/'reports').rglob('*-project.private.json'):
  try:
   s=p.lstat()
   if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size<1024**2 or time.time()-s.st_mtime<3600:continue
   if str(p) in busy or str(p.relative_to(tree)) in tracked or p.with_suffix(p.suffix+'.gz').exists():continue
   candidates.append((s.st_size,p,s))
  except OSError:continue
freed=0;count=0;started=time.monotonic();REPORT.mkdir(exist_ok=True)
for _,p,s in sorted(candidates,reverse=True):
 if freed>=args.limit_gib*1024**3:break
 archive=p.with_suffix(p.suffix+'.gz');temp=archive.with_name(archive.name+'.cleanup-part')
 try:
  h=hashlib.sha256()
  with open(p,'rb') as src,open(temp,'xb') as raw:
   with gzip.GzipFile(filename='',mode='wb',fileobj=raw,compresslevel=3,mtime=int(s.st_mtime)) as dst:
    for block in iter(lambda:src.read(1024**2),b''):h.update(block);dst.write(block)
  expected=h.hexdigest();assert digest(temp,gzip.open)==expected
  current=p.lstat()
  assert (current.st_ino,current.st_size,current.st_mtime_ns)==(s.st_ino,s.st_size,s.st_mtime_ns)
  assert str(p) not in open_files(), 'Snapshot became active; keep the original.'
  temp.chmod(stat.S_IMODE(s.st_mode));os.replace(temp,archive)
  row={'path':str(p),'archive':str(archive),'sha256':expected,'sourceBytes':s.st_size,'sourceAllocatedBytes':s.st_blocks*512,'archiveBytes':archive.stat().st_size,'mode':stat.S_IMODE(s.st_mode),'mtimeNs':s.st_mtime_ns,'verifiedRoundTrip':True}
  rows.append(row);manifest.write_text(json.dumps(rows,indent=2));manifest.chmod(0o600)
  p.unlink();freed+=s.st_blocks*512-archive.stat().st_blocks*512;count+=1
  if count%25==0:print(json.dumps({'archivedFiles':count,'netAllocatedBytesRecovered':freed,'elapsedSeconds':round(time.monotonic()-started,1)}),flush=True)
 except (OSError,AssertionError) as e:
  if temp.exists():temp.unlink()
  print('Skipped',str(p),str(e),flush=True)
print(json.dumps({'complete':True,'archivedFiles':count,'netAllocatedBytesRecovered':freed,'elapsedSeconds':round(time.monotonic()-started,1)}),flush=True)
