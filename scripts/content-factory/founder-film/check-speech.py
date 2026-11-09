"""Offline NVIDIA ASR checks speech recoverable from the actual rendered mix."""
import argparse,time,json,hashlib,subprocess
from pathlib import Path
from faster_whisper import WhisperModel
p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--model',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
identity=subprocess.run(['nvidia-smi','--query-gpu=name','--format=csv,noheader'],capture_output=True,text=True,check=True).stdout.strip()
if identity!='NVIDIA L40S':raise RuntimeError('Expected authorized NVIDIA L40S')
start=time.monotonic();m=WhisperModel(a.model,device='cuda',compute_type='float16',local_files_only=True);segments,info=m.transcribe(str(a.input),language='en',beam_size=5,word_timestamps=True,vad_filter=True)
rows=[{'start':s.start,'end':s.end,'text':s.text,'words':[{'word':w.word,'start':w.start,'end':w.end,'probability':w.probability} for w in s.words]} for s in segments];v={'sourceSha256':hashlib.sha256(a.input.read_bytes()).hexdigest(),'gpu':identity,'device':'cuda','computeType':'float16','modelPath':a.model,'text':' '.join(x['text'].strip() for x in rows),'segments':rows,'seconds':time.monotonic()-start,'scope':'Recoverable speech and alignment from the actual mix; not human emotional or musical acceptance.'};a.output.write_text(json.dumps(v,indent=2));print(json.dumps({'event':'speech_verified','text':v['text'],'seconds':v['seconds']}))
