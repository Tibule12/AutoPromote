"""Bounded subject-aware VFX from structured commands and a frozen matte cache.

An internal renderer for Director integration. It does not add unsupported
Director operations, authorize assets, download models, or alter CPU pipelines.
Preview and final invoke the same pixel renderer on the same source/matte/plan.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile
import time

import numpy as np
from PIL import Image, ImageColor, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

try:
    from .studio_subject_matte import CachedSubjectMatte, canonical_hash, sha256, video_geometry
except ImportError:
    from studio_subject_matte import CachedSubjectMatte, canonical_hash, sha256, video_geometry

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FIELDS = {
    "text_behind": {"text", "x", "y", "font_size", "color"},
    "kinetic_type": {"text", "x", "y", "font_size", "color", "tracking", "travel", "align"},
    "background_grade": {"exposure", "saturation", "contrast"},
    "foreground_grade": {"exposure", "saturation", "contrast"},
    "foreground_holdout": {"corners", "feather"},
    "background_replace": {"asset_id", "asset_sha256", "blur", "exposure", "saturation"},
    "foreground_refine": {"choke", "feather", "recover_box", "recover_hue", "hue_tolerance", "saturation_min",
                          "detail_box", "dark_max", "clear_box", "reject_hue", "reject_tolerance", "reject_saturation", "reject_value"},
    "tracked_callout": {"text", "offset_x", "offset_y", "font_size", "color", "avoid_subject"},
    "depth": {"amount"},
    "glow": {"color", "strength", "radius"},
    "particles": {"seed", "count", "color", "opacity", "speed"},
    "screen_replace": {"asset_id", "asset_sha256", "corners"},
}


def bounded(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"Expected a finite value in [{low}, {high}]")
    return float(value)


def validate_plan(plan, cache):
    if not isinstance(plan, dict) or set(plan) != {"version", "source_sha256", "matte_sha256", "effects"} or plan["version"] != 1:
        raise ValueError("Expected strict version 1 VFX commands")
    if plan["source_sha256"] != cache.manifest["source_sha256"] or plan["matte_sha256"] != cache.artifact_sha256:
        raise ValueError("VFX plan source or matte identity changed")
    effects = plan["effects"]
    if not isinstance(effects, list) or not 1 <= len(effects) <= 12:
        raise ValueError("Expected 1–12 bounded VFX layers")
    if sum(effect.get("edge_radius",0)>0 or effect.get("decontaminate",0)>0 for effect in effects if effect.get("type")=="foreground_refine")>1:
        raise ValueError("Use one fine alpha layer after the authored matte corrections")
    duration = cache.manifest["frame_count"] / cache.manifest["fps"]
    ids = set()
    for effect in effects:
        base = {"id", "type", "start", "end"}
        kind = effect.get("type")
        if kind == "foreground_holdout" and "saturation" in effect:
            base.add("saturation");bounded(effect["saturation"],0,2)
        if kind == "foreground_holdout" and "after_refine" in effect:
            base.add("after_refine")
            if type(effect["after_refine"]) is not bool:raise ValueError("Holdout cleanup preservation must be boolean")
        if kind == "foreground_holdout" and "source_patches" in effect:
            base.add("source_patches")
            patches=effect["source_patches"]
            if not isinstance(patches,list) or not 1<=len(patches)<=16:
                raise ValueError("Use 1–16 source detail repairs")
            import cv2
            for patch in patches:
                if not isinstance(patch,dict) or not {"source","target","feather","end_blend"}<=set(patch) or set(patch)-{"source","target","feather","end_blend","clear_box","protect_paths","source_color","saturation"}:
                    raise ValueError("Source detail repairs need source and target corners, feather and end blend")
                bounded(patch["feather"],0,3);bounded(patch["end_blend"],0,32)
                if "source_color" in patch and patch["source_color"] not in ("cleaned", "original"):
                    raise ValueError("Source repair colour must be cleaned or original")
                if "saturation" in patch:bounded(patch["saturation"],0,2)
                for key in ("source","target"):
                    points=patch[key]
                    if not isinstance(points,list) or len(points)!=4:
                        raise ValueError("Source detail repair needs four corners")
                    for point in points:
                        if not isinstance(point,list) or len(point)!=2:raise ValueError("Invalid source detail repair corner")
                        for value in point:bounded(value,0,1)
                    polygon=np.array(points,dtype=np.float32)
                    if not cv2.isContourConvex(polygon.reshape(-1,1,2)) or abs(cv2.contourArea(polygon))<.000001:
                        raise ValueError("Source detail repair corners must form a convex nonempty quadrilateral")
                if "clear_box" in patch:
                    box=patch["clear_box"]
                    if not isinstance(box,list) or len(box)!=4:raise ValueError("Invalid source repair cleanup box")
                    for value in box:bounded(value,0,1)
                    if box[0]>=box[2] or box[1]>=box[3]:raise ValueError("Empty source repair cleanup box")
                if "protect_paths" in patch:
                    paths=patch["protect_paths"]
                    if not isinstance(paths,list) or not 1<=len(paths)<=16:raise ValueError("Use 1–16 source repair protection paths")
                    for points in paths:
                        if not isinstance(points,list) or not 3<=len(points)<=64:raise ValueError("Invalid source repair protection path")
                        for point in points:
                            if not isinstance(point,list) or len(point)!=2:raise ValueError("Invalid source repair protection point")
                            for value in point:bounded(value,0,1)
                        area=sum(p[0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*p[1]for i,p in enumerate(points))
                        if abs(area)<.000001:raise ValueError("Empty source repair protection path")
        for field in (["paths", "color_paths"] if kind=="foreground_holdout" else ["clear_paths"] if kind=="foreground_refine" else []):
            if field not in effect:continue
            base.add(field)
            maximum=32
            if not isinstance(effect[field],list) or not 1<=len(effect[field])<=maximum:raise ValueError(f"Expected 1–{maximum} matte paths")
            for points in effect[field]:
                if not isinstance(points,list) or not 3<=len(points)<=64:raise ValueError("Matte path needs 3–64 points")
                for point in points:
                    if not isinstance(point,list) or len(point)!=2:raise ValueError("Invalid matte path point")
                    for value in point:bounded(value,0,1)
                area=sum(p[0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*p[1] for i,p in enumerate(points))
                if abs(area)<.000001:raise ValueError("Matte path must have nonzero area")
        if kind == "background_replace" and "reveal_seconds" in effect:base.add("reveal_seconds")
        if kind == "background_replace":base.update(key for key in ("surface_corners","asset_crop") if key in effect)
        if kind == "foreground_refine":
            base.update(key for key in ("alpha_levels", "alpha_polygon", "edge_radius", "decontaminate", "detail_polygon", "edge_polygon", "blue_spill", "after_refine", "after_holdout", "reject_connected") if key in effect)
        if kind not in FIELDS or set(effect) != base | FIELDS[kind] or not isinstance(effect["id"], str) or not 1 <= len(effect["id"]) <= 64 or effect["id"] in ids:
            raise ValueError("Unsupported effect, duplicate ID or unknown command fields")
        ids.add(effect["id"])
        start, end = bounded(effect["start"], 0, duration), bounded(effect["end"], 0, duration)
        if start >= end:
            raise ValueError("Effect end must follow start")
        if "color" in effect:
            if not isinstance(effect["color"], str) or len(effect["color"]) != 7 or not effect["color"].startswith("#"):
                raise ValueError("Use an explicit hex effect color")
            ImageColor.getrgb(effect["color"])
        if "text" in effect:
            if not isinstance(effect["text"], str) or not 1 <= len(effect["text"]) <= 120 or any(ord(ch) < 32 for ch in effect["text"]):
                raise ValueError("Effect text must be bounded single-line text")
            bounded(effect["font_size"], 12, 320)
        for field in ("x", "y"):
            if field in effect: bounded(effect[field], 0, 100)
        for field in ("offset_x", "offset_y"):
            if field in effect: bounded(effect[field], -500, 500)
        if kind == "tracked_callout" and not isinstance(effect["avoid_subject"], bool):
            raise ValueError("Callout subject avoidance must be boolean")
        if kind == "kinetic_type":
            bounded(effect["tracking"], 0, 40)
            bounded(effect["travel"], 0, 150)
            if effect["align"] not in {"left", "center", "right"}: raise ValueError("Unknown type alignment")
        if kind in {"background_grade", "foreground_grade", "background_replace"}:
            bounded(effect["exposure"], -3, 1)
            bounded(effect["saturation"], 0, 2)
        if kind in {"background_grade", "foreground_grade"}:
            bounded(effect["contrast"], .5, 2)
        if kind == "background_replace":
            if "surface_corners" in effect or "asset_crop" in effect:
                corners=effect.get("surface_corners");crop=effect.get("asset_crop")
                if not isinstance(corners,list) or len(corners)!=4:raise ValueError("Four replacement surface corners required")
                for point in corners:
                    if not isinstance(point,list) or len(point)!=2:raise ValueError("Invalid replacement surface corner")
                    for value in point:bounded(value,0,1)
                import cv2
                polygon=np.array(corners,dtype=np.float32)
                if not cv2.isContourConvex(polygon.reshape(-1,1,2)) or abs(cv2.contourArea(polygon))<.000001:raise ValueError("Replacement surface must be convex and nonempty")
                if not isinstance(crop,list) or len(crop)!=4:raise ValueError("Replacement crop required")
                for value in crop:bounded(value,0,1)
                if crop[0]>=crop[2] or crop[1]>=crop[3]:raise ValueError("Replacement crop must be nonempty")
            if "reveal_seconds" in effect:bounded(effect["reveal_seconds"],0,2)
            bounded(effect["blur"], 0, 60)
            if not isinstance(effect["asset_id"], str) or not 1 <= len(effect["asset_id"]) <= 100: raise ValueError("An approved background asset ID is required")
        if kind == "foreground_refine":
            if "alpha_levels" in effect:
                levels=effect["alpha_levels"]
                if not isinstance(levels,list) or len(levels)!=2:raise ValueError("Use two edge opacity levels")
                for value in levels:bounded(value,0,1)
                if levels[1]<levels[0]+.05:raise ValueError("Edge opacity levels need at least 0.05 between them")
                if effect.get("after_holdout",False) or effect.get("after_refine",False):
                    raise ValueError("Edge opacity belongs before post-matting colour or protected-object cleanup")
            if "reject_connected" in effect and type(effect["reject_connected"]) is not bool:
                raise ValueError("Background-connected colour cleanup must be boolean")
            if "after_holdout" in effect and (type(effect["after_holdout"]) is not bool or effect["after_holdout"] and
                    (effect.get("edge_radius",0)>0 or effect.get("decontaminate",0)>0 or effect["choke"]>0)):
                raise ValueError("Protected-object cleanup cannot use a global choke or another alpha solver")
            if "after_refine" in effect and (type(effect["after_refine"]) is not bool or effect["after_refine"] and (effect.get("edge_radius",0)>0 or effect.get("decontaminate",0)>0)):
                raise ValueError("Post-matting colour cleanup cannot run another alpha solver")
            if "blue_spill" in effect:bounded(effect["blue_spill"],0,1)
            for polygon_key in ("detail_polygon", "edge_polygon", "alpha_polygon"):
                if polygon_key not in effect:continue
                points=effect[polygon_key]
                if not isinstance(points,list) or not 3<=len(points)<=64:raise ValueError("Detail region needs 3–64 points")
                for point in points:
                    if not isinstance(point,list) or len(point)!=2:raise ValueError("Invalid detail region point")
                    for value in point:bounded(value,0,1)
                area=sum(p[0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*p[1] for i,p in enumerate(points))
                if abs(area)<.000001:raise ValueError("Detail region must have nonzero area")
            if "edge_polygon" in effect and not effect.get("edge_radius",0):
                raise ValueError("A local edge region needs a positive edge radius")
            if "edge_radius" in effect:
                bounded(effect["edge_radius"],0,8)
                if type(effect["edge_radius"]) is not int:raise ValueError("Edge radius uses whole source pixels")
            if "decontaminate" in effect:bounded(effect["decontaminate"],0,1)
            for field, limits in {"choke":(0,3),"feather":(0,3),"recover_hue":(0,360),"hue_tolerance":(0,60),
                    "saturation_min":(0,1),"dark_max":(0,1),"reject_hue":(0,360),"reject_tolerance":(0,60),
                    "reject_saturation":(0,1),"reject_value":(0,1)}.items():bounded(effect[field],*limits)
            if type(effect["choke"]) is not int:raise ValueError("Matte choke uses whole source pixels")
            for field in ("recover_box","detail_box","clear_box"):
                box=effect[field]
                if not isinstance(box,list) or len(box)!=4:raise ValueError("Invalid authored matte region")
                for value in box:bounded(value,0,1)
                if box[0]>box[2] or box[1]>box[3]:raise ValueError("Unordered authored matte region")
        if kind == "foreground_holdout":
            bounded(effect["feather"],0,3)
            points=effect["corners"]
            if not isinstance(points,list) or len(points)!=4:raise ValueError("Four holdout corners required")
            for point in points:
                if not isinstance(point,list) or len(point)!=2:raise ValueError("Invalid holdout corner")
                for value in point:bounded(value,0,1)
            import cv2
            polygon=np.array(points,dtype=np.float32)
            if not cv2.isContourConvex(polygon.reshape(-1,1,2)) or abs(cv2.contourArea(polygon))<.000001:
                raise ValueError("Holdout must be a convex nonempty quadrilateral")
        if "asset_sha256" in effect and (not isinstance(effect["asset_sha256"], str) or len(effect["asset_sha256"]) != 64
                or any(ch not in "0123456789abcdef" for ch in effect["asset_sha256"])): raise ValueError("Invalid asset hash")
        for field, limits in {"amount": (0, .06), "strength": (0, .6), "radius": (0, 40), "opacity": (0, .6), "speed": (0, 100)}.items():
            if field in effect: bounded(effect[field], *limits)
        if kind == "particles":
            for field, low, high in (("seed", 0, 2**32 - 1), ("count", 1, 80)):
                bounded(effect[field], low, high)
                if not isinstance(effect[field], int): raise ValueError("Particle seed/count must be integers")
        if kind == "screen_replace":
            if not isinstance(effect["asset_id"], str) or len(effect["asset_id"]) > 100 or not isinstance(effect["corners"], list) or len(effect["corners"]) != 4:
                raise ValueError("Screen replacement requires an approved asset ID and four corners")
            for point in effect["corners"]:
                if not isinstance(point, list) or len(point) != 2: raise ValueError("Invalid screen corner")
                bounded(point[0], 0, cache.manifest["width"] - 1)
                bounded(point[1], 0, cache.manifest["height"] - 1)
    return plan




class VfxFrameRenderer:
    def __init__(self, plan, cache, asset_resolver=None):
        self.plan = validate_plan(plan, cache)
        if any(effect.get("edge_radius",0) or effect.get("decontaminate",0) for effect in plan["effects"] if effect["type"]=="foreground_refine"):
            from importlib.metadata import version
            if version("pymatting")!="1.1.16":raise ValueError("Fine alpha requires the pinned pymatting 1.1.16 runtime")
        self.cache = cache
        try:
            from . import studio_vfx_foreground_cache as foreground_cache_module
        except ImportError:
            import studio_vfx_foreground_cache as foreground_cache_module
        # Renderer/helper code are bound alongside exact source/alpha/commands.
        self.foreground_cache=foreground_cache_module.ForegroundFrameCache(
            sha256(Path(__file__))+sha256(Path(foreground_cache_module.__file__))+
            canonical_hash(cache.manifest.get("refinement",{}).get("holdoutGroups",[])))
        self.assets = {}
        self.fonts = {}
        self.particles = {}
        self.backgrounds = {}
        for effect in plan["effects"]:
            if "font_size" in effect:
                self.fonts[effect["id"]] = ImageFont.truetype(FONT, round(effect["font_size"]))
            if effect["type"] == "particles":
                self.particles[effect["id"]] = np.random.default_rng(effect["seed"]).random((effect["count"], 3))
            if effect["type"] in {"screen_replace", "background_replace"}:
                if asset_resolver is None:
                    raise ValueError("Replacement needs the existing approved asset resolver")
                asset = Path(asset_resolver(effect["asset_id"]))
                if sha256(asset) != effect["asset_sha256"]:
                    raise ValueError("Replacement asset hash differs from the reviewed command")
                if effect["type"] == "background_replace":
                    # A still set plate is an ordinary owned image. Do not
                    # manufacture a video or run generation to import it.
                    try:
                        with Image.open(asset) as image:
                            if image.format not in {"PNG", "JPEG", "WEBP"} or image.width * image.height > 16_000_000:
                                raise ValueError("Unsupported or oversized background image")
                            rgb=image.convert("RGB")
                            if "asset_crop" in effect:
                                x0,y0,x1,y1=effect["asset_crop"]
                                bounds=(round(x0*rgb.width),round(y0*rgb.height),round(x1*rgb.width),round(y1*rgb.height))
                                if bounds[0]>=bounds[2] or bounds[1]>=bounds[3]:raise ValueError("Replacement crop has no image pixels")
                                rgb=rgb.crop(bounds)
                            self.assets[effect["id"]] = ImageOps.fit(rgb,
                                (cache.manifest["width"], cache.manifest["height"]), method=Image.Resampling.LANCZOS)
                        continue
                    except (Image.UnidentifiedImageError, OSError):
                        pass  # Existing moving backgrounds retain their decoder.
                    if "asset_crop" in effect:raise ValueError("Surface replacement requires a still image")
                    import cv2
                    geometry = video_geometry(asset)
                    capture = cv2.VideoCapture(str(asset))
                    if not capture.isOpened(): raise ValueError("Background asset could not decode")
                    self.backgrounds[effect["id"]] = (capture, geometry)
                    continue
                with Image.open(asset) as image:
                    if image.width * image.height > 16_000_000: raise ValueError("Screen asset too large")
                    self.assets[effect["id"]] = image.convert("RGBA")

    def _prepare_foreground(self, frame, alpha, active, width, height):
        edge_radius=max((effect.get("edge_radius",0) for effect in active
                         if effect["type"]=="foreground_refine"),default=0)
        precise_paths=bool(edge_radius) or any(effect.get("source_patches") for effect in active
                                             if effect["type"]=="foreground_holdout")
        exclusion_limit=np.ones((height,width),dtype=np.float32)
        authored_limit=np.ones((height,width),dtype=np.float32)
        local_edges=next((effect["edge_polygon"] for effect in active
                          if effect["type"]=="foreground_refine" and effect.get("edge_polygon")),None)

        def path_mask(polygons):
            # Coverage, rather than an integer stair-step, for authored detail
            # when the user enables edge refinement. Legacy radius-zero edits
            # keep their original geometry and learned alpha.
            scale=4 if precise_paths else 1
            mask=Image.new("L",(width*scale,height*scale))
            draw=ImageDraw.Draw(mask)
            for polygon in polygons:
                draw.polygon([(round(x*width*scale),round(y*height*scale)) for x,y in polygon],fill=255)
            if scale>1:mask=mask.resize((width,height),Image.Resampling.BOX)
            return mask

        def refine_alpha(alpha, effect):
            if effect["choke"]:alpha=alpha.filter(ImageFilter.MinFilter(2*effect["choke"]+1))
            values=np.array(alpha,dtype=np.float32)/255
            hsv=np.array(frame.convert("HSV"),dtype=np.float32)/255
            hue=hsv[:,:,0]*360
            def region(box):
                mask=np.zeros((height,width),dtype=bool)
                x0,y0,x1,y1=box
                mask[round(y0*height):round(y1*height),round(x0*width):round(x1*width)]=True
                return mask
            def hue_distance(target):
                distance=np.abs(hue-target)
                return np.minimum(distance,360-distance)
            cleared=region(effect["clear_box"])
            values[cleared]=0;exclusion_limit[cleared]=0;authored_limit[cleared]=0
            if effect.get("clear_paths"):
                garbage=path_mask(effect["clear_paths"])
                remaining=1-np.asarray(garbage,dtype=np.float32)/255
                values*=remaining
                np.minimum(exclusion_limit,remaining,out=exclusion_limit)
                np.minimum(authored_limit,remaining,out=authored_limit)
            selection=np.ones((height,width),dtype=bool)
            if "detail_polygon" in effect:
                drawn=Image.new("L",(width,height))
                ImageDraw.Draw(drawn).polygon([(round(x*width),round(y*height)) for x,y in effect["detail_polygon"]],fill=255)
                selection=np.asarray(drawn)>0
            recovery=region(effect["recover_box"]) & selection & (hue_distance(effect["recover_hue"])<=effect["hue_tolerance"]) & (hsv[:,:,1]>=effect["saturation_min"])
            values[recovery]=1
            detail=region(effect["detail_box"]) & selection
            dark=np.clip((effect["dark_max"]+.05-hsv[:,:,2])/.1,0,1)
            values[detail]=np.maximum(values[detail],dark[detail])
            spill=detail & (hue_distance(effect["reject_hue"])<=effect["reject_tolerance"]) & (hsv[:,:,1]>=effect["reject_saturation"]) & (hsv[:,:,2]>=effect["reject_value"])
            if effect.get("reject_connected",False):
                # A matching colour inside a shirt/trouser patch must not cut
                # a hole. Only remove matching components that reach an actual
                # alpha exterior, never merely the authored region border.
                import cv2
                _,labels=cv2.connectedComponents(spill.astype(np.uint8),connectivity=8)
                exterior=np.unique(labels[spill & (values<=1/255)])
                exterior=exterior[exterior!=0]
                spill &= np.isin(labels,exterior)
            values[spill]=0
            exclusion_limit[spill]=0
            if effect["feather"]:
                # An edge-aware feather follows source detail rather than
                # smearing opaque old-room pixels into the replacement set.
                import cv2
                guide=cv2.cvtColor(np.asarray(frame),cv2.COLOR_RGB2GRAY).astype(np.float32)/255
                radius=max(1,round(effect["feather"]*6));kernel=(2*radius+1,)*2
                mean=lambda value:cv2.boxFilter(value,-1,kernel,borderType=cv2.BORDER_REFLECT)
                mean_guide,mean_alpha=mean(guide),mean(values)
                covariance=mean(guide*values)-mean_guide*mean_alpha
                variance=mean(guide*guide)-mean_guide*mean_guide
                slope=covariance/(variance+.001)
                refined=mean(slope)*guide+mean(mean_alpha-slope*mean_guide)
                # Refine the boundary only: authored fully interior/exterior
                # pixels keep their original inclusion decision.
                low=cv2.erode(values,np.ones(kernel,np.uint8));high=cv2.dilate(values,np.ones(kernel,np.uint8))
                values=np.where(low>=.999,1,np.where(high<=.001,0,np.minimum(values,refined)))
            return Image.fromarray(np.clip(values*255,0,255).astype(np.uint8))

        # These exact authored paths already conditioned the saved soft matte.
        # Re-adding their solid polygons would bring old-room edge pixels back.
        learned_alpha=np.asarray(alpha).copy()
        baked_groups=self.cache.manifest.get("refinement",{}).get("holdoutGroups",[])
        def baked_holdout(effect):
            return {key:effect.get(key,[] if key=="paths" else 0) for key in
                    ("id","start","end","corners","paths","feather")} in baked_groups

        for effect in active:
            if effect["type"] != "foreground_holdout" or effect.get("after_refine",False):continue
            # Authored source-camera holdouts restore thin real equipment.
            # They are deterministic manual geometry, never inferred tracking.
            # Apply before choke/spill cleanup so old-screen pixels along the
            # authored edge cannot be reintroduced after refinement.
            holdout=path_mask([effect["corners"],*effect.get("paths",[])])
            if effect["feather"]:holdout=holdout.filter(ImageFilter.GaussianBlur(effect["feather"]))
            if not baked_holdout(effect):
                alpha=Image.fromarray(np.maximum(np.asarray(alpha),np.asarray(holdout)))
        for effect in active:
            if effect["type"]=="foreground_refine" and not effect.get("after_refine",False) and not effect.get("after_holdout",False):
                alpha=refine_alpha(alpha,effect)
        foreground = frame
        for effect in active:
            if effect["type"]=="foreground_refine" and effect.get("after_refine",False) and not effect.get("after_holdout",False):
                alpha=refine_alpha(alpha,effect)
        for effect in active:
            if effect["type"] != "foreground_holdout" or not effect.get("after_refine",False):continue
            # Explicit manual protection for real detail thinner than the matte
            # solver's unknown band. Legacy holdouts retain their prior order.
            holdout=path_mask([effect["corners"],*effect.get("paths",[])])
            if effect["feather"]:holdout=holdout.filter(ImageFilter.GaussianBlur(effect["feather"]))
            # Preserve the original learned detail through earlier colour
            # exclusions, while never restoring a solid authored boundary.
            protection=np.minimum(learned_alpha,np.asarray(holdout)) if baked_holdout(effect) else np.asarray(holdout)
            alpha=Image.fromarray(np.maximum(np.asarray(alpha),protection))
            np.maximum(exclusion_limit,protection.astype(np.float32)/255,out=exclusion_limit)
            np.maximum(authored_limit,protection.astype(np.float32)/255,out=authored_limit)
            foreground=Image.composite(frame,foreground,holdout)
        for effect in active:
            if effect["type"]=="foreground_refine" and effect.get("after_holdout",False):
                # Explicit source-frame cleanup may remove a wrongly protected
                # background fragment. It can never add pixels to the matte.
                cleaned=refine_alpha(alpha,{**effect,"feather":0})
                values=np.asarray(alpha,dtype=np.int16)
                removed=Image.fromarray(np.maximum(0,values-np.asarray(cleaned,dtype=np.int16)).astype(np.uint8))
                if effect["feather"]:
                    # Feather may extend an exclusion into its boundary, but
                    # must never reduce the explicitly removed alpha. Blurring
                    # only the subtraction resurrects isolated soft remnants.
                    removed=Image.fromarray(np.maximum(np.asarray(removed),np.asarray(
                        removed.filter(ImageFilter.GaussianBlur(effect["feather"])))))
                alpha=Image.fromarray(np.maximum(0,values-np.asarray(removed,dtype=np.int16)).astype(np.uint8))
        if edge_radius:
            # Solve the *completed* inclusion decision, after late holdouts and
            # exclusions. Solving earlier leaves those edges hard and lets a
            # subsequent holdout bring photographed room colour back.
            import cv2
            from pymatting import estimate_alpha_cf
            from pymatting.preconditioner.ichol import ichol
            original=np.asarray(alpha,dtype=np.float64)/255
            region=np.asarray(path_mask([local_edges]),dtype=np.float64)/255 if local_edges else None
            if local_edges:
                # Fade inward at the selected region boundary so a correction
                # cannot leave a seam where it rejoins the untouched matte.
                inset=cv2.distanceTransform((region>0).astype(np.uint8),cv2.DIST_L2,5)
                region*=np.clip(inset/max(1,2*edge_radius),0,1)
            # An explicit local solve can soften colour-threshold decisions in
            # its unknown band. Hand-authored removal paths/boxes stay binding.
            # Without the option, retain every legacy inclusion decision.
            limits=np.where(region>0,authored_limit,exclusion_limit) if local_edges else exclusion_limit
            opaque=(original>=.5).astype(np.uint8)
            distance=cv2.distanceTransform(opaque,cv2.DIST_L2,5)
            # A person-sized band must not consume a thin support's complete
            # cross-section. Estimate the local half-width within four bands:
            # broad silhouettes retain the requested radius; narrow equipment
            # keeps its textured interior. Keep at least three uncertain pixels
            # to reject old-room colour in approximate manual outlines; thinner
            # cables retain the medial seeds below.
            # Otherwise bright real metal, unlike its dark centre, can be
            # mistaken for the photographed room by the colour alpha solve.
            neighbourhood=(8*edge_radius+1,)*2
            half_width=cv2.dilate(distance,np.ones(neighbourhood,np.uint8))
            local_radius=np.minimum(edge_radius,np.maximum(3,half_width*.4))
            inside=distance>local_radius
            # A uniform erosion loses the complete foreground seed in narrow
            # microphone rods/cables. Keep their medial cores without filling
            # the space between neighbouring rods.
            ridges=(distance>=cv2.dilate(distance,np.ones((3,3),np.uint8))-1e-6)&(distance>=1)
            if local_edges:
                # A one-pixel tip on a stepped broad silhouette is not a thin
                # cable. Seeding it opaque pins the coarse staircase in place.
                ridges &= half_width <= 2*edge_radius
            inside|=ridges
            kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*edge_radius+1,)*2)
            outside=(cv2.dilate(opaque,kernel)==0)|(limits==0)
            inside&=~outside
            if not inside.any() or not outside.any():raise ValueError("Fine alpha needs both foreground and background seeds")
            trimap=np.full(opaque.shape,.5,dtype=np.float64)
            trimap[inside]=1;trimap[outside]=0
            if local_edges:
                # Keep unrelated photographed equipment out of the solve and
                # preserve its original subpixel alpha in the final merge.
                trimap[region==0]=opaque[region==0]
            pixels=np.asarray(frame,dtype=np.float64)/255
            values=estimate_alpha_cf(pixels,trimap,laplacian_kwargs={"epsilon":1e-6},
                preconditioner=lambda matrix:ichol(matrix,shifts=[.01,.1,.5,1,10,100,1000,10000,100000]),
                cg_kwargs={"rtol":1e-6,"maxiter":500})
            if not np.isfinite(values).all():raise ValueError("Fine alpha produced nonfinite values")
            # Explicit room exclusions are authoritative. The model boundary
            # can still recover real subpixel coverage on either side; capping
            # everything to its binary mask clips hair and contaminates RGB.
            values=np.minimum(np.clip(values,0,1),limits)
            values[inside]=1;values[outside]=0
            # Antialias the remaining inward edge, including exclusion cuts.
            # Opaque interiors and narrow cores remain exact. Explicitly
            # excluded background remains zero after the coverage operation.
            coverage=cv2.GaussianBlur(values,(0,0),.65)
            boundary=cv2.erode((values>=.999).astype(np.uint8),np.ones((3,3),np.uint8))==0
            values[boundary&~inside]=np.minimum(values,coverage)[boundary&~inside]
            values=np.minimum(values,limits)
            # Source/mask compression can leave detached single-pixel room
            # fragments. A bounded edge-width area removes those islands,
            # while even a one-pixel-wide continuous cable remains intact.
            count,labels,stats,_=cv2.connectedComponentsWithStats((values>.01).astype(np.uint8),connectivity=8)
            tiny=np.flatnonzero(stats[1:,cv2.CC_STAT_AREA]<=max(16,edge_radius**2))+1
            if len(tiny):values[np.isin(labels,tiny)]=0
            if local_edges:values=original*(1-region)+values*region
            alpha=Image.fromarray(np.rint(values*255).astype(np.uint8))
        # Levels adjust coverage in the saved soft matte, rather than tracing a
        # hard replacement silhouette. They precede foreground colour recovery:
        # recovering colour with an underestimated alpha can brighten the edge.
        # Explicit removal/protection limits and immutable source masks remain
        # binding. Identity levels take no new pixel path.
        for effect in active:
            if effect["type"]!="foreground_refine" or "alpha_levels" not in effect or effect["alpha_levels"]==[0,1]:continue
            low,high=effect["alpha_levels"]
            values=np.asarray(alpha,dtype=np.float64)/255
            adjusted=np.clip((values-low)/(high-low),0,1)
            if "alpha_polygon" in effect:
                import cv2
                selected=np.asarray(path_mask([effect["alpha_polygon"]]),dtype=np.float64)/255
                inset=cv2.distanceTransform((selected>0).astype(np.uint8),cv2.DIST_L2,5)
                selected*=np.clip(inset/8,0,1)
                adjusted=values+(adjusted-values)*selected
            adjusted=np.minimum(adjusted,exclusion_limit)
            alpha=Image.fromarray(np.rint(np.clip(adjusted,0,1)*255).astype(np.uint8))
        for effect in active:
            if effect["type"]!="foreground_refine" or not effect.get("decontaminate",0):continue
            # Every alpha correction, including protected-object restoration
            # and its final exclusions, must precede foreground colour recovery.
            # Otherwise a soft restored edge reintroduces photographed old-room
            # colour after the solver has already finished.
            from pymatting import estimate_foreground_ml
            pixels=np.asarray(frame,dtype=np.float64)/255
            values=np.asarray(alpha,dtype=np.float64)/255
            clean=estimate_foreground_ml(pixels,values)
            strength=effect["decontaminate"]
            clean=pixels*(1-strength)+np.clip(clean,0,1)*strength
            clean[(values<=0)|(values>=1)]=pixels[(values<=0)|(values>=1)]
            foreground=Image.fromarray(np.rint(clean*255).astype(np.uint8))
        # Restore an explicitly authored colour treatment on the recovered
        # foreground, never by mixing contaminated source RGB into soft edges.
        for effect in active:
            if effect["type"] != "foreground_holdout" or effect.get("saturation",1)==1:continue
            # Colour treatment must not enlarge the inclusion matte. Keeping
            # these paths separate also retains the exact saved-mask holdout
            # provenance instead of restoring an opaque old-room polygon.
            holdout=path_mask([effect["corners"],*effect.get("paths",[]),*effect.get("color_paths",[])])
            if effect["feather"]:holdout=holdout.filter(ImageFilter.GaussianBlur(effect["feather"]))
            foreground=Image.composite(ImageEnhance.Color(foreground).enhance(effect["saturation"]),foreground,holdout)
        for effect in active:
            if effect["type"]!="foreground_refine" or not effect.get("blue_spill",0):continue
            # Source-colour spill suppression in an explicitly authored region.
            # No alpha or immutable model mask changes; genuine blue clothing
            # outside the plant/equipment region keeps its original colour.
            selection=Image.new("L",(width,height))
            box=effect["detail_box"]
            ImageDraw.Draw(selection).rectangle((round(box[0]*width),round(box[1]*height),round(box[2]*width)-1,round(box[3]*height)-1),fill=255)
            pixels=np.array(foreground,dtype=np.float64)
            excess=np.maximum(0,pixels[:,:,2]-np.minimum(pixels[:,:,0],pixels[:,:,1]))
            pixels[:,:,2]-=excess*(np.asarray(selection)/255)*effect["blue_spill"]
            foreground=Image.fromarray(np.rint(pixels).astype(np.uint8))
        # Optional manual repair for an opaque object hidden by something the
        # editor removes (for example, leaves crossing a rigid microphone rod).
        # Matting cannot recover those unphotographed pixels. Copy an explicitly
        # chosen clean part of this SAME source frame, after matte cleanup, into
        # the authored target. No model, external asset, implicit tracking or
        # previous-frame output is involved. Legacy edits take no new path.
        repairs=[effect for effect in active if effect["type"]=="foreground_holdout" and effect.get("source_patches")]
        if repairs:
            import cv2
            def protection(patch):
                mask=Image.new("L",(width*4,height*4))
                draw=ImageDraw.Draw(mask)
                for points in patch.get("protect_paths",[]):
                    draw.polygon([(round(x*width*4),round(y*height*4))for x,y in points],fill=255)
                return mask.resize((width,height),Image.Resampling.BOX)
            # Clear all authored cleanup regions before copying any detail, so
            # adjacent repairs do not erase one another. Explicit protection
            # retains a photographed accessory crossing in front of the rod.
            values=np.array(alpha,dtype=np.float64)
            for effect in repairs:
                for patch in effect["source_patches"]:
                    if "clear_box" not in patch:continue
                    l,t,r,b=patch["clear_box"]
                    l,r=round(l*width),round(r*width);t,b=round(t*height),round(b*height)
                    keep=np.asarray(protection(patch),dtype=np.float64)/255
                    values[t:b,l:r]*=keep[t:b,l:r]
            alpha=Image.fromarray(np.rint(values).astype(np.uint8))
            rgba=foreground.convert("RGBA");rgba.putalpha(alpha)
            # Reuse this frame's cleaned source colour, including all authored
            # equipment saturation/spill treatment. Copying raw photographed
            # RGB here would bring the old purple lighting back at the seam.
            for effect in repairs:
                sampled=foreground
                if effect.get("saturation",1)!=1:
                    # Existing holdout pixels already received this treatment.
                    # A newly sampled region outside that holdout needs it too,
                    # without applying the saturation twice inside the holdout.
                    treated=ImageEnhance.Color(foreground).enhance(effect["saturation"])
                    included=path_mask([effect["corners"],*effect.get("paths",[]),*effect.get("color_paths",[])])
                    if effect["feather"]:included=included.filter(ImageFilter.GaussianBlur(effect["feather"]))
                    sampled=Image.composite(foreground,treated,included)
                for patch in effect["source_patches"]:
                    # Opaque equipment can retain photographed texture even if
                    # matte colour estimation replaced its low-alpha pixels.
                    # Explicit opt-in only; legacy patches sample cleaned RGB.
                    patch_sample=frame if patch.get("source_color")=="original" else sampled
                    if patch.get("saturation",1)!=1:
                        patch_sample=ImageEnhance.Color(patch_sample).enhance(patch["saturation"])
                    sample=np.asarray(patch_sample)
                    source=np.float32(patch["source"])*[width,height]
                    target=np.float32(patch["target"])*[width,height]
                    padding=math.ceil(patch["feather"]*4)+2
                    left,top=np.maximum(0,np.floor(target.min(axis=0)).astype(int)-padding)
                    right,bottom=np.minimum([width,height],np.ceil(target.max(axis=0)).astype(int)+padding+1)
                    size=(int(right-left),int(bottom-top));local=np.float32(target-[left,top])
                    matrix=cv2.getPerspectiveTransform(np.float32(source),local)
                    copied=cv2.warpPerspective(sample,matrix,size,flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
                    coverage=Image.new("L",(size[0]*4,size[1]*4))
                    ImageDraw.Draw(coverage).polygon([(round(float(x)*4),round(float(y)*4))for x,y in local],fill=255)
                    coverage=coverage.resize(size,Image.Resampling.BOX)
                    if patch["feather"]:coverage=coverage.filter(ImageFilter.GaussianBlur(patch["feather"]))
                    if patch["end_blend"]:
                        # Blend into the two ends of the target in its own
                        # perspective coordinates, also for angled supports.
                        inverse=cv2.getPerspectiveTransform(local,np.float32([[0,0],[1,0],[1,1],[0,1]]))
                        y,x=np.indices((size[1],size[0]),dtype=np.float64)
                        denominator=inverse[2,0]*x+inverse[2,1]*y+inverse[2,2]
                        v=np.divide(inverse[1,0]*x+inverse[1,1]*y+inverse[1,2],denominator,
                            out=np.full(x.shape,np.inf),where=np.abs(denominator)>1e-12)
                        length=(np.linalg.norm(target[3]-target[0])+np.linalg.norm(target[2]-target[1]))/2
                        ramp=np.minimum(np.clip(v*length/patch["end_blend"],0,1),
                            np.clip((1-v)*length/patch["end_blend"],0,1))
                        coverage=Image.fromarray(np.rint(np.asarray(coverage)*ramp).astype(np.uint8))
                    layer=Image.fromarray(copied).convert("RGBA");layer.putalpha(coverage)
                    bounds=(int(left),int(top),int(right),int(bottom))
                    existing=rgba.crop(bounds)
                    combined=Image.alpha_composite(existing,layer)
                    if patch.get("protect_paths"):
                        # Protection describes which photographed foreground
                        # stays in front, not an opaque hole in the repair.
                        # Composite behind its actual fractional alpha so rods
                        # remain continuous through transparent padding and
                        # correctly pass underneath soft leaf/accessory edges.
                        behind=Image.alpha_composite(layer,existing)
                        combined=Image.composite(behind,combined,protection(patch).crop(bounds))
                    rgba.paste(combined,(int(left),int(top)))
            foreground=rgba.convert("RGB");alpha=rgba.getchannel("A")
        return foreground, alpha

    def render(self, frame, index):
        data = self.cache.manifest
        width, height = data["width"], data["height"]
        if frame.mode != "RGB" or frame.size != (width, height): raise ValueError("Source frame differs from matte canvas")
        alpha = Image.fromarray(self.cache.frame(index))
        time_value = index / data["fps"]
        active = [effect for effect in self.plan["effects"] if effect["start"] <= time_value < effect["end"]]
        foreground_effects=[effect for effect in active if effect["type"] in {"foreground_holdout","foreground_refine"}]
        foreground,alpha=self.foreground_cache.prepare(frame,alpha,foreground_effects,
            lambda:self._prepare_foreground(frame,alpha,active,width,height))
        background = frame.convert("RGBA")
        replacement_coverage=np.zeros((height,width),dtype=np.float64)
        for effect in active:
            if effect["type"] == "background_replace":
                if effect["id"] in self.assets:
                    rgb = self.assets[effect["id"]]
                else:
                    import cv2
                    capture, geometry = self.backgrounds[effect["id"]]
                    asset_index = int((time_value - effect["start"]) * geometry["fps"]) % geometry["frame_count"]
                    capture.set(cv2.CAP_PROP_POS_FRAMES, asset_index)
                    available, pixels = capture.read()
                    if not available: raise ValueError("Reviewed background frame could not decode")
                    rgb = ImageOps.fit(Image.fromarray(cv2.cvtColor(pixels, cv2.COLOR_BGR2RGB)), (width, height), method=Image.Resampling.LANCZOS)
                rgb = ImageEnhance.Color(rgb.filter(ImageFilter.GaussianBlur(effect["blur"]))).enhance(effect["saturation"])
                replacement = ImageEnhance.Brightness(rgb).enhance(2 ** effect["exposure"]).convert("RGBA")
                coverage=np.ones((height,width),dtype=np.float64)
                if "surface_corners" in effect:
                    import cv2
                    corners=np.float32([[x*(width-1),y*(height-1)] for x,y in effect["surface_corners"]])
                    matrix=cv2.getPerspectiveTransform(np.float32([[0,0],[width-1,0],[width-1,height-1],[0,height-1]]),corners)
                    warped=cv2.warpPerspective(np.asarray(replacement.convert("RGB")),matrix,(width,height),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
                    replacement=Image.fromarray(warped).convert("RGBA")
                    coverage=cv2.warpPerspective(np.full((height,width),255,np.uint8),matrix,(width,height),flags=cv2.INTER_LINEAR).astype(np.float64)/255
                previous=background
                reveal=effect.get("reveal_seconds",0)
                if reveal:
                    progress=max(0,min(1,(time_value-effect["start"])/reveal))
                    edge=progress*(width+48)-24
                    wipe=np.broadcast_to(np.clip((edge-np.arange(width))/24,0,1),(height,width))
                    if progress>=1:wipe=np.ones((height,width))
                    coverage=coverage*wipe
                background=Image.composite(replacement,previous,Image.fromarray(np.rint(coverage*255).astype(np.uint8)))
                replacement_coverage=1-(1-replacement_coverage)*(1-coverage)
            if effect["type"] == "background_grade":
                rgb = background.convert("RGB")
                rgb = ImageEnhance.Color(rgb).enhance(effect["saturation"])
                rgb = ImageEnhance.Contrast(rgb).enhance(effect["contrast"])
                background = ImageEnhance.Brightness(rgb).enhance(2 ** effect["exposure"]).convert("RGBA")
            if effect["type"] == "depth":
                # Controlled 2.5D separation of the real set and original person.
                amount = effect["amount"] * math.sin(math.pi * (time_value - effect["start"]) / (effect["end"] - effect["start"]))
                scale = 1 + amount
                enlarged = background.filter(ImageFilter.GaussianBlur(amount * 20)).resize((round(width * scale), round(height * scale)), Image.Resampling.BICUBIC)
                left, top = (enlarged.width - width) // 2, (enlarged.height - height) // 2
                background = enlarged.crop((left, top, left + width, top + height))
            if effect["type"] == "screen_replace":
                import cv2
                asset = np.array(self.assets[effect["id"]])
                source = np.float32([[0, 0], [asset.shape[1] - 1, 0], [asset.shape[1] - 1, asset.shape[0] - 1], [0, asset.shape[0] - 1]])
                corners = np.float32(effect["corners"])
                if not cv2.isContourConvex(corners.reshape(-1, 1, 2)) or abs(cv2.contourArea(corners)) < 100:
                    raise ValueError("Screen corners must form a convex nonempty quadrilateral")
                matrix = cv2.getPerspectiveTransform(source, corners)
                projected = cv2.warpPerspective(asset, matrix, (width, height), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
                background.alpha_composite(Image.fromarray(projected))
        for effect in active:
            layer = Image.new("RGBA", (width, height))
            draw = ImageDraw.Draw(layer)
            color = ImageColor.getrgb(effect.get("color", "#ffffff"))
            if effect["type"] == "kinetic_type":
                local, remaining = time_value - effect["start"], effect["end"] - time_value
                progress = max(0, min(1, local / .65))
                eased = 1 - (1 - progress) ** 3
                opacity = max(0, min(1, local / .3, remaining / .3))
                font = self.fonts[effect["id"]]
                text_width = sum(font.getlength(letter) for letter in effect["text"]) + effect["tracking"] * (len(effect["text"]) - 1)
                x = width * effect["x"] / 100
                x -= text_width * {"left": 0, "center": .5, "right": 1}[effect["align"]]
                y = height * effect["y"] / 100 + (1 - eased) * effect["travel"]
                for letter in effect["text"]:
                    draw.text((x, y), letter, font=font, anchor="lm", fill=(*color, round(255 * opacity)))
                    x += font.getlength(letter) + effect["tracking"]
                if progress < 1: layer = layer.filter(ImageFilter.GaussianBlur((1 - eased) * 8))
                background.alpha_composite(layer)
            elif effect["type"] == "text_behind":
                local = time_value - effect["start"]
                opacity = min(1, local / .25, (effect["end"] - time_value) / .25)
                x, y = width * effect["x"] / 100, height * effect["y"] / 100
                draw.text((x, y), effect["text"], font=self.fonts[effect["id"]], anchor="mm",
                          fill=(*color, round(255 * max(0, opacity))), stroke_width=2, stroke_fill=(10, 8, 25, round(180 * max(0, opacity))))
                background.alpha_composite(layer)
            elif effect["type"] == "glow":
                glow = alpha.filter(ImageFilter.GaussianBlur(effect["radius"]))
                glow = glow.point(lambda value: round(value * effect["strength"]))
                layer = Image.new("RGBA", (width, height), (*color, 0))
                layer.putalpha(glow)
                background.alpha_composite(layer)
            elif effect["type"] == "particles":
                for x, y, size in self.particles[effect["id"]]:
                    px = x * width
                    py = (y * height - (time_value - effect["start"]) * effect["speed"]) % height
                    radius = 1 + size * 2
                    draw.ellipse((px - radius, py - radius, px + radius, py + radius), fill=(*color, round(255 * effect["opacity"])))
                background.alpha_composite(layer)
        # Decontamination belongs to the replacement, including its wipe.
        # Applying cleaned edge RGB over the still-original photograph would
        # darken/change the person even before the room transformation starts.
        if foreground is not frame:
            coverage=replacement_coverage[:,:,None]
            pixels=np.asarray(frame,dtype=np.float64)
            cleaned=np.asarray(foreground,dtype=np.float64)
            foreground=Image.fromarray(np.rint(pixels+(cleaned-pixels)*coverage).astype(np.uint8))
        # Keep original detail; light/colour changes are explicit authored
        # controls and never alter the immutable model matte.
        for effect in active:
            if effect["type"] != "foreground_grade":continue
            foreground=ImageEnhance.Color(foreground).enhance(effect["saturation"])
            if effect["contrast"] != 1:
                # Discarded room pixels must not set the person's contrast
                # pivot. Weight luminance by the final visible coverage,
                # including soft hair and repaired/protected equipment.
                weights=np.asarray(alpha,dtype=np.float64)
                total=weights.sum()
                if total:
                    luminance=np.asarray(foreground.convert("L"),dtype=np.float64)
                    mean=int(np.floor((luminance*weights).sum()/total+.5))
                    foreground=Image.blend(Image.new("RGB",foreground.size,(mean,)*3),
                        foreground,effect["contrast"])
            foreground=ImageEnhance.Brightness(foreground).enhance(2**effect["exposure"])
        subject = foreground.convert("RGBA")
        subject.putalpha(alpha)
        background.alpha_composite(subject)
        for effect in active:
            if effect["type"] != "tracked_callout": continue
            centroid = data["frames"][index]["centroid"]
            if not centroid: raise ValueError("Tracked callout has no source subject anchor")
            font = self.fonts[effect["id"]]
            box = font.getbbox(effect["text"])
            label_width, label_height = box[2] - box[0] + 24, box[3] - box[1] + 20
            x = max(8, min(width - label_width - 8, centroid[0] + effect["offset_x"]))
            y = max(8, min(height - label_height - 8, centroid[1] + effect["offset_y"]))
            if effect["avoid_subject"]:
                mask = np.array(alpha)
                bbox = data["frames"][index]["bbox"]
                candidates = [(x, y), (x, 8), (x, height - label_height - 8)]
                if bbox:
                    candidates += [(bbox[0] - label_width - 12, y), (bbox[2] + 12, y),
                                   (x, bbox[1] - label_height - 12), (x, bbox[3] + 12)]
                candidates = [(max(8, min(width - label_width - 8, px)), max(8, min(height - label_height - 8, py))) for px, py in candidates]
                def placement_cost(point):
                    px, py = map(round, point)
                    occupied = np.count_nonzero(mask[py:py + label_height, px:px + label_width] >= 128)
                    return occupied + .001 * math.hypot(px - x, py - y)
                x, y = min(candidates, key=placement_cost)
            color = ImageColor.getrgb(effect["color"])
            draw = ImageDraw.Draw(background)
            draw.line([tuple(centroid), (x + label_width / 2, y + label_height)], fill=(*color, 255), width=2)
            draw.ellipse((centroid[0] - 3, centroid[1] - 3, centroid[0] + 3, centroid[1] + 3), fill=(*color, 255))
            draw.rounded_rectangle((x, y, x + label_width, y + label_height), radius=7, fill=(16, 13, 30, 235), outline=(*color, 255), width=2)
            draw.text((x + 12, y + 10 - box[1]), effect["text"], font=font, fill=(255, 255, 255, 255))
        return background.convert("RGB")


def select_encoder(mode):
    if mode not in {"auto", "cpu", "nvenc"}: raise ValueError("Unknown encoder mode")
    if mode != "cpu":
        result = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=s=320x180:r=24:d=0.1",
            "-frames:v", "1", "-c:v", "h264_nvenc", "-f", "null", "-"], capture_output=True, timeout=30)
        if result.returncode == 0: return "h264_nvenc"
        if mode == "nvenc": raise RuntimeError("Explicit NVIDIA encoding is unavailable: " + result.stderr.decode()[-800:])
    return "libx264"


def render_vfx(source, matte, plan, output, encoder="auto", asset_resolver=None, audio_source=None, audio_start=0):
    cache = CachedSubjectMatte(matte, source)
    if cache.manifest.get("quality_warnings"):
        raise ValueError("Matte quality warnings need review before composition")
    renderer = VfxFrameRenderer(plan, cache, asset_resolver)
    codec = select_encoder(encoder)
    data = cache.manifest
    count, width, height = data["frame_count"], data["width"], data["height"]
    duration = count / data["fps"]
    target = Path(output)
    if target.exists(): raise ValueError("Refusing to overwrite an existing VFX output")
    target.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="studio-vfx-") as temp:
        intermediate = Path(temp) / "composite.mp4"
        encode_args = ["-preset", "p6", "-rc", "vbr", "-cq", "18", "-b:v", "0"] if codec == "h264_nvenc" else ["-preset", "veryfast", "-crf", "18"]
        decode = ["ffmpeg", "-nostdin", "-v", "error", "-i", str(source), "-map", "0:v:0", "-vsync", "0", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]
        audio_input = ["-ss", str(audio_start), "-i", str(audio_source)] if audio_source else ["-i", str(source)]
        audio_encode = ["-c:a", "aac", "-b:a", "192k"] if audio_source else ["-c:a", "copy"]
        encode = ["ffmpeg", "-nostdin", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", data["fps_fraction"], "-i", "pipe:0",
                  *audio_input, "-map", "0:v:0", "-map", "1:a?", "-c:v", codec, *encode_args, "-pix_fmt", "yuv420p", *audio_encode, "-t", str(duration), "-movflags", "+faststart", str(intermediate)]
        with subprocess.Popen(decode, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as reader, subprocess.Popen(encode, stdin=subprocess.PIPE, stderr=subprocess.PIPE) as writer:
            try:
                for index in range(count):
                    raw = reader.stdout.read(width * height * 3)
                    if len(raw) != width * height * 3: raise RuntimeError(f"VFX source ended at frame {index}")
                    composed = renderer.render(Image.frombytes("RGB", (width, height), raw), index).tobytes()
                    digest.update(composed)
                    writer.stdin.write(composed)
                if reader.stdout.read(1): raise RuntimeError("Unexpected source frames")
                writer.stdin.close()
                if reader.wait(timeout=30): raise RuntimeError(reader.stderr.read().decode()[-1500:])
                if writer.wait(timeout=60): raise RuntimeError(writer.stderr.read().decode()[-1500:])
            except BaseException:
                reader.kill(); writer.kill(); reader.wait(); writer.wait(); raise
        probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-of", "json", str(intermediate)], capture_output=True, text=True, check=True).stdout)
        video = next(stream for stream in probe["streams"] if stream["codec_type"] == "video")
        if int(video["nb_read_frames"]) != count or abs(float(video["duration"]) - duration) > 1 / data["fps"]:
            raise RuntimeError("VFX output lost picture frames")
        target.write_bytes(intermediate.read_bytes())
    receipt = {"version": 1, "status": "RENDERED_PENDING_VISUAL_REVIEW", "source_sha256": data["source_sha256"],
               "matte_sha256": cache.artifact_sha256, "plan_sha256": canonical_hash(plan), "pixel_sha256": digest.hexdigest(),
               "output_sha256": sha256(target), "encoder": codec, "frames": count, "seconds": duration,
               "elapsed_seconds": time.monotonic() - started, "effects": [effect["type"] for effect in plan["effects"]],
               "probe": probe, "subject_quality": data["quality"]}
    if renderer.foreground_cache.root:
        receipt["foreground_cache"]={"hits":renderer.foreground_cache.hits,"misses":renderer.foreground_cache.misses,
            "scope":"Exact source/alpha/foreground-command pixels; background is recomposed normally"}
    alpha_effects = [effect for effect in plan['effects'] if effect['type']=='foreground_refine'
                     and (effect.get('edge_radius',0) or effect.get('decontaminate',0))]
    if alpha_effects:
        from importlib.metadata import version
        estimates_alpha = any(effect.get('edge_radius',0) for effect in alpha_effects)
        receipt["alpha_refinement"]={"implementation":"closed_form_alpha_and_multilevel_foreground" if estimates_alpha else "saved_alpha_and_multilevel_foreground",
            "pymatting_version":version("pymatting"),"device":"cpu","model_inference":False,
            "preserves_saved_fractional_alpha":not estimates_alpha,
            "scope":"Source-guided edge refinement; does not repair missing or wrongly included objects"}
    target.with_suffix(".receipt.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps({"event": "vfx_render_complete", **{key: receipt[key] for key in ("encoder", "frames", "elapsed_seconds", "pixel_sha256")}}), flush=True)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "matte", "plan", "output"): parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--encoder", choices=["auto", "cpu", "nvenc"], default="auto")
    parser.add_argument("--approved-assets", type=Path)
    args = parser.parse_args()
    assets = json.loads(args.approved_assets.read_text()) if args.approved_assets else {}
    # Local CLI maps already-reviewed asset IDs. Cloud ownership still belongs to
    # the caller's existing resolver; this interface accepts no arbitrary URLs.
    resolver = lambda asset_id: assets[asset_id]
    render_vfx(args.source, args.matte, json.loads(args.plan.read_text()), args.output, args.encoder, resolver if assets else None)


if __name__ == "__main__":
    main()
