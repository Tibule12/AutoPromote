#!/usr/bin/env bash
set -euo pipefail
/opt/blender/blender -b -t 2 --python-exit-code 1 --python /film/cinematic-vessel.py -- /film/vessel-request-full.json /film/vessel-full > /film/vessel-full.log 2>&1
/opt/blender/blender -b -t 2 --python-exit-code 1 --python /film/story-scenes.py -- /film/story-scenes-request.json /film/story-v3 preview > /film/story-preview-v3.log 2>&1
/opt/blender/blender -b -t 2 --python-exit-code 1 --python /film/story-scenes.py -- /film/story-scenes-request.json /film/story-v3 render > /film/story-full.log 2>&1
/opt/blender/blender -b -t 2 --python-exit-code 1 --python /film/cinematic-ident.py -- /film/ident-cinematic-request-full.json /film/ident-full > /film/ident-full.log 2>&1
/opt/blender/blender -b -t 2 --python-exit-code 1 --python /film/story-scenes-labels.py -- /film/story-labels-request.json /film/story-labels preview > /film/story-labels-preview.log 2>&1
/opt/blender/blender -b -t 2 --python-exit-code 1 --python /film/story-scenes-labels.py -- /film/story-labels-request.json /film/story-labels render > /film/story-labels-full.log 2>&1
python3 /film/materialize-native-assets.py /film /film/native-selection.json > /film/raw-encoding.log 2>&1
