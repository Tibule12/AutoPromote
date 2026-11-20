import base64, csv, hashlib, html, io, json, math, re, shutil, subprocess, textwrap
from pathlib import Path
from xml.sax.saxutils import escape

import pymupdf as fitz, qrcode
from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, KeepTogether, Table, TableStyle, Image as FlowImage
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
OUT=Path('/home/tibule12/Documents/AutoPromote — Africa Tech Festival 2026')
ASSETS=OUT/'assets';ASSETS.mkdir(parents=True,exist_ok=True)
D=json.loads((HERE/'content.json').read_text())
NAVY='#0B1020';INK='#14203B';PURPLE='#773DFF';CYAN='#24D2E0';MUTED='#AAB6D3';LIGHT='#F1F4FB'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
pdfmetrics.registerFont(TTFont('AP',FONT));pdfmetrics.registerFont(TTFont('APB',BOLD))

VIDEOS=Path('/home/tibule12/Videos')
SELECTION=[
 {'name':'House of Rhythm — before and after','path':VIDEOS/'Studio - House of Rhythm - 2026-11-14/House of Rhythm - Before and After.mp4','label':'Photographic architecture motion • source dance @luluthop','start':0,'end':8},
 {'name':'AISLE RIFT','path':VIDEOS/'AutoPromote - AISLE RIFT - 2026-11-14/AISLE RIFT - AutoPromote Studio.mp4','label':'Existing Studio film • selected from Videos','start':0,'end':59.5},
 {'name':'Glass Current','path':VIDEOS/'Studio - Glass Current - 2026-11-08/Glass Current.mp4','label':'Optical composition • animated masks and fragments','start':0,'end':16},
 {'name':'Glass Current — actual Studio controls','path':VIDEOS/'Studio - Glass Current - 2026-11-08/Native fracture and history.mp4','label':'Actual native authoring record • editable decisions','start':0,'end':15.5,'silent':True},
 {'name':'Afterimage','path':VIDEOS/'Studio - Afterimage - Cinematic Edit - 2026-11-08/Afterimage.mp4','label':'Performance edit • delayed layers, camera and colour','start':0,'end':18}
]

def frame(file,seconds,target):
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(seconds),'-i',str(file),'-frames:v','1',str(target)],check=True)

def assets():
 svg=(ROOT/'frontend/public/brand/autopromote-gradient.svg').read_text()
 raw=base64.b64decode(re.search('base64,([^"\']+)',svg).group(1))
 original=Image.open(io.BytesIO(raw)).convert('RGBA');original.crop((33,494,1233,763)).save(ASSETS/'logo.png')
 qrcode.make(D['website'],error_correction=qrcode.constants.ERROR_CORRECT_Q,box_size=12,border=4).save(ASSETS/'website-qr.png')
 frame(SELECTION[2]['path'],2.1,ASSETS/'hero.jpg')
 frame(SELECTION[1]['path'],38.7,ASSETS/'aisle.jpg')
 frame(SELECTION[4]['path'],8.5,ASSETS/'afterimage.jpg')
 frame(SELECTION[0]['path'],4.5,ASSETS/'house.jpg')
 # Keep the native screenshot's original bytes and format.
 shutil.copy2(VIDEOS/'Studio - Glass Current - 2026-11-08/Editable lens keys.png',ASSETS/'studio.png')
 D['slides'][4]['image']='studio.png'
 sheet=Image.new('RGB',(1400,780),NAVY);draw=ImageDraw.Draw(sheet)
 for filename,box,label in [('aisle.jpg',(30,35,440,735),'AISLE RIFT'),('hero.jpg',(470,35,1370,420),'GLASS CURRENT'),('afterimage.jpg',(470,445,1370,735),'AFTERIMAGE')]:
  image=Image.open(ASSETS/filename).convert('RGB');image.thumbnail((box[2]-box[0],box[3]-box[1]))
  x=box[0]+(box[2]-box[0]-image.width)//2;y=box[1]+(box[3]-box[1]-image.height)//2;sheet.paste(image,(x,y))
  draw.text((box[0]+12,box[3]-32),label,fill='white',font=ImageFont.truetype(BOLD,20),stroke_width=2,stroke_fill=NAVY)
 sheet.save(ASSETS/'showcase.jpg',quality=95)
 for item in SELECTION:
  item['sha256']=hashlib.sha256(item['path'].read_bytes()).hexdigest()
  if not item.get('silent'):
   target=OUT/'02 Demo'/('Full film — '+item['name'].replace(' — ',' - ')+'.mp4')
   if target.exists():assert hashlib.sha256(target.read_bytes()).hexdigest()==item['sha256']
   else:shutil.copy2(item['path'],target)
 (HERE/'private/selected-videos.json').write_text(json.dumps([{**x,'path':str(x['path'])}for x in SELECTION],indent=2))

