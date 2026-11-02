"""Bounded independent object geometry and animation in the canonical renderer."""
import math
import re

SHAPES = {"box", "sphere", "torus", "cylinder", "icosphere", "ribbon", "plane"}
RIBBON_DEFAULTS = dict(path="knot", width=.55, thickness=.065, wave=.65, lobes=3, twists=1, speed=.3, phase=0)
RIBBON_BOUNDS = dict(width=(.1, 1.2), thickness=(.015, .2), wave=(0, 1.2), lobes=(1, 6), twists=(-3, 3), speed=(-1, 1), phase=(0, 360))
FIELDS = ("x", "y", "z", "scaleX", "scaleY", "scaleZ", "rotationX", "rotationY", "rotationZ")
EASINGS = {"linear", "ease_out", "ease_in_out", "spring"}


def validate_pose(values):
    if not isinstance(values, dict) or set(values) != set(FIELDS):
        raise ValueError("Invalid object pose fields")
    for field in FIELDS:
        low, high = (.05, 4) if field.startswith("scale") else (-180, 180) if field.startswith("rotation") else (-6, 6)
        value = values[field]
        if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError("Invalid object " + field)


def validate_objects(objects, duration):
    if not isinstance(objects, list) or not 1 <= len(objects) <= 24:
        raise ValueError("Use one to24 scene objects")
    ids, total = set(), 0
    identity = lambda value: isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value)
    for item in objects:
        if not isinstance(item, dict) or set(item) - {"id", "name", "shape", "color", "material", "bevel", "roughness", "ribbon", "keyframes", *FIELDS}:
            raise ValueError("Invalid scene object fields")
        if not identity(item.get("id")) or item["id"] in ids or not isinstance(item.get("name"), str) or len(item["name"]) > 80 or re.search(r"[\x00-\x1f<>]", item["name"]) or item.get("shape") not in SHAPES or not re.fullmatch(r"#[a-fA-F0-9]{6}", item.get("color", "")):
            raise ValueError("Invalid scene object identity or appearance")
        ids.add(item["id"])
        if "material" in item and item["material"] not in {"chrome", "glass", "neon", "gold", "matte", "holographic", "architecture", "brushed", "silk"}:
            raise ValueError("Invalid object material")
        if "bevel" in item and (isinstance(item["bevel"], bool) or not isinstance(item["bevel"], (int, float)) or not math.isfinite(item["bevel"]) or not 0 <= item["bevel"] <= .15):
            raise ValueError("Invalid object bevel")
        if "roughness" in item and (isinstance(item["roughness"], bool) or not isinstance(item["roughness"], (int, float)) or not math.isfinite(item["roughness"]) or not .04 <= item["roughness"] <= 1):
            raise ValueError("Invalid object roughness")
        if item["shape"] == "ribbon":
            validate_ribbon(item.get("ribbon"))
        elif "ribbon" in item:
            raise ValueError("Ribbon parameters require a ribbon")
        validate_pose({field: item.get(field) for field in FIELDS})
        keys = item.get("keyframes")
        if not isinstance(keys, list) or len(keys) > 32:
            raise ValueError("Too many object keys")
        total += len(keys)
        key_ids, times = set(), set()
        for key in keys:
            if not isinstance(key, dict) or set(key) != {"id", "time", "values", "easing"} or not identity(key["id"]) or key["id"] in key_ids or isinstance(key["time"], bool) or not isinstance(key["time"], (float, int)) or not math.isfinite(key["time"]) or not 0 <= key["time"] <= duration or key["time"] in times or key["easing"] not in EASINGS:
                raise ValueError("Invalid object key identity or timing")
            key_ids.add(key["id"])
            times.add(key["time"])
            validate_pose(key["values"])
    if total > 256:
        raise ValueError("Object scene exceeds256 keys")
    return objects


def validate_ribbon(value):
    if not isinstance(value, dict) or set(value) != set(RIBBON_DEFAULTS) or not isinstance(value["path"], str) or value["path"] not in {"loop", "knot", "wave"}:
        raise ValueError("Invalid ribbon parameters")
    for field, (low, high) in RIBBON_BOUNDS.items():
        number = value[field]
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not low <= number <= high:
            raise ValueError("Invalid ribbon " + field)
        if field in {"lobes", "twists"} and int(number) != number:
            raise ValueError("Ribbon count must be an integer")
    return value


