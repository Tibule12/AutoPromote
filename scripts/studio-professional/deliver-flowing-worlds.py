"""Package verified native outputs and an explicitly labelled comparison only."""
import hashlib,json,shutil,subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
REPORT=ROOT/'reports/studio-folded-space-20261101/flowing-ribbon/episode'
TARGET=Path.home()/'Videos/AutoPromote Motion and Flow - 2026-11-01/Cinematic Episode/Flowing worlds - 2026-11-02'


def sha(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def copy(source,name):
    destination=TARGET/name;destination.parent.mkdir(parents=True,exist_ok=True)
    if destination.exists() and sha(source)!=sha(destination):
        raise RuntimeError('Preserve earlier review bytes before replacement: '+str(destination))
    shutil.copy2(source,destination);assert sha(source)==sha(destination)


def main():
    native=REPORT/'native-motion-flow/final.mp4'
    receipt=json.loads((REPORT/'native-motion-flow/render-receipt.json').read_text())
    assert sha(native)==receipt['outputSha256']==receipt['serverOutputSha256']
    assert json.loads((REPORT/'finished-file-identity.json').read_text())['sha256']==sha(native)
    for kind in ['live','finished']:assert json.loads((REPORT/(kind+'-playback.json')).read_text())['complete']
    check=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(native)]))
    video=next(s for s in check['streams'] if s['codec_type']=='video')
    assert video['avg_frame_rate']=='24/1' and int(video['nb_read_frames'])==864
    assert (video['width'],video['height'])==(1280,720)
    subprocess.run(['ffmpeg','-v','error','-i',str(native),'-f','null','-'],check=True)
    copy(native,'Flowing worlds.mp4');copy(REPORT/'Editable Project.autopromote.json','Editable Project.autopromote.json')
    copy(REPORT/'Raw source cuts.mp4','Raw source cuts.mp4')
    for name in ['native-authoring','live-playback','finished-playback']:
        copy(REPORT/name/'editing-in-studio.mp4',name.replace('-',' ').title()+'.mp4')
        copy(REPORT/name/'editing-recording.json','Technical/'+name+' capture.json')
    for name in ['live-playback.json','finished-playback.json','finished-file-identity.json','preview-samples.json',
                 'reopen-edit.json','actual-job-archive.json','local-fixture-credits.json','paired-measurements.json',
                 'final-preflight.json','validation.json','worker-summary.json','guard-ui.json',
                 'exact-backup-and-guard-compilation.json','native-shared-source-observations.json','creative-progress.json',
                 'native-media-validation.json']:
        copy(REPORT/name,'Technical/'+name)
    for picture in REPORT.glob('preview-*.png'):copy(picture,'Stills/'+picture.name)
    copy(REPORT/'paired-contact.jpg','Live vs export.jpg')
    copy(REPORT/'Native episode contact.jpg','Native episode overview.jpg')
    safe={k:receipt[k] for k in ['projectId','projectHash','submittedJobId','outputSha256','startedAt','finishedAt']}
    safe['technical']={'seconds':36,'frames':864,'fps':24,'width':1280,'height':720,'fullDecode':True}
    (TARGET/'Technical/Native receipt.json').write_text(json.dumps(safe,indent=2)+'\n')
    comparison=REPORT/'Raw vs flowing worlds.mp4'
    if not comparison.exists():
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(REPORT/'Raw source cuts.mp4'),'-i',str(native),
            '-filter_complex_threads','2','-filter_complex',
            "[0:v]scale=640:360,drawtext=text='RAW SOURCE CUTS':x=16:y=16:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.55[a];"
            "[1:v]scale=640:360,drawtext=text='AUTOPROMOTE STUDIO':x=16:y=16:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.55[b];"
            '[a][b]hstack=inputs=2[v]','-map','[v]','-map','1:a:0','-r','24','-t','36','-c:v','libx264',
            '-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',str(comparison)],check=True)
    copy(comparison,comparison.name);copy(REPORT/'README.md','README.md');copy(REPORT/'Feedback.md','Feedback.md')
    manifest=[dict(file=str(p.relative_to(TARGET)),bytes=p.stat().st_size,sha256=sha(p))
              for p in sorted(TARGET.rglob('*')) if p.is_file() and p.name!='SHA256.json']
    (TARGET/'SHA256.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (REPORT/'delivery.json').write_text(json.dumps(dict(directory=str(TARGET),nativeReceipt=safe,files=manifest),indent=2)+'\n')
    print(json.dumps(dict(directory=str(TARGET),files=len(manifest),movieSha256=sha(native))))


if __name__=='__main__':main()
