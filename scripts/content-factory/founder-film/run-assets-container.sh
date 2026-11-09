#!/usr/bin/env bash
set -euo pipefail
/opt/blender/blender -b -t 2 --python /film/scene.py -- /film/scene-request.json /film render
python3 /film/encode.py /film
