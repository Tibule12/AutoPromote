import unittest,tempfile
from pathlib import Path
import cv2,numpy as np
from PIL import Image
from model_workers.adapters.temporal_alpha import make_trimap,stabilize,aligned_neighbor,stabilize_stationary_source
class TemporalAlpha(unittest.TestCase):
 def stationary_fixture(self, directory, values, moving=False):
  p=Path(directory);rgb=p/'rgb';masks=p/'masks';tri=p/'tri'
  for d in [rgb,masks,tri]:d.mkdir()
  for i,value in enumerate(values):
   image=np.full((24,24,3),100,np.uint8)
   if moving:image[8:16,8:16]=30+i*10
   Image.fromarray(image).save(rgb/f'rgb_{i:04d}.png')
   a=np.full((24,24),value,np.uint8);a[0,0]=17
   Image.fromarray(a).save(masks/f'matte_{i:04d}.png')
   t=np.full((24,24),128,np.uint8);t[0,0]=255
   Image.fromarray(t).save(tri/f'trimap_{i:04d}.png')
  return rgb,masks,tri
 def test_unchanged_source_surface_does_not_inherit_opacity_chatter(self):
  with tempfile.TemporaryDirectory() as directory:
   rgb,masks,tri=self.stationary_fixture(directory,[250]*7+[80])
   result=stabilize_stationary_source(rgb,masks,tri,8)
   repaired=np.asarray(Image.open(masks/'matte_0007.png'))
   self.assertEqual(int(repaired[12,12]),250)
   self.assertEqual(int(repaired[0,0]),17) # Existing authoritative seed unchanged.
   self.assertGreater(result['intervals'][0]['changedPixelFrames'],0)
 def test_moving_or_newly_occluded_source_pixels_are_not_frozen(self):
  with tempfile.TemporaryDirectory() as directory:
   rgb,masks,tri=self.stationary_fixture(directory,[250]*7+[80],moving=True)
   stabilize_stationary_source(rgb,masks,tri,8)
   result=np.asarray(Image.open(masks/'matte_0007.png'))
   self.assertEqual(int(result[12,12]),80)
   self.assertEqual(int(result[18,18]),250)
 def test_stationary_consensus_does_not_vote_across_a_corrective_click(self):
  with tempfile.TemporaryDirectory() as directory:
   rgb,masks,tri=self.stationary_fixture(directory,[25]*8+[240]*7+[80])
   stabilize_stationary_source(rgb,masks,tri,16,[8])
   self.assertEqual(int(np.asarray(Image.open(masks/'matte_0007.png'))[12,12]),25)
   self.assertEqual(int(np.asarray(Image.open(masks/'matte_0015.png'))[12,12]),240)
 def test_unrelated_static_objects_do_not_reset_when_one_object_is_corrected(self):
  with tempfile.TemporaryDirectory() as directory:
   rgb,masks,tri=self.stationary_fixture(directory,[25]*8+[240]*8)
   # A tiny correction box is expanded conservatively around the selected
   # object. Use a larger canvas to inspect an unrelated surface outside it.
   for i in range(16):
    Image.new('RGB',(128,64),(100,100,100)).save(rgb/f'rgb_{i:04d}.png')
    Image.new('L',(128,64),25 if i<8 else 240).save(masks/f'matte_{i:04d}.png')
   stabilize_stationary_source(rgb,masks,tri,16,[8],{8:[[.7,.3,.8,.6]]})
   left=np.asarray(Image.open(masks/'matte_0007.png'));right=np.asarray(Image.open(masks/'matte_0008.png'))
   self.assertEqual(int(left[30,10]),int(right[30,10]))
   self.assertEqual(int(left[30,95]),25);self.assertEqual(int(right[30,95]),240)
 def test_thin_equipment_retains_seeds_without_expanding_known_foreground(self):
  m=np.zeros((64,64),np.uint8);m[10:55,30:33]=1;t=make_trimap(m,16)
  self.assertTrue(np.any(t[10:55,30:33]==255));self.assertFalse(np.any((t==255)&(m==0)));self.assertEqual(t[0,0],0)
 def test_logit_strength_does_not_make_a_solid_selected_interior_translucent(self):
  evidence=np.zeros((64,64),np.uint8);evidence[10:55,10:55]=170
  trimap=make_trimap((evidence>=128).astype(np.uint8),12,evidence)
  self.assertEqual(trimap[30,30],255);self.assertEqual(trimap[0,0],0)
 def test_weak_room_evidence_cannot_make_a_distant_background_panel_unknown(self):
  evidence=np.zeros((96,160),np.uint8);evidence[10:85,10:50]=230
  evidence[5:70,85:145]=40
  trimap=make_trimap((evidence>=128).astype(np.uint8),8,evidence)
  self.assertEqual(trimap[40,110],0)
  self.assertEqual(trimap[40,30],255)
 def test_soft_evidence_beside_the_subject_retains_a_bounded_unknown_band(self):
  evidence=np.zeros((96,160),np.uint8);evidence[10:85,10:50]=230
  evidence[15:80,50:52]=60
  trimap=make_trimap((evidence>=128).astype(np.uint8),8,evidence)
  self.assertEqual(trimap[40,51],128)
  self.assertEqual(trimap[40,70],0)
 def test_separate_object_evidence_can_retain_a_fine_stem_without_admitting_the_wall(self):
  evidence=np.zeros((96,160),np.uint8);evidence[10:85,10:50]=230
  evidence[5:70,85:145]=40;evidence[15:80,100]=80
  objects=np.zeros(evidence.shape,bool);objects[15:80,100]=True
  trimap=make_trimap((evidence>=128).astype(np.uint8),8,evidence,objects)
  self.assertEqual(trimap[40,100],128)
  self.assertEqual(trimap[40,135],0)
 def test_changed_surface_is_rejected_instead_of_ghosting_neighbor_alpha(self):
  current=np.full((64,64,3),220,np.uint8);other=np.full_like(current,20)
  _,confidence=aligned_neighbor(current,other,np.ones((64,64),np.float32))
  self.assertEqual(float(confidence.max()),0)
 def test_motion_is_warped_and_corrections_cannot_blend_backwards(self):
  with tempfile.TemporaryDirectory() as directory:
   p=Path(directory);rgb=p/'rgb';masks=p/'masks';trimap=p/'trimaps'
   for d in [rgb,masks,trimap]:d.mkdir()
   for i in range(2):
    a=np.zeros((64,64),np.uint8);a[10:50,20+i:45+i]=255
    image=np.zeros((64,64,3),np.uint8);image[:,:,0]=a
    Image.fromarray(image).save(rgb/f'rgb_{i:04d}.png');Image.fromarray(a).save(masks/f'matte_{i:04d}.png');Image.fromarray(make_trimap((a>0).astype(np.uint8),4)).save(trimap/f'trimap_{i:04d}.png')
   result=stabilize(rgb,masks,trimap,2,[1]);self.assertEqual(result['maximumAlphaChange'],0)
   self.assertEqual(result['correctionBoundaries'],[1])
 def test_same_source_consensus_repairs_an_alpha_outlier_without_crossing_correction(self):
  with tempfile.TemporaryDirectory() as directory:
   p=Path(directory);rgb=p/'rgb';masks=p/'masks';tri=p/'tri'
   for d in [rgb,masks,tri]:d.mkdir()
   image=np.tile(np.arange(64,dtype=np.uint8)[None,:,None]*3,(64,1,3))
   for i,value in enumerate([0,80,255,255]):
    Image.fromarray(image).save(rgb/f'rgb_{i:04d}.png')
    Image.fromarray(np.full((64,64),value,np.uint8)).save(masks/f'matte_{i:04d}.png')
    Image.fromarray(np.full((64,64),128,np.uint8)).save(tri/f'trimap_{i:04d}.png')
   result=stabilize(rgb,masks,tri,4,[1],repair_outliers=True)
   self.assertEqual(result['algorithm'],'source_flow_consensus_v2')
   repaired=np.asarray(Image.open(masks/'matte_0001.png'))
   self.assertGreater(int(repaired[32,32]),250)
   self.assertEqual(int(np.asarray(Image.open(masks/'matte_0000.png'))[32,32]),0)
if __name__=='__main__':unittest.main()
