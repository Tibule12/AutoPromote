"""Inspect actual headless Blender devices without cloud services or job dispatch."""
import json
import sys

import bpy
import gpu

args = sys.argv[sys.argv.index("--") + 1:]
if len(args) != 1:
    raise ValueError("Expected a validated local scene specification")
sys.path.insert(0, "/app")
from blender_scene import setup_scene
from spec import validate_spec

with open(args[0], encoding="utf-8") as handle:
    spec = validate_spec(json.load(handle))
scene, _, _, _ = setup_scene(spec)
bpy.ops.render.render(write_still=False)
devices = {}
preferences = bpy.context.preferences.addons["cycles"].preferences
for backend in ("OPTIX", "CUDA"):
    try:
        preferences.compute_device_type = backend
        preferences.get_devices()
        devices[backend] = [{"name": device.name, "type": device.type, "id": device.id} for device in preferences.devices]
    except Exception as error:
        devices[backend] = {"error": str(error)}
try:
    graphics = {"vendor": gpu.platform.vendor_get(), "renderer": gpu.platform.renderer_get()}
except SystemError as error:
    graphics = {"available_in_background": False, "reason": str(error)}
print(json.dumps({"event": "headless_blender_devices", "version": bpy.app.version_string,
                  "render_engine": scene.render.engine, "graphics": graphics,
                  "cycles_devices": devices}), flush=True)
