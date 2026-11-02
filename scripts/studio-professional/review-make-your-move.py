"""Inspect/package native exports; never generates evaluated visual effects."""
from pathlib import Path
import json,hashlib,subprocess,shutil
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[2]
REPORT=ROOT/'reports/studio-make-your-move-20261102/episode'
TARGET=Path.home()/'Videos/AutoPromote Motion and Flow - 2026-11-02/Make your move'

def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def inspect():
    native=REPORT/'native-motion-flow/final.mp4';receipt=json.loads((native.parent/'render-receipt.json').read_text())
    assert sha(native)==receipt['outputSha256']==receipt['serverOutputSha256']
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(native)]))
    video=next(s for s in probe['streams'] if s['codec_type']=='video');audio=next(s for s in probe['streams'] if s['codec_type']=='audio')
    assert (video['width'],video['height'],video['avg_frame_rate'],int(video['nb_read_frames']))==(1280,720,'24/1',720)
    assert abs(float(probe['format']['duration'])-30)<.1
    subprocess.run(['ffmpeg','-v','error','-threads','2','-i',str(native),'-f','null','-'],check=True)
    pictures=REPORT/'Export inspection';pictures.mkdir(exist_ok=True)
    # Inspect every .5s plus cuts/matte boundaries and the last actual frame.
    indices=sorted(set(range(0,720,12))|{1,23,24,95,96,97,189,190,191,192,193,335,336,337,383,384,385,399,400,401,479,480,481,575,576,577,718,719})
    select='+'.join(f'eq(n,{n})' for n in indices)
    subprocess.run(['ffmpeg','-v','error','-y','-threads','2','-i',str(native),'-vf',"select='"+select+"',scale=426:240",'-fps_mode','vfr',str(pictures/'frame-%03d.jpg')],check=True)
    rows=[]
    for page in range((len(indices)+11)//12):
        board=Image.new('RGB',(1278,4*263),'#101114');draw=ImageDraw.Draw(board)
        for slot,index in enumerate(indices[page*12:(page+1)*12]):
            image=Image.open(pictures/f'frame-{page*12+slot+1:03d}.jpg');x=(slot%3)*426;y=(slot//3)*263
            board.paste(image,(x,y+23));draw.text((x+8,y+4),f'{index/24:.3f}s / frame {index}',fill='white')
            rows.append(dict(frame=index,time=index/24,file=f'Export inspection/frame-{page*12+slot+1:03d}.jpg'))
        board.save(REPORT/f'Export contact {page+1}.jpg')
    (REPORT/'technical.json').write_text(json.dumps(dict(seconds=30,frames=720,width=1280,height=720,fps=24,videoCodec=video['codec_name'],audioCodec=audio['codec_name'],sha256=sha(native),fullyDecodes=True,inspectionFrames=rows),indent=2))
    print(json.dumps(dict(nativeSha256=sha(native),seconds=30,frames=720,inspectionFrames=len(rows))))

def package():
    receipt=json.loads((REPORT/'native-motion-flow/render-receipt.json').read_text())
    for name in ['live','finished']:assert json.loads((REPORT/(name+'-playback.json')).read_text())['complete']
    assert json.loads((REPORT/'reopen-edit.json').read_text())['exactDecisionsRestored']
    assert sha(REPORT/'native-motion-flow/final.mp4')==receipt['outputSha256']
    TARGET.mkdir(parents=True,exist_ok=True)
    def copy(source,name):
        dest=TARGET/name;dest.parent.mkdir(parents=True,exist_ok=True)
        if dest.exists():assert sha(source)==sha(dest),'Preserve earlier delivered bytes'
        else:shutil.copy2(source,dest)
    for source,name in [('native-motion-flow/final.mp4','Make your move.mp4'),('Raw source cuts.mp4','Raw source cuts.mp4'),('Editable Project.autopromote.json','Editable Project.autopromote.json'),('Raw vs Studio.mp4','Raw vs Studio.mp4'),('live-playback/editing-in-studio.mp4','Live Studio playback.mp4'),('finished-playback/editing-in-studio.mp4','Finished video in Studio.mp4'),('native-controls/editing-in-studio.mp4','Native editing and recovery.mp4'),('matte-source-guard/editing-in-studio.mp4','Video matte source guard.mp4'),('native-authoring/editing-in-studio.mp4','Native authoring - initial pass.mp4'),('paired-contact.jpg','Live vs export.jpg'),('Native source assets.zip','Native source assets.zip'),('README.md','README.md')]:copy(REPORT/source,name)
    for name in ['technical.json','preflight.json','reopen-edit.json','authoring.json','live-playback.json','finished-playback.json','paired-measurements.json','city-matte-provenance.json','raw-packaging.json','creative-verdict.json','validation.json','finished-file-identity.json','source-asset-pack.json','video-matte-worker-geometry.json','matte-source-guard.json']:copy(REPORT/name,'Technical/'+name)
    for kind in ['live','finished']:copy(REPORT/(kind+'-playback/editing-recording.json'),'Technical/'+kind+' capture.json')
    for pic in REPORT.glob('Export contact *.jpg'):copy(pic,'Inspection/'+pic.name)
    for sample in json.loads((REPORT/'preview-samples.json').read_text()):
        name=f"preview-{float(sample['requested']):.2f}.png";copy(REPORT/name,'Stills/'+name)
    for name in ['City','Footsteps','Summit','Coast']:copy(ROOT/'reports/studio-motion-flow-takeover-20261031/video-texture/open-world-sources'/(name+'.mp4'),'Retained source clips/'+name+'.mp4')
    copy(ROOT/'reports/studio-motion-flow-takeover-20261031/video-texture/open-world-source-manifest.json','Retained source clips/Provenance.json')
    copy(REPORT/'City - source-bound luma matte.mp4','Source mattes/City.mp4');copy(REPORT/'Make your move - original score.wav','Original sound/Score master.wav')
    safe={k:receipt[k] for k in ['projectId','projectHash','submittedJobId','outputSha256','startedAt','finishedAt']}
    (TARGET/'Technical/Native receipt.json').write_text(json.dumps(safe,indent=2))
    manifest=[dict(file=str(p.relative_to(TARGET)),bytes=p.stat().st_size,sha256=sha(p)) for p in sorted(TARGET.rglob('*')) if p.is_file() and p.name!='SHA256.json']
    (TARGET/'SHA256.json').write_text(json.dumps(manifest,indent=2));(REPORT/'delivery.json').write_text(json.dumps(dict(directory=str(TARGET),files=manifest,nativeReceipt=safe),indent=2))
    print(json.dumps(dict(directory=str(TARGET),files=len(manifest))))

if __name__=='__main__':
    import sys
    if sys.argv[1]=='inspect':inspect()
    elif sys.argv[1]=='package':package()
    else:raise ValueError('Choose inspect or package')
