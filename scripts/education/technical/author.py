"""Original static teaching geometry + native Studio graphics interchange.
This script creates NO animated teaching movie. Studio supplies every moving diagram.
"""
import os, json, math, hashlib
from pathlib import Path

R=Path(__file__).resolve().parents[3]
A=R/'frontend/public/education/technical-v1'
W=Path(os.environ.get('TECHNICAL_EDUCATION_WORK','/home/tibule12/.local/share/autopromote-qa/education-technical-20261125/revision2'))
REF=Path(os.environ.get('TECHNICAL_EDUCATION_REFERENCES','/home/tibule12/.local/share/autopromote-qa/education-technical-20261125/references'))
A.mkdir(parents=True,exist_ok=True);W.mkdir(parents=True,exist_ok=True)
D=28
C={'mint':'#8eefd0','blue':'#74bfff','amber':'#ffcc79','ink':'#0c1628','white':'#eff5ff','muted':'#9daec8'}
def write(p,data):p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n' if not isinstance(data,str)else data)
def key(prop,t,v,e='linear'):return {'property':prop,'time':t,'value':round(v,6),'easing':e}
def svg(body,w=1280,h=720):return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>'
def poly(points,fill,stroke='#d9e9ff',width=2):return '<polygon points="'+' '.join(f'{x:.3f},{y:.3f}'for x,y in points)+f'" fill="{fill}" stroke="{stroke}" stroke-width="{width}" stroke-linejoin="round"/>'
def line(x1,y1,x2,y2,color,width=3,dash=''):return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}"'+(f' stroke-dasharray="{dash}"'if dash else'')+'/>'
def circle(x,y,r,fill,stroke='none',width=1):return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>'

class Scene:
 def __init__(self,name):self.name=name;self.layers=[];self.groups=[]
 def text(self,name,text,x,y,size=.7,start=0,dur=D,color=C['white'],width=92):
  # Studio scales the text box with the title; a broad transparent box avoids
  # wrapping short drawing labels at small title scales. Centre anchors remain exact.
  l={'id':name,'name':name,'type':'text','text':text,'x':x/12.8,'y':y/7.2,'width':94,'scale':size,'rotation':0,'opacity':1,'startTime':start,'duration':dur,'fontWeight':600,'textAlign':'center','color':color,'keys':[]};self.layers.append(l);return l
 def art(self,name,body,x=640,y=360,w=1280,h=720,start=0,dur=D,keys=None):
  l={'id':name,'name':name,'type':'artwork','svg':body,'x':x/12.8,'y':y/7.2,'width':w/12.8,'height':h/7.2,'scale':1,'rotation':0,'opacity':1,'startTime':start,'duration':dur,'mediaFit':'contain','keys':keys or[]};self.layers.append(l);return l
 def outline(self,name,x,y,w,h,t,color):
  l={'id':name,'name':name,'type':'artwork','x':x/12.8,'y':y/7.2,'width':w/12.8,'height':h/7.2,'scale':1,'rotation':0,'opacity':1,'startTime':t,'duration':D-t,'mediaFit':'stretch','vectorShape':{'version':1,'closed':True,'nodes':[{'x':x,'y':y,'in':[0,0],'out':[0,0]}for x,y in[(.8,.8),(99.2,.8),(99.2,99.2),(.8,99.2)]],'fill':{'kind':'none','color':'#ffffff','endColor':'#ffffff','start':[0,0],'end':[100,100]},'stroke':{'color':color,'width':.8}},'keys':[key('strokeEnd',t,0),key('strokeEnd',t+.8,100,'ease_in_out')]};self.layers.append(l);return l
 def base(self,subject,title):
  self.text('Pathway marker','AUTOPROMOTE EDUCATION  /  '+subject.upper(),640,30,.35,color=C['mint'])
  self.text('Lesson title',title,640,73,.94)['fontWeight']=800
  self.art('Stage dividers',svg(line(56,119,1224,119,'#25334b',1)+line(56,610,1224,610,'#25334b',1)))
 def callouts(self,items):
  for i,text in enumerate(items):
   t=i*7;l=self.text('Callout '+str(i+1),text,640,660,.68,t,7,C['mint'])
   l['keys']=[key('opacity',t,0),key('opacity',t+.35,1),key('y',t,94),key('y',t+.5,660/7.2,'ease_out')]
 def data(self):return {'format':'autopromote-graphics','version':1,'name':self.name,'width':1280,'height':720,'duration':D,'layers':self.layers,'groups':self.groups}