class Slide:
 def __init__(self,pdf,ppt):self.pdf=pdf;self.ppt=ppt;self.scale=.6
 def rect(self,x,y,w,h,colour,r=0,line=None):
  c=self.pdf;c.setFillColor(colors.HexColor(colour));c.setStrokeColor(colors.HexColor(line or colour))
  if r:c.roundRect(x*.6,(900-y-h)*.6,w*.6,h*.6,r*.6,fill=1,stroke=bool(line))
  else:c.rect(x*.6,(900-y-h)*.6,w*.6,h*.6,fill=1,stroke=bool(line))
  shape=self.ppt.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if r else MSO_SHAPE.RECTANGLE,Inches(x/120),Inches(y/120),Inches(w/120),Inches(h/120))
  shape.fill.solid();shape.fill.fore_color.rgb=RGBColor.from_string(colour.lstrip('#'));shape.line.fill.background()
 def text(self,x,y,w,h,text,size=30,colour='#FFFFFF',bold=False):
  font='APB'if bold else'AP';lines=[]
  for part in text.split('\n'):
   line=''
   for word in part.split():
    candidate=(line+' '+word).strip()
    if pdfmetrics.stringWidth(candidate,font,size*.6)>w*.6 and line:lines.append(line);line=word
    else:line=candidate
   lines.append(line)
  leading=size*1.25;assert len(lines)*leading<=h+4,(text,len(lines)*leading,h)
  c=self.pdf;c.setFillColor(colors.HexColor(colour));c.setFont(font,size*.6)
  for i,line in enumerate(lines):c.drawString(x*.6,(900-y-size-i*leading)*.6,line)
  box=self.ppt.shapes.add_textbox(Inches(x/120),Inches(y/120),Inches(w/120),Inches(h/120));tf=box.text_frame;tf.clear();tf.word_wrap=True;tf.margin_left=0;tf.margin_right=0;tf.margin_top=0;tf.margin_bottom=0
  for i,line in enumerate(lines):
   p=tf.paragraphs[0] if i==0 else tf.add_paragraph();p.text=line;p.font.name='DejaVu Sans';p.font.size=Pt(size*.6);p.font.bold=bold;p.font.color.rgb=RGBColor.from_string(colour.lstrip('#'));p.space_before=Pt(0);p.space_after=Pt(0);p.line_spacing=1.25
 def picture(self,file,x,y,w,h):
  im=Image.open(file);ratio=min(w/im.width,h/im.height);pw=im.width*ratio;ph=im.height*ratio;px=x+(w-pw)/2;py=y+(h-ph)/2
  self.pdf.drawImage(ImageReader(im),px*.6,(900-py-ph)*.6,pw*.6,ph*.6,mask='auto')
  self.ppt.shapes.add_picture(str(file),Inches(px/120),Inches(py/120),width=Inches(pw/120),height=Inches(ph/120))

