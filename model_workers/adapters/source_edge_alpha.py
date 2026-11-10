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
from model_workers.adapters.temporal_alpha import source_click_footprint


def source_frame_results(count, solve, workers=1):
 """Ordered source solves, with frame-zero reference setup completed first.

 At most two frames are in flight. GPU inference and temporal operations do
 not enter this helper. No completed frame is substituted for another one.
 """
 if type(count)is not int or count<1 or type(workers)is not int or workers not in(1,2):
  raise ValueError('Invalid bounded source-frame solve')
 yield 0,solve(0)
 if workers==1:
  for index in range(1,count):yield index,solve(index)
  return
 from concurrent.futures import ThreadPoolExecutor
 from collections import deque
 with ThreadPoolExecutor(max_workers=workers,thread_name_prefix='source-alpha')as pool:
  next_index=1;pending=deque()
  while next_index<count and len(pending)<workers:
   pending.append((next_index,pool.submit(solve,next_index)));next_index+=1
  while pending:
   index,future=pending.popleft()
   values=future.result()
   yield index,values
   if next_index<count:
    pending.append((next_index,pool.submit(solve,next_index)));next_index+=1


def _stamp_fixed_click(plane,reference,x,y,label,foreground=1,background=0):
 x0,y0,x1,y1,allowed=source_click_footprint(reference,x,y,1,label==1)
 plane[y0:y1,x0:x1][allowed]=foreground if label else background

def _preserve_unassigned_foreground(original, candidate, evidence, background_points):
 """A fixed prop may lower only its own evidence or an authored BG point."""
 owned=(evidence>=24).astype(np.uint8)
 for x,y in background_points:cv2.circle(owned,(x,y),1,1,-1)
 return np.where((owned>0)|(candidate>=original),candidate,original).astype(np.uint8),owned

