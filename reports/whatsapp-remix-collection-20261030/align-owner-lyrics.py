"""Read-only local alignment of the owner's words; no lyric generation."""
import json
import os
from pathlib import Path
import subprocess

os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', CUDA_VISIBLE_DEVICES='')
import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.audio import pad_or_trim
from faster_whisper.tokenizer import Tokenizer

root=Path(__file__).resolve().parent/'private/selected-three-captioned-five-lines'
lines=(root/'owner-lyrics.txt').read_text().splitlines()
assert len(lines)==5
source='/home/tibule12/Downloads/WhatsApp Video 2026-10-30 at 18.23.56.mp4'
offset=29.0
raw=subprocess.check_output(['ffmpeg','-v','error','-ss',str(offset),'-i',source,
    '-t','30','-vn','-ar','16000','-ac','1','-f','f32le','pipe:1'],timeout=30)
audio=np.frombuffer(raw,dtype='<f4').copy()
model_path='/home/tibule12/.cache/huggingface/hub/models--digiphyte--swivuriso-turbo/snapshots/078ab5ce8bc1666d658680e61893f76d94c0dec7'
model=WhisperModel(model_path,device='cpu',compute_type='int8',cpu_threads=2,num_workers=1,local_files_only=True)
tokenizer=Tokenizer(model.hf_tokenizer,model.model.is_multilingual,task='transcribe',language='en')
features=model.feature_extractor(audio)
encoded=model.encode(pad_or_trim(features))
words=model.find_alignment(tokenizer,[tokenizer.encode(' '.join(lines))],encoded,min(features.shape[-1],3000))[0]
(root/'alignment-raw.json').write_text(json.dumps([dict(word=x['word'],start=float(x['start']),end=float(x['end']),probability=float(x['probability'])) for x in words],indent=2))
cursor=0;cues=[]
for text in lines:
    selected=[];reconstructed=''
    while reconstructed!=text:
        assert cursor<len(words),(reconstructed,text)
        selected.append(words[cursor]);cursor+=1
        reconstructed=''.join(x['word'] for x in selected).strip()
        assert text.startswith(reconstructed),(reconstructed,text)
    start=offset+float(selected[0]['start']);end=offset+float(selected[-1]['end'])
    assert end-start>.1,(text,start,end)
    cues.append(dict(text=text,start=round(start,3),end=round(end,3),
        meanTokenProbability=float(np.mean([x['probability'] for x in selected]))))
assert cursor==len(words)
proof=dict(wording='Exact explicit five-line owner sequence; first zingaphi includes yho yho',
    alignment='Cached Swivuriso/CTranslate2 teacher-forced attention alignment against the original source audio; no generated words',
    sourceAudioWindow=[offset,offset+len(audio)/16000],neutralDecoderTokenNotSpokenLanguage='en',
    cues=cues,words=[dict(word=x['word'],start=offset+float(x['start']),end=offset+float(x['end']),probability=float(x['probability'])) for x in words])
(root/'lyric-timing-provenance.json').write_text(json.dumps(proof,indent=2))
print(json.dumps(cues))
