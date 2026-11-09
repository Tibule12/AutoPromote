"""Exercise actual tracker transforms with a deterministic colour segmenter.

The moving foreground leaves its initial selection. It must remain visible to
inference; a prompt box is a selection, not a permanent clipping boundary.
Real SAM2/ViTMatte footage review is recorded separately.
"""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
import torch

from model_workers.adapters.component_segmentation import ComponentVideoTracker


class Processor:
    prompts = []
    sessions = []

    def init_video_session(self, **kwargs):
        self.sessions.append(kwargs)
        return SimpleNamespace(processed_frames={}, output_dict_per_obj={}, obj_with_new_inputs=[], objects=set())

    def add_inputs_to_inference_session(self, **kwargs):
        self.prompts.append(kwargs)
        session=kwargs['inference_session']
        session.objects.update(kwargs['obj_ids'])
        # Upstream replaces this queue for each call, rather than appending.
        session.obj_with_new_inputs=list(kwargs['obj_ids'])


class ColourSegmenter:
    config = SimpleNamespace(image_size=64, max_object_pointers_in_encoder=1)
    num_maskmem = 1

    def __init__(self):
        self.inputs = []
        self.pending = []
        self.session_ids = []
        self.frame_indices = []

    def __call__(self, *, frame, **kwargs):
        self.inputs.append(frame.clone())
        session=kwargs['inference_session']
        self.session_ids.append(id(session))
        self.frame_indices.append(kwargs.get('frame_idx'))
        self.pending.append(list(session.obj_with_new_inputs))
        session.obj_with_new_inputs.clear()
        # Red source foreground; deliberately independent of selection boxes.
        logits = (frame[0] - .5) * 20
        return SimpleNamespace(pred_masks=logits[None, None].repeat(len(session.objects),1,1,1))


