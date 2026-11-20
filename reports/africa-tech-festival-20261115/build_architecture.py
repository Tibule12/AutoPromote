from pathlib import Path
import build_package as b
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import Paragraph
from types import SimpleNamespace

file=b.OUT/'04 Meetings/Google Cloud — architecture conversation map.pdf'
c=canvas.Canvas(str(file),pagesize=(595.276,841.89));b.page_header(c,SimpleNamespace(pagesize=(595.276,841.89),page=1))
def text(x,y,w,value,size=10,bold=False,colour=b.INK):
 style=b.ParagraphStyle('diagram',fontName='APB'if bold else'AP',fontSize=size,leading=size*1.4,textColor=colors.HexColor(colour));para=Paragraph(value,style);pw,ph=para.wrap(w,200);para.drawOn(c,x,y-ph)
def box(x,y,w,h,title,body):
 c.setFillColor(colors.HexColor('#F1F4FB'));c.setStrokeColor(colors.HexColor('#CCD5E8'));c.roundRect(x,y,w,h,7,fill=1,stroke=1);text(x+12,y+h-10,w-24,title,11,True,b.PURPLE);text(x+12,y+h-45,w-24,body,9)
def arrow(x1,y1,x2,y2,dashed=False):
 c.setStrokeColor(colors.HexColor(b.PURPLE));c.setLineWidth(1.5);c.setDash(4,3)if dashed else c.setDash();c.line(x1,y1,x2,y2);c.setDash();c.line(x2,y2,x2-5,y2+4);c.line(x2,y2,x2-5,y2-4)
text(43,745,510,'Architecture conversation map',24,True)
text(43,703,510,'Repository and retained deployment evidence • local demo path<br/>Not a fresh authenticated production topology or capacity audit.',10)
box(43,535,150,100,'React Studio','Native timeline and canonical editable project')
box(223,535,150,100,'Node / Express API','Owned media resolution, admission, compile and job boundary')
box(403,535,150,100,'Python media worker','Canonical CPU rendering with FFmpeg; actual retained film outputs')
arrow(193,585,223,585);arrow(373,585,403,585)
box(43,375,150,105,'Firebase identity','Authentication; identity must remain authoritative across requests')
box(223,375,150,105,'Firestore / Storage','Project/job state, owned source media and delivered artifacts')
box(403,375,150,105,'Optional model / GPU','Separate cloud/model integrations; qualify availability, cost and limits')
arrow(193,427,223,560,True);arrow(298,535,298,480);arrow(478,535,478,480,True)
text(43,348,510,'Solid: demonstrated application/media path. Dashed: supporting/optional boundaries to review.',8)
text(43,308,510,'Hosting context',12,True,b.PURPLE)
text(43,284,510,'Retained records identify a primary Render API and Google Cloud/Firebase services. This map describes roles and boundaries; it does not assert current regions, IAM bindings, capacity, deployment revisions or service health.',10)
text(43,225,510,'Three useful outcomes from the conversation',12,True,b.PURPLE)
text(43,201,510,'1. Attribute actual cost to one delivered job, including retries, storage and egress.<br/>2. Review media ownership, signed URLs, service identities, revocation and tenant isolation.<br/>3. Confirm a stage-appropriate startup-programme route and a bounded CPU/GPU measurement plan.',10)
text(43,114,510,'Preparation only. No new cloud job, paid GPU allocation, production write or security certification is implied. See the Google Cloud brief and private evidence/limits reference.',8)
c.setTitle('AutoPromote — architecture conversation map');c.setAuthor(b.D['founder']);c.save()
print('Created architecture conversation map.')