def definition(id,subject,title,grade,ticket,pages,concept,objectives,voices,assignment,creative,questions,criteria,limits):
 return {'id':id,'subject':subject,'title':title,'grade':grade,'releaseStatus':'private-review','duration':D,'reference':{'title':'DBE CAPS Grades 10–12 — '+subject,'url':'https://www.education.gov.za/LinkClick.aspx?fileticket='+ticket+'&forcedownload=true&mid=1558&portalid=0&tabid=570','pdfPages':pages,'note':'Teacher must confirm the current annual teaching plan and specialisation. Page numbers count the PDF cover.'},'concept':concept,'objectives':objectives,'voices':voices,'technicalExercise':assignment,'creativeExercise':creative,'questions':questions,'criteria':criteria,'limits':limits,'evidence':{'teacherFeedbackReceived':False,'independentLearnerRecreation':False,'schoolHardwareTrial':False,'publicRelease':False}}

lessons=[];scenes={}

# EGD: a single stepped solid, not a perspective photograph or an inferred 3D mesh.
l=definition('egd-drawing-views','Engineering Graphics and Design','One object. Three connected views.','Grade 10 introduction; Grades 11–12 revision','pqcxCwUTO98%3D',[18,22],
 'The same stepped solid has width 80, depth 50 and maximum height 40 model units; its lower step is 20 high and its tall portion 30 wide. Third-angle arrangement places the top above the front, and the right-side view to the right. The isometric picture shows appearance; the orthographic views preserve face dimensions.',
 ['Match visible edges of a stepped isometric object to its front, top and right-side views.','Distinguish pictorial appearance from dimension-preserving orthographic views.','Explain and use the stated third-angle layout.','Animate native outlines and matching colours to communicate corresponding views.'],
 ['One stepped object. The isometric picture shows its shape. The front view shows its stepped height.','The top view shows width and depth. Its internal line marks where the height changes.','The right-side view shows depth and height. The horizontal edge separates the two levels.','This is third-angle projection: top above front, right-side on the right. Match every view to the same object.'],
 'Sketch the three views of this solid before replaying. Then change width to 100 and the tall portion to 40, keeping depth 50, overall height 40 and step height 20. Draw all three updated views; explain which edges move. Teacher checks the drawing before animation.',
 'Use the original separate SVG views. Import or replace each through normal Studio Graphics/media controls. Apply blue/front, mint/top and amber/right-side consistently. Build a native draw-on outline for one view using Stroke end 0→100 over 0.8s. Keep third-angle layout. Submit the native project, exact key table and a complete explanation.',
 [['Where does the top view go in this stated convention?','Above the front view. This lesson explicitly uses third-angle projection.'],['Why is there a line at x=30 in the top view?','It marks the visible change from the tall portion to the lower step; it is not a separate slot.'],['What width does the right-side view show?','The depth, 50 model units; its height is 40. The front view width is 80.']],
 ['Correct front, top and right-side geometry and matching dimensions (6).','State third-angle convention and align the views correctly (4).','Explain a new dimension change without relying on colour alone (4).','Accurate native outline timing, readable labels and safe placement (3).','Editable Studio reconstruction and justified technique choices (3).'],
 'Prepared original static isometric/orthographic SVG assets, not Studio CAD, automatic projection, an engineered working drawing or a rendered 3D scene. Model units are explanatory; no manufacturing dimensions or SANS compliance certification is claimed.')
s=Scene(l['title']);s.base('EGD',l['title'])
P=lambda x,y,z:(270+(x-y)*2.1*math.cos(math.pi/6),350+(x+y)*1.05-z*2.1)
iso=''
# Visible surfaces in painter order; both top levels and the vertical step are present.
iso+=poly([P(0,0,40),P(30,0,40),P(30,50,40),P(0,50,40)],'#419d8c')
iso+=poly([P(30,0,20),P(80,0,20),P(80,50,20),P(30,50,20)],'#7be2c4')
iso+=poly([P(30,0,20),P(30,50,20),P(30,50,40),P(30,0,40)],'#b88842')
iso+=poly([P(80,0,0),P(80,50,0),P(80,50,20),P(80,0,20)],'#d5a663')
iso+=poly([P(0,50,0),P(80,50,0),P(80,50,20),P(30,50,20),P(30,50,40),P(0,50,40)],'#588fc4')
s.art('Isometric object',svg(iso));s.text('Isometric label','ISOMETRIC',295,520,.55,color=C['muted'],width=34)
front=poly([(600,500),(840,500),(840,440),(690,440),(690,380),(600,380)],'#23486c',C['blue'],3)
top=poly([(600,175),(840,175),(840,325),(600,325)],'#1b4b41',C['mint'],3)+line(690,175,690,325,C['mint'],3)
side=poly([(900,380),(1050,380),(1050,500),(900,500)],'#57452b',C['amber'],3)+line(900,440,1050,440,C['amber'],3)
s.art('Front view',svg(front));s.art('Top view',svg(top));s.art('Right-side view',svg(side))
guides=line(600,331,600,372,'#41536e',1,'4 6')+line(840,331,840,432,'#41536e',1,'4 6')+line(846,380,895,380,'#41536e',1,'4 6')+line(846,500,895,500,'#41536e',1,'4 6')
s.art('Projection alignment guides',svg(guides));s.text('Front label','FRONT  ·  80 × 40',720,542,.51,color=C['blue'],width=32);s.text('Top label','TOP  ·  80 × 50',720,148,.51,color=C['mint'],width=32);s.text('Side label','RIGHT SIDE  ·  50 × 40',975,542,.47,color=C['amber'],width=30)
s.text('Convention','THIRD-ANGLE LAYOUT',295,565,.44,color=C['muted'],width=35)
s.outline('Front focus',720,440,264,144,2,C['blue']);s.outline('Top focus',720,250,264,174,8,C['mint']);s.outline('Side focus',975,440,174,144,15,C['amber'])
s.callouts(['Front: width and stepped height','Top: width and depth','Right side: depth and height','Third angle: top above · right side to the right'])
l['demoControl']={'target':'Front focus','property':'strokeEnd','time':2.8,'value':100,'starterValue':55,'secondTarget':'Top focus','secondProperty':'strokeEnd','secondTime':8.8,'secondValue':100,'reason':'Draw attention to a corresponding view without moving or distorting its technical geometry.'};lessons.append(l);scenes[l['id']]=s

