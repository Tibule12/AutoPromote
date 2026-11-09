"""Collect lightweight reusable artifacts, never full PNG render caches or secrets."""
from pathlib import Path
import json,tarfile,sys
r=Path(sys.argv[1]);stage=sys.argv[2];bundle=r/(stage+'-artifacts.tar.gz')
with tarfile.open(bundle,'w:gz') as tf:
 for p in r.rglob('*'):
  if not p.is_file():continue
  rel=p.relative_to(r)
  if rel.parts[0] not in {'assets','outputs','evidence'}:continue
  if p.name.startswith('frame-') or p.name.endswith('.blend1') or (p.name.endswith('-24k.wav')):continue
  if p.suffix not in {'.mp4','.wav','.json','.jpg','.blend'}:continue
  if stage=='raw' and rel.parts[0]=='outputs':continue
  tf.add(p,arcname=str(rel))
print(bundle, bundle.stat().st_size)
