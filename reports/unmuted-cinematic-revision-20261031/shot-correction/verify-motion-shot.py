"""Verify the bounded actual shot and its complete, audible Studio capture."""
from pathlib import Path
import hashlib,json,subprocess
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[2]
WORK=ROOT/'private/continuity'
DELIVERY=Path('/home/tibule12/Videos/Unmuted - Shot Correction - 20261031')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
source=Path('/home/tibule12/Videos/cam-combiner-60sec.mp4')
rejected=Path('/home/tibule12/Videos/Unmuted Podcast - Cinematic Revision - 20261031/UNMUTED - Cinematic Set Revision.mp4')
assert sha(source)=='7a16b8ba2eba836eac74bcfb1f830313907ac0e19f314e636d4b7f833643578c'
assert sha(rejected)=='4d2c8d510c0e36d4d2b3e2ad7c9aa461ccf6f3a50ba21e5aba04f608add6eb4f'
movie=DELIVERY/'Background Replacement - Shot Review.mp4'
recording=DELIVERY/'Studio Shot Review Playback with Sound.mp4'
playback=json.loads((WORK/'final-studio-complete/studio-playback.json').read_text())
assert playback['mediaEnded'] and playback['maximumMediaTime']==3
assert not playback['errors'] and not playback['external']
project=json.loads((WORK/'final-studio-complete/private/review-project.json').read_text())
assert project['snapshot']['orderedClips'][0]['contentHash']==sha(movie)
artifacts={}
for path in [movie,recording]:
    subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','null','-'],check=True)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(path)]))
    pcm=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-vn','-ac','1','-ar','16000','-f','f32le','pipe:1']),np.float32)
    rms=float(np.sqrt(np.mean(pcm.astype(float)**2)))
    assert rms>.001
    artifacts[path.name]={'sha256':sha(path),'bytes':path.stat().st_size,'fullDecode':True,'audioRms':rms,
        'videoFrames':next(s['nb_read_frames'] for s in probe['streams'] if s['codec_type']=='video'),
        'hasAudio':any(s['codec_type']=='audio' for s in probe['streams'])}
assert artifacts[movie.name]['videoFrames']=='72'
for index in range(72):
    assert np.array_equal(np.array(Image.open(WORK/'raw'/f'{index+1:06d}.png'))[:,170:],
        np.array(Image.open(ROOT/'private/attempt-2/raw'/f'{index+1:06d}.png')))
    assert Image.open(WORK/'presenter'/f'{index+1:06d}.png').size==(1280,1000)
sam=json.loads((ROOT/'private/temporal-subject/full/subject_masks/manifest.json').read_text())
assert sam['source_sha256']==sha(ROOT/'private/native-composite-cleanup/source.mkv')
assert sam['frame_count']==72 and sam['original_source_sha256']==sha(source)
checks={}
for name,args in {
    'studioContract':['node','test/e2e/validate-studio-contract.js'],
    'whitespace':['git','diff','--check'],
    'recordingSyntax':['node','--check',str(ROOT/'record-studio.cjs')],
}.items():
    result=subprocess.run(args,cwd=REPO,capture_output=True,text=True)
    checks[name]={'exitCode':result.returncode,'output':result.stdout+result.stderr}
    assert result.returncode==0
result={'sourceUnchanged':True,'originalRejectedMovieUnchanged':True,'all72SourceCropsIdentical':True,
    'samManifestBoundToActualLocalDerivative':True,'movieAndRecording':artifacts,'actualStudioPlayback':playback,
    'correctMovieHashInNativePlaybackProject':True,'checks':checks,
    'retainedFocusedApplicationTests':{'foregroundPixels':43,'panel':24,'service':24,'total':91,'rerunThisShotOnlyFollowup':False},
    'actualFinalEncodedFramesReviewed':72,'review':'Equipment, edges and gestures, plus every final full frame after cue alignment',
    'strictWholeRightPictureIdentity':json.loads((WORK/'cue-alignment-pixel-check.json').read_text())['all72RightSideRenderPixelsIdentical'],
    'strictPixelParityClaim':False,'professionalQualification':False,'ownerCreativeApproval':False,
    'authenticatedSubjectVfxJob':False,'wholeFilmRender':False,'cloudJobs':0,'productionDataAccess':False}
(ROOT/'motion-validation.json').write_text(json.dumps(result,indent=2)+'\n')
for name in ['shot-review.json','motion-revision.json']:
    path=ROOT/name;receipt=json.loads(path.read_text())
    # Decoding/clock checks cannot decide visual acceptance or undo an owner
    # rejection. Preserve status, visualReview, remaining and owner decisions.
    receipt['technicalReverification']={'fullDecodePassed':True,'sourceUnchanged':True,
        'all72SourceCropsIdentical':True,'creativeAssessmentPerformedByThisVerifier':False}
    if name=='shot-review.json':receipt['completeAudibleStudioPlayback']=playback
    path.write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'verified':True,'actualFrames':72,'actualEndedMediaTime':playback['maximumMediaTime'],
    'sourceUnchanged':True,'movie':str(movie),'recording':str(recording),'professionalQualification':False},indent=2))
