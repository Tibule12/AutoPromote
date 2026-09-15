from pathlib import Path
import unittest
from unittest.mock import Mock, patch
import cv2
import numpy as np
from studio_face_tracking import track_faces


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

    def test_source_shots_cannot_silently_reassign_split_identities(self):
        with self.assertRaises(ValueError):
            track_faces("fixture", {"top": {}, "bottom": {}}, mode="source_shots")


if __name__ == "__main__":
    unittest.main()
