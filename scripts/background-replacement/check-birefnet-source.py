"""Pinned local general matting diagnostic on exact source RGB; no admission."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import socket
import sys
import time
import types

import cv2
import numpy as np
from PIL import Image,ImageDraw,ImageOps
import torch
from safetensors.torch import load_file
from model_workers.common import sha,write_json


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path);p.add_argument('--device',choices=['cpu','cuda'],default='cpu');p.add_argument('--gesture-sequence',action='store_true');p.add_argument('--general',action='store_true');p.add_argument('--props-crops',action='store_true');p.add_argument('--lucida',action='store_true');p.add_argument('--indices');a=p.parse_args();a.out.mkdir(exist_ok=False)
 assert not a.lucida or not a.general
 cache=Path('/dev/shm/autopromote-lucida-private-r316-20261107') if a.lucida else Path('/home/tibule12/.cache/autopromote-model-runtime/'+('birefnet-general-private-eval-20261106'if a.general else'birefnet-matting-private-eval-20261106'));lock=json.loads((cache/'provenance.json').read_text())
 repo,revision,checkpoint=(('ZhengPeng7/BiRefNet','e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4','9ab37426bf4de0567af6b5d21b16151357149139362e6e8992021b8ce356a154')if a.general else('ZhengPeng7/BiRefNet-matting','eccde0a8cbdce7ac5fecfeb06340fe7b949e85d9','a9875de5b1e6c8eb5fdaa8c727a82927ce442cdc87ba3abee6a77e6fa46c25bb'))
 if a.lucida:repo,revision,checkpoint='egeorcun/lucida','6cbedc9722652dc9a3df91dd871f0c4f3334e922','2f1aa6913426537d4b93dd5f7138ae5c6664e99abda98c95f3d5b9101283e7d5'
 if lock['repo']!=repo or lock['revision']!=revision or lock['checkpointSha256']!=checkpoint or lock['license']!='MIT':raise ValueError('Unqualified model identity')
 for row in lock['files']:
  if sha(cache/row['path'])!=row['sha256']:raise ValueError('Pinned model/code bytes changed')
 socket.socket.connect=lambda *args,**kwargs:(_ for _ in ()).throw(RuntimeError('Local inference networking disabled'))
 torch.set_num_threads(4);torch.set_num_interop_threads(1);cv2.setNumThreads(2)
 package=types.ModuleType('reviewed_birefnet');package.__path__=[str(cache)];sys.modules[package.__name__]=package
 spec=importlib.util.spec_from_file_location('reviewed_birefnet.birefnet',cache/'birefnet.py');module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
 config_spec=importlib.util.spec_from_file_location('reviewed_birefnet.BiRefNet_config',cache/'BiRefNet_config.py');config_module=sys.modules.get(config_spec.name)
 if config_module is None:
  config_module=importlib.util.module_from_spec(config_spec);sys.modules[config_spec.name]=config_module;config_spec.loader.exec_module(config_module)
 config=config_module.BiRefNetConfig();config.bb_pretrained=False
 start=time.monotonic();model=module.BiRefNet(config=config).eval();model.load_state_dict(load_file(cache/'model.safetensors'),strict=True);model.to(a.device)
 dtype=torch.float16 if a.device=='cuda' else torch.float32
 model=model.to(dtype=dtype);print('PINNED_MATTING_MODEL_LOADED',time.monotonic()-start,flush=True)
 private=Path('reports/background-replacement-20261101/private')
 sources=[('striped-person',private/'authored-body-points-r222-20261106/actual-source.png',None),('foreground-props',private/'authored-body-points-r222-20261106/actual-source.png',(815,440,1430,1000)),('gesture15',private/'recovered-gesture-r180-20261105/rgb/rgb_0015.png',None)]
 if a.gesture_sequence:
  sources=[(f'gesture{index:02d}',private/f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png',None)for index in range(48)]
 if a.indices:
  indices=list(map(int,a.indices.split(',')));assert indices and all(0<=i<48 for i in indices)
  sources=[(f'gesture{index:02d}',private/f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png',None)for index in indices]
 if a.props_crops:
  sources=[(name,private/'authored-body-points-r222-20261106/actual-source.png',box)for name,box in [
   ('plant-wide',(1020,460,1390,1000)),('plant-tight',(1060,470,1280,890)),('bench',(820,735,1430,1000)),('headset',(1090,815,1290,1000))]]
 rows=[]
 for name,source,box in sources:
  original=Image.open(source).convert('RGB');image=original.crop(box)if box else original;w,h=image.size
  pixels=np.asarray(image.resize((1024,1024),Image.Resampling.BILINEAR)).copy();tensor=torch.from_numpy(pixels).to(a.device,dtype=dtype).permute(2,0,1)[None]/255
  mean=tensor.new_tensor([.485,.456,.406])[None,:,None,None];std=tensor.new_tensor([.229,.224,.225])[None,:,None,None]
  started=time.monotonic()
  with torch.inference_mode():
   output=model((tensor-mean)/std)[-1].sigmoid();alpha=torch.nn.functional.interpolate(output.float(),(h,w),mode='bilinear',align_corners=False)[0,0].cpu().numpy()
  if not np.isfinite(alpha).all():raise ValueError('Nonfinite matting inference')
  matte=Image.fromarray(np.rint(alpha.clip(0,1)*255).astype(np.uint8));matte.save(a.out/f'{name}-alpha.png')
  background=ImageOps.fit(Image.open(private/'replacement.png').convert('RGB'),original.size)
  if box:background=background.crop(box)
  composite=Image.composite(image,background,matte);composite.save(a.out/f'{name}-diagnostic.png')
  if not a.gesture_sequence or name in ['gesture00','gesture06','gesture15','gesture23','gesture39','gesture47']:
   sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
   for i,(label,pic)in enumerate([('Actual source',image),('Pinned local model alpha',matte.convert('RGB')),('Diagnostic; no foreground recovery',composite)]):sheet.paste(pic,(w*i,24));draw.text((w*i+3,4),label,fill='white')
   sheet.save(a.out/f'{name}-comparison.jpg',quality=98)
  row={'name':name,'sourcePngSha256':sha(source),'box':box,'inferenceSide':1024,'seconds':time.monotonic()-started,'device':a.device};rows.append(row);print('ACTUAL_GENERAL_MATTING',json.dumps(row),flush=True)
  write_json(a.out/'receipt.json',{'model':lock,'rows':rows,'temporalQualification':False,'foregroundRgbRecovery':False,'registeredOrAdmitted':False,'fourMinuteProof':False,'visualReviewPending':True,'paidCloud':False})


if __name__=='__main__':main()
