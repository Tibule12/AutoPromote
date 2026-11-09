"""Prepare authentic observation sources and original sound, then assemble natively."""
import os, sys, json, hashlib, subprocess
from pathlib import Path
import numpy as np
import soundfile as sf
import onnxruntime as ort

BASE=Path('/home/tibule12/Projects/AutoPromte/AutoPromote-main-integration-20261013/reports/daily-studio')
ROOT=Path('/dev/shm/autopromote-three-films')
sys.path.insert(0,str(BASE/'voice-runtime'))
from kokoro_onnx import Kokoro

SCRIPTS={
'aperture':[
('hook',8,'APERTURE / ENGINEERED MOTION','Twenty separate camera parts. Metal, rubber and glass. Watch them assemble, then build the movement in Auto Promote Studio.'),
('independent-parts',12,'01 / BUILD WITH SEPARATE PARTS','Open Motion, then Three D Motion, and choose Object Composition. The body, lens barrels, rings and controls are separate objects. Select each part to set its shape, size and surface.'),
('detail',4,'MACHINED EDGES / REAL DEPTH','The lens has depth. The metal catches the light.'),
('motion-keys',16,'02 / START APART. LAND TOGETHER.','Select a part and load its first pose. Place it away from the body, then add an object key. Seek forward, move it into place, and add the next key. The lens pieces follow the same path, with slightly different arrival times.'),
('movement',8,'DEPTH + TIMING','The body arrives first. The barrels follow. The smaller rings finish the assembly. That order makes the movement readable.'),
('materials',14,'03 / GIVE EACH SURFACE A JOB','Use a matte surface for the body, chrome for the machined rings, and glass for the lens. Watch how changing the surface changes the reflection. Keep the materials different so the parts stay distinct.'),
('camera-and-light',14,'04 / LET THE LIGHT DESCRIBE THE SHAPE','In Advanced, set the light colour and intensity. Then add scene pose keys for a slow turn. The broad highlights reveal the bevels and the thickness of the lens. Leave the finished assembly time to breathe.'),
('hero',4,'THE FINISHED ASSEMBLY','A slow turn lets the materials carry the shot.'),
('review-whole-timeline',12,'05 / WATCH THE WHOLE MOVE','Fit the whole timeline and play from the beginning. Check the gaps, overlaps and landing. Each object keeps its own keys, while the scene turn moves the complete assembly.'),
('actual-export',10,'06 / FINISH THROUGH THE STUDIO TIMELINE','Render the saved scene with local Blender. Bring the finished animation into Studio, and export the complete edit from its timeline.'),
('closing',8,'APERTURE / MADE IN STUDIO','Separate the parts. Give them weight. Let the light finish the story. This is an original three D product study.')],
'city':[
('hook',8,'BLOCK LIGHT / A MINIATURE WORLD','Twelve buildings rise into a miniature skyline. Stagger the movement, shape the light, and build this world in Studio.'),
('independent-parts',12,'01 / BUILD THE MODEL','In Three D Motion, choose Object Composition. Use separate boxes for the plinth and buildings. Vary their height, width and depth. The lower blocks frame the taller central towers.'),
('detail',4,'FACADES + SOFT EDGES','Window grids and soft edges give the model scale.'),
('motion-keys',16,'02 / SEND THE RISE ACROSS THE CITY','Select a building and set its first pose low and compressed. Add an object key. Move forward, raise the building and restore its full height. Add the landing key. Repeat across the rows, moving each starting time a little later.'),
('movement',8,'ONE RHYTHM / DIFFERENT ARRIVALS','Watch the rise travel across the model. The shared rhythm connects the buildings; the stagger keeps the city alive.'),
('materials',14,'03 / MAKE THE SURFACES READ','Choose the architecture surface for the facades. Its window grid responds to the building shape. Use the warm light strips sparingly, and let the darker glazing contrast with the stone. The plinth grounds the whole composition.'),
('camera-and-light',14,'04 / FRAME IT LIKE A PHYSICAL MODEL','Use a raised viewing angle so the streets and roof lines stay visible. In Advanced, warm the light and add a slow scene turn. Watch the reflections move over the glazing as the model passes through the light.'),
('hero',4,'A WORLD SMALL ENOUGH TO HOLD','The finished skyline reads as a physical miniature.'),
('review-whole-timeline',12,'05 / CHECK THE WAVE','Play the whole timeline. Look for buildings rising too early, or blocking their neighbours. Keep the tallest shapes near the centre and leave a clear final hold after the wave finishes.'),
('actual-export',10,'06 / FINISH THROUGH THE STUDIO TIMELINE','Render the saved scene with local Blender and check the windows. Bring that finished animation into Studio, then export the complete edit.'),
('closing',8,'BLOCK LIGHT / MADE IN STUDIO','Shape the skyline. Stagger the rise. Reveal the surfaces with light. Build your miniature world in Studio.')],
'chrono':[
('hook',8,'CHRONO / PRECISION IN PIECES','Steel, gold, teal and clear glass. A timepiece assembles, piece by piece. Build its motion in Studio.'),
('independent-parts',12,'01 / DESIGN THE LAYERS','In Object Composition, cylinders form the case and dial. Toruses become bezels. Beveled boxes form the markers and hands. Keep the crystal separate so you can see the dial underneath.'),
('detail',4,'STEEL / GOLD / SAPPHIRE','Different surfaces make each layer of the watch readable.'),
('motion-keys',16,'02 / CHOREOGRAPH THE ASSEMBLY','Load the first pose of a part. Spread the case, dial and markers into an exploded arrangement, then add their keys. Seek forward and bring them back together. Let the hands arrive after the markers, and place the crystal last.'),
('movement',8,'ASSEMBLY WITH INTENT','The dial settles. The markers align. The hands arrive, and the crystal closes the face. Each arrival has a purpose.'),
('materials',14,'03 / KEEP THE GLASS CLEAR','Use chrome for the steel, gold for the accents, and matte teal for the dial. The crystal uses a separate glass surface. Check that its reflections still let you see the hands and the markers underneath.'),
('camera-and-light',14,'04 / REVEAL IT THROUGH REFLECTIONS','Give the assembled watch a gentle scene turn. Keep the light broad enough to draw a clean highlight along the bezel. A small bevel softens the metal edges. The calm final motion lets you inspect the materials.'),
('hero',4,'PRECISION YOU CAN SEE','The finished watch holds still enough to feel tangible.'),
('review-whole-timeline',12,'05 / CHECK THE COMPLETE SEQUENCE','Play the complete edit with the timeline visible. Check the order of the parts and the spacing around the hands. Keep the final pose clear, then save the editable project and its backup.'),
('actual-export',10,'06 / FINISH THROUGH THE STUDIO TIMELINE','Review the local Blender render, then bring the finished animation into Studio. Keep the editable scene backup and export the final edit from the timeline.'),
('closing',8,'CHRONO / MADE IN STUDIO','Build the parts. Choreograph the assembly. Finish with materials and light. Keep every object editable in Studio.')]
}

