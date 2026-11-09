"""Compare actual decoded matte bytes for the verified gesture inside the long pass."""
from pathlib import Path
import argparse,subprocess,json
p=argparse.ArgumentParser();p.add_argument('root');a=p.parse_args();r=Path(a.root);short=Path('/dev/shm/autopromote-background-four-minute-r9/current-neural-short/Full alpha matte - lossless.mkv');full=r/'assembled/Full alpha matte - lossless.mkv'
def digest(file,select=None):
 cmd=['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(file)]
 if select:cmd+=['-vf','select=between(n\\,1188\\,1235),setpts=PTS-STARTPTS','-vsync','0','-frames:v','48']
 cmd+=['-pix_fmt','gray','-f','hash','-hash','sha256','-'];return subprocess.check_output(cmd).decode().strip().split('=')[-1]
x,y=digest(short),digest(full,True);result={'actualDecodedAlphaCompared':True,'sourceFrames':[1188,1236],'frames':48,'shortAlphaDecodedSha256':x,'sameFramesInsideFourMinuteAlphaSha256':y,'decodedMatteBytesIdentical':x==y,'provesClockAndCorrectionPropagationOnly':True,'creativeGate':False};(r/'actual-neural-short-review/full-alpha-propagation.json').write_text(json.dumps(result,indent=2));assert x==y,'Actual short correction differs inside four-minute matte; inspect source clock/phase before export';print('ACTUAL_SHORT_MATTE_PROPAGATION_BYTE_EXACT',flush=True)
