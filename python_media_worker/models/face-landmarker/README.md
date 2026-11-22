# Pinned facial landmark model

MediaPipe Face Landmarker float16, bundle version 1.

- Source: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- Model documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker
- Upstream model card/license: https://huggingface.co/litert-community/MediaPipe-FaceLandmarker (Apache-2.0).

Bundled for offline CPU analysis. The worker verifies the pinned digest and refuses unavailable SDK/model dependencies; it never downloads a replacement at request time. Facial landmarks are estimates and require review during occlusion, profile turns, motion blur and low resolution. This does not identify people.
