"""Extract effective alpha using the same source/effects as the native preview."""
import argparse,json,subprocess,hashlib,tarfile
from pathlib import Path
import numpy as np
from PIL import Image
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
p=argparse.ArgumentParser();p.add_argument('preview_job');p.add_argument('out');a=p.parse_args();w=Path(a.preview_job);out=Path(a.out);out.mkdir(parents=True,exist_ok=True);frames=out/'effective-alpha';frames.mkdir(exist_ok=True)
spec=json.loads((w/'spec.json').read_text())['spec'];scene=spec['scene'];cache=CachedSubjectMatte(w/'matte',w/'source.mp4');plan={'version':1,'source_sha256':sha256(w/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':scene['effects']};assets={v['assetId']:w/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer(plan,cache,asset_resolver=assets.__getitem__)
decoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(w/'source.mp4'),'-map','0:v:0','-threads','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
try:
 for i in range(48):
  raw=decoder.stdout.read(1430*1000*3);assert len(raw)==1430*1000*3;rgb=Image.frombytes('RGB',(1430,1000),raw);alpha=Image.fromarray(cache.frame(i));active=[e for e in scene['effects'] if e['start']<=i/24<e['end']];_,effective=renderer._prepare_foreground(rgb,alpha,active,1430,1000);effective.save(frames/f'{i:04d}.png')
 assert not decoder.stdout.read(1);assert decoder.wait()==0
finally:
 if decoder.poll() is None:decoder.kill();decoder.wait()
subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-framerate','24','-i',str(frames/'%04d.png'),'-frames:v','48','-c:v','ffv1','-pix_fmt','gray',str(out/'Effective alpha - lossless.mkv')],check=True)
subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-framerate','24','-i',str(frames/'%04d.png'),'-frames:v','48','-c:v','libx264','-crf','15','-pix_fmt','yuv420p','-movflags','+faststart',str(out/'Effective alpha - viewing copy.mp4')],check=True)
with tarfile.open(out/'Effective alpha - PNG frames.tar.gz','w:gz') as archive:
 for f in sorted(frames.glob('*.png')):archive.add(f,arcname=f.name)
(out/'effective-alpha.json').write_text(json.dumps({'frames':48,'fps':24,'geometry':[1430,1000],'requestHash':spec['requestHash'],'modelArtifactHash':spec['modelInput']['artifactHash'],'canonicalForegroundPreparation':True,'manualSecondaryCorrections':[e for e in scene['effects'] if e['type']=='foreground_holdout'],'visualApproval':False},indent=2));print('ACTUAL_NATIVE_EFFECTIVE_ALPHA_48_FRAMES_EXTRACTED')