# Gears: original 20° full-depth involute silhouettes. Module is drawing pixels.
def gear(z,module,color,phase=0):
 rp=module*z/2;rb=rp*math.cos(math.radians(20));ra=rp+module;rr=rp-1.25*module
 inv=lambda r:math.sqrt(max(0,(r/rb)**2-1))-math.acos(min(1,rb/r)) if r>=rb else 0
 half=lambda r:math.pi/(2*z)+inv(rp)-inv(r)
 points=[]
 for tooth in range(z):
  a=phase+tooth*2*math.pi/z
  for r,ang in [(rr,a-half(rr))]+[(rb+(ra-rb)*i/10,a-half(rb+(ra-rb)*i/10))for i in range(11)]+[(ra,a+half(ra))]+[(rb+(ra-rb)*i/10,a+half(rb+(ra-rb)*i/10))for i in range(10,-1,-1)]+[(rr,a+half(rr)),(rr,a+2*math.pi/z-half(rr))]:
   points.append((ra+3+r*math.cos(ang),ra+3+r*math.sin(ang)))
 size=(ra+3)*2;cx=cy=ra+3
 body=poly(points,color,'#d8e8f5',1.2)+circle(cx,cy,rp*.48,C['ink'],'#6c8199',1)+circle(cx,cy,7,'#eff5ff')+circle(cx+rp*.7,cy,6,'#ff3366'if z==20 else'#30ff70')
 body+=f'<circle cx="{cx}" cy="{cy}" r="{rp}" fill="none" stroke="#cce1f7" stroke-width=".6" stroke-dasharray="3 6" opacity=".5"/>'
 return svg(body,size,size),size
l=definition('mechanical-gears','Mechanical Technology','Two gears. One clear ratio.','Grade 10 systems and control; Grades 11–12 extension','Pu7gZywTv48%3D',[28,34,37],
 'Two external spur gears have equal module and pressure angle, with 20 driver teeth and 40 driven teeth. Pitch radii are 72 and 144 drawing pixels, fixed centre distance 216. For ideal rolling at the pitch circles, n₁z₁=n₂z₂ and θ₂=−θ₁/2 plus the initial tooth phase. The larger gear turns in the opposite direction at half the speed. A reduction transmits power and ideally increases torque; losses reduce output power.',
 ['Identify driver and driven gear.','Use tooth counts to calculate a 2:1 speed reduction.','Predict opposite directions for two external gears.','Relate reduced speed and increased ideal torque without claiming energy creation.','Build constant-rate native rotation using linear keys and fixed centres.'],
 ['The small gear is the driver: twenty teeth. It transfers motion through the meshing teeth.','The driven gear has forty teeth. It rotates in the opposite direction. Watch the coloured index dots.','Forty divided by twenty is two. One driver turn produces half a driven turn: half the rotational speed.','Gears transmit mechanical power. Ideally, lower speed gives higher torque. Real friction causes losses; power is not created.'],
 'Predict direction and turns for a 20-tooth driver and 40-tooth driven gear. Calculate output speed for 120 revolutions per minute input. Then consider a 30-tooth driven gear: state the new ratio, direction, output speed and required pitch-centre distance for drawing module 7.2 pixels.',
 'Recreate the two supplied original gear SVGs as separate native image layers. Set centres to (470,350) and (686,350) pixels; preserve dimensions and aspect. Use the key table to complete one full driver turn and half an opposite driven turn over 20 seconds. Do not ease constant-speed rotation. Explain why independent arbitrary spins would mislead a learner.',
 [['If the driver turns clockwise, what does the driven gear do?','Counterclockwise, because these are two external gears in direct mesh.'],['What is the output speed for a 120 rpm input?','60 rpm, since 120 × 20 / 40 = 60.'],['Does twice the ideal torque create extra power?','No. Ideal power is torque × angular speed: doubling torque while halving speed preserves power. Friction reduces actual output.'],['For a 30-tooth driven gear at drawing module 7.2, what changes?','Output is 80 rpm for 120 rpm input, ratio 1.5:1, opposite direction. Pitch radii 72 and 108 give centre distance 180 drawing pixels. New geometry and initial mesh phase are required.']],
 ['Identify driver/driven and justify opposing direction (4).','Correct ratio, turn counts and 120→60 rpm calculation (6).','Explain ideal power/torque and real losses (4).','Maintain native fixed centres, correct tooth phase and linear rates (3).','Recreate/edit the project and explain a new gear pair (3).'],
 'Illustrative planar kinematics using prepared original 20° involute SVG contours. Native Studio supplies layer rotation, not gear simulation, contact forces, material stress or manufacturing CAD. Root transitions are simplified, not a cutter/fabrication profile. Drawing pixels are not engineering module in millimetres. Physical angular speed is deliberately slowed for teaching; no real motor is simulated.')