def classify_corrected_fixed_object(rgb, alpha, reference, points, box, object_evidence, protect=None, *, source_seeded_foreground=False, bounded_source_growth=False, reference_evidence=None, independent_source=False):
 """Use independent object evidence and real clicks to refine a fixed prop.

 Only unchanged source pixels in this explicitly selected object's box may
 change. Other selected foreground stays exact. Thin model-supported medial
 seeds survive the colour classifier; a union mask cannot seed TV casing as
 part of a nearby plant. No new model or imagined background is introduced.
 """
 from pymatting import estimate_alpha_cf
 from pymatting.preconditioner.ichol import ichol
 if rgb.shape!=reference.shape or alpha.shape!=rgb.shape[:2] or object_evidence.shape!=alpha.shape:
  raise ValueError('Fixed-object evidence geometry differs')
 if protect is not None and protect.shape!=alpha.shape:raise ValueError('Fixed-object protection differs')
 if reference_evidence is not None and reference_evidence.shape!=alpha.shape:
  raise ValueError('Fixed-object reference evidence geometry differs')
 h,w=alpha.shape;x0,y0,x1,y1=map(int,box)
 if not(0<=x0<x1<=w and 0<=y0<y1<=h):raise ValueError('Invalid fixed-object region')
 if len([p for p in points if p['label']==1])<3 or len([p for p in points if p['label']==0])<3:return None
 picture=rgb[y0:y1,x0:x1].copy();pr=object_evidence[y0:y1,x0:x1]
 blocked=np.zeros(pr.shape,bool) if protect is None else protect[y0:y1,x0:x1].astype(bool)
 eligible=(np.max(np.abs(picture.astype(np.int16)-reference[y0:y1,x0:x1].astype(np.int16)),axis=2)<=24)&~blocked
 if reference_evidence is not None:
  # Fixed equipment can lose neural confidence even when the photographed
  # surface has not changed. Its source-bound first-frame evidence may retain
  # that detail only on agreeing current RGB, outside every protected person
  # or neighbouring object. Changed/occluded pixels still use current evidence.
  # This supplies a search bound, never a held alpha or copied source picture.
  pr=np.where(eligible,np.maximum(pr,reference_evidence[y0:y1,x0:x1]),pr)
 gc=np.full(pr.shape,cv2.GC_PR_BGD,np.uint8);gc[pr>=128]=cv2.GC_PR_FGD
 if source_seeded_foreground:
  # A low segmentation logit cannot veto an explicit source-material
  # correction. Keep the selected object's border and actual BG constraints.
  gc[0,:]=cv2.GC_BGD;gc[-1,:]=cv2.GC_BGD;gc[:,0]=cv2.GC_BGD;gc[:,-1]=cv2.GC_BGD
 else:
  gc[cv2.dilate((pr>=64).astype(np.uint8),np.ones((5,5),np.uint8))==0]=cv2.GC_BGD
 gc[cv2.erode((pr>=180).astype(np.uint8),np.ones((3,3),np.uint8))>0]=cv2.GC_FGD
 distance=cv2.distanceTransform((pr>=128).astype(np.uint8),cv2.DIST_L2,5)
 medial=(distance>=cv2.dilate(distance,np.ones((3,3),np.uint8))-.01)&(distance>=1)&(distance<=2)&(pr>=128)&~blocked
 gc[medial]=cv2.GC_FGD;gc[blocked]=cv2.GC_BGD
 authored=[]
 for point in points:
  px,py=point['position'];label=point['label']
  if label not in (0,1) or not(0<=px<=1 and 0<=py<=1):raise ValueError('Invalid fixed-object point')
  x=min(w-1,round(px*w))-x0;y=min(h-1,round(py*h))-y0
  if 0<=x<x1-x0 and 0<=y<y1-y0 and eligible[y,x]:
   authored.append((x,y,label));_stamp_fixed_click(gc,reference[y0:y1,x0:x1],x,y,label,cv2.GC_FGD,cv2.GC_BGD)
 gc[blocked]=cv2.GC_BGD
 if source_seeded_foreground:
  samples={0:[],1:[]}
  for x,y,label in authored:samples[label].append(picture[y,x].astype(np.float32))
  def colour_distance(values):
   result=np.full(pr.shape,np.inf,np.float32)
   for colour in values:result=np.minimum(result,np.linalg.norm(picture.astype(np.float32)-colour,axis=2))
   return result
  foreground,background=colour_distance(samples[1]),colour_distance(samples[0])
  material=(foreground<22)&(foreground+24<background)&eligible
  empty=(background<22)&(background+24<foreground)&eligible
  # Matching colour elsewhere in the TV is not another leaf. New definite
  # foreground must connect to a real authored foreground-material sample.
  _,material_labels=cv2.connectedComponents(material.astype(np.uint8),8)
  material_seeds=[material_labels[y,x]for x,y,label in authored if label and material_labels[y,x]>0]
  if not material_seeds and not independent_source:return None
  # Independent solves can use their own tracked silhouette when colour is
  # ambiguous. They cannot use colour to grow beyond that bounded support.
  connected_material=material&np.isin(material_labels,material_seeds)
  gc[connected_material]=cv2.GC_FGD
  _,prior_labels=cv2.connectedComponents((alpha[y0:y1,x0:x1]>8).astype(np.uint8),8)
  source_anchors=[prior_labels[y,x]for x,y,label in authored if label and prior_labels[y,x]>0]
  prior_connected=np.isin(prior_labels,source_anchors)
  gc[(alpha[y0:y1,x0:x1]>=254)&(pr>=(180 if independent_source else 24))&prior_connected&~blocked]=cv2.GC_FGD
  # Colour samples cannot revoke independently tracked solid dark material.
  # A real rail/stem may match the old set; explicit BG clicks below still
  # override their own footprint when the user corrects that object.
  gc[empty&(pr<180)]=cv2.GC_BGD
  for x,y,label in authored:_stamp_fixed_click(gc,reference[y0:y1,x0:x1],x,y,label,cv2.GC_FGD,cv2.GC_BGD)
  gc[blocked]=cv2.GC_BGD
 if not any(p[2] for p in authored) or not any(not p[2] for p in authored):return None
 if not np.isin(gc,[cv2.GC_FGD,cv2.GC_PR_FGD]).any() or not np.isin(gc,[cv2.GC_BGD,cv2.GC_PR_BGD]).any():return None
 # Definite object seeds already supplied to GrabCut remain definite in the
 # alpha solve. Eroding the classified silhouette a second time discards
 # narrow dark rail interiors and makes opaque metal transparent again.
 # Authored exclusions and other selected objects have already won above.
 definite_foreground=gc==cv2.GC_FGD
 cv2.setRNGSeed(0)
 cv2.grabCut(picture,gc,None,np.zeros((1,65)),np.zeros((1,65)),5,cv2.GC_INIT_WITH_MASK)
 selected=np.isin(gc,[cv2.GC_FGD,cv2.GC_PR_FGD]).astype(np.uint8)
 if source_seeded_foreground:
  _,seed_labels=cv2.connectedComponents(selected,8)
  touched=np.unique(seed_labels[definite_foreground]);touched=touched[touched!=0]
  selected=np.isin(seed_labels,touched).astype(np.uint8)
 growth_domain=None
 if source_seeded_foreground and bounded_source_growth:
  # GrabCut's colour proposal can extend a black microphone stand into the
  # adjoining old TV casing, even where both SAM and the neural alpha say BG.
  # New low-logit material needs its own authored source evidence, including
  # a small soft boundary; a connected colour proposal alone is insufficient.
  growth_domain=(pr>=24)|(alpha[y0:y1,x0:x1]>8)|(cv2.dilate(
      connected_material.astype(np.uint8),np.ones((7,7),np.uint8))>0)
  if independent_source:
   # A separately solved object's alpha cannot make its own uncertain band
   # authoritative. Keep current strong support, one source-pixel boundary,
   # and connected, explicitly sampled material; never another object's union.
   growth_domain=(pr>=64)|(cv2.dilate((pr>=128).astype(np.uint8),np.ones((3,3),np.uint8))>0)|connected_material|definite_foreground
  selected[~growth_domain]=0
 tri=np.full(pr.shape,.5);tri[cv2.erode(selected,np.ones((3,3),np.uint8))>0]=1
 tri[cv2.dilate(selected,np.ones((5,5),np.uint8))==0]=0
 tri[medial&(selected>0) if source_seeded_foreground else medial]=1
 tri[definite_foreground]=1
 for x,y,label in authored:_stamp_fixed_click(tri,reference[y0:y1,x0:x1],x,y,label)
 tri[blocked]=0
 if not (tri==0).any() or not (tri==1).any():return None
 values=estimate_alpha_cf(picture.astype(np.float64)/255,tri,laplacian_kwargs={'epsilon':1e-6},
  preconditioner=lambda matrix:ichol(matrix,shifts=[.01,.1,1,10,100,1000]),cg_kwargs={'rtol':1e-6,'maxiter':1000})
 if not np.isfinite(values).all():raise ValueError('Nonfinite classified fixed-object alpha')
 result=alpha.copy();region=result[y0:y1,x0:x1];candidate=np.rint(values.clip(0,1)*255).astype(np.uint8)
 if growth_domain is not None:candidate[~growth_domain]=0 if independent_source else region[~growth_domain]
 # The union matte may contain real clothing/detail missed by every separate
 # tracker. A prop's rectangular ROI does not give it ownership of those pixels.
 # Keep existing unassigned foreground; explicit BG clicks still exclude their
 # own footprint and source-confirmed additions retain their previous scope.
 if not independent_source:
  candidate,_=_preserve_unassigned_foreground(region,candidate,pr,[(x,y)for x,y,label in authored if not label])
 region[eligible]=candidate[eligible]
 return result

