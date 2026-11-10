import copy
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from model_workers.adapters.fixed_source_neural import polish_fixed_source_objects


class FixedSourceNeural(unittest.TestCase):
    def fixture(self, directory):
        rgb = np.full((96,160,3), [210,65,35], np.uint8)
        alpha = np.zeros((96,160), np.uint8)
        person = np.zeros_like(alpha)
        person[10:90,5:35] = 255
        alpha[person > 0] = 255
        # Incoming neural clothing remains opaque even where tracking missed it.
        person[30:60,12:24] = 0
        alpha[30:60,12:24] = 231
        prop = np.zeros_like(alpha)
        prop[25:75,85:125] = 255
        alpha[prop > 0] = 255
        alpha[25:75,84] = 160
        rgb[prop > 0] = [30,35,30]
        selections = [({'id':'person','propagate':True,'points':[]}, person),
            ({'id':'prop','propagate':False,'points':[]}, prop)]
        components = []
        for selection, plane in selections:
            name = selection['id'] + '.png'
            Image.fromarray(plane).save(Path(directory)/name)
            components.append({'selection':selection,'roi':[0,0,160,96],
                               'frames':[{'file':name}]})
        return rgb, alpha, (Path(directory), {
            'components':components,'_reference_rgb':rgb.copy()})

    def test_current_missed_clothing_changed_hand_and_other_objects_are_exact(self):
        with tempfile.TemporaryDirectory() as directory:
            rgb, alpha, guidance = self.fixture(directory)
            # An untracked moving hand changes RGB inside the prop ROI.
            rgb[35:45,132:142] = [170,110,70]
            alpha[35:45,132:142] = 211
            stand = np.zeros_like(alpha)
            stand[10:90,65:69] = 255
            alpha[stand > 0] = 243
            Image.fromarray(stand).save(Path(directory)/'stand.png')
            guidance[1]['components'].append({'selection':{
                'id':'stand','propagate':False,'points':[]},
                'roi':[50,0,80,96],'frames':[{'file':'stand.png'}]})
            original = alpha.copy()
            def infer(picture, trimap, limit):
                # A deliberately destructive prediction must still have no
                # authority over another foreground object or changed source.
                return np.zeros(trimap.shape, np.float32)
            values, records = polish_fixed_source_objects(
                rgb,alpha,guidance,0,['prop'],infer)
            self.assertTrue(records)
            self.assertTrue(np.array_equal(values[:,:50], original[:,:50]))
            self.assertTrue(np.array_equal(values[35:45,132:142],
                                           original[35:45,132:142]))
            self.assertTrue(np.array_equal(values[stand > 0], original[stand > 0]))
            self.assertTrue(np.array_equal(alpha, original))

    def test_authored_gap_and_foreground_remain_authoritative(self):
        with tempfile.TemporaryDirectory() as directory:
            rgb,alpha,guidance = self.fixture(directory)
            selection = guidance[1]['components'][1]['selection']
            selection['points'] = [
                {'position':[95/160,40/96],'label':0},
                {'position':[110/160,55/96],'label':1}]
            values, _ = polish_fixed_source_objects(rgb,alpha,guidance,0,
                ['prop'],lambda picture,trimap,limit:
                    np.full(trimap.shape,.4,np.float32))
            self.assertEqual(int(values[40,95]),0)
            self.assertEqual(int(values[55,110]),255)
            self.assertEqual(int(values[50,84]),102)

    def test_outside_verified_roi_is_exact_and_invalid_predictions_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            rgb,alpha,guidance = self.fixture(directory)
            guidance[1]['components'][1]['roi']=[75,15,135,85]
            before=alpha.copy()
            result,_=polish_fixed_source_objects(rgb,alpha,guidance,0,['prop'],
                lambda picture,trimap,limit:np.full(trimap.shape,.4,np.float32))
            self.assertTrue(np.array_equal(result[:15],before[:15]))
            self.assertTrue(np.array_equal(result[:,135:],before[:,135:]))
            for invalid in [np.nan,1.1,-.1]:
                with self.assertRaises(ValueError):
                    polish_fixed_source_objects(rgb,alpha,guidance,0,['prop'],
                        lambda picture,trimap,limit,v=invalid:
                            np.full(trimap.shape,v,np.float32))
            self.assertTrue(np.array_equal(alpha,before))
            for bad in [[0,0,161,96],[0,0,135.5,85],[0,0,135]]:
                guidance[1]['components'][1]['roi']=bad
                with self.assertRaises(ValueError):
                    polish_fixed_source_objects(rgb,alpha,guidance,0,['prop'],
                        lambda *unused:None)


if __name__ == '__main__':
    unittest.main()
