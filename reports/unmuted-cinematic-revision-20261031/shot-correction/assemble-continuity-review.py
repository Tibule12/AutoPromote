"""Encode and inspect the actual three-second picture, preserving prior takes."""
from pathlib import Path
import hashlib,json,subprocess,sys
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parent
WORK=ROOT/'private/continuity'
DELIVERY=Path('/home/tibule12/Videos/Unmuted - Shot Correction - 20261031')
aligned='--aligned' in sys.argv
movie=DELIVERY/('Background Replacement - Shot Review.mp4' if aligned else 'Background Replacement - Motion Revision.mp4')
previous=DELIVERY/'Background Replacement - Detail Refinement.mp4'
original=DELIVERY/'Before - same 3 seconds.mp4'
assert not movie.exists(), 'Preserve earlier delivered files'
render=WORK/('aligned-render' if aligned else 'render')
assert len(list(render.glob('*.png')))==72
subprocess.run(['ffmpeg','-v','error','-framerate','24','-i',str(render/'%04d.png'),
    '-i',str(previous),'-map','0:v:0','-map','1:a:0','-vf','format=yuv420p',
    '-c:v','libx264','-threads','2','-crf','17','-preset','medium','-c:a','copy',
    '-t','3','-movflags','+faststart',str(movie)],check=True)
decoded=WORK/('encoded-aligned' if aligned else 'encoded');decoded.mkdir()
subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-threads','1',str(decoded/'%04d.png')],check=True)
assert len(list(decoded.glob('*.png')))==72
subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'],check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(movie)]))
v=next(s for s in probe['streams'] if s['codec_type']=='video')
assert int(v['nb_read_frames'])==72 and v['width']==1280 and v['height']==720 and v['r_frame_rate']=='24/1'
def audio_hash(path):
    return hashlib.sha256(subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-vn','-c:a','copy','-f','adts','pipe:1'])).hexdigest()
assert audio_hash(movie)==audio_hash(previous)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16)
audit=WORK/('motion-audit-aligned' if aligned else 'motion-audit');audit.mkdir()
for kind,box in [('equipment',(790,350,1280,650)),('edges',(510,20,1130,380)),('gesture',(510,350,1140,720))]:
    for page in range(6):
        sheet=Image.new('RGB',(1200,1040),'#16191e')
        for cell in range(12):
            index=page*12+cell
            image=Image.open(decoded/f'{index+1:04d}.png').crop(box)
            image.thumbnail((400,230))
            x=(cell%3)*400;y=(cell//3)*260
            sheet.paste(image,(x,y+28))
            ImageDraw.Draw(sheet).text((x+8,y+5),f'{kind} | {index}/72 | {index/24:.3f}s',font=font,fill='white')
        sheet.save(audit/f'{kind}-{page}.jpg',quality=94)
pair=Image.new('RGB',(1280,1176),'#16191e')
for row,index in enumerate([0,16,71]):
    before=WORK/f'before-{index:03d}.png'
    if not before.exists():
        subprocess.run(['ffmpeg','-v','error','-i',str(previous),'-vf',f'select=eq(n\\,{index})',
            '-frames:v','1',str(before)],check=True)
    for col,(label,img) in enumerate([('Rejected detail pass',Image.open(before)),('Shot review' if aligned else 'Motion revision',Image.open(decoded/f'{index+1:04d}.png'))]):
        pair.paste(img.resize((640,360)),(col*640,row*392+32))
        ImageDraw.Draw(pair).text((col*640+10,row*392+6),f'{label} | {index/24:.3f}s',font=font,fill='white')
pair.save(DELIVERY/('Before and Shot Review - actual frames.png' if aligned else 'Before and Motion Revision - actual frames.png'))
Image.open(decoded/'0017.png').save(DELIVERY/('Shot Review - actual gesture frame.png' if aligned else 'Motion Revision - actual gesture frame.png'))
receipt={'movie':str(movie),'sha256':hashlib.sha256(movie.read_bytes()).hexdigest(),
    'frames':72,'fps':24,'duration':3,'fullDecodePassed':True,'previousAudioBytesPreserved':True,
    'sourceInterval':[539/24,611/24],'programmeInterval':[4,7],
    'actualEncodedAuditFrames':72,'auditRegions':['equipment','edges','gesture'],
    'matte':'Temporal SAM2 body + source-specific protected interior/equipment + source-resolution ViTMatte head + native foreground recovery',
    'framing':'Presenter moved to right; real boom exits right edge. Occluded original post is outside frame, not reconstructed.',
    'inventedMicrophoneSupport':False,'authoredLocalBlenderShot':True,'authenticatedStudioVfxJob':False,
    'professionalQualification':False,'creativeApproval':False,'wholeVideoRendered':False,
    'cloudJobs':0,'productionDataAccess':False,'visualReview':'Pending all-frame inspection'}
(ROOT/('shot-review.json' if aligned else 'motion-revision.json')).write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