def deck():
 prs=Presentation();prs.slide_width=Inches(13.333333);prs.slide_height=Inches(7.5);prs.core_properties.title='AutoPromote — Africa Tech Festival 2026';prs.core_properties.author=D['founder']
 pdf=canvas.Canvas(str(OUT/'01 Pitch/AutoPromote — Investor conversation.pdf'),pagesize=(960,540));pdf.setTitle('AutoPromote | Africa Tech Festival 2026');pdf.setAuthor(D['founder'])
 for i,s in enumerate(D['slides']):
  page=prs.slides.add_slide(prs.slide_layouts[6]);draw=Slide(pdf,page);draw.rect(0,0,1600,900,NAVY);draw.rect(0,0,1600,8,PURPLE);draw.rect(70,34,250,63,'#F8F6FF',12);draw.picture(ASSETS/'logo.png',83,45,224,42)
  draw.text(365,50,1120,40,s['eyebrow'],22,CYAN,True)
  kind=s['kind']
  if kind=='hero':
   draw.text(70,175,800,300,s['title'],88,bold=True);draw.text(70,520,700,180,s['subtitle'],34,MUTED)
   draw.rect(850,180,680,480,'#17223C',15);draw.picture(ASSETS/s['image'],865,195,650,450)
   draw.text(70,745,1450,65,D['stage'],24,CYAN);draw.text(70,810,1450,36,D['event'],21,MUTED)
  elif kind=='image':
   draw.text(70,170,500,250,s['title'],54,bold=True);draw.text(70,455,515,230,s['subtitle'],29,MUTED)
   draw.rect(620,160,910,620,'#121C32',18);draw.picture(ASSETS/s['image'],635,175,880,590)
   draw.text(70,820,1450,55,s['bottom'],20,MUTED)
  elif kind=='contact':
   draw.text(70,190,1030,150,s['title'],110,bold=True);draw.text(70,380,1050,180,s['subtitle'],36,MUTED)
   draw.text(70,610,1100,150,s['bottom'],32,CYAN);draw.picture(ASSETS/'website-qr.png',1190,300,300,300)
   draw.text(70,805,1450,50,D['stage'],23,MUTED)
  else:
   draw.text(70,145,1460,210,s['title'],66,bold=True);draw.text(70,330,1460,105,s['subtitle'],28,MUTED)
   for j,(head,body)in enumerate(s['cards']):
    x=70+j*495;draw.rect(x,465,470,280,'#141E35',15);draw.rect(x,465,470,5,PURPLE if j!=1 else CYAN)
    draw.text(x+24,490,422,78,head,32,'#FFFFFF',True);draw.text(x+24,575,422,150,body,23,MUTED)
   draw.text(70,790,1460,80,s['bottom'],22,MUTED)
  draw.text(1485,48,60,35,str(i+1).zfill(2),22,MUTED);page.notes_slide.notes_text_frame.text=s['note'];pdf.showPage()
 prs.save(OUT/'01 Pitch/AutoPromote — Investor conversation.pptx');pdf.save()
 doc=fitz.open(OUT/'01 Pitch/AutoPromote — Investor conversation.pdf');assert len(doc)==len(D['slides'])
 for i,page in enumerate(doc):page.get_pixmap(matrix=fitz.Matrix(1.25,1.25)).save(ASSETS/f'slide-{i+1:02}.png')
 notes='\n\n'.join(f"Slide {i+1} — {s['title'].replace(chr(10),' ')}\n{s['note']}"for i,s in enumerate(D['slides']))
 (OUT/'01 Pitch/Speaker notes.txt').write_text(notes+'\n')
 rendered=[Image.open(ASSETS/f'slide-{i+1:02}.png').resize((480,270))for i in range(len(D['slides']))]
 sheet=Image.new('RGB',(1440,math.ceil(len(rendered)/3)*270),'white')
 for i,im in enumerate(rendered):sheet.paste(im,((i%3)*480,(i//3)*270))
 sheet.save(HERE/'private/deck-contact-sheet.jpg',quality=90)
 slides_js=json.dumps([{'image':'../assets/slide-'+str(i+1).zfill(2)+'.png','notes':s['note']}for i,s in enumerate(D['slides'])])
 (OUT/'01 Pitch/Present offline.html').write_text('''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AutoPromote — present offline</title><style>body{margin:0;background:#0b1020;color:white;font-family:system-ui}main{height:90vh;display:grid;place-items:center}img{max-width:100vw;max-height:89vh}nav{display:flex;justify-content:center;gap:14px;padding:10px}button,a{color:white;background:#442488;padding:10px;border:0;border-radius:8px}aside{max-width:900px;margin:15px auto;padding:18px;line-height:1.6}button:focus{outline:2px solid #24d2e0}</style><main><img id="slide" alt="Presentation slide"></main><nav><button id="back">← Previous</button><span id="count"></span><button id="next">Next →</button><button id="full">Fullscreen</button><button id="notes">Speaker notes</button><a href="../index.html">Package</a></nav><aside id="speaker" hidden></aside><script>const slides='''+slides_js+''';let i=0;const image=document.querySelector('#slide'),speaker=document.querySelector('#speaker');function show(){image.src=slides[i].image;document.querySelector('#count').textContent=(i+1)+' / '+slides.length;speaker.textContent=slides[i].notes}function step(d){i=Math.max(0,Math.min(slides.length-1,i+d));show()}document.querySelector('#back').onclick=()=>step(-1);document.querySelector('#next').onclick=()=>step(1);document.querySelector('#notes').onclick=()=>speaker.hidden=!speaker.hidden;document.querySelector('#full').onclick=()=>document.documentElement.requestFullscreen();addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key))step(1);if(['ArrowLeft','PageUp'].includes(e.key))step(-1)});show();</script>''')

STYLES={
 'title':ParagraphStyle('title',fontName='APB',fontSize=25,leading=31,textColor=colors.HexColor(INK),spaceAfter=12),
 'sub':ParagraphStyle('sub',fontName='AP',fontSize=10,leading=15,textColor=colors.HexColor('#59657E'),spaceAfter=14),
 'h':ParagraphStyle('h',fontName='APB',fontSize=12,leading=17,textColor=colors.HexColor(PURPLE),spaceBefore=14,spaceAfter=6,keepWithNext=True),
 'body':ParagraphStyle('body',fontName='AP',fontSize=10,leading=15,textColor=colors.HexColor(INK),spaceAfter=8),
 'small':ParagraphStyle('small',fontName='AP',fontSize=8,leading=12,textColor=colors.HexColor('#536079'),spaceAfter=5)
}
def clean(text):
 for a,b in [('Thursday19','Thursday 19'),('November10','November 10'),('15November','15 November'),('17November','17 November'),('November2026','November 2026'),('three-partner90','three-partner 90'),('30seconds','30 seconds'),('60seconds','60 seconds'),('all nine','all nine'),('budget alerts','budget alerts')]:text=text.replace(a,b)
 return re.sub(r'(\d)(FUNCTIONAL|PARTIAL|BROKEN|UNIMPLEMENTED|PRO-READY|PRODUCTION-READY|seconds|frames|day|days|November)',r'\1 \2',text)
def para(text,style='body'):return Paragraph(escape(clean(text)).replace('\n','<br/>'),STYLES[style])
def page_header(c,doc):
 w,h=doc.pagesize;c.setFillColor(colors.HexColor(NAVY));c.rect(0,h-73,w,73,fill=1,stroke=0);c.setFillColor(colors.white);c.roundRect(39,h-56,167,37,6,fill=1,stroke=0);c.drawImage(str(ASSETS/'logo.png'),47,h-49,150,30,mask='auto',preserveAspectRatio=True)
 c.setFont('AP',8);c.setFillColor(colors.HexColor('#FFFFFF'));c.drawRightString(w-39,h-33,'AFRICA TECH FESTIVAL 2026');c.setStrokeColor(colors.HexColor('#DCE2EF'));c.line(40,42,w-40,42);c.setFont('AP',8);c.setFillColor(colors.HexColor('#59657E'));c.drawString(40,28,'AUTOPROMOTE (PTY) LTD  •  '+D['date']);c.drawRightString(w-40,28,str(doc.page))
def document(file,title,subtitle,sections,sources=None):
 story=[para(title,'title'),para(subtitle,'sub')]
 for head,body in sections:
  story.append(para(head,'h'))
  for part in body.split('\n\n'):story.append(para(part))
 if sources:
  story.append(para('Sources checked 15 November 2026','h'))
  for label,url in sources:story.append(Paragraph('<link href="'+escape(url,{'"':'&quot;'})+'" color="#773dff">'+escape(label)+'</link>',STYLES['small']))
 path=OUT/file;path.parent.mkdir(parents=True,exist_ok=True);doc=SimpleDocTemplate(str(path),pagesize=(595.276,841.89),leftMargin=43,rightMargin=43,topMargin=96,bottomMargin=61,title=title,author=D['founder']);doc.build(story,onFirstPage=page_header,onLaterPages=page_header)
 return path

def docs():
 for brief in D['briefs']:
  document('04 Meetings/'+brief['file']+' — meeting brief.pdf',brief['title'],brief['person']+'\n'+brief['status'],[['Opening introduction',brief['intro']]]+brief['sections'],brief['sources'])
 sections=[['30-second introduction',D['intro30']],['60-second introduction',D['intro60']]]+D['fiveMinute']
 document('05 Founder/Founder pitches and five-minute presentation.pdf','Founder speaking notes','Private preparation • timings are rehearsal guides, not speed targets.',sections)
 document('05 Founder/Investor and partner questions.pdf','Questions you can answer honestly',D['stage'],D['qa'])
 profile=[
  ['Company','AUTOPROMOTE (PTY) LTD is building an AI-assisted editing and publishing workspace for creators and small teams. The aim is to connect finding useful moments, refining a video and preparing its release while keeping the creator in control.'],
  ['What the product brings together','Source-bound clip suggestions; an editable Studio timeline; motion, compositing, B-roll, grading and sound controls; finished exports; and broader Publisher/Queue release preparation. Availability and reliability vary by feature and workflow.'],
  ['Progress and current stage','Prelaunch, with the founder as the only current user/tester. Selected Studio films and real native authoring records demonstrate existing development work. The next milestone is a narrowly scoped design-partner pilot, subject to reliability and account/security qualification.'],
  ['Business focus','Proposed initial customers are South African small creative teams, podcast/interview teams and creator-led businesses with recurring video work. A subscription and metered-processing model is under evaluation; commercial pricing has not been validated.'],
  ['Conversations we welcome','Potential design partners, practical technical/cloud guidance, and relevant early-stage introductions. We welcome conversations with teams that repeatedly turn footage into finished content.'],
  ['Contact','Thulani Mtshwelo • Founder & CEO\nthulani@autopromote.org\nhttps://autopromote.org']
 ]
 path=document('03 Company/AutoPromote — one-page company profile.pdf','Creative work, kept editable.','AUTOPROMOTE (PTY) LTD • South Africa • Africa Tech Festival 2026',profile)
 assert len(fitz.open(path))==1,'Company profile must be exactly one page'
 founder=[
 ['Event facts','17–19 November 2026, Cape Town International Convention Centre (CTICC), Convention Square, 1 Lower Long Street, Cape Town. Times in this packet are SAST (UTC+2). Event facts are publicly verified; personal admission and meeting acceptance are not.'],
 ['Pass and meeting status','Founder reports successful registration and conditional Start-up Pass approval, subject to organiser eligibility review. Networking access does not independently prove final pass approval. Launch Africa: requested Thursday19 November10:00–10:20 SAST; acceptance unverified. WPP and Google Cloud: requests reported sent; times and acceptance unverified. Verify all three in the official platform before travelling to a meeting.'],
 ['Before 17 November','Open index.html on the actual laptop. Play the complete selected showcase with sound, then open the PDF deck and company profile. Copy the whole folder to the phone and a USB drive. Charge devices and pack headphones, charger, display adaptor and a power bank. Keep the exact files available offline rather than relying on the website or cloud rendering.'],
 ['At the venue','Check badge collection and pass status through official registration. Confirm room/table/location for accepted meetings. Allow travel time between halls. Start with the30-second introduction, ask about the other person’s priorities, then show the most relevant short example. Keep one clear next-step question.'],
 ['Meeting capture','Record name, organisation, actual discussion, permission to follow up and agreed next action in the tracker. Distinguish a suggested introduction from a completed introduction, and interest from a committed partnership. Do not mark requested slots as accepted.'],
 ['After the conversation','Send only the requested material after obtaining an appropriate contact route. The packet contains draft follow-ups; none have been sent. Replace the bracketed fields with what actually happened. Update the tracker and propose a specific next step without overstating agreement.']]
 document('06 Working documents/Event checklist and meeting status.pdf','Event execution checklist','Founder preparation • registration and meeting status remain subject to verification.',founder,[['Official event FAQ','https://africatechfestival.com/faqs/']])
 proof=[
 ['Verified personal stage','Founder instruction: the founder is the only current app user and is still testing; the product has not launched to users. Company name and CEO title are founder supplied. Name is consistent with workspace Git identity; business email comes from the public Contact implementation and was visible on the live contact page on15 November.'],
 ['What can be shown','Use the selected existing Videos films and actual matching Studio records. Glass Current and Afterimage retain native authoring, editable projects, source provenance and completed export evidence. House of Rhythm retains a native comparison and its reported publication receipts. AISLE RIFT retains its existing delivered film and editable projects; a new source/build/job binding audit was not run for this packet.'],
 ['Local proof versus production','Recent Finder and B-roll tests qualify bounded local English-source analysis, editing, export/download and playback. The founder rejected that test footage for this festival package; it is not included in the showcase. None of these tests establishes a launched user base, unrestricted multilingual quality or whole-product production readiness.'],
 ['Current Studio qualification','The retained authority matrix lists17 FUNCTIONAL,9 PARTIAL,1 BROKEN and2 UNIMPLEMENTED capabilities, with0 PRO-READY and0 PRODUCTION-READY. These are internal audit classifications, not customer usage. Known typography colour/edge failures, whole moving picture/audio agreement, software-preview performance and shared S02/S04/S03 work remain.'],
 ['Commercial information not supplied','Verified revenue, cash/burn, current funding, runway, incorporation date, cap table and intended raise amount remain unavailable. The event deck does not invent them. There is no claimed external customer cohort or signed design partner. Unit-cost input cells remain blank pending measurements.'],
 ['Security and cloud limits','Retained security reports document owner-scoping repairs and tests, but historical session/account and financial-authority follow-through remains open. A current authenticated production security/settlement or cloud-capacity audit was not part of this package. Do not claim enterprise certification, blanket security, perfect parity or unlimited processing.'],
 ['Language and AI claims','The founder’s intended experience is strong English handling, supported-language output where models know it, and visible review/correction for uncertainty. That is a product direction, not a measured universal translation guarantee. Clips are editorial suggestions, never promises of viral performance.'],
 ['Current handoff','Presentation PDFs and screenshots were rendered and inspected; PowerPoint structure and speaker notes are validated. The offline reel is an editorial assembly of existing movies and actual UI recordings, with synthetic local introductory narration. Full films keep their original downloaded bytes separately. Human creative/listening acceptance and source rights for any later public redistribution remain separate.']]
 document('06 Working documents/Proof, stage and limitations.pdf','Evidence and limits','Private founder reference • use the concise deck for external conversations.',proof)
 demos=[
 ['Start offline','Open02 Demo/AutoPromote — festival showcase.mp4. It is an editorial reel of existing Studio work selected from Videos after review. It is not a new one-click AI generation or a live render-performance benchmark. Full selected films are included separately, with their original audio and unchanged file bytes.'],
 ['Explain the sequence','Start with the House of Rhythm before/after, followed by AISLE RIFT, Glass Current, the actual Glass Current native authoring record, and Afterimage. Describe each as a specific existing Studio example. The native authoring record shows the controls behind one film; it does not prove that every other film used those same settings.'],
 ['Optional deeper demonstration','Use the original full movie or the supplied complete Glass Current Studio control recording. Source projects remain in Videos. The project may need its retained local runtime and media to reopen; avoid promising a cloud import at the venue. No new render, paid service or live post is required to present these materials.'],
 ['Concise spoken framing','“These are actual films from my existing Studio work. The next recording shows the native decisions behind Glass Current. AutoPromote is still prelaunch; I am showing what works in these examples while I qualify reliability and the first pilot workflow.”'],
 ['If internet or the app is unavailable','Play the offline MP4 and open the PDF deck. Avoid starting a cloud job while an executive waits. Tell them this is a recorded development demonstration. Offer a later founder-guided session for any feature not covered by the retained evidence.'],
 ['Rehearsal','Play the complete showcase on the actual laptop and phone, check volume, and practise stopping after the example most relevant to the listener. Use30seconds for a hallway introduction,60seconds for the product story and the five-minute script for a seated conversation.']]
 document('02 Demo/Demo runbook.pdf','Offline demonstration runbook','Real existing Videos work • source audio retained • founder-led prelaunch demonstration.',demos)
 start=[['Begin here','Open index.html for the offline package dashboard. Use01 Pitch/Present offline.html for keyboard-controlled slides or the PDF deck for easy sharing. The editable PowerPoint contains speaker notes.'],['Show the work','Play02 Demo/AutoPromote — festival showcase.mp4. The selected movies come from Videos, replacing the rejected test footage. Separate full films and an actual Studio control recording support follow-up questions.'],['Prepare each meeting','Read the appropriate brief in04 Meetings, then rehearse the founder introductions and Q&A in05 Founder. Use the private evidence/limitations reference and the unit-economics workbook when discussing unknowns.'],['Share useful material','The one-page company profile, digital card, vCard and website QR are in03 Company. Follow-up messages are drafts only. The QR opens the existing public website; it does not upload this private folder.'],['Known facts','Prelaunch; founder is the sole current user/tester. No external traction, verified revenue, investment, credit award, confirmed meeting or unconditional pass is invented. The festival is17–19 November at CTICC; check personal admission and meeting acceptance in the official platform.']]
 document('00 Start here.pdf','Africa Tech Festival 2026','AutoPromote founder preparation package • prepared15 November2026',start)
 # Editable text accompanies the formatted documents.
 editable={'company':D,'purpose':'Local preparation only; messages unsent; no deployment or paid jobs.'}
 (OUT/'06 Working documents/Editable content.json').write_text(json.dumps(editable,indent=2,ensure_ascii=False))

def card():
 file=OUT/'03 Company/AutoPromote — digital company card.pdf';c=canvas.Canvas(str(file),pagesize=(648,396));c.setFillColor(colors.HexColor(NAVY));c.rect(0,0,648,396,fill=1,stroke=0);c.setFillColor(colors.HexColor(PURPLE));c.rect(0,383,648,13,fill=1,stroke=0)
 c.setFillColor(colors.white);c.roundRect(35,295,300,65,10,fill=1,stroke=0);c.drawImage(str(ASSETS/'logo.png'),48,308,275,45,mask='auto',preserveAspectRatio=True)
 c.setFillColor(colors.white);c.setFont('APB',25);c.drawString(35,247,D['founder']);c.setFont('AP',13);c.drawString(35,220,'Founder & CEO');c.setFillColor(colors.HexColor(MUTED));c.setFont('AP',11);c.drawString(35,194,D['company'])
 c.setFillColor(colors.HexColor(CYAN));c.setFont('AP',14);c.drawString(35,131,D['email']);c.drawString(35,103,'autopromote.org');c.setFillColor(colors.HexColor(MUTED));c.setFont('AP',10);c.drawString(35,48,'AI-assisted video • prelaunch • South Africa')
 c.drawImage(str(ASSETS/'website-qr.png'),454,110,160,160);c.linkURL(D['website'],(454,110,614,270),relative=0);c.linkURL('mailto:'+D['email'],(35,126,355,148),relative=0);c.save()
 doc=fitz.open(file);doc[0].get_pixmap(matrix=fitz.Matrix(2,2)).save(OUT/'03 Company/AutoPromote — digital company card.png')
 vcard='BEGIN:VCARD\r\nVERSION:3.0\r\nN:Mtshwelo;Thulani;;;\r\nFN:Thulani Mtshwelo\r\nORG:AUTOPROMOTE (PTY) LTD\r\nTITLE:Founder & CEO\r\nEMAIL;TYPE=INTERNET,WORK:thulani@autopromote.org\r\nURL:https://autopromote.org\r\nEND:VCARD\r\n'
 (OUT/'03 Company/Thulani Mtshwelo — AutoPromote.vcf').write_bytes(vcard.encode('utf8'));shutil.copy2(ASSETS/'website-qr.png',OUT/'03 Company/AutoPromote — website QR.png')

def workbook():
 wb=Workbook();ws=wb.active;ws.title='Inputs';ws.append(['Unit economics inputs','Value','Unit / evidence required']);rows=[
 ['Customer price per month',None,'Single chosen currency; net of VAT/tax treatment'],['Delivered videos per customer/month',None,'Measured pilot volume'],['CPU seconds per attempt',None,'Measured'],['CPU cost per second',None,'Invoice-derived rate'],['GPU seconds per attempt',None,'Measured; enter0only if unused'],['GPU cost per second',None,'Invoice-derived rate;0only if unused'],['Other model/provider cost per attempt',None,'Measured;0only if unused'],['Extra failed attempts per delivered video',None,'Measured retry/failure burden'],['Storage cost per delivered video',None,'Include byte-time; measured'],['Egress/data cost per delivered video',None,'Measured'],['Support minutes per delivered video',None,'Measured'],['Support cost per minute',None,'Chosen labour cost basis'],['Payment fee fraction',None,'Verified processor fee as fraction'],['Payment fee fixed per account/month',None,'Verified fixed monthly fee'],['Other variable cost per delivered video',None,'Measured;0only if none']]
 for row in rows:ws.append(row)
 ws.append(['All values unverified until entered',None,'Blank cells are intentional; no forecasts are populated.'])
 unit=wb.create_sheet('Contribution');unit.append(['Metric','Formula / result','Interpretation']);unit.append(['Processing per attempt','=IF(COUNT(Inputs!B4:B8)<5,"Inputs needed",Inputs!B4*Inputs!B5+Inputs!B6*Inputs!B7+Inputs!B8)','CPU + GPU + other provider cost'])
 unit.append(['Delivered-job variable cost','=IF(OR(COUNT(Inputs!B9:B13)<5,COUNT(Inputs!B16)<1,NOT(ISNUMBER(B2))),"Inputs needed",B2*(1+Inputs!B9)+Inputs!B10+Inputs!B11+Inputs!B12*Inputs!B13+Inputs!B16)','Include failed attempts, storage, egress, support, other'])
 unit.append(['Monthly variable cost/account','=IF(OR(COUNT(Inputs!B2:B3)<2,COUNT(Inputs!B14:B15)<2,NOT(ISNUMBER(B3))),"Inputs needed",Inputs!B3*B3+Inputs!B2*Inputs!B14+Inputs!B15)','Usage cost + payment fees'])
 unit.append(['Monthly contribution/account','=IF(OR(NOT(ISNUMBER(B4)),NOT(ISNUMBER(Inputs!B2))),"Inputs needed",Inputs!B2-B4)','Before fixed overheads; not company profit'])
 unit.append(['Contribution margin','=IF(OR(NOT(ISNUMBER(B5)),NOT(ISNUMBER(Inputs!B2))),"Inputs needed",IF(Inputs!B2<=0,"Positive price needed",B5/Inputs!B2))','Format as fraction; exclude tax consistently'])
 cash=wb.create_sheet('Funding and runway');cash.append(['Item','Value','Evidence']);
 for row in [['Current cash',None,'Bank/cash records'],['Monthly fixed burn',None,'Current recurring spend'],['Other monthly burn',None,'Explicit basis; avoid double counting'],['Net burn','=IF(COUNT(B3:B4)<2,"Inputs needed",B3+B4)','Excludes unentered revenue/contribution'],['Runway months','=IF(OR(COUNT(B2)<1,NOT(ISNUMBER(B5))),"Inputs needed",IF(B5<=0,"Positive burn needed",B2/B5))','Simplified model; not a verified runway'],['Milestone budget',None,'Costed scope'],['Contingency',None,'Founder-selected; unverified'],['Proposed capital need','=IF(COUNT(B7:B8)<2,"Inputs needed",B7+B8)','Discussion structure, not an asserted raise']]:cash.append(row)
 evidence=wb.create_sheet('Measurements');evidence.append(['Date','Job ID','Success/failure','Output minutes','CPU sec','GPU sec','Provider cost','Storage','Egress','Support min','Evidence link'])
 evidence.append(['No measurements entered — template only'])
 for sheet in wb:
  sheet.freeze_panes='B2';sheet.auto_filter.ref=sheet.dimensions
  for cell in sheet[1]:cell.fill=PatternFill('solid',fgColor='0B1020');cell.font=Font(name='Calibri',bold=True,color='FFFFFF');cell.alignment=Alignment(wrap_text=True)
  sheet.column_dimensions['A'].width=42;sheet.column_dimensions['B'].width=24;sheet.column_dimensions['C'].width=70
  for row in sheet.iter_rows(min_row=2):
   sheet.row_dimensions[row[0].row].height=36
   for cell in row:cell.alignment=Alignment(wrap_text=True,vertical='center')
  if sheet.title in ['Inputs','Funding and runway']:
   for row in sheet.iter_rows(min_row=2,max_col=2):
    if row[1].value is None:row[1].fill=PatternFill('solid',fgColor='E9E0FF')
 file=OUT/'06 Working documents/Unit economics and funding — unpopulated inputs.xlsx';wb.save(file);check=load_workbook(file);assert check['Inputs']['B2'].value is None

def followups_and_sources():
 text='''# Draft follow-up messages — send only after editing for the actual conversation

These are unsent templates. None implies an accepted meeting or existing relationship.

## Launch Africa — subject: AutoPromote | following up on [actual discussion]
Hi Janade,
Thank you for [the conversation / feedback you actually received]. AutoPromote is prelaunch and I am currently its tester. I appreciated your point about [specific milestone]. I have attached the one-page profile and the selected Studio examples you requested. My next step is [actual action]. Would [specific check-in or introduction discussed] be appropriate? If useful, I can send a concise update when we reach [agreed milestone].
Thulani Mtshwelo | AUTOPROMOTE (PTY) LTD | thulani@autopromote.org

## WPP — subject: AutoPromote | [specific workflow] discussion
Hi Tebogo,
Thank you for discussing [actual workflow]. Based on what you shared, I would like to explore whether a narrow evaluation of [specific task] would be useful alongside your team's existing tools. AutoPromote remains prelaunch. Could you point me to the appropriate workflow owner, if that matches our conversation? I can share the actual Studio example and an outline of the proposed evaluation before any assets or work are committed.
Thulani

## Google Cloud — subject: AutoPromote | [architecture / startup-programme] follow-up
Hi Donovan,
Thank you for [actual advice]. I am following up on [specific technical question]. AutoPromote is a prelaunch video application with React/Node, Firebase and Python media workers. Could you introduce me to the appropriate [startup / security / media-GPU] colleague, if appropriate? I can provide a sanitised architecture summary and the measurements you recommended. I am seeking guidance rather than assuming credit eligibility or capacity approval.
Thulani

## No meeting took place — neutral message
Hi [name], I requested a meeting through the Africa Tech Festival platform but we did not get a confirmed slot. I am the founder of AutoPromote, a prelaunch AI-assisted video workspace. If relevant to your work, may I send a short profile and selected existing Studio examples? I would value guidance on [one specific relevant question].
'''
 (OUT/'06 Working documents/Follow-up message drafts.md').write_text(text)
 with (OUT/'06 Working documents/Meeting tracker.csv').open('w',newline='')as f:
  w=csv.writer(f);w.writerow(['Contact','Organisation','Requested date','Requested start SAST','Requested end SAST','Status','Accepted date/time/location','Actual discussion','Permission to follow up','Agreed next action','Due','Completed'])
  w.writerow(['Janade du Plessis','Launch Africa Ventures','2026-11-19','10:00','10:20','REQUEST SENT — acceptance unverified','','','','','',''])
  for n,o in [('Tebogo Skwambane','WPP South Africa'),('Donovan Mooney','Google Cloud')]:w.writerow([n,o,'','','','REQUEST SENT — acceptance unverified','','','','','',''])
 sources=[
 ('Event dates/location','https://africatechfestival.com/faqs/','Official public FAQ; personal pass/meetings not verified.'),
 ('Launch Africa fit','https://www.launchafrica.vc/faqs','Published investment preferences; no AutoPromote investment eligibility asserted.'),
 ('Janade role','https://www.launchafrica.vc/news/launch-africa-ventures-achieves-dpi-milestone','Official fund statement identifies Managing Partner.'),
 ('WPP context','https://www.wpp.com/en/open','Existing WPP marketing platform; no AutoPromote integration.'),
 ('Tebogo historical role','https://www.wpp.com/en/news/2024/07/wpp-champions-inclusive-creativity-at-inaugural-unite-south-africa-awards-during-pride-month','July2024 role evidence; not current event-specific verification.'),
 ('Google startup programme','https://cloud.google.com/startup','Current stage-dependent programme. Maximum benefits not guaranteed. Old pre-funded/benefits pages redirect.'),
 ('Company public website','https://autopromote.org','Anonymous page loaded HTTP200 on15November; this is not authenticated feature qualification.'),
 ('Business contact','https://autopromote.org/#/contact','Public page visibly contains thulani@autopromote.org; no email delivery test.')]
 lines=['# Sources and claim register','', 'Checked15November2026. External facts use official sources. Internal references describe retained evidence, not a new live cloud audit.','']
 for title,url,scope in sources:lines+=['- ['+title+']('+url+'): '+scope]
 lines+=['','## Repository and retained-file evidence','', '- Founder stage: explicit owner instruction in this conversation: founder-only testing, not launched to users.','- Company identity and meeting requests: original Africa Tech Festival brief supplied by founder.','- Contact: frontend/src/Contact.js; name consistent with workspace Git identity.','- Product architecture: package.json, frontend/src/components/studioProjectDocument.js, studioRenderCompiler.js, src/mediaRoutes.js and python_media_worker/studio_pro_render_engine.py.','- Internal readiness: docs/STUDIO-PRODUCT-READINESS.md and test/e2e/studio-capability-matrix.json, reviewed15November.','- Security scope: SECURITY_RELEASE_READINESS.md; unresolved production account/session, financial authority and authenticated-flow risks remain.','- Unit economics: APPLICATION_WORKFLOWS_20261027.md says monetary cost/operation is unmeasured. reports/gcp-cost-cleanup-20261031/README.md records historical alerts/cleanup; alerts are not a spend cap.','- Find Viral Clips: reports/viral-clip-powerhouse-20261115/README.md; selected local English-source workflow. The owner rejected the test footage for this festival package.','- Glass Current: Videos/Studio - Glass Current -2026-11-08, README, source provenance, native authoring and Technical/render-receipt.json.','- Afterimage: Videos/Studio - Afterimage - Cinematic Edit -2026-11-08, README, native projects/records and source provenance.','- House of Rhythm: Videos/Studio - House of Rhythm -2026-11-14, README and Publication results.json. Historical reported provider outcomes are not a new public publication audit.','- AISLE RIFT: existing delivered film and editable VFX/delivery projects in Videos/AutoPromote - AISLE RIFT -2026-11-14. No fresh native binding audit was performed for this packet.','', '## Claim rules','', 'Revenue, funding, burn, runway, founding date and raise amount are unverified. No invented financial results or external-user traction. No claimed partner/investor endorsement, accepted meeting, unconditional pass, universal AI quality, guaranteed views, professional certification or whole-platform production readiness. The three-partner90-day plan and business model are proposals.','', '## Media provenance','', 'The showcase is an editorial assembly of existing films and an actual Studio recording. Full films are copied without changing bytes; selection hashes are recorded in the package manifest. Intro/control-record narration uses cached local Piper synthetic speech. Existing movie audio remains with each film. Source dance credit for House of Rhythm: @luluthop. Preserve the original source/license records with the projects for any later use.']
 (OUT/'06 Working documents/Sources and claim register.md').write_text('\n'.join(lines)+'\n')

def dashboard():
 links=[('Present the deck','01 Pitch/Present offline.html'),('Pitch PDF','01 Pitch/AutoPromote — Investor conversation.pdf'),('Editable PowerPoint','01 Pitch/AutoPromote — Investor conversation.pptx'),('One-page profile','03 Company/AutoPromote — one-page company profile.pdf'),('Digital company card','03 Company/AutoPromote — digital company card.png'),('Save founder contact','03 Company/Thulani Mtshwelo — AutoPromote.vcf'),('Launch Africa brief','04 Meetings/Launch Africa — meeting brief.pdf'),('WPP brief','04 Meetings/WPP South Africa — meeting brief.pdf'),('Google Cloud brief','04 Meetings/Google Cloud — meeting brief.pdf'),('Architecture map','04 Meetings/Google Cloud — architecture conversation map.pdf'),('Founder pitches','05 Founder/Founder pitches and five-minute presentation.pdf'),('Investor / partner Q&A','05 Founder/Investor and partner questions.pdf'),('Event checklist','06 Working documents/Event checklist and meeting status.pdf')]
 cards=''.join('<a class="card" href="'+html.escape(path,quote=True)+'">'+html.escape(label)+' <span>↗</span></a>'for label,path in links)
 movies=''.join('<li><a href="02 Demo/'+html.escape('Full film — '+i['name'].replace(' — ',' - ')+'.mp4',quote=True)+'">'+html.escape(i['name'])+'</a></li>'for i in SELECTION if not i.get('silent'))
 page='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AutoPromote | Africa Tech Festival 2026</title><style>*{box-sizing:border-box}body{margin:0;background:#0b1020;color:#f4f6ff;font:16px/1.6 system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:38px 24px 70px}header{display:flex;align-items:center;justify-content:space-between;gap:24px}header img{background:#fff;border-radius:12px;padding:10px;width:260px}small,.muted{color:#aab6d3}h1{font-size:clamp(36px,6vw,68px);line-height:1.1;max-width:900px;margin-bottom:16px}h2{margin-top:44px;font-size:28px}a{color:#69e3ee}video{width:100%;max-height:70vh;background:#030611;border-radius:16px;border:1px solid #334063}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}.card{display:flex;align-items:center;justify-content:space-between;background:#15203a;border:1px solid #344260;border-radius:12px;min-height:84px;padding:20px;color:white;text-decoration:none}.card:hover{border-color:#24d2e0}.tag{display:inline-block;background:#29204a;border:1px solid #7150ad;padding:6px 12px;border-radius:100px}aside{padding:20px;border-left:3px solid #24d2e0;background:#111b30;margin:28px 0}footer{margin-top:45px;border-top:1px solid #334063;padding-top:20px}ul{padding-left:23px}a:focus-visible{outline:3px solid #24d2e0}</style></head><body><main><header><img src="assets/logo.png" alt="AutoPromote"><small>17–19 November 2026<br>CTICC · Cape Town · SAST</small></header><p class="tag">FOUNDER PREPARATION · 15 NOVEMBER 2026</p><h1>Creative work,<br>kept editable.</h1><p class="muted">Thulani Mtshwelo · Founder & CEO · AUTOPROMOTE (PTY) LTD</p><aside>Prelaunch. Founder-only testing. Real existing Studio work selected from Videos. Meeting acceptance and final pass eligibility still need checking.</aside><h2>Show the work</h2><p>Existing films with sound, plus an actual native Studio authoring record. The full films are available separately below.</p><video controls preload="metadata" poster="assets/showcase.jpg"><source src="02 Demo/AutoPromote — festival showcase.mp4" type="video/mp4">Open the MP4 in your video player.</video><ul>'''+movies+'''</ul><h2>Ready for the conversation</h2><div class="grid">'''+cards+'''</div><h2>Working documents</h2><p><a href="06 Working documents/Proof, stage and limitations.pdf">Evidence and limitations</a> · <a href="06 Working documents/Unit economics and funding — unpopulated inputs.xlsx">Unit economics workbook</a> · <a href="06 Working documents/Meeting tracker.csv">Meeting tracker</a> · <a href="06 Working documents/Follow-up message drafts.md">Follow-up drafts</a> · <a href="06 Working documents/Sources and claim register.md">Sources</a></p><footer>thulani@autopromote.org · <a href="https://autopromote.org">autopromote.org (online)</a><p class="muted">This folder works offline. The QR opens the existing website; it does not publish this packet. Keep the whole folder together when copying to another device.</p></footer></main></body></html>'''
 (OUT/'index.html').write_text(page)

if __name__=='__main__':
 assets();deck();docs();card();workbook();followups_and_sources();dashboard();print('Created deck, PDFs, card, QR, workbook, editable sources and offline dashboard at',OUT)
