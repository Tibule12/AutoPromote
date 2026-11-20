from pathlib import Path
import json, wave
from piper import PiperVoice, SynthesisConfig
folder=Path(__file__).resolve().parent/'private/narration';folder.mkdir(exist_ok=True)
voice=PiperVoice.load('/home/tibule12/Projects/AutoPromte/AutoPromote-model-runtime-v1/reports/studio-background-three-sets-20261030/private-evidence/narration/en_GB-alan-medium.onnx',use_cuda=False)
texts={
'intro':'AutoPromote. Real Studio films, followed by the native controls behind the work.',
'controls':'This is the actual Glass Current Studio project. Watch the native layer and motion controls change. These decisions remain editable. The finished films are separate exported files.',
'outro':'AutoPromote is prelaunch and founder tested. Let us talk about your creative workflow.'
}
durations={}
for key,text in texts.items():
 file=folder/(key+'.wav')
 with wave.open(str(file),'wb')as out:voice.synthesize_wav(text,out,syn_config=SynthesisConfig(length_scale=1.0))
 with wave.open(str(file),'rb')as f:durations[key]={'text':text,'seconds':f.getnframes()/f.getframerate()}
(folder/'durations.json').write_text(json.dumps(durations,indent=2));print('Prepared three short local narration cues.')
