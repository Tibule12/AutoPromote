import unittest,tempfile
from pathlib import Path
from types import SimpleNamespace
import numpy as np
from PIL import Image
from model_workers.adapters.moving_detail_alpha import observed_background,detail_trimap,merge_detail_alpha,foreground_colour_support,measured_motion_trimap

class MovingDetailAlpha(unittest.TestCase):
 def test_primary_only_movement_retains_photographed_evidence_without_detail_inference(self):
  from model_workers.adapters.moving_detail_alpha import refine_moving_details
  with tempfile.TemporaryDirectory()as directory:
   root=Path(directory);rgb=root/'rgb';masks=root/'masks';trimaps=root/'trimaps';guide=root/'components'
   for path in [rgb,masks,trimaps,guide]:path.mkdir()
   plane=np.zeros((80,100),np.uint8);plane[25:55,35:65]=255
   frames=[]
   for index in range(4):
    picture=np.full((80,100,3),[20,70,190],np.uint8);picture[25:55,35:65]=[130,80,40]
    Image.fromarray(picture).save(rgb/f'rgb_{index:04d}.png')
    name=f'{index:04d}.png';Image.fromarray(plane).save(guide/name);frames.append({'file':name})
   manifest={'components':[{'selection':{'id':'person','propagate':True,'points':[]},'frames':frames}]}
   result=refine_moving_details(rgb,masks,trimaps,(guide,manifest),SimpleNamespace(frame=lambda _:plane.copy()),None,count=4)
   support=np.array(Image.open(root/'observed_detail/observed-support.png'))
   self.assertEqual(result['tiles'],0);self.assertTrue(result['backgroundEvidenceOnly'])
   self.assertEqual(int(support[0,0]),255);self.assertEqual(int(support[40,50]),0)
 def test_measured_blur_revokes_false_opaque_finger_seeds_but_keeps_body(self):
  primary=np.zeros((220,240),np.uint8);primary[10:210,100:230]=255
  hand=np.zeros_like(primary);hand[40:170,60:95]=255
  prior=np.maximum(primary,hand);rgb=np.full((*prior.shape,3),[110,60,35],np.uint8)
  bg=np.full_like(rgb,[220,80,20]);motion=np.full(prior.shape,18,np.float32)
  tri,domain=measured_motion_trimap(prior,hand,primary,rgb,bg,np.ones_like(prior,bool),motion)
  self.assertTrue(domain[100,75]);self.assertEqual(int(tri[100,75]),128)
  self.assertEqual(int(tri[100,165]),255)
  self.assertFalse(domain[100,102]);self.assertEqual(int(tri[100,102]),255)
  self.assertFalse(domain[0,0])
 def test_stationary_hand_and_unobserved_background_do_not_release_opaque_seeds(self):
  hand=np.zeros((120,140),np.uint8);hand[15:105,20:120]=255
  rgb=np.full((*hand.shape,3),100,np.uint8);bg=np.zeros_like(rgb)
  for observed,motion in [(np.ones_like(hand,bool),np.zeros_like(hand,np.float32)),
                           (np.zeros_like(hand,bool),np.full(hand.shape,30,np.float32))]:
   tri,_=measured_motion_trimap(hand,hand,np.zeros_like(hand),rgb,bg,observed,motion)
   self.assertEqual(int(tri[60,70]),255)
 def test_hand_tile_cannot_revoke_opaque_printed_clothing_interior(self):
  union=np.zeros((220,240),np.uint8);union[10:210,10:230]=255;union[95:105,110:120]=0
  base=np.zeros_like(union);base[10:210,10:230]=255
  hand=np.zeros_like(union);hand[85:115,100:130]=255
  rgb=np.full((*union.shape,3),100,np.uint8)
  tri,domain=detail_trimap(base,hand,union,rgb,rgb,np.ones_like(union,bool))
  self.assertTrue(domain[100,115]);self.assertEqual(int(tri[100,115]),255)
 def test_actual_detail_inference_receives_agreeing_background_corrections(self):
  import torch
  from model_workers.adapters.moving_detail_alpha import refine_moving_details
  torch.set_num_threads(2)
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);rgb=root/'rgb';masks=root/'masks';trimaps=root/'trimaps';guide=root/'components'
   for path in [rgb,masks,trimaps,guide]:path.mkdir()
   hand=np.zeros((100,128),np.uint8);hand[20:80,30:55]=255
   zero=np.zeros_like(hand);source=np.full((100,128,3),[220,80,20],np.uint8)
   frames=[]
   for index in range(4):
    picture=source.copy();plane=hand if index==0 else zero
    if index==0:picture[20:80,30:55]=[110,60,35];picture[38:43,43:48]=[190,80,20]
    Image.fromarray(picture).save(rgb/f'rgb_{index:04d}.png')
    Image.fromarray(plane).save(masks/f'matte_{index:04d}.png')
    Image.fromarray(np.full(plane.shape,128,np.uint8)).save(trimaps/f'trimap_{index:04d}.png')
    name=f'{index:04d}.png';Image.fromarray(plane).save(guide/name);frames.append({'file':name})
   bg={'position':[45/128,40/100],'label':0};fg={'position':[40/128,60/100],'label':1}
   manifest={'components':[{'selection':{'id':'person','propagate':True,'points':[bg]},'frames':frames},
      {'selection':{'id':'hand','propagate':True,'points':[bg,fg]},'frames':frames}],
      '_reference_rgb':np.asarray(Image.open(rgb/'rgb_0000.png'))}
   inputs=[]
   def infer(*,pixel_values):
    inputs.append(pixel_values.detach().clone())
    return SimpleNamespace(alphas=torch.full((1,1,*pixel_values.shape[-2:]),.5))
   parent=SimpleNamespace(frame=lambda index:hand.copy() if index==0 else zero.copy())
   result=refine_moving_details(rgb,masks,trimaps,(guide,manifest),parent,infer,count=4)
   self.assertEqual(result['tiles'],1);self.assertEqual(len(inputs),1)
   self.assertEqual(float(inputs[0][0,3,40,45]),0)
   self.assertEqual(float(inputs[0][0,3,60,40]),1)
   self.assertEqual(Image.open(trimaps/'trimap_0000.png').getpixel((45,40)),0)
 def test_unobserved_foreground_cannot_become_an_empty_plate(self):
  rgb=np.full((40,50,3),[220,80,20],np.uint8);known=np.ones((40,50),bool);known[10:30,20:40]=False
  background,valid,support=observed_background([(rgb,known)]*4)
  self.assertTrue(valid[0,0]);self.assertFalse(valid[20,30]);self.assertEqual(int(support[20,30]),0)
 def test_changed_or_occluded_colour_is_not_accepted_as_stable_background(self):
  empty=np.full((16,16,3),100,np.uint8);changed=empty.copy();changed[4:12,4:12]=180;known=np.ones((16,16),bool)
  _,valid,_=observed_background([(empty,known),(empty,known),(changed,known),(changed,known)])
  self.assertTrue(valid[0,0]);self.assertFalse(valid[6,6])
 def test_less_than_three_observations_rejected(self):
  with self.assertRaises(ValueError):observed_background([(np.zeros((4,4,3),np.uint8),np.ones((4,4),bool))]*2)
 def test_new_background_evidence_releases_a_false_opaque_seed(self):
  hand=np.zeros((100,100),np.uint8);hand[20:80,35:65]=255;rgb=np.full((100,100,3),180,np.uint8)
  base=np.zeros((100,100),np.uint8);base[20:80,35:65]=255
  tri,domain=detail_trimap(base,hand,hand,rgb,rgb,np.ones((100,100),bool))
  self.assertTrue(domain[25,40]);self.assertEqual(int(tri[25,40]),0)
 def test_merge_preserves_opaque_palm_and_never_changes_unobserved_or_unselected_pixels(self):
  prior=np.zeros((140,140),np.uint8);prior[15:125,15:125]=255;hand=prior.copy();observed=np.ones_like(prior,bool);observed[:,100:]=False;domain=np.zeros_like(prior,bool);domain[10:130,10:130]=True
  result=merge_detail_alpha(prior,np.full(prior.shape,.4),hand,domain,observed)
  self.assertEqual(int(result[65,65]),255)
  self.assertLess(int(result[20,20]),255)
  self.assertTrue(np.array_equal(result[:,100:],prior[:,100:]));self.assertTrue(np.array_equal(result[~domain],prior[~domain]))
 def test_geometry_and_nonfinite_predictions_rejected(self):
  a=np.zeros((10,10),np.uint8);b=np.ones((10,10),bool)
  with self.assertRaises(ValueError):merge_detail_alpha(a,np.full(a.shape,np.nan),a,b,b)
  with self.assertRaises(ValueError):detail_trimap(a,a,a,np.zeros((9,10,3)),np.zeros((10,10,3)),b)
 def test_hand_click_colours_cannot_authorize_white_cuff_transparency(self):
  background=np.full((24,40,3),[220,90,20],np.float32);rgb=background.copy();rgb[5:20,5:15]=[110,60,35];rgb[5:20,20:35]=[230,220,180]
  colours=np.array([[110,60,35],[115,65,35],[100,50,30]],np.float32)
  supported=foreground_colour_support(rgb,background,colours)
  self.assertTrue(supported[10,10]);self.assertFalse(supported[10,25])
 def test_motion_blurred_mixture_with_observed_background_remains_eligible(self):
  background=np.full((8,8,3),[35,60,150],np.float32);colour=np.array([150,90,35],np.float32);rgb=background*.4+colour*.6
  self.assertTrue(foreground_colour_support(rgb,background,[colour]).all())

if __name__=='__main__':unittest.main()
