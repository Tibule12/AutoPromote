"""Consolidate byte-identical sealed local intermediates; retain every path."""
import argparse,hashlib,json,os,stat
from collections import defaultdict
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('demo',type=Path);p.add_argument('receipt',type=Path);a=p.parse_args()
root=a.demo.resolve();assert root==Path('/tmp/autopromote-application-demo-YU8K0a')
config=json.loads((root/'config.json').read_text());assert config['origin']=='http://127.0.0.1:45793'
files=[]
for seal in (root/'model-jobs').glob('*/*/result.json'):
 directory=seal.parent
 for sub in ['outputs','dependency','component_dependency','source']:
  if (directory/sub).is_dir():files.extend(f for f in (directory/sub).rglob('*') if f.is_file() and not f.is_symlink() and (f.suffix in ['.png','.mp4'] or f.name.endswith('.tar.gz')))
 files.extend(f for f in directory.iterdir() if f.is_file() and (f.suffix=='.mp4' or f.name.endswith('.tar.gz')))
for seal in (root/'subject-previews').glob('*/terminal.json'):
 if (seal.parent/'result.json').is_file():files.extend(f for f in seal.parent.rglob('*') if f.is_file() and not f.is_symlink() and (f.suffix in ['.png','.mp4'] or f.name.endswith('.tar.gz')))
groups=defaultdict(list)
for file in sorted(set(files)):
 s=file.stat();groups[(s.st_dev,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_size)].append(file)
def digest(file):
 with file.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
changes=[];scanned=0
for files in groups.values():
 if len(files)<2:continue
 known={}
 for file in files:
  assert file.resolve().is_relative_to(root);s=file.stat();h=digest(file);scanned+=1
  if h not in known:known[h]=file;continue
  canonical=known[h];reference=canonical.stat()
  if s.st_ino==reference.st_ino or s.st_nlink!=1:continue
  temp=file.with_name(file.name+'.verified-identical-link');assert not temp.exists();os.link(canonical,temp);os.replace(temp,file)
  assert digest(file)==h and file.stat().st_ino==reference.st_ino
  changes.append({'path':str(file.relative_to(root)),'sameAs':str(canonical.relative_to(root)),'sha256':h,'logicalDuplicateBytes':s.st_size,'allocatedBytesReleased':s.st_blocks*512})
receipt={'scope':'Sealed local model/preview media only; active executions, user media, credentials and model weights excluded','scanned':scanned,'pathsPreserved':len(changes),'allocatedBytesReleased':sum(x['allocatedBytesReleased'] for x in changes),'logicalDuplicateBytes':sum(x['logicalDuplicateBytes'] for x in changes),'allHashesRechecked':True,'changes':changes}
assert not a.receipt.exists();a.receipt.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k!='changes'}))
