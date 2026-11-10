import unittest,tempfile
from pathlib import Path
import cv2,numpy as np
from PIL import Image
from model_workers.adapters.temporal_alpha import make_trimap,stabilize,aligned_neighbor,stabilize_stationary_source,source_motion_radius,condition_trimap_clicks,enclosed_person_interiors
class TemporalAlpha(unittest.TestCase):
 def test_fresh_trimap_cannot_inherit_a_previous_refinement_background_fragment(self):
  from model_workers.adapters.temporal_alpha import independent_selection_evidence
  person=np.zeros((128,128),np.uint8);person[16:110,12:66]=255
  rig=np.zeros_like(person);rig[14:114,84:89]=255
  defective=np.maximum(person,rig);defective[90:122,100:124]=255
  holdout=np.zeros(person.shape,bool)
  fresh=independent_selection_evidence([person,rig],holdout)
  old_trimap=make_trimap((defective>=128).astype(np.uint8),3,evidence=defective)
  new_trimap=make_trimap((fresh>=128).astype(np.uint8),3,evidence=fresh,
   weak_evidence_region=rig>=24,fixed_evidence=rig,primary_evidence=person)
  self.assertEqual(int(old_trimap[106,113]),255)
  self.assertEqual(int(new_trimap[106,113]),0)
  self.assertEqual(int(new_trimap[60,40]),255)
  self.assertEqual(int(new_trimap[60,86]),255)
  self.assertEqual(int(defective[106,113]),255)
 def test_independent_current_tracks_and_authored_holdout_preserve_exact_soft_codes(self):
  from model_workers.adapters.temporal_alpha import independent_selection_evidence
  person=np.zeros((40,60),np.uint8);person[10:25,10:30]=83
  hand=np.zeros_like(person);hand[15:30,20:40]=147
  holdout=np.zeros(person.shape,bool);holdout[5:8,45:49]=True
  before=[p.copy()for p in[person,hand,holdout]]
  actual=independent_selection_evidence([person,hand],holdout)
  self.assertEqual(int(actual[12,12]),83);self.assertEqual(int(actual[20,25]),147)
  self.assertTrue(np.all(actual[holdout]==255));self.assertEqual(int(actual[0,0]),0)
  for first,second in zip([person,hand,holdout],before):np.testing.assert_array_equal(first,second)
 def test_independent_track_geometry_and_types_cannot_be_silently_broadcast(self):
  from model_workers.adapters.temporal_alpha import independent_selection_evidence
  plane=np.zeros((20,30),np.uint8);holdout=np.zeros(plane.shape,bool)
  for parts,protected in[([],holdout),([plane[:10]],holdout),([plane.astype(float)],holdout),([plane],plane)]:
   with self.assertRaises(ValueError):independent_selection_evidence(parts,protected)
 def test_fixed_consensus_cannot_restore_zero_background_after_source_classification(self):
  with tempfile.TemporaryDirectory()as directory:
   rgb,masks,tri=self.stationary_fixture(directory,[250]*7+[0])
   detail=stabilize_stationary_source(rgb,masks,tri,8,selection_domain=np.ones((24,24),bool),
    maximum_source_range=32,preserve_current_background=True)
   actual=np.asarray(Image.open(masks/'matte_0007.png'))
   self.assertEqual(int(actual[12,12]),0);self.assertEqual(int(actual[0,0]),17)
   self.assertTrue(detail['currentKnownBackgroundPreserved'])
 def test_fixed_foreground_click_does_not_harden_contrasting_neighbor_pixels(self):
  rgb=np.full((64,64,3),180,np.uint8);rgb[24:40,32]=[25,30,28]
  tri=np.full((64,64),128,np.uint8);plane=np.zeros_like(tri)
  selection={'propagate':False,'points':[{'position':[.5,.5],'label':1}]}
  result=condition_trimap_clicks(tri,rgb,rgb.copy(),[(selection,plane)],0)
  self.assertEqual(result[32,32],255);self.assertEqual(result[30,32],255)
  self.assertEqual(result[32,31],128);self.assertEqual(result[32,34],128)
 def test_fixed_foreground_click_keeps_separate_bright_foreground_point(self):
  rgb=np.full((64,64,3),180,np.uint8);rgb[24:40,32]=[25,30,28]
  tri=np.full((64,64),128,np.uint8);plane=np.zeros_like(tri)
  prop={'propagate':False,'points':[{'position':[.5,.5],'label':1}]}
  other={'propagate':False,'points':[{'position':[34/64,.5],'label':1}]}
  result=condition_trimap_clicks(tri,rgb,rgb.copy(),[(prop,plane),(other,plane)],0)
  self.assertEqual(result[32,32],255);self.assertEqual(result[32,34],255)
  moved=rgb.copy();moved[30:35,32]=230
  self.assertEqual(condition_trimap_clicks(tri,moved,rgb,[(prop,plane)],1)[32,32],128)
 def test_dark_print_enclosed_in_opaque_person_is_not_background(self):
  person=np.zeros((400,500),np.uint8);person[20:380,20:480]=255;person[180:200,210:240]=20
  result=make_trimap((person>=128).astype(np.uint8),15,primary_evidence=person,fixed_evidence=np.zeros_like(person))
  self.assertTrue(np.all(result[180:200,210:240]==255))
  self.assertEqual(result[0,0],0)
 def test_real_background_click_protects_entire_enclosed_hole(self):
  person=np.zeros((400,500),np.uint8);person[20:380,20:480]=255;person[180:200,210:240]=20
  result=make_trimap((person>=128).astype(np.uint8),15,primary_evidence=person,fixed_evidence=np.zeros_like(person),primary_background_points=[[225/500,190/400]])
  self.assertFalse(np.any(result[180:200,210:240]==255))
 def test_large_arm_gap_open_gap_and_thin_finger_web_are_not_filled(self):
  person=np.zeros((400,500),np.uint8);person[20:380,20:480]=255
  person[120:200,80:180]=0;person[250:280,0:210]=0
  person[25:35,240:250]=0
  repaired=enclosed_person_interiors(person,15)
  self.assertFalse(repaired.any())
 def test_independent_moving_hand_protects_even_a_deep_enclosed_gap(self):
  person=np.zeros((400,500),np.uint8);person[20:380,20:480]=255;person[180:200,210:240]=20
  hand=np.zeros_like(person);hand[170:210,200:250]=255;hand[180:200,210:240]=0
  tri=make_trimap((person>=128).astype(np.uint8),15,primary_evidence=person,fixed_evidence=np.zeros_like(person),moving_components=[hand])
  self.assertFalse(np.any(tri[180:200,210:240]==255))
 def test_agreeing_person_and_hand_background_clicks_are_not_mutually_vetoed(self):
  rgb=np.full((64,64,3),100,np.uint8);tri=np.full((64,64),128,np.uint8)
  selection={'propagate':True,'points':[],'shotPrompts':[{'frameIndex':23,'points':[{'position':[.5,.5],'label':0}]}]}
  plane=np.full_like(tri,255)
  result=condition_trimap_clicks(tri,rgb,rgb,[(selection,plane),(selection,plane.copy())],23)
  self.assertEqual(result[32,32],0);self.assertEqual(result[32,34],0)
  self.assertEqual(result[32,35],128)
  self.assertEqual(condition_trimap_clicks(tri,rgb,rgb,[(selection,plane),(selection,plane)],24)[32,32],128)
 def test_uncorrected_kept_object_still_vetoes_agreeing_background_tracks(self):
  rgb=np.full((64,64,3),100,np.uint8);tri=np.full((64,64),128,np.uint8);plane=np.full_like(tri,255)
  reject={'propagate':True,'points':[{'position':[.5,.5],'label':0}]}
  untouched={'propagate':True,'points':[]}
  result=condition_trimap_clicks(tri,rgb,rgb,[(reject,plane),(reject,plane),(untouched,plane)],0)
  self.assertEqual(result[32,32],128)
 def test_explicit_foreground_wins_over_negative_clicks_even_with_low_model_evidence(self):
  rgb=np.full((64,64,3),100,np.uint8);tri=np.full((64,64),128,np.uint8)
  bg={'propagate':True,'points':[{'position':[.5,.5],'label':0}]}
  fg={'propagate':True,'points':[{'position':[.5,.5],'label':1}]}
  zero=np.zeros_like(tri);full=np.full_like(tri,255)
  for components in [[(bg,full),(fg,zero)],[(fg,zero),(bg,full)]]:
   result=condition_trimap_clicks(tri,rgb,rgb,components,0)
   self.assertEqual(result[32,32],255)
 def test_background_agreement_applies_only_to_intersecting_source_click_pixels(self):
  rgb=np.full((64,64,3),100,np.uint8);tri=np.full((64,64),128,np.uint8);plane=np.full_like(tri,255)
  one={'propagate':True,'points':[{'position':[32/64,32/64],'label':0}]}
  two={'propagate':True,'points':[{'position':[35/64,32/64],'label':0}]}
  result=condition_trimap_clicks(tri,rgb,rgb,[(one,plane),(two,plane)],0)
  self.assertEqual(result[32,33],0);self.assertEqual(result[32,34],0)
  self.assertEqual(result[32,31],128);self.assertEqual(result[32,36],128)
 def test_small_seams_between_overlapping_tracks_do_not_make_solid_cloth_transparent(self):
  selected=np.zeros((300,400),np.uint8);selected[20:280,20:340]=1
  # Separate masks can leave narrow uncertain seams beside an occluding boom.
  # The shirt between the rails is still strong foreground evidence.
  selected[128:131,20:250]=0;selected[159:162,20:250]=0
  fixed=np.zeros_like(selected);fixed[120:128,20:250]=255;fixed[162:170,20:250]=255
  tri=make_trimap(selected,15,evidence=selected*255,fixed_evidence=fixed,primary_evidence=selected*255)
  self.assertEqual(tri[145,180],255)
  self.assertFalse(np.any((tri==255)&(selected==0)))
  self.assertEqual(tri[0,0],0)
 def test_fixed_background_click_is_authoritative_but_cannot_erase_an_occluding_person(self):
  rgb=np.full((64,64,3),100,np.uint8);tri=np.full((64,64),128,np.uint8)
  person=np.zeros_like(tri);person[20:35,20:35]=255
  prop=np.full_like(tri,90)
  selection={'propagate':False,'points':[{'position':[.4,.4],'label':0},{'position':[.75,.75],'label':0}]}
  components=[({'propagate':True,'points':[]},person),(selection,prop)]
  result=condition_trimap_clicks(tri,rgb,rgb.copy(),components,4)
  self.assertEqual(result[26,26],128);self.assertEqual(result[48,48],0)
  moved=rgb.copy();moved[46:51,46:51]=200
  self.assertEqual(condition_trimap_clicks(tri,moved,rgb,components,4)[48,48],128)
 def test_prop_background_click_cannot_punch_a_hole_in_moderately_tracked_clothing(self):
  rgb=np.full((64,64,3),100,np.uint8);tri=np.full((64,64),128,np.uint8)
  person=np.zeros_like(tri);person[20:35,20:35]=90
  prop=np.full_like(tri,90)
  selection={'propagate':False,'points':[{'position':[.4,.4],'label':0},{'position':[.75,.75],'label':0}]}
  components=[({'propagate':True,'points':[]},person),(selection,prop)]
  result=condition_trimap_clicks(tri,rgb,rgb.copy(),components,4)
  self.assertEqual(result[26,26],128)
  self.assertEqual(result[48,48],0)
 def test_moving_click_conditions_its_frame_without_leaving_frozen_circles(self):
  rgb=np.full((64,64,3),100,np.uint8);tri=np.full((64,64),128,np.uint8)
  selection={'propagate':True,'points':[],'shotPrompts':[{'frameIndex':6,'points':[{'position':[.5,.5],'label':0}]}]}
  components=[(selection,np.zeros_like(tri))]
  self.assertEqual(condition_trimap_clicks(tri,rgb,rgb,components,6)[32,32],0)
  self.assertEqual(condition_trimap_clicks(tri,rgb,rgb,components,7)[32,32],128)
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
 def test_explicit_fixed_domain_tolerates_codec_noise_without_touching_other_foreground(self):
  with tempfile.TemporaryDirectory() as directory:
   rgb,masks,tri=self.stationary_fixture(directory,[250]*7+[80]);domain=np.zeros((24,24),bool);domain[:,2:12]=True
   for i in range(8):
    image=np.full((24,24,3),100+i*3,np.uint8);Image.fromarray(image).save(rgb/f'rgb_{i:04d}.png')
   stabilize_stationary_source(rgb,masks,tri,8,selection_domain=domain,maximum_source_range=32)
   result=np.asarray(Image.open(masks/'matte_0007.png'))
   self.assertEqual(int(result[12,6]),250)
   self.assertEqual(int(result[12,18]),80)
 def test_fixed_consensus_still_preserves_motion_and_rejects_unbounded_domain(self):
  with tempfile.TemporaryDirectory() as directory:
   rgb,masks,tri=self.stationary_fixture(directory,[250]*7+[80],moving=True);domain=np.ones((24,24),bool)
   stabilize_stationary_source(rgb,masks,tri,8,selection_domain=domain,maximum_source_range=32)
   self.assertEqual(int(np.asarray(Image.open(masks/'matte_0007.png'))[12,12]),80)
   with self.assertRaises(ValueError):stabilize_stationary_source(rgb,masks,tri,8,selection_domain=np.ones((25,24),bool))
   with self.assertRaises(ValueError):stabilize_stationary_source(rgb,masks,tri,8,selection_domain=domain,maximum_source_range=255)
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
 def test_motion_blurred_fingers_are_not_forced_opaque_like_fixed_microphone_rails(self):
  m=np.zeros((128,128),np.uint8);m[20:105,20:36]=1;m[20:105,90:93]=1
  fixed=np.zeros_like(m);fixed[20:105,90:93]=255
  t=make_trimap(m,12,evidence=m*255,fixed_evidence=fixed)
  self.assertTrue(np.all(t[35:90,20:36]==128))
  self.assertTrue(np.any(t[35:90,90:93]==255))
  self.assertFalse(np.any((t==255)&(m==0)))
  self.assertEqual(t[0,0],0)
 def test_component_aware_soft_band_keeps_solid_body_interiors_and_checks_geometry(self):
  m=np.zeros((128,128),np.uint8);m[10:118,10:118]=1
  t=make_trimap(m,12,fixed_evidence=np.zeros_like(m))
  self.assertEqual(t[64,64],255);self.assertEqual(t[12,64],128)
  with self.assertRaises(ValueError):make_trimap(m,12,fixed_evidence=np.zeros((64,64),np.uint8))
 def test_fast_blurred_boundary_can_release_false_opaque_seeds_without_changing_rigid_or_body_cores(self):
  m=np.zeros((160,320),np.uint8);m[20:140,20:80]=1;m[10:150,120:240]=1;m[20:140,280:283]=1
  fixed=np.zeros_like(m);fixed[20:140,280:283]=255
  band=np.full(m.shape,12,np.float32);band[20:140,20:80]=36;band[:,270:]=40
  normal=make_trimap(m,12,fixed_evidence=fixed)
  moving=make_trimap(m,12,fixed_evidence=fixed,motion_radius=band)
  self.assertEqual(normal[80,50],255);self.assertEqual(moving[80,50],128)
  self.assertEqual(moving[80,180],255);self.assertEqual(moving[80,281],255)
  self.assertFalse(np.any((moving==255)&(normal!=255)))
 def test_identical_source_has_no_extra_motion_band_and_mismatched_geometry_fails(self):
  rgb=np.random.default_rng(41).integers(0,255,(96,128,3),dtype=np.uint8)
  self.assertTrue(np.all(source_motion_radius(rgb,rgb.copy(),12)==12))
  with self.assertRaises(ValueError):source_motion_radius(rgb,rgb[:80],12)
 def test_overlapping_body_cannot_force_blurred_hand_opaque_or_remove_a_fixed_mic(self):
  selected=np.zeros((160,240),np.uint8);selected[20:140,20:220]=1
  hand=np.zeros_like(selected);hand[35:125,45:85]=255
  fixed=np.zeros_like(selected);fixed[45:115,75:78]=255
  band=np.full(selected.shape,30,np.float32)
  without=make_trimap(selected,12,fixed_evidence=fixed,motion_radius=band)
  corrected=make_trimap(selected,12,fixed_evidence=fixed,motion_radius=band,moving_components=[hand],primary_evidence=selected*255)
  self.assertEqual(without[80,60],255);self.assertEqual(corrected[80,60],128)
  self.assertEqual(corrected[80,76],255);self.assertEqual(corrected[80,180],255)
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
 def test_very_weak_object_logits_do_not_retain_a_distant_tv_bezel(self):
  evidence=np.zeros((160,240),np.uint8);evidence[20:140,20:35]=255
  evidence[90:94,90:220]=30
  trimap=make_trimap((evidence>=128).astype(np.uint8),12,evidence,weak_evidence_region=evidence>=24,fixed_evidence=evidence)
  self.assertEqual(trimap[92,160],0)
  self.assertEqual(trimap[80,27],255)
 def test_fast_object_unknown_band_cannot_expand_to_weak_remote_background(self):
  hand=np.zeros((160,240),np.uint8);hand[30:125,35:80]=255;hand[90:94,170:220]=30
  selected=(hand>=128).astype(np.uint8)
  trimap=make_trimap(selected,12,evidence=hand,weak_evidence_region=hand>=24,
   fixed_evidence=np.zeros_like(hand),motion_radius=np.full(hand.shape,30,np.float32),moving_components=[hand])
  self.assertEqual(trimap[92,190],0)
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
