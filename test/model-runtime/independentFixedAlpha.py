import json,tempfile,unittest
from pathlib import Path
import cv2,numpy as np
from PIL import Image
from model_workers.adapters.source_edge_alpha import refine_independent_fixed_objects

class IndependentFixedObjects(unittest.TestCase):
 def fixed_fixture(self):
  rgb=np.full((96,128,3),[18,22,20],np.uint8);alpha=np.zeros((96,128),np.uint8);evidence=np.zeros_like(alpha)
  for box,colour in [((12,24,38,45),[125,65,30]),((40,28,60,48),[75,30,20]),((25,60,50,82),[145,85,40])]:
   x0,y0,x1,y1=box;rgb[y0:y1,x0:x1]=colour;alpha[y0:y1,x0:x1]=255;evidence[y0:y1,x0:x1]=205
  rgb[40:70,37:39]=[110,90,50];alpha[40:70,37:39]=255;evidence[40:70,37:39]=195
  # False opaque TV patch near, but independent from, the plant evidence.
  alpha[48:60,48:78]=255;evidence[48:60,48:78]=70
  points=[{'position':[x/128,y/96],'label':label} for x,y,label in [(20,30,1),(50,35,1),(35,72,1),(70,20,0),(65,55,0),(70,80,0)]]
  return rgb,alpha,evidence,points
 def independent_fixture(self,directory):
  p=Path(directory);rgb,alpha,evidence,points=self.fixed_fixture()
  person=np.zeros_like(alpha);person[15:90,100:120]=255;alpha[person>0]=255;rgb[person>0]=[180,110,70]
  components=[]
  for name,plane,selection in [('person',person,{'id':'person','propagate':True}),
    ('plant',evidence,{'id':'plant','propagate':False,'box':[0,0,1,1],'points':points})]:
   Image.fromarray(plane).save(p/f'{name}.png');components.append({'selection':selection,'frames':[{'file':f'{name}.png'}]})
  return rgb,alpha,(p,{'components':components,'_reference_rgb':rgb.copy()})
 def test_independent_prop_removes_union_background_without_cutting_selected_stem(self):
  with tempfile.TemporaryDirectory() as directory:
   rgb,alpha,guide=self.independent_fixture(directory)
   result=refine_independent_fixed_objects(rgb,alpha,guide,0,['plant'])
   self.assertLess(int(result[54,65]),5)
   self.assertEqual(int(result[55,37]),255)
   self.assertEqual(int(result[30,25]),255)
   self.assertTrue(np.array_equal(result[:,100:120],alpha[:,100:120]))
 def test_independent_prop_preserves_current_missed_clothing_and_changed_hand(self):
  with tempfile.TemporaryDirectory() as directory:
   rgb,alpha,guide=self.independent_fixture(directory);p,manifest=guide
   # The tracked person has a missing interior. A prop ROI cannot erase the
   # incoming neural clothing alpha inside that current person envelope.
   person=np.asarray(Image.open(p/'person.png')).copy();person[30:75,104:115]=0;Image.fromarray(person).save(p/'person.png')
   alpha[30:75,104:115]=237
   # A moving hand outside that envelope changes current source appearance.
   rgb[48:62,70:80]=[180,110,70];alpha[48:62,70:80]=210
   result=refine_independent_fixed_objects(rgb,alpha,guide,0,['plant'])
   self.assertTrue(np.array_equal(result[30:75,104:115],alpha[30:75,104:115]))
   self.assertTrue(np.array_equal(result[48:62,70:80],alpha[48:62,70:80]))
 def test_independent_prop_cannot_erase_overlapping_object_when_its_solve_abstains(self):
  with tempfile.TemporaryDirectory() as directory:
   rgb,alpha,guide=self.independent_fixture(directory);p,manifest=guide
   stand=np.zeros_like(alpha);stand[15:90,82:86]=255;rgb[stand>0]=[20,23,21];alpha[stand>0]=230
   manifest['_reference_rgb']=rgb.copy();Image.fromarray(stand).save(p/'stand.png')
   manifest['components'].append({'selection':{'id':'stand','propagate':False,'box':[.5,0,.8,1],'points':[]},'frames':[{'file':'stand.png'}]})
   result=refine_independent_fixed_objects(rgb,alpha,guide,0,['plant','stand'])
   self.assertTrue(np.array_equal(result[stand>0],alpha[stand>0]))
 def test_independent_prop_abstains_without_current_person_or_selected_objects(self):
  with tempfile.TemporaryDirectory() as directory:
   rgb,alpha,guide=self.independent_fixture(directory);p,manifest=guide
   self.assertTrue(np.array_equal(refine_independent_fixed_objects(rgb,alpha,guide,0,[]),alpha))
   Image.fromarray(np.zeros_like(alpha)).save(p/'person.png')
   self.assertTrue(np.array_equal(refine_independent_fixed_objects(rgb,alpha,guide,0,['plant']),alpha))
 def test_current_unchanged_leaf_survives_later_confidence_loss_but_old_background_stays_removed(self):
  import tempfile
  with tempfile.TemporaryDirectory()as directory:
   rgb,alpha,guide=self.independent_fixture(directory);p,m=guide
   first=refine_independent_fixed_objects(rgb,alpha,guide,0,['plant'])
   evidence=np.asarray(Image.open(p/'plant.png')).copy();evidence[24:45,12:38]=35;Image.fromarray(evidence).save(p/'plant.png')
   for c in m['components']:c['frames'].append(c['frames'][0])
   current=refine_independent_fixed_objects(rgb,alpha,guide,1,['plant'])
   self.assertEqual(int(first[30,25]),255);self.assertEqual(int(current[30,25]),255)
   self.assertLess(int(first[54,65]),5);self.assertLess(int(current[54,65]),5)
 def test_source_reference_does_not_hold_old_alpha_over_changed_pixel(self):
  import tempfile
  with tempfile.TemporaryDirectory()as directory:
   rgb,alpha,guide=self.independent_fixture(directory);p,m=guide
   refine_independent_fixed_objects(rgb,alpha,guide,0,['plant'])
   for c in m['components']:c['frames'].append(c['frames'][0])
   current=rgb.copy();current[24:45,12:38]=[235,240,245];incoming=alpha.copy();incoming[24:45,12:38]=0
   result=refine_independent_fixed_objects(current,incoming,guide,1,['plant'])
   self.assertTrue(np.array_equal(result[24:45,12:38],incoming[24:45,12:38]))
 def test_classified_reference_never_invents_stronger_segmentation_evidence(self):
  with tempfile.TemporaryDirectory()as directory:
   rgb,alpha,guide=self.independent_fixture(directory);p,m=guide
   original=np.asarray(Image.open(p/'plant.png'))
   result=refine_independent_fixed_objects(rgb,alpha,guide,0,['plant'])
   reference=m['_classified_independent_fixed_support']['plant']
   self.assertTrue(np.all(reference<=original))
   self.assertEqual(int(result[30,25]),255)
   self.assertEqual(int(reference[30,25]),int(original[30,25]))
   self.assertTrue(np.any((result==255)&(original<255)&(reference>0)))
 def test_background_click_in_verified_prompt_margin_is_not_discarded(self):
  with tempfile.TemporaryDirectory()as directory:
   rgb,alpha,guide=self.independent_fixture(directory);p,m=guide
   prop=m['components'][1];prop['selection']['box']=[5/128,10/96,80/128,90/96]
   prop['roi']=[0,0,95,96]
   prop['selection']['points'].append({'position':[85/128,55/96],'label':0})
   alpha[52:59,82:89]=255
   # A selected object's actual source-context margin contains its authored
   # negative point. The original prompt box must not leave it uncorrected.
   result=refine_independent_fixed_objects(rgb,alpha,guide,0,['plant'])
   self.assertEqual(int(result[55,85]),0)
   self.assertEqual(int(result[55,37]),255)
   self.assertTrue(np.array_equal(result[:,100:120],alpha[:,100:120]))
 def test_verified_roi_cannot_change_source_pixels_beyond_its_bounds(self):
  with tempfile.TemporaryDirectory()as directory:
   rgb,alpha,guide=self.independent_fixture(directory);p,m=guide
   m['components'][1]['roi']=[5,10,90,90];alpha[:8,:]=217
   result=refine_independent_fixed_objects(rgb,alpha,guide,0,['plant'])
   self.assertTrue(np.array_equal(result[:8,:],alpha[:8,:]))
 def test_invalid_or_fractional_roi_is_rejected(self):
  with tempfile.TemporaryDirectory()as directory:
   rgb,alpha,guide=self.independent_fixture(directory);p,m=guide
   for roi in [[0,0,129,96],[0,0,95.5,96],[0,0,95]]:
    m['components'][1]['roi']=roi
    with self.assertRaises(ValueError):refine_independent_fixed_objects(rgb,alpha,guide,0,['plant'])

if __name__=='__main__':unittest.main()
