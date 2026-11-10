"""Source-edge repair may never harden fast blur or erase another object."""
import unittest
import cv2
import numpy as np
from model_workers.adapters.person_material_alpha import refine_person_source_boundaries


class PersonSourceBoundary(unittest.TestCase):
    def fixture(self):
        rgb=np.full((96,160,3),[205,210,215],np.uint8)
        rgb[15:82,30:90]=[35,45,55]
        person=np.zeros((96,160),np.uint8);person[15:82,30:90]=255
        alpha=cv2.GaussianBlur(person,(9,9),1.4)
        return rgb,alpha,person,np.zeros(alpha.shape,np.float32)

    def test_slow_source_boundary_reduces_wrong_fringe_without_losing_opaque_core(self):
        rgb,alpha,person,motion=self.fixture()
        result=refine_person_source_boundaries(rgb,alpha,person,motion)
        self.assertLess(int(result[45,28]),int(alpha[45,28]))
        self.assertGreater(int(result[45,31]),int(alpha[45,31]))
        self.assertEqual(int(result[45,50]),255)
        np.testing.assert_array_equal(result[:,100:],alpha[:,100:])

    def test_unannotated_fast_moving_person_edges_keep_fractional_exposure_alpha(self):
        rgb,alpha,person,motion=self.fixture();motion[20:75,22:98]=3
        result=refine_person_source_boundaries(rgb,alpha,person,motion)
        np.testing.assert_array_equal(result[motion>=3],alpha[motion>=3])
        self.assertGreater(np.count_nonzero((alpha>0)&(alpha<255)&(motion>=3)),0)

    def test_separate_current_hand_and_fixed_rail_keep_exact_alpha_and_gaps(self):
        rgb,alpha,person,motion=self.fixture()
        hand=np.zeros_like(alpha);hand[40:50,85:100]=40
        rail=np.zeros_like(alpha);rail[68:85,30:35]=100
        alpha[43:47,87:90]=0;alpha[72:80,30:33]=71
        result=refine_person_source_boundaries(rgb,alpha,person,motion,[hand],[rail])
        protected=(cv2.dilate((hand>=24).astype(np.uint8),np.ones((31,31),np.uint8))>0)|(cv2.dilate((rail>=24).astype(np.uint8),np.ones((7,7),np.uint8))>0)
        np.testing.assert_array_equal(result[protected],alpha[protected])
        self.assertEqual(int(result[44,88]),0)
        self.assertEqual(int(result[75,31]),71)

    def test_empty_person_or_full_fast_motion_abstains(self):
        rgb,alpha,person,motion=self.fixture()
        np.testing.assert_array_equal(refine_person_source_boundaries(rgb,alpha,person//2,motion),alpha)
        np.testing.assert_array_equal(refine_person_source_boundaries(rgb,alpha,person,motion+3),alpha)

    def test_invalid_flow_geometry_and_nonfinite_source_evidence_rejected(self):
        rgb,alpha,person,motion=self.fixture()
        invalid=[motion[:20],motion.astype(np.uint8),motion-1,motion+np.nan]
        for field in invalid:
            with self.assertRaises(ValueError):refine_person_source_boundaries(rgb,alpha,person,field)
        with self.assertRaises(ValueError):refine_person_source_boundaries(rgb,alpha,person,motion,[person[:20]])


if __name__=='__main__':unittest.main()
