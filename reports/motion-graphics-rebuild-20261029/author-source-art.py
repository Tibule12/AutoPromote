"""Original source artwork. Motion is authored later through actual Studio controls."""
from pathlib import Path
import json, math, subprocess, shutil

ROOT = Path(__file__).resolve().parent
BASE = ROOT / 'proof'
BASE.mkdir(exist_ok=True)
W, H, D = 720, 1280, 16

def artwork(name, svg, x, y, width, height, start=0, duration=D):
    return dict(id=name.lower().replace(' ', '-'), name=name, type='artwork', svg=svg,
        x=x, y=y, width=width, height=height, startTime=start, duration=duration,
        scale=1, rotation=0, opacity=1, keys=[])

def text(name, copy, x, y, width, scale, color, start=0, duration=D):
    return dict(id=name.lower().replace(' ', '-'), name=name, type='text', text=copy,
        x=x, y=y, width=width, scale=scale, color=color, fontWeight=800,
        textAlign='center', strokeWidth=0, startTime=start, duration=duration,
        rotation=0, opacity=1, keys=[])

def svg(body, width=400, height=400):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{body}</svg>'

def pose(time, x, y, scale=1, rotation=0, opacity=1, easing='ease_out'):
    return dict(time=time, X=x, Y=y, Scale=scale, Rotate=rotation, Opacity=opacity, easing=easing)

def save(story, name, bg, layers, motion, teaching):
    folder = BASE / story
    folder.mkdir(exist_ok=True)
    package = dict(format='autopromote-graphics', version=1, name=name, width=W,
        height=H, duration=D, layers=layers, groups=[])
    (folder/'source-art.graphics.json').write_text(json.dumps(package, indent=2)+'\n')
    (folder/'direction.json').write_text(json.dumps(dict(id=story, name=name,
        projectName=f'{name} / native motion / 20261029', duration=D, background=bg,
        sourceArtworkOnly=True, nativeMotionPoses=motion, teaching=teaching,
        requiresOwnerWatchBeforeScheduling=True, ownerApproved=False,
        visualTruth='Original illustrated sample artwork; two-dimensional native layers, not a 3D simulation.'), indent=2)+'\n')
    subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i',f'color=c={bg}:s=720x1280:r=24:d=16',
        '-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','16','-c:v','libx264',
        '-preset','fast','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',str(folder/'blank-stage.mp4')],check=True)

# ZEST is fictional sample packaging, not a client endorsement or new app identity.
can = svg('''<defs>
<linearGradient id="metal"><stop stop-color="#111A20"/><stop offset=".16" stop-color="#53615D"/><stop offset=".29" stop-color="#17271E"/><stop offset=".7" stop-color="#0F2017"/><stop offset=".88" stop-color="#4B6052"/><stop offset="1" stop-color="#102018"/></linearGradient>
<linearGradient id="silver"><stop stop-color="#50615D"/><stop offset=".35" stop-color="#F4F5D9"/><stop offset=".65" stop-color="#95A18B"/><stop offset="1" stop-color="#364E43"/></linearGradient></defs>
<path d="M43 48Q38 32 52 20Q120 2 188 20Q201 32 197 48L205 455Q201 482 180 488H60Q38 482 35 455Z" fill="url(#metal)"/>
<ellipse cx="120" cy="25" rx="72" ry="18" fill="url(#silver)"/><ellipse cx="120" cy="25" rx="58" ry="12" fill="#B0B99F"/>
<ellipse cx="120" cy="25" rx="29" ry="7" fill="#243E30"/><path d="M109 22H136L143 31H116Z" fill="#D9DDBF"/>
<path d="M47 64L42 450Q52 471 70 470" fill="none" stroke="#BDE06A" stroke-width="3" opacity=".6"/>
<path d="M186 55L193 442" fill="none" stroke="#E8F2B0" stroke-width="2" opacity=".45"/>
<path d="M40 352Q123 290 201 347V427Q121 369 37 431Z" fill="#DDF36B"/>
<path d="M37 389Q125 327 202 383" stroke="#7CA037" stroke-width="5" fill="none"/>
<text x="121" y="173" fill="#F5F5DF" font-family="DejaVu Sans,sans-serif" font-weight="bold" text-anchor="middle" font-size="51">ZEST.</text>
<text x="121" y="211" fill="#CFE96B" font-family="DejaVu Sans,sans-serif" text-anchor="middle" font-size="16" letter-spacing="3">GINGER + LIME</text>
<circle cx="120" cy="273" r="31" fill="none" stroke="#DCEB96" stroke-width="2"/>
<path d="M120 244V302M91 273H149M99 251L142 294M98 294L142 251" stroke="#DCEB96" stroke-width="2"/>
<text x="121" y="454" fill="#E6EBCF" font-family="DejaVu Sans,sans-serif" text-anchor="middle" font-size="11" letter-spacing="2">ILLUSTRATED SAMPLE</text>''',240,500)

