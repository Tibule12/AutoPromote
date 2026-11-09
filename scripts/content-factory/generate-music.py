"""Generate one reusable, private instrumental stem on the authorized NVIDIA.

Raw music is pending listening review. Existing procedural audio remains the
CPU fallback; this module does not edit or render a finished film.
"""
import argparse,hashlib,json,subprocess,time
from pathlib import Path
MODEL='ACE-Step/ACE-Step-v1-3.5B'
REVISION='82cd0d7b6322bd28cd4e830fe675ddb6180ce36c'
SOURCE_REVISION='1bee4c9f5b43e30995f8d4d33b3919197ce1bd68'
p=argparse.ArgumentParser();p.add_argument('--request',type=Path,required=True);p.add_argument('--models',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
data=json.loads(a.request.read_text());model=json.loads((a.models/'model-receipt.json').read_text())
if model['model']!=MODEL or model['revision']!=REVISION:raise RuntimeError('Pinned music weights required')
if not 10<=float(data['duration'])<=60 or not isinstance(data['prompt'],str) or not 1<=len(data['prompt'])<=1500:raise ValueError('Invalid bounded instrumental request')
if time.time()+300>=data['deadlineEpoch']:raise RuntimeError('Insufficient authorized time')
import torch
from acestep.pipeline_ace_step import ACEStepPipeline
if not torch.cuda.is_available() or torch.cuda.get_device_name(0)!='NVIDIA L40S':raise RuntimeError('Authorized NVIDIA L40S required')
a.output.mkdir(parents=True,exist_ok=True);started=time.monotonic();torch.cuda.reset_peak_memory_stats()
pipe=ACEStepPipeline(checkpoint_dir=str(a.models),dtype='bfloat16',torch_compile=False,cpu_offload=False,overlapped_decode=False)
native=a.output/'native.wav'
result=pipe(format='wav',audio_duration=float(data['duration']),prompt=data['prompt'],lyrics='[instrumental]',use_erg_lyric=False,infer_step=60,guidance_scale=15,scheduler_type='euler',cfg_type='apg',manual_seeds=[str(data['seed'])],save_path=str(native),batch_size=1)
if not native.is_file():raise RuntimeError('Music model did not produce its requested artifact')
audio=a.output/'audio.wav'
subprocess.run(['ffmpeg','-y','-v','error','-i',str(native),'-af','loudnorm=I=-20:TP=-2:LRA=9','-ar','48000','-ac','2','-c:a','pcm_s16le',str(audio)],check=True)
probe=json.loads(subprocess.run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(audio)],capture_output=True,text=True,check=True).stdout)
record={'status':'GENERATED_PENDING_LISTENING_REVIEW','model':MODEL,'modelRevision':REVISION,'implementationRevision':SOURCE_REVISION,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'license':'Apache-2.0','sourceBrief':data['sourceBrief'],'prompt':data['prompt'],'seed':data['seed'],'tool':'AutoPromote NVIDIA instrumental stem generation','gpu':torch.cuda.get_device_name(0),'seconds':time.monotonic()-started,'peakCudaAllocatedBytes':torch.cuda.max_memory_allocated(),'settings':{'duration':data['duration'],'inferStep':60,'guidanceScale':15,'scheduler':'euler','cfg':'apg','lyrics':'[instrumental]','useErgLyric':False,'dtype':'bfloat16','sampleRate':48000,'channels':2,'normalization':'-20 LUFS, -2 dBTP'},'artifact':{'path':str(audio),'sha256':hashlib.sha256(audio.read_bytes()).hexdigest(),'duration':float(probe['format']['duration'])},'nativeArtifact':{'path':str(native),'sha256':hashlib.sha256(native.read_bytes()).hexdigest()},'limitation':'Instrumental intent is prompted, not a guarantee. Listening review and final sound direction are required.'}
(a.output/'receipt.json').write_text(json.dumps(record,indent=2));print(json.dumps({'event':'instrumental_music_generated','seconds':record['seconds'],'sha256':record['artifact']['sha256']}),flush=True)