def call(args): subprocess.run(args,check=True)
def original_score(seconds, identity, rows):
    sr=24000;t=np.arange(round(seconds*sr))/sr;audio=np.zeros((len(t),2),np.float64)
    seed={'aperture':17,'city':23,'chrono':31}[identity];rng=np.random.default_rng(seed)
    notes={'aperture':[55,82.4069,110,146.832],'city':[65.406,98,130.813,164.814],'chrono':[58.27,87.307,116.54,174.614]}[identity]
    # Original quiet electronic score and synchronized assembly cues. It is
    # synthesized sound design, never represented as recorded location audio.
    for i,start in enumerate(np.arange(0,seconds,.5)):
        n=np.arange(min(round(.46*sr),len(t)-round(start*sr)));u=n/sr
        tone=np.sin(2*np.pi*notes[i%4]*u)+.25*np.sin(2*np.pi*notes[i%4]*2*u)
        envelope=np.sin(np.pi*np.minimum(1,u/.018)/2)**2*np.exp(-u*7)
        a=round(start*sr);audio[a:a+len(n),0]+=.07*tone*envelope;audio[a:a+len(n),1]+=.065*tone*envelope
    for row in rows:
        if row['kind']!='result':continue
        a=round((row['start']+min(2.95,row['duration']/2))*sr);n=np.arange(min(round(.42*sr),len(t)-a));u=n/sr
        click=(np.sin(2*np.pi*(180*u+180*u*u))*.22+rng.standard_normal(len(u))*.12)*np.exp(-u*28)
        audio[a:a+len(n),:]+=click[:,None]
    envelope=np.minimum(1,t/1.2)*np.minimum(1,(seconds-t)/1.2)
    audio*=envelope[:,None];return audio,sr

