from pathlib import Path
import json,os,shutil,time,stat
ROOT=Path('/home/tibule12/Projects/AutoPromte');OUT=ROOT/'AutoPromote-studio-live-owner-20261105/reports/dance-three-four-20261110/private';roots=[ROOT,Path('/home/tibule12/.local/share/autopromote-qa'),Path('/home/tibule12/.config/google-chrome'),Path('/home/tibule12/.cache/google-chrome')]
def busy_paths():
 found=set()
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   for fd in (p/'fd').iterdir():
    try:found.add(os.readlink(fd).removesuffix(' (deleted)'))
    except OSError:pass
   for line in (p/'maps').read_text().splitlines():
    a=line.split(None,5)
    if len(a)==6 and a[-1].startswith('/'):found.add(a[-1].removesuffix(' (deleted)'))
  except (OSError,UnicodeError):pass
 return found
busy=busy_paths();candidates=[]
cache_names={'Cache','Code Cache','GPUCache','DawnCache','DawnGraphiteCache','DawnWebGPUCache','GrShaderCache','ShaderCache','GraphiteDawnCache'}
for root in roots:
 if not root.exists():continue
 if root.name=='.cache':candidates.append(root/'mozilla');continue
 for base,dirs,files in os.walk(root):
  dirs[:]=[d for d in dirs if d not in {'.git','node_modules','.venv','venv','ai-env','Sources','models'} and not Path(base,d).is_symlink()]
  here=Path(base)
  if here.name in {'Default','Profile 1','Profile 2','Profile 3'} and (here.parent/'Local State').is_file():
   candidates.extend(here/n for n in cache_names if (here/n).is_dir());dirs[:]=[d for d in dirs if d not in cache_names]
  if here.name in cache_names and (here.parent/'Local State').is_file():candidates.append(here);dirs[:]=[]
candidates += [Path('/home/tibule12/.config/google-chrome/OptGuideOnDeviceModel'),Path('/home/tibule12/.npm/_cacache'),Path('/home/tibule12/.cache/pip'),Path('/home/tibule12/.cache/typescript')]
candidates += [Path('/home/tibule12/.cache/google-chrome/Default/Cache'),Path('/home/tibule12/.cache/google-chrome/Default/Code Cache'),Path('/home/tibule12/.cache/autopromote-performance-monitor-20261021'),Path('/home/tibule12/.cache/autopromote-materials-auth-audit-20261010')]
# Test/compile caches contain derived products, not package installations.
candidates += [p for tree in ROOT.glob('AutoPromote*') for p in [tree/'frontend/node_modules/.cache',tree/'node_modules/.cache'] if p.is_dir() and not p.is_symlink()]
rows=[];before=shutil.disk_usage(ROOT).free
for p in sorted(set(candidates),key=lambda p:len(p.parts)):
 if not p.is_dir()or p.is_symlink():continue
 if any(str(x).startswith(str(p)+'/')or str(x)==str(p)for x in busy):rows.append({'path':str(p),'skipped':'Open or mapped file'});continue
 total=sum(f.lstat().st_blocks*512 for b,ds,fs in os.walk(p,followlinks=False)for f in [Path(b,n)for n in fs]if f.is_file()and not f.is_symlink())
 if not total:continue
 shutil.rmtree(p);rows.append({'path':str(p),'allocatedBytesBefore':total,'deleted':True});print('Removed cache',p,round(total/1024**2,1),'MiB',flush=True)
(OUT/'cache-cleanup.json').write_text(json.dumps({'beforeFree':before,'afterFree':shutil.disk_usage(ROOT).free,'actions':rows,'browserLoginsHistoryAndProjectsUntouched':True},indent=2));print('Free GiB',shutil.disk_usage(ROOT).free/1024**3,flush=True)
