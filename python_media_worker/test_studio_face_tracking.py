from pathlib import Path
import unittest
from unittest.mock import Mock, patch
import cv2
import numpy as np
from studio_face_tracking import build_podcast_edit_plan, estimate_picture_fill, estimate_picture_window, track_faces


class StudioFaceTrackingTests(unittest.TestCase):
    def capture(self, frames):
        capture = Mock()
        capture.get.side_effect = lambda prop: 2 if prop == cv2.CAP_PROP_FPS else len(frames)
        capture.read.side_effect = [(True, frame) for frame in frames]
        return capture

    def test_independent_faces_follow_smoothly_without_sharing_detection(self):
        capture = self.capture([np.zeros((180, 320, 3), np.uint8)]*4)
        detector = Mock()
        detector.empty.return_value = False
        detector.detectMultiScale.side_effect = [np.array([[60+i*4, 60, 40, 40], [236-i*4, 60, 40, 40]]) for i in range(4)]
        with patch("studio_face_tracking.cv2.VideoCapture", return_value=capture), \
             patch("studio_face_tracking.cv2.CascadeClassifier", return_value=detector):
            data = track_faces("fixture", {"top": {"x": 25, "y": 50}, "bottom": {"x": 80, "y": 50}}, end=2)
        top, bottom = data["tracks"]["top"], data["tracks"]["bottom"]
        self.assertEqual(top["coverage"], 1)
        self.assertEqual(bottom["coverage"], 1)
        self.assertGreater(top["keyframes"][-1]["x"], 25)
        self.assertLess(bottom["keyframes"][-1]["x"], 80)
        for track in (top, bottom):
            for left, right in zip(track["keyframes"], track["keyframes"][1:]):
                self.assertLessEqual(abs(right["x"]-left["x"]), 2.001)
        capture.release.assert_called_once()

    def test_camera_cut_does_not_reassign_identity(self):
        capture = self.capture([np.zeros((180, 320, 3), np.uint8), np.full((180, 320, 3), 255, np.uint8)] )
        detector = Mock()
        detector.empty.return_value = False
        detector.detectMultiScale.return_value = np.array([[60, 60, 40, 40]])
        with patch("studio_face_tracking.cv2.VideoCapture", return_value=capture), \
             patch("studio_face_tracking.cv2.CascadeClassifier", return_value=detector):
            data = track_faces("fixture", {"solo": {"x": 25, "y": 50}}, end=1)
        self.assertEqual(data["sceneCuts"], [.5])
        self.assertEqual(len(data["tracks"]["solo"]["keyframes"]), 1)
        self.assertEqual(data["tracks"]["solo"]["missing"], [.5])

    def test_actual_local_host_detection(self):
        source = Path("/home/tibule12/Videos/cam-combiner-60sec.mp4")
        if not source.exists():
            self.skipTest("Local source is not available")
        result = track_faces(source, {"solo": {"x": 34, "y": 47}}, end=12)
        self.assertGreater(result["tracks"]["solo"]["coverage"], .65)
        self.assertGreater(len(result["tracks"]["solo"]["keyframes"]), 12)
        self.assertTrue(result["reviewRequired"])
        self.assertEqual(result["identity"], "anchor-proximity-not-voice-identification")

    def test_source_shots_reacquires_foreground_instead_of_stopping_at_cut(self):
        capture = self.capture([np.zeros((180, 320, 3), np.uint8)]*4)
        detector = Mock()
        detector.empty.return_value = False
        detector.detect.side_effect = [(None, boxes) for boxes in [
            np.array([[60, 60, 40, 40]]),
            np.array([[60, 60, 20, 20], [230, 60, 40, 40]]),
            np.array([[60, 60, 20, 20], [234, 60, 40, 40]]),
            np.array([[60, 60, 20, 20], [238, 60, 40, 40]]),
        ]]
        with patch("studio_face_tracking.cv2.VideoCapture", return_value=capture), \
             patch("studio_face_tracking.cv2.FaceDetectorYN.create", return_value=detector), \
             patch("studio_face_tracking.detect_source_cuts", return_value=[.5]):
            data = track_faces("fixture", {"solo": {"x": 25, "y": 50}}, end=2, mode="source_shots")
        keys = data["tracks"]["solo"]["keyframes"]
        self.assertEqual(data["tracks"]["solo"]["coverage"], 1)
        self.assertEqual(keys[0]["x"], 25)
        self.assertGreater(keys[1]["x"], 70)
        self.assertTrue(keys[1]["cut"])
        self.assertFalse(keys[2]["cut"])
        # Cut detection timestamps can seek to the preceding frame. The face
        # sample must come from just inside the newly detected shot.
        self.assertTrue(any(call.args == (cv2.CAP_PROP_POS_MSEC, 580.0)
                            for call in capture.set.call_args_list))
        self.assertEqual(data["identity"], "foreground-per-shot-not-person-identification")

    def test_ambiguous_new_shot_waits_for_a_dominant_face(self):
        capture = self.capture([np.zeros((180, 320, 3), np.uint8)]*3)
        detector = Mock()
        detector.empty.return_value = False
        detector.detect.side_effect = [(None, boxes) for boxes in [np.array([[60, 60, 40, 40]]),
            np.array([[60, 60, 40, 40], [230, 60, 40, 40]]), np.array([[230, 60, 40, 40]])]]
        with patch("studio_face_tracking.cv2.VideoCapture", return_value=capture), \
             patch("studio_face_tracking.cv2.FaceDetectorYN.create", return_value=detector), \
             patch("studio_face_tracking.detect_source_cuts", return_value=[.5]):
            data = track_faces("fixture", {"solo": {"x": 25, "y": 50}}, end=1.5, mode="source_shots")
        self.assertEqual(data["tracks"]["solo"]["missing"], [.5])
        self.assertTrue(data["tracks"]["solo"]["keyframes"][-1]["cut"])
        self.assertEqual(data["tracks"]["solo"]["keyframes"][-1]["time"], .5)

    def test_source_shots_cannot_silently_reassign_split_identities(self):
        with self.assertRaises(ValueError):
            track_faces("fixture", {"top": {}, "bottom": {}}, mode="source_shots")

    def test_short_obscured_shot_alternates_from_previous_camera_side(self):
        capture = self.capture([np.zeros((180, 320, 3), np.uint8)]*3)
        detector = Mock()
        detector.empty.return_value = False
        detector.detect.side_effect = [(None, boxes) for boxes in [
            np.array([[60, 60, 40, 40]]), np.empty((0, 4)), np.array([[60, 60, 40, 40]]),
        ]]
        with patch("studio_face_tracking.cv2.VideoCapture", return_value=capture), \
             patch("studio_face_tracking.cv2.FaceDetectorYN.create", return_value=detector), \
             patch("studio_face_tracking.detect_source_cuts", return_value=[.5, 1.0]):
            data = track_faces("fixture", {"solo": {"x": 25, "y": 50}}, end=1.5,
                               mode="source_shots")
        fallback = next(item for item in data["tracks"]["solo"]["keyframes"]
                        if item["origin"] == "short_shot_side_fallback")
        self.assertEqual(fallback["time"], .5)
        self.assertEqual(fallback["x"], 25)
        held_cut = next(item for item in data["editPlan"]["timelineCuts"]
                        if item["time"] == .5)
        self.assertLess(held_cut["sourceTimeOffsetSeconds"], 0)

    def test_picture_fill_measures_baked_frame_padding_without_episode_timestamps(self):
        frame = np.zeros((200, 360, 3), np.uint8)
        frame[10:190, 18:342] = (80, 130, 190)
        self.assertAlmostEqual(estimate_picture_fill(frame), 1.116, places=3)
        self.assertEqual(estimate_picture_window(frame), (5.0, 5.0))
        asymmetric = np.zeros((200, 360, 3), np.uint8)
        asymmetric[15:195, 18:342] = (80, 130, 190)
        self.assertEqual(estimate_picture_window(asymmetric), (7.5, 2.5))
        full_bleed = np.full((200, 360, 3), 80, np.uint8)
        self.assertEqual(estimate_picture_fill(full_bleed), 1)

    def test_edit_plan_excludes_small_reaction_window_and_records_fill_per_shot(self):
        plan = build_podcast_edit_plan(0, 12, [5], [
            {"time": 0, "faceY": .32, "pictureFill": 1.11,
             "faces": [(.72, .35, .08), (.1, .12, .006)]},
            {"time": 5, "faceY": .65, "pictureFill": 1.07,
             "faces": [(.30, .62, .09), (.9, .15, .004)]},
        ])
        self.assertEqual([cut["zoom"] for cut in plan["timelineCuts"]], [1.11, 1.07])
        self.assertEqual([cut["placement"] for cut in plan["captionPlacementCuts"]],
                         ["bottom_center", "top_center"])
        self.assertEqual(plan["splitSuggestions"], [])
        self.assertFalse(plan["preflight"]["reactionWindowsUsedForSplit"])

    def test_edit_plan_suggests_split_only_for_two_clean_foreground_faces(self):
        plan = build_podcast_edit_plan(0, 12, [], [{
            "time": 2, "faceY": .35, "pictureFill": 1,
            "faces": [(.25, .4, .045), (.75, .42, .04)],
        }])
        self.assertEqual(len(plan["splitSuggestions"]), 1)
        self.assertEqual(plan["splitSuggestions"][0]["reason"], "two_clean_foreground_faces")
        self.assertEqual(plan["splitSuggestions"][0]["top"]["x"], 25)
        self.assertEqual(plan["mainFrame"]["radiusPercent"], 10)

    def test_edit_plan_rejects_edge_reaction_false_positive(self):
        plan = build_podcast_edit_plan(0, 12, [], [{
            "time": 2, "faceY": .35, "pictureFill": 1,
            "faces": [(.25, .4, .04), (.95, .7, .03)],
        }])
        self.assertEqual(plan["splitSuggestions"], [])

    def test_edit_plan_keeps_temporal_cutaways_out_of_automatic_splits(self):
        observations = []
        for time, x in [(0, .25), (1, .25), (10, .75), (11, .75),
                        (25, .25), (26, .25), (35, .75), (36, .75)]:
            observations.append({
                "time": time, "faceX": x, "faceY": .35, "pictureFill": 1.1,
                "faces": [(x, .35, .06), (.94, .12, .004)],
            })
        plan = build_podcast_edit_plan(0, 45, [10, 25, 35], observations)
        temporal = plan["temporalCutawayCandidates"]
        self.assertEqual(len(temporal), 1)
        self.assertEqual(plan["splitSuggestions"], [])
        self.assertNotEqual(temporal[0]["bottom"]["sourceTimeOffsetSeconds"], 0)
        self.assertFalse(plan["preflight"]["reactionWindowsUsedForSplit"])


if __name__ == "__main__":
    unittest.main()
