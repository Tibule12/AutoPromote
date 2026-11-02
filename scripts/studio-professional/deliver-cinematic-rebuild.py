"""Review packaging of completed native movies, never an effect renderer."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'reports/studio-cinematic-episode-20261101'
REPORT=BASE/'creative-rebuild-v2'
TARGET=Path.home()/'Videos/AutoPromote Motion and Flow - 2026-11-01/Cinematic Episode/Creative revision - 2026-11-01'


def digest(p):
    with p.open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def copy(source,name):
    destination=TARGET/name;destination.parent.mkdir(parents=True,exist_ok=True)
    if destination.exists() and digest(destination)!=digest(source):
        raise RuntimeError('Preserve the previous review file before replacement: '+str(destination))
    shutil.copy2(source,destination);assert digest(source)==digest(destination)


def main():
    movie=REPORT/'native-motion-flow/final.mp4'
    receipt=json.loads((REPORT/'native-motion-flow/render-receipt.json').read_text())
    assert digest(movie)==receipt['outputSha256']==receipt['serverOutputSha256']
    for kind in ['live','finished']:
        assert json.loads((REPORT/(kind+'-playback.json')).read_text())['complete']
    assert json.loads((REPORT/'finished-file-identity.json').read_text())['sha256']==digest(movie)
    technical=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames',
        '-show_streams','-show_format','-of','json',str(movie)]))
    video=next(s for s in technical['streams'] if s['codec_type']=='video')
    assert video['avg_frame_rate']=='24/1' and int(video['nb_read_frames'])==864
    subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'],check=True)
    copy(movie,'Beyond the frame.mp4');copy(REPORT/'Editable Project.autopromote.json','Editable Project.autopromote.json')
    for kind in ['live','finished']:
        copy(REPORT/(kind+'-playback/editing-in-studio.mp4'),'Studio '+kind+' playback.mp4')
        copy(REPORT/(kind+'-playback.json'),'Technical/'+kind+' playback.json')
        copy(REPORT/(kind+'-playback/editing-recording.json'),'Technical/'+kind+' capture.json')
    for directory in ['native-creative-authoring','native-composition-correction','native-edge-correction']:
        copy(REPORT/directory/'editing-in-studio.mp4','Authoring/'+directory+'.mp4')
    for p in REPORT.glob('preview-*.png'):
        copy(p,'Stills/'+p.name)
    copy(REPORT/'paired-contact.jpg','Live vs export.jpg')
    copy(REPORT/'city-contour-review.jpg','Reviewed subject contour.jpg')
    copy(REPORT/'Creative revision overview.jpg','Creative revision overview.jpg')
    for name in ['creative-authoring.json','composition-correction.json','creative-progress.json',
                 'paired-measurements.json','local-native-envelope.json','proven-no-dispatch.json',
                 'local-fixture-credits.json','validation.json','final-preflight.json',
                 'actual-job-archive.json','reopen-edit.json','finished-file-identity.json',
                 'creative-review-exit.json']:
        copy(REPORT/name,'Technical/'+name)
    safe={k:receipt[k] for k in ['projectId','projectHash','submittedJobId','outputSha256','startedAt','finishedAt']}
    safe['technical']={'frames':864,'fps':24,'width':video['width'],'height':video['height'],'fullDecode':True}
    (TARGET/'Technical/Native receipt.json').write_text(json.dumps(safe,indent=2)+'\n')
    comparison=REPORT/'Raw vs creative revision.mp4'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(BASE/'native-raw-source/final.mp4'),'-i',str(movie),
        '-filter_complex_threads','2','-filter_complex',
        "[0:v]scale=640:360,drawtext=text='RAW SOURCE':x=16:y=16:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.55[a];"
        "[1:v]scale=640:360,drawtext=text='AUTOPROMOTE CREATIVE REVISION':x=16:y=16:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.55[b];"
        '[a][b]hstack=inputs=2[v]','-map','[v]','-map','1:a:0','-r','24','-t','36','-c:v','libx264',
        '-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',str(comparison)],check=True)
    copy(comparison,comparison.name)
    copy(REPORT/'Feedback.md','Feedback.md');copy(REPORT/'README.md','README.md')
    manifest=[dict(file=str(p.relative_to(TARGET)),sha256=digest(p),bytes=p.stat().st_size)
              for p in sorted(TARGET.rglob('*')) if p.is_file() and p.name!='SHA256.json']
    (TARGET/'SHA256.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (REPORT/'delivery.json').write_text(json.dumps(dict(directory=str(TARGET),nativeReceipt=safe,files=manifest),indent=2)+'\n')
    print(json.dumps(dict(directory=str(TARGET),files=len(manifest),movieSha256=digest(movie))))


if __name__=='__main__':
    main()