lime_body='<circle cx="200" cy="200" r="186" fill="#244B27"/><circle cx="200" cy="200" r="171" fill="#DCEB92"/><circle cx="200" cy="200" r="150" fill="#B9DA50"/>'
for i in range(9):
    a=(i*40+5)*math.pi/180;b=(i*40+35)*math.pi/180
    x1,y1=200+140*math.cos(a),200+140*math.sin(a)
    x2,y2=200+140*math.cos(b),200+140*math.sin(b)
    lime_body+=f'<path d="M200 200L{x1:.2f} {y1:.2f}A140 140 0 0 1 {x2:.2f} {y2:.2f}Z" fill="#DDEC7D"/>'
lime_body+='<circle cx="200" cy="200" r="13" fill="#F2F4BF"/>'
lime=svg(lime_body)
leaf=svg('<path d="M27 342C-7 87 204-37 374 29C404 234 237 408 27 342Z" fill="#184729"/><path d="M47 321L340 63M114 258L89 170M180 198L168 98M244 142L334 160" stroke="#8EBB4C" stroke-width="6" fill="none"/>')
shadow=svg('<defs><radialGradient id="s"><stop stop-color="#193A22" stop-opacity=".28"/><stop offset="1" stop-color="#193A22" stop-opacity="0"/></radialGradient></defs><ellipse cx="200" cy="70" rx="198" ry="65" fill="url(#s)"/>',400,140)
layers=[artwork('Ground shadow',shadow,50,65,55,8),
    artwork('Back lime',lime,30,47,28,15.75),artwork('Leaf',leaf,69,39,24,13.5),
    artwork('Product can',can,49,48,34,35.42),artwork('Front lime',lime,68,58,27,15.19),
    text('Main headline','FRESH.\nBY DESIGN.',46,23,88,1.12,'#14291D'),
    text('Small edition','A STUDY IN LAYERED MOTION',46,14.2,88,.26,'#37532B'),
    text('Sample caption','Illustrated product study / ZEST',46,72,88,.27,'#37532B')]
motion=[dict(layer='Product can',poses=[pose(0,49,76,.55,-22,0),pose(.85,49,47,1.05,-9),pose(1.6,49,48,1,-5),pose(14.8,49,47,1.02,-2)]),
    dict(layer='Back lime',poses=[pose(.15,18,62,.4,-70,0),pose(1.15,30,46,1.06,12),pose(2.0,30,47,1,0),pose(14.8,29,46,1,30)]),
    dict(layer='Leaf',poses=[pose(.35,81,50,.4,45,0),pose(1.35,69,39,1,-10),pose(14.8,70,38,1,5)]),
    dict(layer='Front lime',poses=[pose(.55,83,72,.4,-85,0),pose(1.55,68,57,1.08,15),pose(2.4,68,58,1,0),pose(14.8,68,58,1,-20)]),
    dict(layer='Ground shadow',poses=[pose(0,50,65,.4,0,0),pose(1.6,50,65,1,0,.6),pose(14.8,50,65,1,0,.6)])]
save('product','Layer a product reveal', '0xD9F477',layers,motion,
    ['Import the separate source artwork','Give the can a clear entrance and settle','Offset the rear and front fruit','Animate the headline as one editable title','Play the whole composition and inspect the hold'])