s=Scene(l['title']);s.base('Mechanical technology',l['title'])
for name,z,cx,col,phase,angles in [('Driver gear',20,470,C['blue'],0,[-180,-90,0,90,180]),('Driven gear',40,686,C['mint'],math.pi/40,[90,45,0,-45,-90])]:
 body,size=gear(z,7.2,col,phase);s.art(name,body,cx,350,size,size,keys=[key('rotation',t,v)for t,v in zip([4,9,14,19,24],angles)])
s.text('Driver label','DRIVER  /  20 TEETH',395,555,.57,color=C['blue'],width=38)
s.text('Driven label','DRIVEN  /  40 TEETH',805,555,.57,color=C['mint'],width=38)
s.text('Ratio badge','2 : 1',1080,302,1.22,color=C['amber'],width=20)
s.text('Ratio explanation','SPEED REDUCTION',1080,350,.4,color=C['muted'],width=22)
s.text('Turn relation','1 turn → ½ turn',1080,391,.49,width=22)
s.text('Motion note','FIXED CENTRES  /  CONSTANT RATE',640,157,.38,color=C['muted'])
s.callouts(['Driver → tooth contact → driven','External gears turn in opposite directions','40 ÷ 20 = 2  ·  driven speed = driver speed ÷ 2','Power is transmitted, not created'])
l['demoControl']={'target':'Driver gear','property':'rotation','time':24,'value':180,'starterValue':90,'secondTarget':'Driven gear','secondProperty':'rotation','secondTime':24,'secondValue':-90,'reason':'A complete 360° driver interval corresponds to an opposite 180° driven interval. Linear interpolation preserves the fixed ratio.'};lessons.append(l);scenes[l['id']]=s

# Electrical: no current marker crosses the open switch; no marker goes inside source.
l=definition('electrical-simple-circuit','Electrical Technology','Close the path. Light the load.','Grade 10 basic principles; Grades 11–12 revision','D5mc22RBvDA%3D',[11,23,26],
 'A low-voltage DC source supplies potential difference; conductors, a switch and a suitable lamp form a series path. Opening the switch breaks the path and the lamp is off. Closing it completes the path and permits current. Conventional current is shown through the external circuit from positive to negative; this is distinct from electron drift in metal. Moving indicators communicate direction, not measured current or the speed of electrons.',
 ['Identify source, conductor, switch and load in a simple DC schematic.','Predict lamp state for open and closed paths.','Trace conventional current through the external circuit from positive to negative.','Distinguish an illustrative animation from an electrical calculation or simulation.','Coordinate switch rotation, lamp opacity and current-marker position keys.'],
 ['A three-volt source, conductors, a switch and a lamp form a simple circuit. The open switch breaks the path.','Close the switch. The conducting path is complete, so the lamp can light.','The moving indicators show conventional current: from positive, through the external circuit, back to negative. They are not electrons.','Open the switch again: the lamp goes off. This is an illustration, not a simulation. Practical work needs teacher supervision.'],
 'Draw and label the source, switch, conductors and lamp. Predict lamp state before and after closing the switch. Trace conventional current only in the external circuit. Explain why the animation does not measure current, voltage, electron speed or lamp suitability. No physical wiring is required.',
 'Use separate native switch, lamp-light and indicator layers. Close the switch from −35° to 0° at 8.5–9.5s, switch the light on only at closure, and keep indicators inside 10–24s. Open at 24–25s and switch off as contact is broken. Add an original label that distinguishes conventional current from electrons.',
 [['Why is the lamp off with the switch open?','The conducting loop is interrupted. In this elementary ideal DC illustration, no steady current flows through the lamp.'],['Which way is conventional current shown?','From the positive terminal through the external circuit and load to the negative terminal. Electron drift in metal is opposite.'],['Do the moving dots measure current or electron speed?','No. Their speed and spacing are visual teaching choices. A simulation or measurement would require a circuit model and component values.']],
 ['Correct component identification and open/closed reasoning (6).','Correct conventional current direction and distinction from electrons (6).','Clear simulation/supervision limits (2).','Switch/light/marker timings remain causally consistent (3).','Editable project, exact native controls and justified visual choices (3).'],
 'Illustrative low-voltage DC schematic, not an electrical solver or practical wiring plan. 3V is an example source label; component ratings/current are not calculated. No mains activity or unsupervised workshop task. Any real practical must use teacher-approved components and direct supervision.')