class MovementTests(unittest.TestCase):
    def make_tracker(self, *, corrections=True, second_object=False, fixed_object=False, refresh_fixed=None, offload_state=False, registered_refresh=False, registered_stateless=False):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        directory = Path(self.directory.name)
        (directory / 'model.safetensors').write_bytes(b'test-only')
        (directory / 'preprocessor_config.json').write_text(json.dumps({
            'image_mean': [0, 0, 0], 'image_std': [1, 1, 1], 'rescale_factor': 1 / 255}))
        parameters = {'subjectId': 'hand', 'initialBox': [.1, .1, .35, .35],
                      'points': [{'position': [.2, .2], 'label': 1}],
                      'shotPrompts': [{'frameIndex': 1,
                                       'points': [{'position': [.8, .8], 'label': 1}]}]}
        if not corrections:
            parameters['shotPrompts'] = []
        if fixed_object:
            parameters['components']=[{'id':'fixed-stand','box':[.55,.55,.95,.95],
                'points':[{'position':[.7,.7],'label':1}], 'propagate':False}]
        if second_object:
            parameters['components']=[{'id':'other-hand','box':[.6,.6,.9,.9],
                'points':[{'position':[.7,.7],'label':1}],
                'shotPrompts':[{'frameIndex':1,'points':[{'position':[.2,.8],'label':0}]}]}]
        model = ColourSegmenter()
        Processor.prompts = []
        Processor.sessions = []
        module = SimpleNamespace(Sam2VideoModel=None, Sam2VideoProcessor=Processor)
        with patch.dict(sys.modules, {'transformers': module}):
            tracker = ComponentVideoTracker({
                'model': {'limits': {'refreshFixedSourceFrames': registered_refresh, 'statelessFixedSourceFrames': registered_stateless}, 'weights': [{'path': 'model.safetensors',
                                      'sha256': hashlib.sha256(b'test-only').hexdigest()}]},
                'request': {'parameters': parameters}}, {'width': 64, 'height': 64}, directory,
                model=model,refresh_fixed=refresh_fixed,offload_state=offload_state)
        return tracker, model

    def test_moving_hand_can_leave_initial_selection_without_being_clipped(self):
        tracker, model = self.make_tracker(corrections=False)
        first = np.zeros((64, 64, 3), np.uint8)
        first[10:20, 10:20, 0] = 255
        moved = np.zeros_like(first)
        moved[45:56, 47:58, 0] = 255
        a, _ = tracker.frame(first, 0)
        b, _ = tracker.frame(moved, 1)
        self.assertTrue((a[12:18, 12:18] > 250).all())
        self.assertTrue((b[47:54, 49:56] > 250).all())
        self.assertTrue((b[12:18, 12:18] < 5).all())
        self.assertEqual(tracker.rois[0], (0, 0, 64, 64))

    def test_later_click_does_not_reapply_stale_first_pose_box(self):
        tracker, _ = self.make_tracker()
        rgb = np.zeros((64, 64, 3), np.uint8)
        tracker.frame(rgb, 0)
        tracker.frame(rgb, 1)
        self.assertIn('input_boxes', Processor.prompts[0])
        correction = Processor.prompts[1]
        self.assertNotIn('input_boxes', correction)
        self.assertEqual(correction['input_points'], [[[[51.2, 51.2]]]])
        self.assertEqual(correction['original_size'], (64, 64))

    def test_fixed_equipment_retains_detailed_bounded_crop(self):
        from model_workers.adapters.component_segmentation import component_roi
        fixed = {'box': [.4, .4, .5, .5], 'points': [], 'propagate': False}
        self.assertEqual(component_roi(fixed, 1000, 1000), (388, 388, 512, 512))

    def test_explicit_history_offload_preserves_tracker_and_requests_cpu_storage(self):
        tracker, model = self.make_tracker(corrections=False, offload_state=True)
        source = np.zeros((64,64,3),np.uint8)
        source[10:20,10:20,0] = 255
        first,_ = tracker.frame(source,0)
        second,_ = tracker.frame(source,1)
        self.assertTrue((first[12:18,12:18]>250).all())
        self.assertTrue(np.array_equal(first,second))
        self.assertEqual(len(model.inputs),2)
        self.assertEqual(Processor.sessions[0]['inference_state_device'],'cpu')

    def test_explicit_new_pose_box_is_preserved(self):
        tracker, _ = self.make_tracker()
        tracker.components[0]['shotPrompts'][0]['box'] = [.65, .65, .95, .95]
        rgb = np.zeros((64, 64, 3), np.uint8)
        tracker.frame(rgb, 0)
        tracker.frame(rgb, 1)
        self.assertEqual(Processor.prompts[1]['input_boxes'], [[[41.6, 41.6, 60.8, 60.8]]])

    def test_saved_primary_point_correction_does_not_reset_to_unchanged_box(self):
        tracker, _ = self.make_tracker()
        tracker.components[0]['shotPrompts'][0]['box'] = [.1, .1, .35, .35]
        rgb = np.zeros((64, 64, 3), np.uint8)
        tracker.frame(rgb, 0)
        tracker.frame(rgb, 1)
        self.assertNotIn('input_boxes', Processor.prompts[1])

    def test_same_frame_corrections_for_both_objects_reach_inference(self):
        tracker, model=self.make_tracker(second_object=True)
        rgb=np.zeros((64,64,3),np.uint8)
        tracker.frame(rgb,0)
        tracker.frame(rgb,1)
        self.assertEqual(model.pending[0],[1,2])
        self.assertEqual(model.pending[1],[1,2])

    def test_opted_in_fixed_roi_sees_current_occlusion_and_reveal(self):
        tracker,model=self.make_tracker(corrections=False,fixed_object=True,refresh_fixed=True)
        first=np.zeros((64,64,3),np.uint8);first[40:52,40:52,0]=255
        revealed=np.zeros_like(first);revealed[45:58,47:60,0]=255
        _,before=tracker.frame(first,0);_,after=tracker.frame(revealed,1)
        self.assertGreater(int(before[1][43,43]),240)
        self.assertLess(int(after[1][43,43]),5)
        self.assertGreater(int(after[1][50,52]),240)
        self.assertEqual(len(model.inputs),4)
        self.assertEqual(tracker.rois[1],(23,23,64,64))

    def test_ordinary_fixed_object_retains_existing_hold_semantics(self):
        tracker,model=self.make_tracker(corrections=False,fixed_object=True)
        first=np.zeros((64,64,3),np.uint8);first[40:52,40:52,0]=255
        _,before=tracker.frame(first,0);_,after=tracker.frame(np.zeros_like(first),1)
        self.assertTrue(np.array_equal(before[1],after[1]))
        self.assertEqual(len(model.inputs),3)

    def test_registered_fixed_object_uses_current_rgb_without_a_private_override(self):
        tracker, model = self.make_tracker(corrections=False, fixed_object=True, registered_refresh=True)
        first = np.zeros((64,64,3), np.uint8)
        first[40:52,40:52,0] = 255
        _, before = tracker.frame(first, 0)
        _, revealed = tracker.frame(np.zeros_like(first), 1)
        self.assertTrue((before[1][43:49,43:49] > 250).all())
        self.assertTrue((revealed[1][43:49,43:49] < 5).all())
        self.assertEqual(len(model.inputs), 4)
        self.assertEqual(tracker.fixed_roi_diagnostics[1]['neural_frames'], 2)

    def test_fixed_roi_reuse_checks_against_actual_inference_frame_without_drift(self):
        tracker,model=self.make_tracker(corrections=False,fixed_object=True,refresh_fixed=True)
        first=np.zeros((64,64,3),np.uint8);first[40:52,40:52,0]=240
        tracker.frame(first,0)
        close=first.copy();close[40:52,40:52,0]=244;tracker.frame(close,1)
        # This third frame is only four levels from the previous input, but
        # eight from the actual inference frame. It must trigger inference.
        changed=first.copy();changed[40:52,40:52,0]=248;tracker.frame(changed,2)
        self.assertEqual(len(model.inputs),5)
        fixed=tracker.fixed_roi_diagnostics[1]
        self.assertEqual(fixed['neural_frames'],2)
        self.assertEqual(fixed['agreeing_reuses'],1)

    def test_current_image_fixed_objects_reset_only_their_own_memory(self):
        tracker, model = self.make_tracker(fixed_object=True, registered_refresh=True,
                                          registered_stateless=True)
        first = np.zeros((64, 64, 3), np.uint8)
        first[40:52, 40:52, 0] = 255
        hidden = np.zeros_like(first)
        revealed = np.zeros_like(first)
        revealed[47:59, 49:61, 0] = 255
        _, before = tracker.frame(first, 0)
        _, occluded = tracker.frame(hidden, 1)
        _, after = tracker.frame(revealed, 2)
        self.assertGreater(int(before[1][44, 44]), 240)
        self.assertLess(int(occluded[1][44, 44]), 5)
        self.assertGreater(int(after[1][52, 54]), 240)
        self.assertEqual(model.frame_indices, [0, 0, 1, 0, 2, 0])
        self.assertEqual(len(set(model.session_ids[::2])), 1)
        self.assertEqual(len(set(model.session_ids[1::2])), 3)
        self.assertEqual(tracker.fixed_roi_diagnostics[1]['current_image_frames'], 3)
        moving_correction = next(p for p in Processor.prompts if p['frame_idx'] == 1)
        self.assertNotIn('input_boxes', moving_correction)

    def test_current_image_fixed_object_reuses_only_agreeing_source_pixels(self):
        tracker, model = self.make_tracker(corrections=False, fixed_object=True,
                                          registered_refresh=True, registered_stateless=True)
        source = np.zeros((64, 64, 3), np.uint8)
        source[40:52, 40:52, 0] = 255
        _, first = tracker.frame(source, 0)
        _, second = tracker.frame(source.copy(), 1)
        np.testing.assert_array_equal(first[1], second[1])
        self.assertEqual(len(model.inputs), 3)
        self.assertEqual(tracker.fixed_roi_diagnostics[1]['agreeing_reuses'], 1)
        self.assertEqual(tracker.fixed_roi_diagnostics[1]['current_image_frames'], 1)

    def test_current_image_mode_cannot_disable_fixed_source_refresh(self):
        with self.assertRaisesRegex(ValueError, 'source RGB refresh'):
            self.make_tracker(fixed_object=True, registered_stateless=True,
                              refresh_fixed=False)


if __name__ == '__main__':
    unittest.main()