def main():
    identity=sys.argv[1];out=ROOT/identity/'episode';out.mkdir(parents=True,exist_ok=True)
    make_sources='--sources' in sys.argv
    settings=ort.SessionOptions();settings.intra_op_num_threads=1;settings.inter_op_num_threads=1
    model=BASE/'models/kokoro-onnx'
    voice=Kokoro.from_session(ort.InferenceSession(str(model/'kokoro-v1.0.int8.onnx'),sess_options=settings,providers=['CPUExecutionProvider']),str(model/'voices-v1.0.bin'))
    clock=0;rows=[];audio=[];layers=[]
    def title(uid,text,start,duration):return dict(id=uid,name=uid,type='text',text=text,startTime=start,duration=duration,x=50,y=3.4,width=94,scale=.4,rotation=0,opacity=1,color='#ebe9e2',fontWeight=600,textAlign='left',strokeWidth=0,keys=[])
    for index,(name,budget,heading,text) in enumerate(SCRIPTS[identity]):
        wav=out/(name+'.wav');receipt=out/(name+'.speech.json');digest=hashlib.sha256(text.encode()).hexdigest()
        cache=json.loads(receipt.read_text()) if receipt.exists() else None
        if cache and cache['textSha256']==digest: samples,sr=sf.read(wav)
        else:
            samples,sr=voice.create(text,voice='bm_george',speed=1.06,lang='en-gb')
            if len(samples)/sr>budget-.2:
                samples,sr=voice.create(text,voice='bm_george',speed=min(1.18,1.06*(len(samples)/sr)/(budget-.2)),lang='en-gb')
            sf.write(wav,samples,sr,subtype='PCM_16');receipt.write_text(json.dumps(dict(textSha256=digest,voice='bm_george',synthetic=True,cloned=False)))
        actual=len(samples)/sr
        if actual>budget-.1: budget=np.ceil((actual+.3)*24)/24
        kind='result' if name in {'hook','detail','movement','hero','closing'} else 'workspace'
        if kind=='result' and name in {'hook','movement','closing'} and budget>8.05: raise RuntimeError(f'Shorten {name}: speech lasts{actual:.2f}s')
        row=dict(id=name,start=clock,duration=float(budget),heading=heading,speech=text,speechSeconds=actual,kind=kind,file=str(out/f'{index+1:02d}-{name}.mp4'))
        audio.append(np.pad(samples,(0,round(budget*sr)-len(samples))));rows.append(row);layers.append(title(identity+'-'+name,heading,clock,budget));clock+=budget
        print(identity,name,f'{actual:.2f}s speech /{budget:.2f}s shot',flush=True)
    # Last disclosure is a small editable title, not a claim of photographed products.
    layers.append({**title(identity+'-disclosure','Original 3D study · synthetic preset narration · original synthesized score',clock-8,8),'y':96.8,'scale':.23,'textAlign':'center'})
    raw=np.concatenate(audio);sf.write(out/'narration-24k.wav',raw,sr,subtype='PCM_16')
    call(['ffmpeg','-v','error','-y','-i',str(out/'narration-24k.wav'),'-af','loudnorm=I=-17:TP=-2:LRA=7','-ar','48000','-ac','2','-c:a','libmp3lame','-q:a','2',str(out/'narration.mp3')])
    score,rate=original_score(clock,identity,rows);sf.write(out/'original-score.wav',score,rate,subtype='PCM_16')
    call(['ffmpeg','-v','error','-y','-i',str(out/'original-score.wav'),'-ar','48000','-c:a','libmp3lame','-q:a','3',str(out/'original-score.mp3')])
    if make_sources:
        steps={s['id']:s for s in json.loads((ROOT/identity/'teaching-review.json').read_text())['steps']}
        for row in rows:
            if row['kind']=='workspace':
                if row['id']=='actual-export':
                    step=json.loads((ROOT/identity/'core-export'/'export-observation.json').read_text());source=ROOT/identity/'core-export'/'editing-in-studio.mp4'
                else:step=steps[row['id']];source=ROOT/identity/'teaching-in-studio.mp4'
                start=step['start']+.07
                if row['duration']>step['end']-start:raise RuntimeError('Insufficient authentic footage: '+row['id'])
                vf='setpts=PTS-STARTPTS,scale=1496:936,pad=1600:1000:52:64:color=0x0c1020,setsar=1,fps=24'
                cropped=False
            else:
                source=ROOT/identity/'native-core-final.mp4';start=4 if row['id'] in {'detail','hero'} else 0
                if row['id']=='detail':vf='setpts=PTS-STARTPTS,crop=896:504:(iw-896)/2:(ih-504)/2,scale=1600:900,pad=1600:1000:0:50:color=0x0c1020,setsar=1,fps=24';cropped=True
                else:vf='setpts=PTS-STARTPTS,scale=1600:900,pad=1600:1000:0:50:color=0x0c1020,setsar=1,fps=24';cropped=False
            row.update(source=str(source),sourceStart=start,sourceFilter=vf,sourceScreenCropping=False,resultDetailCrop=cropped)
            if not Path(row['file']).exists():call(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(source),'-t',str(row['duration']),'-an','-vf',vf,'-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',row['file']])
            probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=nb_frames','-of','json',row['file']]))['streams'][0]
            assert int(probe['nb_frames'])==round(row['duration']*24),(row['id'],probe,row['duration'])
    (out/'labels.graphics.json').write_text(json.dumps(dict(format='autopromote-graphics',version=1,name=identity+' / chapter labels',width=1600,height=1000,duration=clock,layers=layers,groups=[]),indent=2))
    (out/'lesson-plan.json').write_text(json.dumps(dict(name=identity.upper()+' / real objects, real motion / 20261029',duration=clock,width=1600,height=1000,rows=rows,narration=dict(voice='bm_george',synthetic=True,cloned=False,model='cached local Kokoro int8'),sound=dict(originalSynthesized=True,locationRecording=False),sourceScreenCropping=False,finalNativeAssemblyRequired=True,ownerApproved=False,scheduled=False),indent=2))
    print(identity,'planned',clock,'seconds',flush=True)

if __name__=='__main__':main()