s=Scene(l['title']);s.base('Electrical technology',l['title'])
wire=line(240,280,240,200,C['blue'],5)+line(240,200,500,200,C['blue'],5)+line(620,200,900,200,C['blue'],5)+line(900,200,900,310,C['blue'],5)+line(900,390,900,520,C['blue'],5)+line(900,520,240,520,C['blue'],5)+line(240,520,240,420,C['blue'],5)
battery=line(240,280,240,316,C['white'],4)+line(204,316,276,316,C['white'],5)+line(219,332,261,332,C['white'],5)+line(240,332,240,360,C['white'],4)+line(204,360,276,360,C['white'],5)+line(219,377,261,377,C['white'],5)+line(240,377,240,420,C['white'],4)
lamp=circle(900,350,40,'none',C['white'],4)+line(872,322,928,378,C['white'],3)+line(872,378,928,322,C['white'],3)
s.art('Conductors and symbols',svg(wire+battery+lamp+circle(500,200,6,C['white'])+circle(620,200,6,C['white'])))
lever=svg(line(140,140,260,140,C['amber'],6)+circle(140,140,7,C['amber']),280,280)
s.art('Switch lever',lever,500,200,280,280,keys=[key('rotation',0,-35),key('rotation',8.5,-35),key('rotation',9.5,0),key('rotation',24,0),key('rotation',25,-35)])
glow=svg('<defs><radialGradient id="light"><stop stop-color="#ffdf86" stop-opacity=".7"/><stop offset="1" stop-color="#ffdf86" stop-opacity="0"/></radialGradient></defs>'+circle(64,64,64,'url(#light)'),128,128)
s.art('Lamp light',glow,900,350,160,160,keys=[key('opacity',0,0),key('opacity',9.49,0),key('opacity',9.5,1,'hold'),key('opacity',24,1),key('opacity',24.05,0,'hold')])
s.text('Source label','3 V DC SOURCE',239,569,.5,width=28);s.text('Positive terminal','+',293,287,.65,color=C['amber'],width=7);s.text('Negative terminal','−',293,420,.65,color=C['blue'],width=7)
s.text('Switch label','SWITCH',572,147,.5,width=30);s.text('Load label','LAMP / LOAD',1036,350,.5,width=25)
s.text('Flow note','ILLUSTRATIVE CONVENTIONAL CURRENT',640,578,.39,color=C['muted'])
path=[(240,280),(240,200),(500,200),(620,200),(900,200),(900,350),(900,520),(240,520),(240,420)]
length=sum(math.dist(a,b)for a,b in zip(path,path[1:]));elapsed=0;keys=[]
for i,(x,y)in enumerate(path):
 if i:elapsed+=math.dist(path[i-1],path[i])
 t=10+13*elapsed/length;keys.extend([key('x',t,x/12.8),key('y',t,y/7.2)])
keys.extend([key('opacity',10,1),key('opacity',23.05,0,'hold')])
s.art('Conventional current marker',svg(circle(12,12,9,'#ffcf53'),24,24),240,280,24,24,10,13.1,keys)
s.text('Open state','OPEN PATH  /  LAMP OFF',640,468,.58,0,8.5,C['amber'],width=60)
s.text('Closed state','CLOSED PATH  /  LAMP ON',640,468,.58,9.5,14.5,C['mint'],width=60)
s.text('Open again','OPEN AGAIN  /  LAMP OFF',640,468,.58,25,3,C['amber'],width=60)
s.callouts(['Open switch: the path is broken','Closed switch: a complete conducting path','Conventional current: external + → −','Illustration only · practical work needs supervision'])
l['demoControl']={'target':'Switch lever','property':'rotation','time':9.5,'value':0,'starterValue':-15,'secondTarget':'Lamp light','secondProperty':'opacity','secondTime':9.5,'secondValue':1,'reason':'The switch must actually touch the contact before the load is shown as on. The marker communicates direction only.'};lessons.append(l);scenes[l['id']]=s

