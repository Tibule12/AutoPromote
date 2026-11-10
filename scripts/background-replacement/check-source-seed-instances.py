"""Private SAM ablation: independent kept instances for disconnected props.

The existing compound plant selection includes leaves, stems and a headset.
This tests those actual authored seeds independently, with shared image encoding,
instead of asking one semantic instance to satisfy contradictory object prompts.
No app selection limit or native artifact is changed.
"""
import argparse,json,socket,time
from pathlib import Path
import cv2,numpy as np,torch
from PIL import Image,ImageDraw,ImageOps
from transformers import Sam2VideoModel,Sam2VideoProcessor
from model_workers.common import sha,write_json
from model_workers.adapters.component_segmentation import component_roi


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False)
 torch.set_num_threads(4);torch.set_num_interop_threads(1);cv2.setNumThreads(2)
 private=Path('reports/background-replacement-20261101/private');source=private/'authored-body-points-r222-20261106/actual-source.png'
 if sha(source)!='16a4fb39f996d18fc59d32a55f9162d7da207a6d522583dd50dfcda56f6852ce':raise ValueError('Exact original source changed')
 rgb=np.asarray(Image.open(source).convert('RGB'));directory=Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned')
 modeldef=next(m for m in json.loads(Path('config/model-runtime/registry.v1.json').read_text())['models']if m['id']=='sam21-multiobject-cpu-v2')
 if sha(directory/'model.safetensors')!=modeldef['weights'][0]['sha256']:raise ValueError('Pinned source tracker changed')
 socket.socket.connect=lambda *args,**kw:(_ for _ in ()).throw(RuntimeError('Local source inference networking disabled'))
 model=Sam2VideoModel.from_pretrained(directory,local_files_only=True).to('cuda',dtype=torch.float32).eval()
 config=json.loads((directory/'preprocessor_config.json').read_text());processor=Sam2VideoProcessor.__new__(Sam2VideoProcessor);processor.target_size=model.config.image_size;processor.point_pad_value=-10
 mean=torch.tensor(config['image_mean'],device='cuda')[None,:,None,None];std=torch.tensor(config['image_std'],device='cuda')[None,:,None,None]
 selection=json.loads((private/'foreground-details-current-pipeline-r233-20261106/camera-00-0000-0001/frames-0000-0001/selection.json').read_text())
 rows=[]
 for cid,name in [('component-b9e45632-b207-4a33-a930-d39b5db19716','plant'),('component-9afa0763-f83b-4be8-95ee-e1c5c5766117','bench')]:
  component=next(c for c in selection['components']if c['id']==cid);x0,y0,x1,y1=component_roi(component,1430,1000);w,h=x1-x0,y1-y0
  foreground=[p for p in component['points']if p['label']];background=[p for p in component['points']if not p['label']]
  points=[[[p['position'][0]*1430-x0,p['position'][1]*1000-y0]for p in [positive,*background]]for positive in foreground]
  labels=[[p['label']for p in [positive,*background]]for positive in foreground]
  session=processor.init_video_session(inference_device='cuda',inference_state_device='cpu',dtype=torch.float32)
  processor.add_inputs_to_inference_session(inference_session=session,frame_idx=0,obj_ids=list(range(1,len(foreground)+1)),original_size=(h,w),input_points=[points],input_labels=[labels])
  started=time.monotonic()
  with torch.inference_mode():
   pixels=torch.from_numpy(rgb[y0:y1,x0:x1].copy()).to('cuda').permute(2,0,1)[None].float()*config['rescale_factor'];pixels=torch.nn.functional.interpolate(pixels,(processor.target_size,)*2,mode='bilinear',align_corners=False,antialias=True)
   output=model(inference_session=session,frame=((pixels-mean)/std)[0],frame_idx=0)
   logits=torch.nn.functional.interpolate(output.pred_masks.float(),(h,w),mode='bilinear',align_corners=False)[:,0].cpu().numpy()
  if not np.isfinite(logits).all():raise ValueError('Nonfinite per-instance segmentation')
  planes=np.rint(255/(1+np.exp(-np.clip(logits,-30,30)))).astype(np.uint8);values=np.zeros((1000,1430),np.uint8);values[y0:y1,x0:x1]=planes.max(0)
  Image.fromarray(values).save(a.out/f'{name}-source-evidence.png')
  for i,plane in enumerate(planes):Image.fromarray(plane).save(a.out/f'{name}-instance-{i:02d}.png')
  background_image=ImageOps.fit(Image.open(private/'replacement.png').convert('RGB'),(1430,1000));diagnostic=Image.composite(Image.fromarray(rgb),background_image,Image.fromarray((values>=128).astype(np.uint8)*255));diagnostic.save(a.out/f'{name}-diagnostic.png')
  box=(815,440,1430,1000);sheet=Image.new('RGB',(1845,584));draw=ImageDraw.Draw(sheet)
  for i,(label,picture)in enumerate([('Actual original',Image.fromarray(rgb)),('Actual independent-seed evidence',Image.fromarray(values).convert('RGB')),('Diagnostic; not alpha matting',diagnostic)]):sheet.paste(picture.crop(box),(i*615,24));draw.text((i*615+3,4),label,fill='white')
  sheet.save(a.out/f'{name}-comparison.jpg',quality=98);rows.append({'id':cid,'name':name,'foregroundSeeds':len(foreground),'sourceRoi':[x0,y0,x1,y1],'seconds':time.monotonic()-started});print('ACTUAL_SEPARATE_SOURCE_SEEDS',json.dumps(rows[-1]),flush=True)
 write_json(a.out/'receipt.json',{'rows':rows,'sourcePngSha256':sha(source),'modelCheckpoint':modeldef['checkpoint'],'modelWeightsSha256':modeldef['weights'][0]['sha256'],'sharedImageEncoderPerComponent':True,'independentSemanticInstancePerRealPositiveSeed':True,'negativeSeedsPreserved':True,'appContractOrRegistryChanged':False,'nativeAdmission':False,'fourMinuteProof':False,'visualReviewPending':True,'paidCloud':False})


if __name__=='__main__':main()
