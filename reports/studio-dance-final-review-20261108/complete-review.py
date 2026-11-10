"""Read-only review of retained media; diagnostics never replace the movie."""
from pathlib import Path
import hashlib, io, json, subprocess
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
private = root / 'private'
delivery = Path('/home/tibule12/Videos/Studio - Grounded Dance Revision - 2026-11-08')
movie = delivery / 'Grounded doubles.mp4'
source = Path('/home/tibule12/Videos/number two dance.mp4')
audit = json.loads((root / 'technical-audit.json').read_text())
assert hashlib.file_digest(movie.open('rb'), 'sha256').hexdigest() == audit['movieSha256']

def decode_frame(path, index):
    data = subprocess.check_output(['ffmpeg', '-v', 'error', '-threads', '2', '-i', str(path),
        '-vf', f'select=eq(n\\,{index})', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'])
    return Image.open(io.BytesIO(data)).convert('RGB')

# Compare nearby actual 30-fps source frames with actual 24-fps export frames.
# This is a labelled diagnostic, not exact source/export frame-parity proof.
indices = [36, 141, 143]
board = Image.new('RGB', (584, 3 * 382), '#11151c')
draw = ImageDraw.Draw(board)
for row, index in enumerate(indices):
    source_index = round((8 + index / 24) * 30)
    original = decode_frame(source, source_index)
    final = decode_frame(movie, index)
    y = row * 382
    for column, im in enumerate([original, final]):
        crop = im.crop((430, 740, 576, 910)).resize((292, 340), Image.Resampling.NEAREST)
        board.paste(crop, (column * 292, y + 42))
    draw.text((5, y + 5), f'Original / {source_index/30:.4f}s', fill='white')
    draw.text((297, y + 5), f'Export / f{index} / {index/24:.4f}s', fill='white')
    draw.text((5, y + 23), 'Nearest source frame; crop enlarged 2x', fill='#ccd0d8')
board.save(root / 'Corner comparison.png')

# Measure precisely the same 288,000-sample intervals in both audio streams.
loudness = {}
for label, path, start in [('source', source, 8), ('final', movie, 0)]:
    pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-ss', str(start), '-i', str(path),
        '-t', '6', '-vn', '-ar', '48000', '-ac', '2', '-f', 'f32le', '-'])
    assert len(pcm) == 288000 * 2 * 4
    proc = subprocess.run(['ffmpeg', '-hide_banner', '-f', 'f32le', '-ar', '48000', '-ac', '2',
        '-i', 'pipe:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], input=pcm, capture_output=True, check=True)
    log = proc.stderr.decode()
    (private / f'{label}-exact-loudness.log').write_text(log)
    summary = log.rsplit('Summary:', 1)[1]
    import re
    loudness[label] = {
        'integratedLufs': float(re.search(r'I:\s*([\d.-]+) LUFS', summary)[1]),
        'truePeakDbtp': float(re.search(r'Peak:\s*([\d.-]+) dBFS', summary)[1]),
        'samplesPerChannel': 288000,
    }

playback = {}
for kind in ['live', 'finished']:
    name = f'Complete {kind} Studio playback' if kind == 'live' else 'Complete finished playback in Studio'
    if kind == 'live':
        name = 'Complete live Studio playback'
    clock = json.loads((private / 'two' / (name + '.json')).read_text())
    capture = json.loads((private / 'two' / name / 'editing-recording.json').read_text())
    playback[kind] = {
        'complete': clock['complete'], 'wallMilliseconds': clock['wallMs'],
        'capturedFrames': capture['frames'], 'captureSeconds': capture['seconds'],
        'observedCaptureFps': capture['frames'] / capture['seconds'],
        'captureHasAudio': False, 'smooth24fpsDisplayQualified': False,
    }

result = {
    'recordedDate': '2026-11-08', 'movieSha256': audit['movieSha256'],
    'nativeJobId': 'viral_87018777759d0e861bf3fb87a616645d328309195f39bd8b879a4e4cd5eab28e',
    'verdict': 'HOLD_PUBLICATION_FOR_PICTURE_AND_AUDIO_CORRECTION',
    'all144FramesRepresentedInInspectedContactSheets': True,
    'inspectedSheetGroups': ['full', 'faces-hands', 'feet', 'cleanup'],
    'inspectedPagesPerGroup': 6,
    'pictureFindings': [
        {'area': 'masked corner reconstruction', 'severity': 'release blocker',
         'timesSeconds': [1.1667, 1.375, 4.0, 5.75, 5.7917, 5.9583],
         'observation': 'Soft rectangular floor/backdrop texture and a hard transition remain; red shoe/lower-leg detail is clipped or displaced at the closing crossing. See labelled original/export crops.'},
        {'area': 'echo mattes and grounding', 'severity': 'quality blocker for realism claim',
         'timesSeconds': [1.2, 1.5, 3, 4.5, 5.4],
         'observation': 'Soft subject edges, overlapping silhouettes and mismatched contact still read as a designed compositing effect, not independently lit physical dancers.'},
        {'area': 'ending', 'severity': 'editorial limitation',
         'observation': 'The last and first poses do not match; do not describe this as a seamless loop.'},
    ],
    'colour': {'sourceMatrix': 'bt709', 'exportMatrixTag': None,
        'exportPrimariesAndTransfer': 'bt709',
        'finding': 'Export lacks an explicit matrix tag retained by the source. Cross-player colour consistency remains unqualified; this alone does not prove a visible colour shift.'},
    'audio': {**loudness, 'sourceCorrelation': audit['audio']['sourceWaveformCorrelation'],
        'bestMeasuredLagMilliseconds': 0, 'humanListeningQualified': False,
        'finding': 'Source already overshoots; final is lower but still above full scale. This is measured overshoot and clipping risk, not proof of audible distortion.',
        'correction': 'Set conservative native output headroom, then remeasure the encoded result and listen to the entire final. Do not replace or stretch the original music.'},
    'native': {'backupCompilerWorkerDownloadBindingVerified': True,
        'independentExactRestore': True, 'freshNormalSignIn': True,
        'browserErrors': [], 'headlessAndMuted': True, 'loopbackOnly': True,
        'freshPlayback': playback, 'pausedSelectedTimesInspected': [0,.5,.8,.92,1.05,1.2,1.5,3,4.5,5.4,5.65,5.875,143/24],
        'strictPreviewExportParityQualified': False,
        'limitations': ['Cleanup in live preview is a placement guide, not the finished reconstructed picture.',
            'Some paused screenshots include native cleanup handles; they are not baked into the movie.',
            'A selected UI timestamp and a resized diagnostic image do not by themselves establish exact decoded-source-frame equality.']},
    'copy': {
        'title': 'One Clip. Three Moments at Once.',
        'hook': 'Watch what happens behind the dancers.',
        'description': 'The dancers move forward. Earlier versions stay behind. A dance edit exploring colour, timing and motion echoes in AutoPromote Studio.\n\nWould you try this on your footage?\n#AutoPromote #MotionGraphics #DanceEdit #VideoEditing',
        'titleAccurate': True, 'maximumTemporalStatesDuringEffect': 3,
        'hookPlacement': 'Proposed opening of post caption; not burned in or spoken in this movie.',
        'studioClaimScope': 'Native editable layer/keyframe compositing and canonical CPU export; supplied foreground/alpha were prepared inputs.',
        'doNotClaim': ['fully automatic Director isolation', 'one-click result', 'photoreal duplication', 'seamless loop', 'pixel-identical live preview'],
    },
    'reviewLimits': ['No human listening qualification.', 'No provider-transcoded upload, destination-specific crop or published-page check.', 'No selected thumbnail has been approved in this review.'],
    'movieChanged': False, 'productSourceChangedByReview': False,
    'newRenderSubmitted': False, 'paidExecutionStarted': False,
    'published': False, 'scheduled': False, 'readinessPromotion': False,
    'nextTask': 'Correct the corner/body boundary and output headroom through the native project; recheck exact new bytes, temporal mattes, listening and thumbnail before publication.'
}
(root / 'final-review.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'verdict': result['verdict'], 'audio': loudness, 'playback': playback}))