# Civil: continuous cropped elevation; boundary fragments are not specified half-bats.
l=definition('civil-brick-sequence','Civil Technology','Build the bond, course by course.','Grade 10 Construction specialisation; Grades 11–12 revision','-ObkWQR3PVo%3D',[47,49,56,58],
 'A cropped front elevation illustrates four stretcher-bond courses. Bed joints separate courses horizontally; vertical perp joints separate adjacent bricks. Alternate courses are offset by half the brick-plus-joint module so their vertical joints do not align. The wall continues beyond both cropped edges. A prepared base and a schematic damp-proof course are contextual layers, not a foundation or waterproofing specification.',
 ['Identify courses, horizontal bed joints and vertical perp joints.','Explain the half-module stagger in stretcher bond.','Sequence the courses from the prepared support upward.','Distinguish a cropped elevation from an end/corner construction detail.','Use native layers, group masking and eased vertical/opacity keys to reveal a sequence.'],
 ['Start at the prepared support. The dark strip marks a schematic damp-proof course. This is a cropped elevation.','Lay the first stretcher course in the illustration. Mortar forms horizontal bed joints and vertical perp joints.','Offset the next course by half a module. The vertical joints are staggered rather than stacked.','Continue upward, checking the illustrated level and plumb guides. The wall extends beyond the crop. Real construction needs supervised practical training.'],
 'Draw a three-course cropped stretcher-bond elevation. Mark a bed joint and a perp joint, and explain why alternate joints are staggered. Predict which next-course pattern follows. Explain why cropped edge fragments do not specify cut-brick sizes, corner bonding, foundations or safe construction.',
 'Import the four original course assets as separate ordinary image layers. Offset alternate patterns by 80 drawing pixels for the 160-pixel module. Use a native group polygon mask to crop the continuous wall. Reveal courses from bottom to top with Y and opacity keys; add native level/plumb annotations without claiming a site measurement.',
 [['What is a bed joint?','The horizontal mortar joint between courses. A perp joint is vertical between neighbouring bricks.'],['How far is the pattern offset?','Half the brick-plus-joint module: 80 drawing pixels for this 160-pixel module. These are illustration units, not a site dimension specification.'],['Are the cropped end fragments instructions for half-brick cuts?','No. They show a wall continuing beyond the displayed crop. End/corner details and actual cutting/bonding require the teacher’s technical drawing and supervised instruction.']],
 ['Correctly label courses, bed joints and perp joints (6).','Predict alternating half-module stagger and explain its purpose (6).','State crop/base/DPC and practical limits (2).','Correct native layer order, mask and course timings (3).','Recreate an editable sequence and justify the motion/annotation choices (3).'],
 'Supplementary front-elevation illustration, not structural design, a construction method statement or an alternative to supervised workshop training. No real dimensions, mortar mix, load capacity, foundation specification or DPC installation detail is supplied. The colour strip only identifies a contextual DPC layer. Cropped fragments continue outside the frame.')
s=Scene(l['title']);s.base('Civil technology',l['title'])
s.art('Prepared support',svg('<rect x="238" y="560" width="814" height="27" rx="3" fill="#526176"/>'))
s.art('Schematic DPC',svg('<rect x="250" y="550" width="790" height="8" fill="#131c30" stroke="#8c9bb3" stroke-width="1"/>'))
s.text('Support note','PREPARED SUPPORT + SCHEMATIC DPC',640,183,.44,color=C['muted'])
ids=[]
for row in range(4):
 body='<rect width="1120" height="60" fill="#bac1ca"/>'
 offset=0 if row%2==0 else -80
 for x in range(-160,1280,160):
  xx=x+offset
  body+=f'<rect x="{xx}" y="0" width="150" height="52" fill="'+('#be6e4b'if row%2==0 else'#d18a63')+'" stroke="#e7a67d" stroke-width="1"/>'
  body+=line(xx+8,8,xx+140,8,'#e6a27d',1)
 t=3+row*5;cy=520-row*60;name='Course '+str(row+1)
 s.art(name,svg(body,1120,60),810,cy,1120,60,t,D-t,[key('y',t,(cy-24)/7.2),key('y',t+.9,cy/7.2,'ease_out'),key('opacity',t,0),key('opacity',t+.5,1,'ease_out')]);ids.append(name)
 s.text('Course label '+str(row+1),'0'+str(row+1),190,cy,.5,t,D-t,C['muted'],width=9)
# Keep group children contiguous: labels follow courses in leaf ordering.
course_layers=[x for x in s.layers if x['id']in ids];s.layers=[x for x in s.layers if x['id']not in ids]+course_layers
s.groups.append({'id':'Wall crop','name':'Wall crop','layerIds':ids,'startTime':0,'duration':D,'mask':{'enabled':True,'shape':'polygon','path':'polygon(19.53125% 38%, 81.25% 38%, 81.25% 76.388889%, 19.53125% 76.388889%)','feather':0,'inverted':False},'keys':[]})
s.outline('Bed joint annotation',640,485,770,11,14,C['mint']);s.text('Bed joint label','BED JOINT',1126,485,.42,14,14,C['mint'],width=17)
s.outline('Perp joint annotation',405,516,14,45,10,C['amber']);s.text('Perp joint label','PERP JOINT',1126,530,.42,10,18,C['amber'],width=17)
guide=svg(line(245,302,245,555,C['blue'],2,'5 5')+line(245,302,1047,302,C['blue'],2,'5 5'))
s.art('Level and plumb guides',guide,start=21,dur=7,keys=[key('opacity',21,0),key('opacity',21.7,1)])
s.text('Crop note','CROPPED ELEVATION  /  WALL CONTINUES AT BOTH EDGES',640,229,.41,color=C['muted'])
s.callouts(['Prepared support and schematic damp-proof course','Bed joints + perp joints','Alternate courses: half-module offset','Level + plumb guides · supervised practicals remain essential'])
l['demoControl']={'target':'Course 2','property':'y','time':8.9,'value':460/7.2,'starterValue':(460-20)/7.2,'secondTarget':'Wall crop','secondProperty':None,'reason':'The course settles onto the previous bed joint. The shared native polygon mask clips a continuing wall, rather than inventing end-brick sizes.'};lessons.append(l);scenes[l['id']]=s

