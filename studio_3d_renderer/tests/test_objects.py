import copy
import json
from pathlib import Path
import pytest
from objects import validate_objects, object_pose, validate_ribbon, ribbon_mesh, RIBBON_DEFAULTS
from collections import Counter
from spec import validate_spec

FIXTURE = Path(__file__).with_name("objects.json")

def scene():
    return json.loads(FIXTURE.read_text())

def test_objects_reach_renderer_and_keep_independent_animation():
    spec = scene()
    validate_spec(spec)
    first, second = spec["scene"]["objects"]
    assert object_pose(first, .75)["x"] == -1.8
    assert object_pose(first, .75)["rotationY"] == 45
    assert object_pose(first, .75)["y"] == -.3
    assert object_pose(second, .75)["y"] == .3

@pytest.mark.parametrize("field,value", [("shape", "../scene.blend"), ("scaleX", 0), ("x", float("nan")), ("script", "import os")])
def test_rejects_invalid_object_fields(field, value):
    spec = scene()
    spec["scene"]["objects"][0][field] = value
    with pytest.raises(ValueError):
        validate_spec(spec)

def test_rejects_duplicate_identity_and_timing():
    spec = scene()
    objects = spec["scene"]["objects"]
    objects.append(copy.deepcopy(objects[0]))
    with pytest.raises(ValueError):
        validate_objects(objects, 1.5)
    objects.pop()
    objects[0]["keyframes"][1]["time"] = 0
    with pytest.raises(ValueError):
        validate_objects(objects, 1.5)

def test_bounds_physical_surface_and_bevel_without_accepting_code():
    spec = scene()
    item = spec["scene"]["objects"][0]
    item.update(material="architecture", bevel=.08)
    validate_spec(spec)
    item["bevel"] = .151
    with pytest.raises(ValueError):
        validate_spec(spec)
    item.update(bevel=.08, material="arbitrary-script")
    with pytest.raises(ValueError):
        validate_spec(spec)

@pytest.mark.parametrize("path", ["loop", "knot", "wave"])
def test_swept_surfaces_are_closed_solids_and_seeking_is_stateless(path):
    params = {**RIBBON_DEFAULTS, "path": path}
    vertices, faces = ribbon_mesh(params, 1.75)
    edges = Counter(tuple(sorted((face[i], face[(i+1)%len(face)]))) for face in faces for i in range(len(face)))
    assert set(edges.values()) == {2}
    assert ribbon_mesh(params, 1.75)[0] == vertices
    assert ribbon_mesh(params, 2.5)[0] != vertices
    assert ribbon_mesh({**params,"speed":0}, 1)[0] == ribbon_mesh({**params,"speed":0}, 9)[0]

@pytest.mark.parametrize("field,value", [("path","../mesh.blend"),("lobes",1.5),("twists",True),("wave",float("inf")),("script","import os"),("speed",2)])
def test_rejects_unbounded_or_executable_surface_parameters(field,value):
    with pytest.raises(ValueError):
        validate_ribbon({**RIBBON_DEFAULTS,field:value})

def test_procedural_surface_and_lighting_cross_the_strict_render_boundary():
    spec = scene(); spec["scene"]["lightingRig"] = "sculpture"
    spec["scene"]["objects"][0].update(shape="ribbon",ribbon=dict(RIBBON_DEFAULTS),material="brushed",roughness=.19)
    validate_spec(spec)
    spec["scene"]["lightingRig"] = "external-code"
    with pytest.raises(ValueError):
        validate_spec(spec)
