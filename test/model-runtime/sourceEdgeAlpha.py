import json,tempfile,unittest
from pathlib import Path
import cv2,numpy as np
from PIL import Image
from model_workers.adapters.source_edge_alpha import refine_source_edge,refine_corrected_object_alpha,classify_corrected_fixed_object

class SourceEdges(unittest.TestCase):
 def test_thin_prop_foreground_stamp_does_not_seed_adjacent_bright_background(self):
  from unittest.mock import patch
  rgb=np.full((64,64,3),180,np.uint8);rgb[10:55,20]=[25,30,28]
  alpha=np.zeros((64,64),np.uint8);alpha[10:55,20]=255;evidence=alpha.copy()
  points=[{'position':[x/64,y/64],'label':label}for x,y,label in
          [(20,20,1),(20,35,1),(20,50,1),(40,20,0),(40,35,0),(40,50,0)]]
  trimaps=[]
  def solve(picture,trimap,**kwargs):trimaps.append(trimap.copy());return trimap
  with patch('pymatting.estimate_alpha_cf',side_effect=solve):
   result=classify_corrected_fixed_object(rgb,alpha,rgb,points,[0,0,64,64],evidence)
  # The neighboring mixed pixel remains unknown for the real alpha solver;
  # an FG point does not authorize a new definite BG label either.
  self.assertEqual(trimaps[0][35,20],1);self.assertEqual(trimaps[0][35,21],.5)
  self.assertEqual(result[35,20],255);self.assertEqual(result[35,21],128)
 def test_thin_foreground_colour_sample_cannot_include_bright_room_neighbors(self):
  rgb=np.full((64,64,3),180,np.uint8);rgb[10:55,20]=[25,30,28]
  alpha=np.zeros((64,64),np.uint8);alpha[10:55,20]=255;alpha[30:42,21:31]=255
  points=[{'position':[20/64,20/64],'label':1},{'position':[40/64,20/64],'label':0}]
  result=refine_corrected_object_alpha(rgb,alpha,rgb,points,[0,0,64,64])
  self.assertEqual(result[35,20],255);self.assertLess(int(result[35,26]),5)
 def test_definite_dark_rail_seeds_reach_alpha_solver_and_background_click_wins(self):
  from unittest.mock import patch
  rgb=np.full((80,160,3),180,np.uint8);rgb[35:42,10:150]=[35,33,45]
  alpha=np.zeros((80,160),np.uint8);alpha[35:42,10:150]=255
  evidence=np.zeros_like(alpha);evidence[35:42,10:150]=210
  points=[{'position':[x/160,y/80],'label':label}for x,y,label in
          [(20,38,1),(70,38,1),(135,38,1),(30,20,0),(90,60,0),(100,38,0)]]
  trimaps=[]
  def solve(picture,trimap,**kwargs):trimaps.append(trimap.copy());return trimap
  with patch('pymatting.estimate_alpha_cf',side_effect=solve):
   result=classify_corrected_fixed_object(rgb,alpha,rgb,points,[0,0,160,80],evidence)
  self.assertEqual(float(trimaps[0][36,50]),1)
  self.assertEqual(int(result[36,50]),255)
  self.assertEqual(float(trimaps[0][38,100]),0)
  self.assertEqual(int(result[38,100]),0)
 def fixed_fixture(self):
  rgb=np.full((96,128,3),[18,22,20],np.uint8);alpha=np.zeros((96,128),np.uint8);evidence=np.zeros_like(alpha)
  for box,colour in [((12,24,38,45),[125,65,30]),((40,28,60,48),[75,30,20]),((25,60,50,82),[145,85,40])]:
   x0,y0,x1,y1=box;rgb[y0:y1,x0:x1]=colour;alpha[y0:y1,x0:x1]=255;evidence[y0:y1,x0:x1]=205
  rgb[40:70,37:39]=[110,90,50];alpha[40:70,37:39]=255;evidence[40:70,37:39]=195
  # False opaque TV patch near, but independent from, the plant evidence.
  alpha[48:60,48:78]=255;evidence[48:60,48:78]=70
  points=[{'position':[x/128,y/96],'label':label} for x,y,label in [(20,30,1),(50,35,1),(35,72,1),(70,20,0),(65,55,0),(70,80,0)]]
  return rgb,alpha,evidence,points
 def test_fixed_classification_uses_separate_mask_and_keeps_thin_source_stem(self):
  rgb,alpha,evidence,points=self.fixed_fixture()
  result=classify_corrected_fixed_object(rgb,alpha,rgb,points,[5,10,85,90],evidence)
  self.assertLess(int(result[54,65]),5)
  self.assertEqual(int(result[55,37]),255)
  self.assertEqual(int(result[30,25]),255)
  self.assertTrue(np.array_equal(result[:10],alpha[:10]))
 def test_fixed_classification_preserves_other_objects_and_changed_source_pixels(self):
  reference,alpha,evidence,points=self.fixed_fixture();rgb=reference.copy();rgb[46:68,70:85]=[185,125,80];alpha[46:68,70:85]=255
  rgb[50:80,5:10]=[40,40,40];reference[50:80,5:10]=rgb[50:80,5:10];alpha[50:80,5:10]=255;protect=np.zeros_like(alpha);protect[50:80,5:10]=1
  result=classify_corrected_fixed_object(rgb,alpha,reference,points,[0,10,95,90],evidence,protect)
  self.assertTrue(np.array_equal(result[46:68,70:85],alpha[46:68,70:85]))
  self.assertTrue(np.array_equal(result[50:80,5:10],alpha[50:80,5:10]))
 def test_fixed_classification_cannot_erase_unassigned_foreground_inside_its_box(self):
  rgb,alpha,evidence,points=self.fixed_fixture()
  # A real opaque garment has no support in this selected plant's tracker.
  # Its colour happens to match the background, and the person tracker missed
  # it. The plant classifier still has no ownership of that shared foreground.
  alpha[66:85,88:108]=237
  # An actual background click remains authoritative at its small footprint.
  alpha[77:84,67:74]=190
  result=classify_corrected_fixed_object(rgb,alpha,rgb,points,[5,10,115,90],evidence)
  self.assertTrue(np.array_equal(result[66:85,88:108],alpha[66:85,88:108]))
  self.assertEqual(int(result[80,70]),0)
  self.assertLess(int(result[54,65]),5)
  self.assertEqual(int(result[55,37]),255)
 def test_fixed_classification_needs_both_authored_colours_and_bound_geometry(self):
  rgb,alpha,evidence,points=self.fixed_fixture()
  self.assertIsNone(classify_corrected_fixed_object(rgb,alpha,rgb,points[:3],[0,0,128,96],evidence))
  with self.assertRaises(ValueError):classify_corrected_fixed_object(rgb,alpha,rgb,points,[0,0,129,96],evidence)
  with self.assertRaises(ValueError):classify_corrected_fixed_object(rgb,alpha,rgb,points,[0,0,128,96],evidence[:20])
 def test_registered_classifier_cannot_cut_neighboring_stand(self):
  with tempfile.TemporaryDirectory() as directory:
   p=Path(directory);rgb,alpha,evidence,points=self.fixed_fixture();stand=np.zeros_like(alpha);stand[15:90,87:92]=255;rgb[stand>0]=[20,23,21];alpha[stand>0]=255
   for name,pixels in [('person',np.zeros_like(alpha)),('plant',evidence),('stand',stand)]:Image.fromarray(pixels).save(p/f'{name}.png')
   guide=(p,{'_reference_rgb':rgb,'components':[
    {'selection':{'propagate':True},'frames':[{'file':'person.png'}]},
    {'selection':{'id':'plant','propagate':False,'box':[0,0,1,1],'points':points},'roi':[0,0,128,96],'frames':[{'file':'plant.png'}]},
    {'selection':{'id':'stand','propagate':False,'box':[.65,0,.8,1],'points':[]},'roi':[80,0,100,96],'frames':[{'file':'stand.png'}]}]})
   result=refine_source_edge(rgb,alpha,guide,0,colour_component_ids=['plant'],classify_fixed_objects=True)
   self.assertLess(int(result[54,65]),5)
   self.assertEqual(int(result[55,89]),255)
   self.assertEqual(int(result[55,37]),255)
 def test_overlapping_prop_boxes_do_not_undo_the_first_background_correction(self):
  with tempfile.TemporaryDirectory() as directory:
   p=Path(directory);rgb,alpha,evidence,points=self.fixed_fixture()
   stand=np.zeros_like(alpha);stand[15:90,87:92]=255;rgb[stand>0]=[20,23,21];alpha[stand>0]=255
   stand_points=[{'position':[x/128,y/96],'label':label}for x,y,label in [(89,25,1),(89,45,1),(89,75,1),(78,20,0),(78,50,0),(78,80,0)]]
   for name,pixels in [('person',np.zeros_like(alpha)),('plant',evidence),('stand',stand)]:Image.fromarray(pixels).save(p/f'{name}.png')
   guide=(p,{'_reference_rgb':rgb,'components':[
    {'selection':{'propagate':True},'frames':[{'file':'person.png'}]},
    {'selection':{'id':'plant','propagate':False,'box':[0,0,1,1],'points':points},'roi':[0,0,128,96],'frames':[{'file':'plant.png'}]},
    {'selection':{'id':'stand','propagate':False,'box':[.3,.05,.95,.95],'points':stand_points},'roi':[38,5,122,91],'frames':[{'file':'stand.png'}]}]})
   result=refine_source_edge(rgb,alpha,guide,0,colour_component_ids=['plant','stand'],classify_fixed_objects=True)
   self.assertLess(int(result[54,65]),5)
   self.assertEqual(int(result[55,89]),255)
 def test_background_correction_revokes_false_opaque_gap_without_deleting_same_coloured_person(self):
  rgb=np.full((96,128,3),[235,70,30],np.uint8);alpha=np.zeros((96,128),np.uint8)
  rgb[20:80,30:36]=[40,60,30];alpha[20:80,30:36]=255
  rgb[25:75,65:95]=[100,50,25];alpha[25:75,65:95]=255
  alpha[40:55,36:65]=255 # Wrong old-background bridge, same hue as the background click.
  rgb[35:55,105:118]=[235,70,30];alpha[35:55,105:118]=255
  protect=np.zeros_like(alpha,dtype=bool);protect[30:60,100:125]=True
  points=[{'position':[32/128,40/96],'label':1},{'position':[80/128,40/96],'label':1},
    {'position':[50/128,30/96],'label':0}]
  result=refine_corrected_object_alpha(rgb,alpha,rgb,points,[10,10,125,90],protect)
  self.assertLess(int(result[47,50]),5)
  self.assertEqual(int(result[47,32]),255)
  self.assertEqual(int(result[47,80]),255)
  self.assertEqual(int(result[47,110]),255)
  self.assertTrue(np.array_equal(result[:10],alpha[:10]))
 def test_occluding_movement_invalidates_stationary_colour_correction(self):
  reference=np.full((64,64,3),[240,65,25],np.uint8);reference[10:55,15:22]=[50,65,30]
  rgb=reference.copy();rgb[25:45,22:50]=[100,60,40]
  alpha=np.zeros((64,64),np.uint8);alpha[10:55,15:22]=255;alpha[25:45,22:50]=255;alpha[15:20,25:45]=180
  points=[{'position':[18/64,15/64],'label':1},{'position':[35/64,12/64],'label':0}]
  result=refine_corrected_object_alpha(rgb,alpha,reference,points,[5,5,58,58])
  self.assertTrue(np.array_equal(result[25:45,22:50],alpha[25:45,22:50]))
  self.assertLess(int(result[17,35]),5)
 def test_foreground_background_same_colour_cannot_authorize_colour_deletion(self):
  rgb=np.full((32,32,3),220,np.uint8);alpha=np.full((32,32),255,np.uint8)
  points=[{'position':[.25,.5],'label':1},{'position':[.75,.5],'label':0}]
  self.assertTrue(np.array_equal(refine_corrected_object_alpha(rgb,alpha,rgb,points,[0,0,32,32]),alpha))
 def test_no_background_examples_preserves_exact_soft_alpha(self):
  rgb=np.full((32,32,3),100,np.uint8);alpha=np.arange(1024,dtype=np.uint16).reshape(32,32).astype(np.uint8)
  result=refine_corrected_object_alpha(rgb,alpha,rgb,[{'position':[.5,.5],'label':1}],[0,0,32,32])
  self.assertTrue(np.array_equal(result,alpha))
 def test_thin_selected_stem_survives_background_colour_overlap(self):
  rgb=np.full((64,64,3),[235,80,40],np.uint8);rgb[10:54,15:16]=[205,90,55]
  rgb[20:45,30:48]=[80,45,30];rgb[5:9,50:54]=[205,90,55]
  alpha=np.zeros((64,64),np.uint8);alpha[10:54,15:16]=255;alpha[20:45,30:48]=255
  alpha[25:40,48:58]=180
  points=[{'position':[38/64,30/64],'label':1},{'position':[51/64,7/64],'label':0}]
  result=refine_corrected_object_alpha(rgb,alpha,rgb,points,[0,0,64,64])
  self.assertEqual(int(result[30,15]),255)
  self.assertEqual(int(result[30,38]),255)
 def test_correction_rejects_geometry_mismatch(self):
  with self.assertRaises(ValueError):refine_corrected_object_alpha(np.zeros((5,5,3),np.uint8),np.zeros((5,5),np.uint8),np.zeros((6,5,3),np.uint8),[],[0,0,5,5])
 def test_registered_source_edge_stage_consumes_fixed_component_corrections(self):
  with tempfile.TemporaryDirectory() as directory:
   p=Path(directory);rgb=np.full((96,128,3),[235,70,30],np.uint8);rgb[20:80,25:40]=[40,60,30]
   alpha=np.zeros((96,128),np.uint8);alpha[20:80,25:40]=255;alpha[40:55,40:75]=255
   Image.fromarray(np.zeros_like(alpha)).save(p/'person.png');Image.fromarray(alpha).save(p/'prop.png')
   points=[{'position':[30/128,30/96],'label':1},{'position':[60/128,30/96],'label':0}]
   guide=(p,{'_reference_rgb':rgb.copy(),'components':[
    {'selection':{'propagate':True},'frames':[{'file':'person.png'}]},
    {'selection':{'id':'prop','propagate':False,'box':[.1,.1,.8,.95],'points':points},'roi':[0,0,128,96],'frames':[{'file':'prop.png'}]}]})
   legacy=refine_source_edge(rgb,alpha,guide,0)
   corrected=refine_source_edge(rgb,alpha,guide,0,colour_component_ids=['prop'])
   unselected=refine_source_edge(rgb,alpha,guide,0,colour_component_ids=['another-object'])
   self.assertTrue(np.array_equal(legacy,unselected))
   self.assertGreater(int(legacy[47,60]),250)
   self.assertLess(int(corrected[47,60]),5)
   self.assertEqual(int(corrected[47,30]),255)
 def test_revealed_background_is_removed_without_freezing_the_moving_person(self):
  with tempfile.TemporaryDirectory() as directory:
   p=Path(directory);rgb=np.full((512,512,3),190,np.uint8);alpha=np.zeros((512,512),np.uint8)
   rgb[170:500,25:220]=[20,40,90];alpha[170:500,25:220]=255
   # The held chair mask includes the OLD hand position. The current source
   # reveals grey background there, so the silhouette must be reconsidered.
   alpha[220:350,220:245]=255
   rgb[80:450,280:410]=[245,235,210];alpha[80:450,280:410]=255
   alpha[80:450,279]=100
   person=np.zeros_like(alpha);person[80:450,280:410]=255
   chair=np.zeros_like(alpha);chair[170:500,25:220]=255;chair[220:350,220:245]=255
   components=[]
   for n,(mask,moving) in enumerate([(person,True),(chair,False)]):
    name=f'c{n}.png';Image.fromarray(mask).save(p/name)
    components.append({'selection':{'propagate':moving},'roi':[0,140,260,512] if not moving else [250,0,450,512],'frames':[{'file':name}]})
   reference=rgb.copy();reference[220:350,220:245]=[130,75,45]
   result=refine_source_edge(rgb,alpha,(p,{'components':components,'_reference_rgb':reference}),0)
   self.assertEqual(int(result[300,100]),255)
   self.assertLess(int(result[280,235]),5)
   self.assertEqual(int(result[200,279]),100) # Existing soft person edge remains.
   self.assertEqual(int(result[200,350]),255)
   self.assertEqual(int(result[20,20]),0)
 def test_newly_revealed_couch_fills_initial_hand_occlusion_without_deleting_microphone(self):
  with tempfile.TemporaryDirectory() as directory:
   p=Path(directory);rgb=np.full((512,512,3),190,np.uint8);alpha=np.zeros((512,512),np.uint8)
   rgb[170:500,25:260]=[20,40,90];alpha[170:500,25:220]=255
   # An old hand hid the top right part of the couch. Its colour is now blue.
   alpha[350:500,220:260]=255
   person=np.zeros_like(alpha);person[80:450,280:410]=255;rgb[80:450,280:410]=[245,235,210];alpha[80:450,280:410]=255
   mic=np.zeros_like(alpha);mic[260:450,245:250]=255;rgb[260:450,245:250]=[10,10,10];alpha[mic>0]=255
   chair=alpha.copy();chair[person>0]=0;chair[mic>0]=0
   components=[]
   for n,(mask,moving,roi) in enumerate([(person,True,[0,0,512,512]),(mic,False,[230,240,270,470]),(chair,False,[0,140,280,512])]):
    name=f'c{n}.png';Image.fromarray(mask).save(p/name);components.append({'selection':{'propagate':moving},'roi':roi,'frames':[{'file':name}]})
   result=refine_source_edge(rgb,alpha,(p,{'components':components}),0)
   self.assertGreater(int(result[220,240]),250)
   self.assertEqual(int(result[300,247]),255)
   self.assertEqual(int(result[40,40]),0)
 def test_thin_opaque_rail_does_not_become_transparent_or_wider(self):
  rgb=np.full((96,96,3),210,np.uint8);rgb[10:86,45:48]=20
  alpha=np.zeros((96,96),np.uint8);alpha[10:86,45:48]=255
  result=refine_source_edge(rgb,alpha,None,0)
  self.assertEqual(int(result[45,46]),255)
  self.assertLess(int(result[45,40]),5)
 def test_solid_white_microphone_is_not_keyed_by_its_colour(self):
  rgb=np.full((96,96,3),80,np.uint8);rgb[15:80,30:65]=245
  a=np.zeros((96,96),np.uint8);a[15:80,30:65]=255
  result=refine_source_edge(rgb,a,None,0)
  self.assertEqual(int(result[45,45]),255)
  self.assertEqual(int(result[0,0]),0)
if __name__=='__main__':unittest.main()