for number,l in enumerate(lessons,1):
 l['number']=number;d=A/l['id'];d.mkdir(exist_ok=True);s=scenes[l['id']];full=s.data();starter=json.loads(json.dumps(full));control=l['demoControl']
 target=next(x for x in starter['layers']if x['name']==control['target'])
 target_key=next(x for x in target['keys']if x['property']==control['property'] and abs(x['time']-control['time'])<.001);target_key['value']=control['starterValue']
 write(d/'lesson.graphics.json',full);write(d/'starter.graphics.json',starter)
 originals=d/'original-assets';originals.mkdir(exist_ok=True)
 for layer in full['layers']:
  if layer.get('svg'):write(originals/(layer['id'].replace(' ','-').lower()+'.svg'),layer['svg'])
  static=json.loads(json.dumps(layer));static.update({'startTime':0,'duration':D,'keys':[]})
  write(originals/(layer['id'].replace(' ','-').lower()+'.graphics.json'),{'format':'autopromote-graphics','version':1,'name':layer['name']+' — original static layer','width':1280,'height':720,'duration':D,'layers':[static],'groups':[]})
 l['layerReference']=full['layers'];l['groupReference']=full['groups'];l['graphics']={'layers':len(full['layers']),'keys':sum(len(x['keys'])for x in full['layers'])}
 pdf=REF/(['egd','mechanical','electrical','civil'][number-1]+'.pdf');l['reference']['sha256']=hashlib.sha256(pdf.read_bytes()).hexdigest()
 l['studioSteps']=[
 {'title':'Upload the original stage','control':'Workspace → Viral Clip Studio → Choose videos → Open Creator Studio','value':'source.mp4 · 1280×720 · 28 seconds · original offline synthetic narration','why':'The source is a plain stage with sound. It contains no animated teaching diagrams.'},
 {'title':'Keep the whole composition visible','control':'After → Preview quality; Reframe; View options; Sound; Captions','value':'Full; 16:9; Show Everyone; Fit full; main frame off; Rounded off; keep original audio; voice repair off; captions off','why':'Preserve precise drawing relationships and a stable full-frame lesson.'},
 {'title':'Import the editable scaffold','control':'Graphics → Import animated graphics → Import graphics composition…','value':'starter.graphics.json; native text, artwork, masks and motion keys','why':'Static original SVGs become ordinary editable image layers. Existing keys use the canonical Studio animation graph; they are not an external movie.'},
 {'title':'Complete the key deliberately','control':'Motion → Transform keyframes → Target layer → Motion value curve editor → Curve keyframe → Selected motion key value','value':control['target']+'; '+control['property']+' at '+str(control['time'])+'s = '+str(round(control['value'],6))+'; easing '+('linear'if number in[2,3]else'ease_out'if number==4 else'ease_in_out'),'why':control['reason']},
 {'title':'Inspect the matching layer or group','control':'Motion → Target layer; Layer geometry & timing; Graphics → Groups where applicable','value':control['secondTarget']+'; see the full layer/group table below','why':'Check the relationship between layers, rather than judging one moving part in isolation.'},
 {'title':'Add your own annotation','control':'Graphics → Add title layer → Label; Copy; title time/size; Motion → Transform keyframes → Target layer = Predict first → X/Y','value':'Practice label: Predict first; start 24s; duration 4s; size .55; width 60%; explicitly select Predict first in Target layer; X50 Y84. Remove the practice label before final save.','why':'Graphics selection and the Motion target are separate. Confirm the new text target before changing X/Y, so the technical drawing layers remain fixed.'},
 {'title':'Save, export and reopen','control':'Show media → Project name → Save; Export → Render Final Clip; Show Finished Video; saved project','value':'Unique project name; 720p; 24 fps; original audio; normal local CPU render/download; complete 28s playback; cold reopen','why':'The actual authored graph must supply the final result and restore through normal Studio controls.'}]
 write(d/'LEARNER-NOTES.txt',l['concept']+'\n\n'+l['limits']+'\n')
 write(d/'STUDENT-EXERCISES.txt','TECHNICAL EXERCISE\n'+l['technicalExercise']+'\n\nCREATIVE EDITING EXERCISE\n'+l['creativeExercise']+'\n\nSubmit predictions/reasoning, original assets, editable Studio project, exact keys and complete movie. The starter deliberately contains one incomplete value; correct it using the lesson.\n')
 write(d/'TEACHER-ASSESSMENT.txt','SUPPLEMENTARY PRIVATE TEACHER REVIEW — NOT CAPS APPROVED\n'+l['title']+'\n'+l['grade']+'\n\nOBJECTIVES\n'+'\n'.join(l['objectives'])+'\n\nDRAFT RUBRIC /20\n'+'\n'.join(l['criteria'])+'\n\nREASONING GUIDE\n'+'\n\n'.join(q+'\n'+a for q,a in l['questions'])+'\n\nLIMITS\n'+l['limits']+'\n\nREFERENCE\n'+l['reference']['title']+'; PDF pages '+', '.join(map(str,l['reference']['pdfPages']))+'\n'+l['reference']['url']+'\n\nTeacher confirms current ATP, specialisation, terminology and suitability before learner use. No teacher endorsement or learning-speed claim is made.\n')
 write(d/'TEACHER-REVIEW-CHECKLIST.txt','PRIVATE PROFESSIONAL REVIEW\n[ ] Technical geometry/relationships correct\n[ ] Grade/specialisation and current ATP appropriate\n[ ] Prediction questions reveal understanding\n[ ] Labels clear at 720p and on projector\n[ ] Spoken instruction matches real control action\n[ ] Learner can locate controls using the visible tool and path label\n[ ] Exact values can be recreated in a fresh authorised project\n[ ] Animation helps explain a new example, not just copy clicks\n[ ] School computer/browser can decode, seek and edit adequately\n[ ] Offline pack useful within available bandwidth\n[ ] Technical/practical boundaries understood\n[ ] Changes required before approval documented\n\nAll external teacher review, independent learner recreation and actual school hardware trials remain pending. Do not provide child names or records.\n')
 write(d/'SOURCE-PROVENANCE.txt','Original mathematical/static SVG artwork prepared with author.py; disclosed asset preparation. source.mp4 contains only a plain stage and offline synthetic narration. Native Studio imports/rasterises the static SVGs, positions ordinary layers, evaluates keys/masks and renders the final film. No externally rendered finished animation is substituted. Native vector outlines and editable text remain distinct from rasterised SVG geometry.\n'+l['limits']+'\n')
 write(d/'STUDIO-RECIPE.txt','AUTOPROMOTE EDUCATION — '+l['title']+'\n\n'+'\n\n'.join(str(i+1)+'. '+x['title']+'\n'+x['control']+'\n'+x['value']+'\n'+x['why']for i,x in enumerate(l['studioSteps']))+'\n\nFULL NATIVE COMPOSITION\nPositions/sizes in canvas percent. Times in programme seconds on 90kHz clock. Easing applies on arrival. Canvas1280×720,28seconds. Original static SVG coordinate systems use drawing pixels.\n'+json.dumps(full,ensure_ascii=False,indent=2)+'\n')
