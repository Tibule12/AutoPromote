import sys
try:
    from scenedetect import VideoManager, SceneManager
    from scenedetect.detectors import ContentDetector
    print("scenedetect: OK")
except ImportError:
    print("scenedetect: MISSING")

try:
    import cv2
    print("cv2: OK")
except ImportError:
    print("cv2: MISSING")

try:
    import ffmpeg
    print("ffmpeg-python: OK")
except ImportError:
    print("ffmpeg-python: MISSING")