band=svg('''<defs><linearGradient id="m"><stop stop-color="#493A71"/><stop offset=".3" stop-color="#E8E2F9"/><stop offset=".55" stop-color="#8874BB"/><stop offset="1" stop-color="#302347"/></linearGradient></defs>
<path d="M54 326V178C54-10 346-10 346 178V326" fill="none" stroke="#160F26" stroke-width="72"/>
<path d="M54 326V178C54-10 346-10 346 178V326" fill="none" stroke="url(#m)" stroke-width="46"/>
<path d="M76 194C76 16 324 16 324 194" fill="none" stroke="#201830" stroke-width="18"/>''')
cup=svg('''<defs><linearGradient id="m"><stop stop-color="#35294B"/><stop offset=".3" stop-color="#DFD4EB"/><stop offset=".65" stop-color="#685477"/><stop offset="1" stop-color="#20182F"/></linearGradient></defs>
<rect x="76" y="29" width="250" height="343" rx="110" fill="#140E20"/>
<rect x="90" y="39" width="218" height="320" rx="103" fill="url(#m)"/>
<rect x="124" y="69" width="150" height="257" rx="75" fill="#23172F"/>
<path d="M160 101Q119 219 158 295" fill="none" stroke="#ECA5A8" stroke-width="8" opacity=".7"/>
<circle cx="201" cy="198" r="39" fill="none" stroke="#766181" stroke-width="2"/>''')
texture=svg('<defs><radialGradient id="r"><stop stop-color="#FEDBD3"/><stop offset=".35" stop-color="#BD728B"/><stop offset=".72" stop-color="#382248"/><stop offset="1" stop-color="#170F23"/></radialGradient></defs><rect width="400" height="400" fill="url(#r)"/>'+''.join(f'<circle cx="200" cy="200" r="{r}" fill="none" stroke="#E5B9C6" stroke-opacity=".24" stroke-width="2"/>' for r in range(20,190,14)))
disk=svg('<circle cx="200" cy="200" r="200" fill="#EED4BE"/>')
background=svg('<rect width="720" height="1280" fill="#EED4BE"/>',720,1280)
layers=[artwork('Headband',band,49,43,48,27),artwork('Left earcup',cup,34,52,22,17),
    artwork('Right earcup',cup,64,52,22,17),artwork('Listening core',texture,49,49,18,10.125),
    text('Opening headline','HEAR\nTHE SPACE.',46,23,88,1.12,'#F2DECB',duration=8),
    text('Opening label','AN ILLUSTRATED SOUND STUDY',46,69.5,88,.26,'#C2AEBF',duration=8),
    artwork('Second colour field',background,50,50,100,100,start=8,duration=8),
    artwork('Second headband',band,49,43,48,27,start=8,duration=8),
    artwork('Second left earcup',cup,34,52,22,17,start=8,duration=8),
    artwork('Second right earcup',cup,64,52,22,17,start=8,duration=8),
    text('Second headline','SAME FORM.\nNEW FEEL.',46,24,88,1.02,'#36233F',start=8,duration=8),
    artwork('Circular wipe',disk,50,50,70,39.375,start=6,duration=10)]
motion=[dict(layer='Headband',poses=[pose(0,49,29,.75,-12,0),pose(1,49,43,1.04,2),pose(1.8,49,43,1,0),pose(6.3,49,43,1,0)]),
    dict(layer='Left earcup',poses=[pose(.2,17,58,.6,-20,0),pose(1.1,34,52,1.04,3),pose(1.8,34,52,1,0)]),
    dict(layer='Right earcup',poses=[pose(.4,80,58,.6,20,0),pose(1.3,64,52,1.04,-3),pose(2,64,52,1,0)]),
    dict(layer='Listening core',poses=[pose(.8,49,49,.1,0,0),pose(1.8,49,49,1,0),pose(5.5,49,49,1.12,25)]),
    dict(layer='Circular wipe',poses=[pose(6,49,49,.12,0),pose(7.5,50,50,5,0,easing='ease_in_out'),pose(8.0,50,50,5,0),pose(9.4,50,51,.58,0),pose(14.8,50,51,.58,0)])]
save('transition','Make the transition part of the design','0x20152E',layers,motion,
    ['Import the separate headphone artwork','Assemble the headband and earcups with different offsets','Clip the listening texture with an ellipse','Animate the circular matte across the scene change','Inspect the cover frame and new layout'])

logo=BASE/'logo';logo.mkdir(exist_ok=True)
original=Path('/home/tibule12/Projects/AutoPromte/AutoPromote-main-integration-20261013/reports/studio-logo-motion-20261017/assets/AutoPromote-Gradient-Tech-Logo.png')
shutil.copy2(original,logo/'AutoPromote-Gradient-Tech-Logo.png')
subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','color=c=0x0B081B:s=720x1280:r=24:d=14','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','14','-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',str(logo/'blank-stage.mp4')],check=True)
(logo/'direction.json').write_text(json.dumps(dict(id='logo',name='Make the logo assemble from its own pieces',projectName='Logo component choreography / native / 20261029',duration=14,requiresOwnerWatchBeforeScheduling=True,ownerApproved=False,source=original.as_posix(),preserveOriginalLogoPixels=True,bitmapMasksNotInferredVectorContours=True),indent=2)+'\n')
print('Three source studies prepared. No finished motion movie rendered outside Studio.')
