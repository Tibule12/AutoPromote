from pathlib import Path
import json,subprocess,sys,os
sys.path.insert(0,str(Path.cwd()))
from python_media_worker.studio_watermark_cleanup import apply_studio_glyph_cleanup
r=Path(__file__).resolve().parent;runtime=json.loads((r/'private/runtime-pointer.json').read_text())['directory'];config=json.loads((Path(runtime)/'config.json').read_text());os.environ['STUDIO_BADGE_INPAINT_MODEL']=config['env']['STUDIO_BADGE_INPAINT_MODEL']
movie=r/'private/cleanup-diagnostic.mp4';source='/home/tibule12/Videos/number two dance.mp4'
subprocess.run(['ffmpeg','-v','error','-y','-ss','8','-i',source,'-t','6','-r','24','-c:v','libx264','-crf','14','-preset','fast','-threads','2','-c:a','aac','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',str(movie)],check=True)
receipt={'method':'local_lama_masked','manual_regions':[{'left':77,'top':75,'width':22,'height':11,'track':False,'seed_time':0}]}
result=apply_studio_glyph_cleanup(str(movie),receipt,['-c:v','libx264','-crf','14','-preset','fast'],source_path=source)
(r/'private/cleanup-diagnostic.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
