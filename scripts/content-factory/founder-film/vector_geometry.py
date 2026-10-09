"""Exact original vector contours for reusable native ident geometry."""
import re
import bpy

def svg_contours(path):
 """Exact quadratic→cubic conversion; no raster tracing or silhouette erosion."""
 tokens=re.findall(r'[A-Za-z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?',path);i=0;cmd=None;cur=(0,0);start=None;contours=[];items=[]
 def take(n):
  nonlocal i
  vals=[float(v) for v in tokens[i:i+n]];i+=n;return vals
 while i<len(tokens):
  if tokens[i].isalpha():cmd=tokens[i];i+=1
  if cmd=='Z':
   if cur!=start:items.append((cur,cur,start,start))
   contours.append(items);items=[];cur=start;cmd=None;continue
  if cmd=='M':
   cur=tuple(take(2));start=cur;cmd='L';continue
  if cmd=='L':end=tuple(take(2));items.append((cur,cur,end,end));cur=end
  elif cmd=='H':end=(take(1)[0],cur[1]);items.append((cur,cur,end,end));cur=end
  elif cmd=='V':end=(cur[0],take(1)[0]);items.append((cur,cur,end,end));cur=end
  elif cmd=='C':a,b,c,d,e,f=take(6);end=(e,f);items.append((cur,(a,b),(c,d),end));cur=end
  elif cmd=='Q':a,b,c,d=take(4);end=(c,d);c1=(cur[0]+2*(a-cur[0])/3,cur[1]+2*(b-cur[1])/3);c2=(end[0]+2*(a-end[0])/3,end[1]+2*(b-end[1])/3);items.append((cur,c1,c2,end));cur=end
  else:raise ValueError('Unsupported original SVG command '+str(cmd))
 return contours

def outline(part,transform,offset,scale,material):
 cu=bpy.data.curves.new(part['id']+' original Beziers','CURVE');cu.dimensions='2D';cu.fill_mode='BOTH';cu.resolution_u=16;cu.extrude=.08;cu.bevel_depth=.008;cu.bevel_resolution=3
 a,b,c,d,e,f=transform
 def co(p):x,y=p;return ((a*x+c*y+e+offset[0])*scale,-(b*x+d*y+f+offset[1])*scale,0)
 for segments in svg_contours(part['path']):
  sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(segments)-1);sp.use_cyclic_u=True
  for j,seg in enumerate(segments):
   bp=sp.bezier_points[j];bp.co=co(seg[0]);bp.handle_left_type='FREE';bp.handle_right_type='FREE';bp.handle_right=co(seg[1]);bp.handle_left=co(segments[j-1][2])
 o=bpy.data.objects.new(part['id'],cu);bpy.context.collection.objects.link(o);cu.materials.append(material);return o