def ribbon_mesh(parameters, local=0):
    p = validate_ribbon(parameters)
    segments, profile_size, closed = 192, 16, p["path"] != "wave"
    phase = math.radians(p["phase"]) + local * p["speed"] * math.pi / 4
    def centre(u):
        a = u * math.pi * 2
        if not closed:
            return ((u - .5) * 5.2, p["wave"] * .8 * math.sin(p["lobes"] * a + phase), p["wave"] * .7 * math.cos(a + phase * .65))
        angle = a * (2 if p["path"] == "knot" else 1)
        radius = 1.4 + p["wave"] * .4 * math.cos(p["lobes"] * a + phase)
        return radius * math.cos(angle), radius * math.sin(angle), p["wave"] * .9 * math.sin(p["lobes"] * a + phase)
    def cross(a, b):
        return a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]
    def unit(a):
        length = math.sqrt(sum(v*v for v in a))
        return tuple(v/length for v in a)
    profile, radius = [], min(p["thickness"]*.42, p["width"]*.08)
    for corner in range(4):
        cx = (1, -1, -1, 1)[corner] * (p["width"]/2-radius)
        cy = (1, 1, -1, -1)[corner] * (p["thickness"]/2-radius)
        for j in range(4):
            a = corner * math.pi/2 + j * math.pi/6
            profile.append((cx+radius*math.cos(a), cy+radius*math.sin(a)))
    vertices, faces = [], []
    rings = segments if closed else segments+1
    for i in range(rings):
        u = i/segments
        c, before, after = centre(u), centre(u-.0001), centre(u+.0001)
        tangent = unit(tuple(a-b for a,b in zip(after,before)))
        normal = unit(cross(tangent,(0,0,1)))
        binormal = cross(tangent,normal)
        angle = math.pi*2*p["twists"]*u + .3*math.sin(p["lobes"]*u*math.pi*2+phase) + phase*.2
        first = tuple(v*math.cos(angle)+binormal[k]*math.sin(angle) for k,v in enumerate(normal))
        second = tuple(-v*math.sin(angle)+binormal[k]*math.cos(angle) for k,v in enumerate(normal))
        vertices.extend(tuple(v+first[k]*x+second[k]*y for k,v in enumerate(c)) for x,y in profile)
    for i in range(segments):
        next_ring = (i+1)%rings
        for j in range(profile_size):
            faces.append((i*profile_size+j,i*profile_size+(j+1)%profile_size,next_ring*profile_size+(j+1)%profile_size,next_ring*profile_size+j))
    if not closed:
        faces.extend((tuple(reversed(range(profile_size))),tuple(segments*profile_size+j for j in range(profile_size))))
    return vertices, faces


def object_pose(item, local):
    frames = list(item.get("keyframes", []))
    if not any(key["time"] == 0 for key in frames):
        frames.append({"time": 0, "values": {field: item[field] for field in FIELDS}, "easing": "linear"})
    frames.sort(key=lambda frame: frame["time"])
    index = next((i for i, key in enumerate(frames) if key["time"] >= local), -1)
    if index < 0:
        return dict(frames[-1]["values"])
    right, left = frames[index], frames[max(0, index - 1)]
    mix = 1 if right["time"] == left["time"] else max(0, min(1, (local - left["time"]) / (right["time"] - left["time"])))
    if right["easing"] == "ease_out":
        mix = 1 - (1 - mix) ** 3
    elif right["easing"] == "spring":
        mix = max(0, min(1, 1 - math.cos(mix * math.pi * 2.5) * math.exp(-mix * 5)))
    elif right["easing"] == "ease_in_out":
        mix = mix * mix * (3 - 2 * mix)
    return {field: left["values"][field] + (right["values"][field] - left["values"][field]) * mix for field in FIELDS}


def build_objects(scene, root, material_factory):
    import bpy
    result = []
    for item in scene["objects"]:
        shape = item["shape"]
        if shape == "ribbon":
            vertices, faces = ribbon_mesh(item["ribbon"])
            mesh = bpy.data.meshes.new(item["name"])
            mesh.from_pydata(vertices, [], faces); mesh.update()
            uv = mesh.uv_layers.new(name="Ribbon coordinates")
            for index, polygon in enumerate(mesh.polygons[:192*16]):
                ring, profile = divmod(index, 16)
                coords = ((ring/192, profile/16), (ring/192, (profile+1)/16), ((ring+1)/192, (profile+1)/16), ((ring+1)/192, profile/16))
                for loop_index, point in zip(polygon.loop_indices, coords):
                    uv.data[loop_index].uv = point
            obj = bpy.data.objects.new(item["name"], mesh)
            bpy.context.collection.objects.link(obj)
        elif shape == "plane":
            bpy.ops.mesh.primitive_plane_add(size=10)
        elif shape == "sphere":
            bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1)
        elif shape == "torus":
            bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=.22, major_segments=48, minor_segments=12)
        elif shape == "cylinder":
            # Blender's cylinder is along Z; the preview uses the same axis.
            bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1, depth=2)
        elif shape == "icosphere":
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
        else:
            bpy.ops.mesh.primitive_cube_add(size=2)
        if shape != "ribbon":
            obj = bpy.context.object
        obj.name, obj.parent = item["name"], root
        obj.data.materials.append(material_factory(item["name"], {**scene, "primaryColor": item["color"], "glowColor": item["color"], "material": item.get("material", scene["material"]), "surfaceRoughness": item.get("roughness")}))
        if shape in {"box", "cylinder"} and item.get("bevel", 0) > 0:
            bevel = obj.modifiers.new("Authored edge bevel", "BEVEL")
            bevel.width, bevel.segments = item["bevel"], 3
            normal = obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
            normal.keep_sharp = True
        if shape not in {"box", "icosphere"}:
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
        result.append((obj, item))
    animate_objects(result, 0)
    return result


def animate_objects(objects, local):
    for obj, item in objects:
        if item["shape"] == "ribbon" and item["ribbon"]["speed"] != 0:
            vertices, _ = ribbon_mesh(item["ribbon"], local)
            obj.data.vertices.foreach_set("co", [value for vertex in vertices for value in vertex])
            obj.data.update()
        pose = object_pose(item, local)
        obj.location = tuple(pose[field] for field in ("x", "y", "z"))
        obj.scale = tuple(pose[field] for field in ("scaleX", "scaleY", "scaleZ"))
        obj.rotation_euler = tuple(math.radians(pose[field]) for field in ("rotationX", "rotationY", "rotationZ"))