def refine_independent_fixed_objects(rgb,alpha,guidance,index,component_ids):
 """Resolve selected fixed props independently before union with the person.

 Only verified, explicitly selected fixed-object inference ROIs are writable.
 Those include the source prompt margin and its actual authored BG examples.
 Current person and
 moving-detail envelopes retain their incoming neural alpha, including missed
 internal clothing. Each object's source-resolution solve starts with its OWN
 segmentation support. A neighbouring leaf or false TV alpha is never a seed.
 No source RGB, held pose, model weight or artifact identity is substituted.
 """
 from importlib.metadata import version
 if version('pymatting')!='1.1.16':raise ValueError('Source edge refinement requires pymatting 1.1.16')
 from pymatting import estimate_alpha_cf
 from pymatting.preconditioner.ichol import ichol
 if not guidance or not component_ids:return alpha.copy()
 directory,manifest=guidance;reference=manifest.get('_reference_rgb')
 if (reference is None or reference.shape!=rgb.shape or rgb.shape!=(*alpha.shape,3)
     or rgb.dtype!=np.uint8 or alpha.dtype!=np.uint8 or alpha.ndim!=2):
  raise ValueError('Independent fixed-object source geometry differs')
 components=manifest['components'];planes=[np.asarray(Image.open(directory/c['frames'][index]['file']))for c in components]
 if any(p.shape!=alpha.shape or p.dtype!=np.uint8 for p in planes):raise ValueError('Independent fixed-object guidance differs')
 primary=(planes[0]>=128).astype(np.uint8)
 if np.count_nonzero(primary)<64:return alpha.copy()
 protect=np.zeros(alpha.shape,np.uint8)
 for c,p in zip(components,planes):
  selection=c['selection']
  if selection.get('propagate',True):
   binary=(p>=128).astype(np.uint8)
   if binary.any():cv2.fillConvexPoly(protect,cv2.convexHull(cv2.findNonZero(binary)),1)
   protect|=(p>=24).astype(np.uint8)
  elif selection['id'] not in component_ids:protect|=(p>=24).astype(np.uint8)
 protect=cv2.dilate(protect,np.ones((15,15),np.uint8))>0
 # A changed photographed pixel is not authorized by a reference-frame
 # correction. Preserve its incoming alpha even if the tracker missed a hand.
 protect|=np.max(np.abs(rgb.astype(np.int16)-reference.astype(np.int16)),axis=2)>24
 combined=np.zeros(alpha.shape,np.uint8);domain=np.zeros(alpha.shape,bool)
 abstained=np.zeros(alpha.shape,np.uint8)
 h,w=alpha.shape
 for component,plane in zip(components[1:],planes[1:]):
  selection=component['selection']
  if selection.get('propagate',True)or selection['id']not in component_ids:continue
  if len([p for p in selection['points']if p['label']])<3 or len([p for p in selection['points']if not p['label']])<3:
   abstained|=(plane>=24).astype(np.uint8);continue
  region=component.get('roi',[round(v*s)for v,s in zip(selection['box'],[w,h,w,h])])
  if len(region)!=4 or any(type(v)not in(int,float)or not np.isfinite(v)or int(v)!=v for v in region):
   raise ValueError('Independent fixed-object ROI differs')
  x0,y0,x1,y1=map(int,region)
  if not(0<=x0<x1<=w and 0<=y0<y1<=h):raise ValueError('Independent fixed-object box differs')
  plane=plane.copy()
  first=manifest.get('_classified_independent_fixed_support',{}).get(selection['id'])
  if first is not None:
   agree=np.max(np.abs(rgb.astype(np.int16)-reference.astype(np.int16)),axis=2)<=12
   plane=np.where(agree&~protect,np.maximum(plane,first),plane).astype(np.uint8)
  selected=(plane[y0:y1,x0:x1]>=128).astype(np.uint8)
  inside=cv2.erode(selected,np.ones((3,3),np.uint8))>0
  outside=cv2.dilate(selected,np.ones((7,7),np.uint8))==0
  if not inside.any()or not outside.any():
   abstained|=(plane>=24).astype(np.uint8);continue
  tri=np.full(selected.shape,.5);tri[inside]=1;tri[outside]=0
  values=estimate_alpha_cf(rgb[y0:y1,x0:x1].astype(np.float64)/255,tri,
      laplacian_kwargs={'epsilon':1e-6},preconditioner=lambda m:ichol(m,shifts=[.01,.1,1,10,100,1000]),
      cg_kwargs={'rtol':1e-6,'maxiter':1000})
  if not np.isfinite(values).all():raise ValueError('Nonfinite independent fixed-object alpha')
  own=np.zeros(alpha.shape,np.uint8);own[y0:y1,x0:x1]=np.rint(values.clip(0,1)*255).astype(np.uint8)
  corrected=classify_corrected_fixed_object(rgb,own,reference,selection['points'],[x0,y0,x1,y1],plane,
      protect=protect,source_seeded_foreground=True,bounded_source_growth=True,independent_source=True)
  if corrected is None:
   abstained|=(plane>=24).astype(np.uint8);continue
  if index==0:
   # Opacity classification can exclude a model response, but cannot promote
   # a weak response to a new strong segmentation observation. In particular,
   # an isolated old-set fragment must not become a 255 reference seed and
   # reinforce itself on every subsequent source frame.
   manifest.setdefault('_classified_independent_fixed_support',{})[selection['id']]=np.where(
       (corrected>=250)&~protect,plane,0).astype(np.uint8)
  np.maximum(combined[y0:y1,x0:x1],corrected[y0:y1,x0:x1],out=combined[y0:y1,x0:x1])
  domain[y0:y1,x0:x1]=True
 # This stage subtracts old union contamination only outside the CURRENT
 # moving foreground. Unknown/missed body interiors cannot be erased by a
 # prop's box, and a moving arm is never held at the reference position.
 protect|=cv2.dilate(abstained,np.ones((15,15),np.uint8))>0
 result=alpha.copy();editable=domain&~protect
 result[editable]=combined[editable]
 return result

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
  samples=patch.reshape(-1,3)
  if label:samples=samples[np.max(np.abs(samples.astype(np.int16)-reference[y,x].astype(np.int16)),axis=1)<=32]
  labelled[label].extend(samples)
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
   _stamp_fixed_click(tri,reference[y0:y1,x0:x1],x-x0,y-y0,point['label'])
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