write(W/'catalog.json',{'version':1,'scope':['IT','CAT','Technical Education'],'reviewStatus':'private-teacher-review','publicRelease':False,'lessons':lessons})
write(A/'catalog.json',json.loads((W/'catalog.json').read_text()))
write(R/'frontend/src/education/technicalCatalog.json',json.loads((W/'catalog.json').read_text()))
write(A/'PERMISSIONS.txt','Original AutoPromote supplementary teaching assets. Teachers and students may copy, adapt and redistribute these original examples for non-commercial educational review/practice with attribution. Do not imply official DBE/CAPS endorsement. Official CAPS documents remain DBE material and are linked rather than repackaged. Synthetic narration is disclosed. This package grants no school enrolment, minor onboarding or paid processing authorisation. Normal Studio account rights and processing costs apply. No physical workshop activity is assigned.\n')
write(A/'REVIEW-BRIEF.txt','AUTOPROMOTE EDUCATION — TECHNICAL SCHOOL REVIEW\nThree pathways only: IT, CAT, Technical Education (EGD, Mechanical, Electrical, Civil). Existing IT/CAT work is preserved. The founder reports initial staff interest at his former technical high school in Cofimvaba, Eastern Cape. No school, staff or principal endorsement/partnership is claimed.\n\nPurpose: let adults assess remote supplementary visual explanations, native Studio demonstrations, independent concept questions and editing assignments before a school pilot. Not a replacement for official curriculum, CAD/technical drawing, engineering simulation or supervised workshop instruction.\n\nPlease review one finished concept film, then its actual control tutorial and exact recipe. Try a prediction question before viewing the reasoning guide. Recreate the scaffold in an authorised account, then change the technical example. Record technical corrections, pacing/readability, hardware/bandwidth constraints and evidence of learning. No learner names or records are needed. Review is not approval. No new enrolment or production deployment is enabled.\n')
print('Prepared four original static-asset/native-interchange lesson packages. No finished animated video is claimed yet.')
