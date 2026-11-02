"""Bounded source-resolution refinement of opaque objects, preserving the person.

SAM per-object evidence, rather than a held union silhouette, distinguishes the
moving person from large stationary surfaces. Graph-cut classification is only
allowed to alter the latter. Closed-form alpha resolves a three-pixel boundary;
soft person alpha is retained. No new weights or synthesized source RGB.
"""
from pathlib import Path
import json,hashlib,tarfile
import cv2,numpy as np
from PIL import Image
from model_workers.common import canonical,sha

def refine_corrected_object_alpha(rgb, alpha, reference, points, box, protect=None):
 """Refine a fixed object's soft matte from its authored colour examples.

 A low-resolution object mask can make a bright background gap opaque. A
 local closed-form solve cannot correct it when that same wrong pixel is a
 known-FG seed. Distinct background clicks may revoke those seeds, within the
 selected box and only on source pixels unchanged since the click. Foreground
 examples, current person occlusions, and all pixels outside the box persist.
 This is conservative colour evidence, not an inferred clean background plate.
 """
 from pymatting import estimate_alpha_cf
 from pymatting.preconditioner.ichol import ichol
 if rgb.shape != reference.shape or alpha.shape != rgb.shape[:2]:
  raise ValueError('Corrective source geometry differs')
 h,w=alpha.shape;x0,y0,x1,y1=map(int,box)
 if not(0<=x0<x1<=w and 0<=y0<y1<=h):raise ValueError('Invalid corrective object region')
 if protect is not None and protect.shape!=alpha.shape:raise ValueError('Invalid correction protection')
 labelled={0:[],1:[]}
 for point in points:
  px,py=point['position'];label=point['label']
  if label not in (0,1) or not(0<=px<=1 and 0<=py<=1):raise ValueError('Invalid corrective object point')
  x=min(w-1,round(px*w));y=min(h-1,round(py*h))
  # An example outside the selected box may explain its background, but does
  # not grant permission to alter pixels at that unrelated source location.
  patch=reference[max(0,y-1):min(h,y+2),max(0,x-1):min(w,x+2)]
  labelled[label].extend(patch.reshape(-1,3))
 if not labelled[0] or not labelled[1]:return alpha.copy()
 pixels=rgb[y0:y1,x0:x1].astype(np.float32);prior=alpha[y0:y1,x0:x1]
 def distance(samples):
  nearest=np.full(prior.shape,np.inf,np.float32)
  for colour in np.unique(np.asarray(samples,dtype=np.float32),axis=0):
   nearest=np.minimum(nearest,np.linalg.norm(pixels-colour,axis=2))
  return nearest
 background,foreground=distance(labelled[0]),distance(labelled[1])
 stationary=np.max(np.abs(pixels-reference[y0:y1,x0:x1].astype(np.float32)),axis=2)<=24
 eligible=stationary.copy()
 if protect is not None:eligible&=~protect[y0:y1,x0:x1].astype(bool)
 selected=(prior>=128).astype(np.uint8)
 distance_map=cv2.distanceTransform(selected,cv2.DIST_L2,5)
 thin_core=(prior>=230)&(distance_map>=cv2.dilate(distance_map,np.ones((3,3),np.uint8))-.01)&(distance_map>=1)&(distance_map<=2)
 # Source-colour overlap is especially common on a one-pixel stem reflecting
 # a bright screen. Its already selected opaque medial seed must survive.
 reject=(background<22)&(background+24<foreground)&eligible&~thin_core
 # No distinct corrective background colour means no new solve or change.
 if not np.any(reject & (prior>8)):return alpha.copy()
 tri=np.full(prior.shape,.5,np.float64);tri[prior<=8]=0
 tri[cv2.erode((prior>=245).astype(np.uint8),np.ones((3,3),np.uint8))>0]=1
 tri[thin_core]=1
 tri[reject]=0
 for point in points:
  x=min(w-1,round(point['position'][0]*w));y=min(h-1,round(point['position'][1]*h))
  if x0<=x<x1 and y0<=y<y1 and eligible[y-y0,x-x0]:
   cv2.circle(tri,(x-x0,y-y0),1,float(point['label']),-1)
 if not (tri==0).any() or not (tri==1).any():return alpha.copy()
 values=estimate_alpha_cf(pixels.astype(np.float64)/255,tri,laplacian_kwargs={'epsilon':1e-6},
  preconditioner=lambda matrix:ichol(matrix,shifts=[.01,.1,1,10,100,1000]),cg_kwargs={'rtol':1e-6,'maxiter':1000})
 if not np.isfinite(values).all():raise ValueError('Nonfinite corrected object alpha')
 changed=np.rint(values.clip(0,1)*255).astype(np.uint8)
 result=alpha.copy();region=result[y0:y1,x0:x1]
 region[eligible]=changed[eligible]
 return result

