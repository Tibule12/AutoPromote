"""Known-composite and preservation regressions, without cloud/model weights."""
import unittest
import tempfile
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

from model_workers.adapters.photographed_opacity import refine_photographed_opacity,regularize_opacity,refine_photographed_sequence


class PhotographedOpacity(unittest.TestCase):
    def fixture(self):
        h,w=160,200
        background=np.full((h,w,3),[32,53,88],np.uint8)
        silhouette=np.zeros((h,w),np.uint8)
        cv2.rectangle(silhouette,(40,60),(160,145),255,-1)
        for x in [50,80,110,140]:cv2.rectangle(silhouette,(x,20),(x+15,95),255,-1)
        cv2.circle(silhouette,(115,100),11,0,-1)
        truth=cv2.GaussianBlur(silhouette.astype(float)/255,(0,0),2)
        foreground=np.full((h,w,3),[155,106,66],float)
        image=np.rint(foreground*truth[...,None]+background*(1-truth[...,None])).astype(np.uint8)
        prior=cv2.morphologyEx(silhouette,cv2.MORPH_CLOSE,np.ones((31,31),np.uint8))
        observed=np.ones((h,w),bool)
        return image,prior,background,observed,prior.copy(),[prior.copy()],truth

    def test_false_opaque_finger_gap_moves_toward_known_exposure(self):
        image,prior,bg,observed,primary,parts,truth=self.fixture()
        result,detail=refine_photographed_opacity(image,prior,bg,observed,primary,parts)
        # This is an inter-finger exposure, inside the bounded edge band.
        # A palm-depth hole is deliberately excluded to preserve opaque cloth.
        hole=np.zeros(prior.shape,np.uint8);cv2.circle(hole,(103,34),3,1,-1);hole=hole>0
        self.assertGreater(np.mean(abs(prior[hole]/255-truth[hole])),.85)
        self.assertLess(np.mean(abs(result[hole]/255-truth[hole])),.15)
        self.assertTrue(np.all(result<=prior));self.assertGreater(detail['changedPixels'],0)
        # Strong current material is not made transparent by its dark colour.
        self.assertEqual(int(result[130,90]),255)

    def test_unknown_plate_cannot_erase_even_an_incorrect_opaque_gap(self):
        image,prior,bg,observed,primary,parts,_=self.fixture()
        observed[:]=False
        result,detail=refine_photographed_opacity(image,prior,bg,observed,primary,parts)
        np.testing.assert_array_equal(result,prior)
        self.assertEqual(detail['rows'][0]['status'],'no_photographed_background_no_change')

    def test_opaque_material_samples_cannot_become_translucent_in_their_own_posterior(self):
        image,prior,bg,observed,primary,parts,truth=self.fixture()
        depth=cv2.distanceTransform((parts[0]>=224).astype(np.uint8),cv2.DIST_L2,5)
        colour=image.astype(float)/255
        anchors=(depth>10)&(depth<32)&(prior>=254)
        anchors&=(colour[...,0]-colour[...,2]>.025)&(colour[...,1]-colour[...,2]>-.01)
        anchors&=truth>.999
        self.assertGreater(int(anchors.sum()),192)
        result,detail=refine_photographed_opacity(image,prior,bg,observed,primary,parts)
        np.testing.assert_array_equal(result[anchors],prior[anchors])
        self.assertTrue(detail['currentOpaqueMaterialAnchorsPreserved'])
        self.assertLess(float(result[34,103])/255,.15)

    def test_opaque_material_protection_follows_current_hand_without_filling_gaps(self):
        image,prior,bg,observed,primary,parts,truth=self.fixture()
        image,prior,primary,parts,truth=(np.roll(image,9,axis=1),np.roll(prior,9,axis=1),
            np.roll(primary,9,axis=1),[np.roll(parts[0],9,axis=1)],np.roll(truth,9,axis=1))
        depth=cv2.distanceTransform((parts[0]>=224).astype(np.uint8),cv2.DIST_L2,5)
        anchors=(depth>10)&(depth<32)&(truth>.999)&(prior==255)
        result,_=refine_photographed_opacity(image,prior,bg,observed,primary,parts)
        np.testing.assert_array_equal(result[anchors],prior[anchors])
        np.testing.assert_array_equal(result[prior==0],prior[prior==0])
        self.assertLess(float(result[34,112])/255,.15)

    def test_other_blue_material_is_not_keyed_with_missing_warm_evidence(self):
        image,prior,bg,observed,primary,parts,_=self.fixture()
        image[prior>0]=[40,70,150]
        result,detail=refine_photographed_opacity(image,prior,bg,observed,primary,parts)
        np.testing.assert_array_equal(result,prior)
        self.assertEqual(detail['rows'][0]['status'],'insufficient_current_material_no_change')

    def test_cool_lit_opaque_hand_material_stays_opaque_after_warm_model_qualification(self):
        image,prior,bg,observed,primary,parts,truth=self.fixture()
        # Reproduce the photographed wrist: the hand supplies enough warm
        # material for its colour model, but a shadow has a cool blue cast.
        # Its current opaque interior is not a mixture with the old blue set.
        depth=cv2.distanceTransform((parts[0]>=224).astype(np.uint8),cv2.DIST_L2,5)
        shadow=np.zeros(prior.shape,bool);shadow[96:124,138:151]=True
        shadow&=(depth>10)&(depth<32)&(truth>.999)&(prior==255)
        self.assertGreater(int(shadow.sum()),64)
        image[shadow]=[64,50,60]
        for shift in [0,9]:
            picture,mask,person,hand,expected_shadow=(np.roll(v,shift,axis=1)for v in
                [image,prior,primary,parts[0],shadow])
            result,detail=refine_photographed_opacity(picture,mask,bg,observed,person,[hand])
            self.assertEqual(detail['rows'][0]['status'],'applied')
            np.testing.assert_array_equal(result[expected_shadow],mask[expected_shadow])
            # Preserve the existing genuine finger-gap correction, including
            # background which the coarse hand selection incorrectly encloses.
            self.assertLess(int(result[34,103+shift]),40)
            np.testing.assert_array_equal(result[mask==0],mask[mask==0])

    def test_unobserved_pixels_and_input_arrays_remain_exact(self):
        image,prior,bg,observed,primary,parts,_=self.fixture()
        observed[:,100:]=False
        originals=[v.copy()for v in [image,prior,bg,observed,primary,*parts]]
        result,_=refine_photographed_opacity(image,prior,bg,observed,primary,parts)
        np.testing.assert_array_equal(result[:,100:],prior[:,100:])
        for actual,expected in zip([image,prior,bg,observed,primary,*parts],originals):
            np.testing.assert_array_equal(actual,expected)

    def test_empty_detail_is_an_explicit_noop_and_bad_geometry_fails(self):
        image,prior,bg,observed,primary,_,_=self.fixture()
        result,detail=refine_photographed_opacity(image,prior,bg,observed,primary,[np.zeros_like(prior)])
        np.testing.assert_array_equal(result,prior)
        self.assertEqual(detail['rows'][0]['status'],'empty_selection_no_change')
        with self.assertRaises(ValueError):refine_photographed_opacity(image,prior,bg[:-1],observed,primary,[])
        with self.assertRaises(ValueError):refine_photographed_opacity(image,prior,bg,observed.astype(np.uint8),primary,[])

    def test_changed_current_room_cannot_use_an_old_photographed_reference(self):
        image,prior,bg,observed,primary,parts,_=self.fixture()
        image[:4]=[150,180,210]
        result,detail=refine_photographed_opacity(image,prior,bg,observed,primary,parts)
        np.testing.assert_array_equal(result,prior)
        self.assertEqual(detail['rows'][0]['status'],'current_background_changed_no_change')

    def test_fully_occluded_current_reference_cannot_authorize_subtraction(self):
        image,prior,bg,observed,primary,parts,_=self.fixture()
        primary[:]=255
        result,detail=refine_photographed_opacity(image,prior,bg,observed,primary,parts)
        np.testing.assert_array_equal(result,prior)
        self.assertEqual(detail['rows'][0]['status'],'insufficient_current_background_no_change')

    def test_spatial_posterior_suppresses_noise_without_holding_a_pose(self):
        rng=np.random.default_rng(19);target=.5+rng.normal(0,.06,(40,60))
        domain=np.zeros(target.shape,bool);domain[3:-3,3:-3]=True
        rgb=np.full((*target.shape,3),100,np.uint8);variance=np.full(target.shape,.02)
        result=regularize_opacity(target,target.copy(),domain,rgb,variance,4)
        self.assertLess(np.std(result[8:-8,8:-8]),np.std(target[8:-8,8:-8])/3)
        np.testing.assert_array_equal(result[~domain],target[~domain])
        np.testing.assert_array_equal(regularize_opacity(target,target,domain&False,rgb,variance,4),target)

    def test_saved_sequence_restores_clicks_holdouts_and_does_not_freeze_old_clicks(self):
        image,prior,bg,observed,primary,parts,_=self.fixture();h,w=prior.shape
        with tempfile.TemporaryDirectory()as directory:
            root=Path(directory);rgb=root/'rgb';masks=root/'masks';guides=root/'guides'
            for p in [rgb,masks,guides]:p.mkdir()
            fg={'position':[103/w,34/h],'label':1}
            negative={'position':[90/w,130/h],'label':0}
            manifest={'_reference_rgb':image,'components':[]}
            for number,plane in enumerate([primary,parts[0]]):
                component={'selection':{'propagate':True,'points':[fg,negative]},'frames':[]}
                for i in range(2):
                    name=f'component-{number}-{i}.png';Image.fromarray(plane).save(guides/name)
                    component['frames'].append({'file':name})
                manifest['components'].append(component)
            for i in range(2):
                Image.fromarray(image).save(rgb/f'rgb_{i:04d}.png');Image.fromarray(prior).save(masks/f'matte_{i:04d}.png')
            holdout=np.zeros(prior.shape,bool);holdout[3:6,3:6]=True
            detail=refine_photographed_sequence(rgb,masks,(guides,manifest),bg,observed,holdout,count=2)
            first=np.array(Image.open(masks/'matte_0000.png'));second=np.array(Image.open(masks/'matte_0001.png'))
            self.assertEqual(int(first[34,103]),255)
            self.assertEqual(int(first[130,90]),0)
            self.assertLess(int(second[34,103]),40)
            self.assertEqual(int(second[130,90]),255)
            self.assertTrue(np.all(first[holdout]==255));self.assertTrue(np.all(second[holdout]==255))
            self.assertTrue(detail['authoredClicksAndHoldoutsRestored'])

    def test_two_frame_workers_preserve_moving_gaps_click_frames_and_every_output_byte(self):
        image,prior,bg,observed,primary,parts,_=self.fixture();h,w=prior.shape
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);rgb=root/'rgb';guides=root/'guides'
            serial=root/'serial';parallel=root/'parallel'
            for p in [rgb,guides,serial,parallel]:p.mkdir()
            manifest={'_reference_rgb':image,'components':[]}
            for number,plane in enumerate([primary,parts[0]]):
                selection={'propagate':True,
                    'points':[{'position':[103/w,34/h],'label':1}],
                    'shotPrompts':[{'frameIndex':2,'points':[
                        {'position':[121/w,34/h],'label':1}]}]}
                component={'selection':selection,'frames':[]}
                for index,shift in enumerate([0,9,18]):
                    name=f'component-{number}-{index}.png'
                    Image.fromarray(np.roll(plane,shift,axis=1)).save(guides/name)
                    component['frames'].append({'file':name})
                manifest['components'].append(component)
            for index,shift in enumerate([0,9,18]):
                Image.fromarray(np.roll(image,shift,axis=1)).save(rgb/f'rgb_{index:04d}.png')
                for destination in [serial,parallel]:
                    Image.fromarray(np.roll(prior,shift,axis=1)).save(destination/f'matte_{index:04d}.png')
            holdout=np.zeros(prior.shape,bool);holdout[3:6,3:6]=True
            a=refine_photographed_sequence(rgb,serial,(guides,manifest),bg,observed,holdout,count=3)
            b=refine_photographed_sequence(rgb,parallel,(guides,manifest),bg,observed,holdout,count=3,workers=2)
            self.assertEqual(a,b)
            for index in range(3):
                self.assertEqual((serial/f'matte_{index:04d}.png').read_bytes(),
                    (parallel/f'matte_{index:04d}.png').read_bytes())
            self.assertEqual(int(np.array(Image.open(parallel/'matte_0000.png'))[34,103]),255)
            self.assertLess(int(np.array(Image.open(parallel/'matte_0001.png'))[34,112]),40)
            self.assertEqual(int(np.array(Image.open(parallel/'matte_0002.png'))[34,121]),255)


if __name__=='__main__':unittest.main()