def refine_source_edge(rgb,alpha,guidance,index,*,colour_component_ids=(),classify_fixed_objects=False,source_seeded_foreground=False,bounded_source_growth=False,reference_fixed_evidence=False):
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
     correction_protect=protect.copy();corrected=None
     if classify_fixed_objects:
      # This object cannot erase a neighboring stand, another selected prop,
      # or the current person. Independent masks provide that ownership.
      for other in manifest['components'][1:]:
       if other is component:continue
       evidence=np.asarray(Image.open(directory/other['frames'][index]['file']))
       # Keep the neighboring object's fractional boundary as well as its
       # core; another prop's classifier cannot trim a stand's soft edge.
       other=cv2.dilate((evidence>=128).astype(np.uint8),np.ones((7,7),np.uint8))
       # Preserve other objects' existing fractional foreground. Their coarse
       # uncertain regions cannot prohibit recovering an absent real leaf.
       if source_seeded_foreground:other&=(alpha>0).astype(np.uint8)
       correction_protect|=other
      evidence=np.asarray(Image.open(directory/component['frames'][index]['file']))
      reference_evidence=None
      if reference_fixed_evidence and index>0:
       # A weak first-frame logit also covers nearby TV casing. It cannot
       # authorize new foreground after that SAME photographed pixel was
       # classified as background. Borrow confidence only within the first
       # source-classified object, excluding its then-occluding person/props.
       # This is a search bound: alpha and RGB are still solved on this frame.
       support=manifest.get('_classified_fixed_reference_support',{}).get(selection['id'])
       if support is not None:
        first=np.asarray(Image.open(directory/component['frames'][0]['file']))
        reference_evidence=np.where(support,first,0).astype(np.uint8)
      corrected=classify_corrected_fixed_object(rgb,alpha,reference,selection['points'],region,evidence,correction_protect,
          source_seeded_foreground=source_seeded_foreground,bounded_source_growth=bounded_source_growth,
          reference_evidence=reference_evidence)
      if reference_fixed_evidence and index==0:
       support=manifest.setdefault('_classified_fixed_reference_support',{})
       support.pop(selection['id'],None)
       if corrected is not None:
        support[selection['id']]=(corrected>8)&(correction_protect==0)
     if corrected is None:corrected=refine_corrected_object_alpha(rgb,alpha,reference,selection['points'],region,correction_protect)
     x0,y0,x1,y1=region;allowed=(correction_protect[y0:y1,x0:x1]==0)
     candidate=corrected[y0:y1,x0:x1]
     if classify_fixed_objects:
      # Guard the sparse-click fallback too. Copying its entire ROI could undo
      # an earlier prop's correction where this object merely kept the input.
      background_points=[(min(rgb.shape[1]-1,round(p['position'][0]*rgb.shape[1]))-x0,
                          min(rgb.shape[0]-1,round(p['position'][1]*rgb.shape[0]))-y0)
                         for p in selection['points'] if not p['label']]
      candidate,owned=_preserve_unassigned_foreground(alpha[y0:y1,x0:x1],candidate,
          evidence[y0:y1,x0:x1],background_points)
      allowed&=(owned>0)|(candidate!=alpha[y0:y1,x0:x1])
     result[y0:y1,x0:x1][allowed]=candidate[allowed]
 return result