def load_guidance(spec,work,source,count):
 dep=spec.get('componentDependency')
 if not dep:return None
 artifact=dep['artifact'];core={k:v for k,v in artifact.items() if k!='artifactHash'}
 request=spec['request']
 if (hashlib.sha256(canonical(core).encode()).hexdigest()!=artifact['artifactHash'] or
     artifact['ownerUid']!=spec['ownerUid'] or artifact['projectId']!=request['projectId'] or
     artifact['sourceSha256']!=request['sourceSha256'] or artifact['sourceRange']!=request['sourceRange'] or
     artifact['sourceAssetId']!=request['sourceAssetId'] or artifact['provenance']['sourceGeneration']!=spec['source']['generation']):
  raise ValueError('Component source binding changed')
 bundle=work/'component_dependency.tar.gz';file=dep['file']
 if bundle.stat().st_size!=file['bytes'] or sha(bundle)!=file['sha256']:raise ValueError('Component guidance bytes changed')
 directory=work/'component_dependency';directory.mkdir()
 with tarfile.open(bundle,'r:gz') as archive:
  members=archive.getmembers()
  if len(members)>1+9*count or any(not m.isfile() or Path(m.name).name!=m.name or m.size>8*1024**2 for m in members) or sum(m.size for m in members)>120*1024**2:raise ValueError('Invalid component archive')
  archive.extractall(directory,members=members,filter='data')
 manifest=json.loads((directory/'manifest.json').read_text())
 if manifest['source_sha256']!=sha(source) or manifest['frame_count']!=count:raise ValueError('Component source clock changed')
 for component in manifest['components']:
  if len(component['frames'])!=count:raise ValueError('Incomplete component guidance')
  for i,row in enumerate(component['frames']):
   if row['index']!=i or sha(directory/row['file'])!=row['sha256']:raise ValueError('Component frame changed')
 decoder=cv2.VideoCapture(str(source));ok,bgr=decoder.read();decoder.release()
 if not ok:raise ValueError('Missing source reference frame')
 manifest['_reference_rgb']=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)
 return directory,manifest

