"""Offline CPU speech verification from the actual rendered soundtrack."""
import argparse,hashlib,json,time
from pathlib import Path
from faster_whisper import WhisperModel
p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--vad',action='store_true');a=p.parse_args()
started=time.monotonic();model=WhisperModel(a.model,device='cpu',compute_type='int8',cpu_threads=6,local_files_only=True)
segments,info=model.transcribe(str(a.input),language='en',beam_size=5,word_timestamps=True,vad_filter=a.vad)
rows=[{'start':s.start,'end':s.end,'text':s.text,'avgLogProbability':s.avg_logprob,'noSpeechProbability':s.no_speech_prob,
 'words':[{'word':w.word,'start':w.start,'end':w.end,'probability':w.probability} for w in s.words]} for s in segments]
result={'sourceSha256':hashlib.sha256(a.input.read_bytes()).hexdigest(),'modelPath':a.model,'device':'cpu','computeType':'int8','vadFilter':a.vad,'segments':rows,
 'text':' '.join(s['text'].strip() for s in rows),'seconds':time.monotonic()-started,'limitation':'ASR verifies recoverable speech in actual audio; it is not a human listening or emotional-quality judgment.'}
a.output.write_text(json.dumps(result,indent=2));print(json.dumps({'event':'soundtrack_transcribed','text':result['text'],'seconds':result['seconds']}))