def refine_source_edge(rgb,alpha,guidance,index,*,colour_component_ids=()):
 from importlib.metadata import version
 if version('pymatting')!='1.1.16':raise ValueError('Source edge refinement requires pymatting 1.1.16')
 from pymatting import estimate_alpha_cf
 from pymatting.preconditioner.ichol import ichol
 selected=(alpha>=128).astype(np.uint8)
 # Solve only the supported alpha silhouette: graph cuts cannot grow a new
 # object outside this bounded search region or key arbitrary source colours.
 if guidance:
  directory,manifest=guidance;editable=np.zeros(alpha.shape,np.uint8);surfaces=[];others=np.zeros(alpha.shape,np.uint8)
  person=np.array(Image.open(directory/manifest['components'][0]['frames'][index]['file']))
  for component in manifest['components'][1:]:
   evidence=np.array(Image.open(directory/component['frames'][index]['file']))
   if component['selection'].get('propagate',True):
    others|=(evidence>=24).astype(np.uint8);continue
   binary=(evidence>=128).astype(np.uint8)
   # A closed opaque surface has a substantial interior. Fine foliage and
   # equipment never qualify for this silhouette reclassification.
   core=cv2.erode(binary,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(41,41)))
   if core.sum()<15000 or core.sum()/max(1,binary.sum())<.55:
    others|=(evidence>=24).astype(np.uint8);continue
   # Held masks contain holes where the person occluded the furniture on the
   # first frame. Let CURRENT source colour classify each connected surface's
    # search region; a union dilation alone cannot recover these gaps.
   count,labels,stats,_=cv2.connectedComponentsWithStats(binary,8)
   envelope=np.zeros_like(binary)
   for n in range(1,count):
    if stats[n,cv2.CC_STAT_AREA]<1000:continue
    points=cv2.findNonZero((labels==n).astype(np.uint8))
    cv2.fillConvexPoly(envelope,cv2.convexHull(points),1)
   editable|=cv2.dilate(envelope,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7)))
   region=np.zeros_like(binary)
   x0,y0,x1,y1=component['roi'];region[y0:y1,x0:x1]=1
   surfaces.append((binary,envelope,region))
  # Keep the CURRENT tracked subject, including its uncertain boundary. A
  # convex hull would also protect old furniture/arm silhouette errors in the
  # gap revealed when a hand moves, so protection follows the actual track.
  protect=cv2.dilate((person>=24).astype(np.uint8),np.ones((7,7),np.uint8))
  if editable.any():
   classified=np.zeros_like(selected)
   for binary,envelope,region in surfaces:
    mask=np.full(alpha.shape,cv2.GC_BGD,np.uint8)
    search=region>0
    mask[search]=cv2.GC_PR_BGD;mask[envelope>0]=cv2.GC_PR_FGD
    inside=cv2.erode(binary,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(21,21)))>0
    reference=manifest.get('_reference_rgb')
    if reference is not None:
     # A first-frame person's arm is not a valid stationary-chair FG seed
     # after it moves away. Only unchanged photographed seed colours persist.
     inside&=np.max(np.abs(rgb.astype(np.int16)-reference.astype(np.int16)),axis=2)<=12
    if np.count_nonzero(inside)<64:continue
    mask[inside]=cv2.GC_FGD
    x,y,w,h=cv2.boundingRect(region)
    x0,y0=max(0,x-32),max(0,y-32);x1,y1=min(rgb.shape[1],x+w+32),min(rgb.shape[0],y+h+32)
    # Work on the selected object's source ROI, preserving a real background
    # margin. Full-frame GMM fitting both wastes CPU and lets unrelated colours
    # influence a small object at the other side of the shot.
    local=mask[y0:y1,x0:x1].copy()
    cv2.setRNGSeed(0)
    cv2.grabCut(rgb[y0:y1,x0:x1].copy(),local,None,np.zeros((1,65)),np.zeros((1,65)),3,cv2.GC_INIT_WITH_MASK)
    mask[y0:y1,x0:x1]=local
    candidate=np.isin(mask,[cv2.GC_FGD,cv2.GC_PR_FGD]).astype(np.uint8)
    _,labels=cv2.connectedComponents(candidate,8)
    touched=np.unique(labels[inside]);touched=touched[touched!=0]
    classified|=np.isin(labels,touched).astype(np.uint8)
   # A broad person track may also cover an initially occluded chair. Protect
   # the person from deletion, while allowing source-confirmed opaque furniture
   # to fill a newly revealed hole in that same envelope.
   preserve=cv2.dilate(others,np.ones((5,5),np.uint8))|protect
   classified[preserve>0]=np.maximum(classified[preserve>0],selected[preserve>0])
   selected[editable>0]=classified[editable>0]
   selected=np.maximum(selected,classified)
 # A fine, source-resolution alpha band sharpens solid surfaces and leaves
 # opaque interiors exact. Keep the existing fractional hair/skin boundary.
 kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7))
 inside=cv2.erode(selected,kernel)>0;outside=cv2.dilate(selected,kernel)==0
 strong=(alpha>=230).astype(np.uint8);distance=cv2.distanceTransform(selected,cv2.DIST_L2,5)
 medial=(distance>=cv2.dilate(distance,np.ones((3,3),np.uint8))-.01)&(distance>=1)&(distance<=3)&(strong>0)
 inside|=medial
 trimap=np.full(alpha.shape,.5);trimap[inside]=1;trimap[outside]=0
 values=estimate_alpha_cf(rgb.astype(np.float64)/255,trimap,laplacian_kwargs={'epsilon':1e-6},
  preconditioner=lambda matrix:ichol(matrix,shifts=[.01,.1,1,10,100,1000]),cg_kwargs={'rtol':1e-6,'maxiter':500})
 if not np.isfinite(values).all():raise ValueError('Nonfinite source edge alpha')
 result=np.rint(np.clip(values,0,1)*255).astype(np.uint8)
 if guidance:
  # The photographed person uses the video-conditioned alpha, not the
  # rigid-surface solve. This avoids cutting white cloth against a pale wall.
  protected=(protect>0)&(alpha>0)
  result[protected&(editable==0)]=alpha[protected&(editable==0)]
  shared=protected&(editable>0)
  result[shared]=np.maximum(result[shared],alpha[shared])
  if colour_component_ids:
   reference=manifest.get('_reference_rgb')
   if reference is not None:
    for component in manifest['components'][1:]:
     selection=component['selection']
     if selection.get('propagate',True) or selection['id'] not in colour_component_ids:continue
     box=selection['box'];region=[max(0,round(box[0]*rgb.shape[1])),max(0,round(box[1]*rgb.shape[0])),
       min(rgb.shape[1],round(box[2]*rgb.shape[1])),min(rgb.shape[0],round(box[3]*rgb.shape[0]))]
     # Start from the soft neural alpha. The preceding thresholded rigid-edge
     # solve is not authoritative for thin leaves or fractional source pixels.
     corrected=refine_corrected_object_alpha(rgb,alpha,reference,selection['points'],region,protect)
     x0,y0,x1,y1=region;allowed=(protect[y0:y1,x0:x1]==0)
     result[y0:y1,x0:x1][allowed]=corrected[y0:y1,x0:x1][allowed]
 return result
