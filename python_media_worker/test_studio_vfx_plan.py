"""Real pixel, identity and clock checks for cached subject-aware compositing."""
import copy
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image, ImageDraw
import pytest

from python_media_worker.studio_subject_matte import CachedSubjectMatte, canonical_hash, sha256, mask_geometry
from python_media_worker.studio_vfx_plan import VfxFrameRenderer, render_vfx, validate_plan


@pytest.fixture
def source_cache(tmp_path):
    source = tmp_path / "source.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=navy:s=128x72:r=2:d=1",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx264", "-c:a", "aac", "-t", "1", str(source)], check=True)
    directory = tmp_path / "matte"
    directory.mkdir()
    alpha = np.zeros((72, 128), dtype=np.uint8)
    alpha[:, 64:] = 255
    prompt = {"version": 1, "source_sha256": sha256(source), "points": [[90, 35]], "labels": [1]}
    rows = []
    for index in range(2):
        name = f"matte_{index:04d}.png"
        Image.fromarray(alpha).save(directory / name)
        rows.append({"index": index, "time": index / 2, "file": name, "sha256": sha256(directory / name), **mask_geometry(alpha)})
    manifest = {"version": 1, "kind": "source_bound_subject_matte", "source_sha256": sha256(source), "width": 128, "height": 72,
                "fps": 2, "fps_fraction": "2/1", "frame_count": 2, "prompt": prompt, "prompt_sha256": canonical_hash(prompt),
                "frames": rows, "shot_cuts": [], "quality_warnings": [], "quality": "Internal pixel regression fixture"}
    (directory / "manifest.json").write_text(json.dumps(manifest))
    return source, directory, CachedSubjectMatte(directory, source)


def plan(cache):
    return {"version": 1, "source_sha256": cache.manifest["source_sha256"], "matte_sha256": cache.artifact_sha256,
            "effects": [{"id": "text", "type": "text_behind", "start": 0, "end": 1, "text": "STORIES", "x": 50, "y": 50, "font_size": 30, "color": "#ffffff"}]}


def test_source_detail_repair_restores_an_occluded_object_after_exclusions(source_cache):
    _,_,cache=source_cache
    hold={"id":"rig","type":"foreground_holdout","start":0,"end":1,
        "corners":[[.6,.1],[.8,.1],[.8,.9],[.6,.9]],"feather":0,
        "source_patches":[{"source":[[.7,.2],[.75,.2],[.75,.4],[.7,.4]],
            "target":[[.15,.2],[.2,.2],[.2,.8],[.15,.8]],"feather":.4,"end_blend":3}]}
    command=plan(cache);command['effects']=[hold]
    renderer=VfxFrameRenderer(command,cache)
    pixels=np.full((72,128,3),[190,40,20],np.uint8);pixels[8:60,88:100]=[30,40,50]
    # Final alpha has no target pixels: the plant and its old matte are gone.
    alpha=Image.new('L',(128,72))
    clean,result=renderer._prepare_foreground(Image.fromarray(pixels),alpha,[hold],128,72)
    values=np.asarray(result);rgb=np.asarray(clean)
    assert values[32,22]==255 and np.all(rgb[32,22]==[30,40,50])
    assert values[32,10]==0 and values[32,35]==0, 'No repair or old-room pixels outside the authored support'
    assert 0<values[15,22]<255, 'Blend at the photographed end instead of leaving a hard seam'
    changed=pixels.copy();changed[8:60,88:100]=[45,55,65]
    second,_=renderer._prepare_foreground(Image.fromarray(changed),alpha,[hold],128,72)
    assert np.all(np.asarray(second)[32,22]==[45,55,65]), 'Sample this frame, never reuse the first photographed pose'


def test_source_detail_repair_uses_authored_equipment_saturation_and_does_not_move_people(source_cache):
    _,_,cache=source_cache
    hold={"id":"rig","type":"foreground_holdout","start":0,"end":1,
        "corners":[[.6,.1],[.8,.1],[.8,.9],[.6,.9]],"feather":0,"saturation":0,
        "source_patches":[{"source":[[.7,.2],[.75,.2],[.75,.4],[.7,.4]],
            "target":[[.15,.2],[.2,.2],[.22,.8],[.17,.8]],"feather":.5,"end_blend":0}]}
    command=plan(cache);command['effects']=[hold]
    renderer=VfxFrameRenderer(command,cache);frame=Image.new('RGB',(128,72),(20,40,90))
    initial=Image.fromarray(cache.frame(0));clean,result=renderer._prepare_foreground(frame,initial,[hold],128,72)
    assert len(set(np.asarray(clean)[32,23]))==1, 'Do not reintroduce removed coloured lighting on the neutral rig'
    assert np.array_equal(np.asarray(result)[:,110:],np.asarray(initial)[:,110:])
    assert np.array_equal(np.asarray(clean)[:,110:],np.asarray(frame)[:,110:])


def test_source_detail_repair_clears_damaged_edges_but_retains_an_accessory_crossing_in_front(source_cache):
    _,_,cache=source_cache
    patch={'source':[[.7,.2],[.75,.2],[.75,.4],[.7,.4]],'target':[[.15,.2],[.2,.2],[.2,.8],[.15,.8]],
        'feather':0,'end_blend':0,'clear_box':[.1,.2,.3,.8],
        'protect_paths':[[[.1,.45],[.3,.45],[.3,.55],[.1,.55]]]}
    hold={'id':'repair','type':'foreground_holdout','start':0,'end':1,
        'corners':[[.6,.1],[.8,.1],[.8,.9],[.6,.9]],'feather':0,'source_patches':[patch]}
    command=plan(cache);command['effects']=[hold];renderer=VfxFrameRenderer(command,cache)
    alpha=np.full((72,128),255,np.uint8);pixels=np.full((72,128,3),[150,70,20],np.uint8)
    pixels[8:60,88:100]=[20,25,30];pixels[32:40,12:40]=[220,200,170]
    clean,result=renderer._prepare_foreground(Image.fromarray(pixels),Image.fromarray(alpha),[hold],128,72)
    assert np.asarray(result)[20,15]==0, 'Remove the old jagged object outside the copied rod'
    assert np.asarray(result)[20,22]==255 and np.all(np.asarray(clean)[20,22]==[20,25,30])
    assert np.asarray(result)[36,22]==255 and np.all(np.asarray(clean)[36,22]==[220,200,170]), 'Retain the photographed accessory in front'


def test_source_detail_repair_keeps_subpixel_authored_edges_without_resolving_a_fine_matte(source_cache):
    _,_,cache=source_cache
    hold={'id':'repair','type':'foreground_holdout','start':0,'end':1,
        'corners':[[35.25/128,.2],[41.25/128,.2],[41.25/128,.7],[35.25/128,.7]],'feather':0,
        'source_patches':[{'source':[[.7,.2],[.75,.2],[.75,.4],[.7,.4]],
            'target':[[.1,.8],[.2,.8],[.2,.95],[.1,.95]],'feather':0,'end_blend':0}]}
    command=plan(cache);command['effects']=[hold];renderer=VfxFrameRenderer(command,cache)
    _,alpha=renderer._prepare_foreground(Image.new('RGB',(128,72),(25,35,45)),Image.new('L',(128,72)),[hold],128,72)
    values=np.asarray(alpha)
    assert 0<values[30,35]<255, 'Fine-alpha workflows at edge radius zero still need subpixel manual cleanup geometry'
    assert values[30,36]==255 and values[30,34]==0


def test_source_repair_sample_outside_original_holdout_receives_its_equipment_colour_treatment(source_cache):
    _,_,cache=source_cache
    hold={'id':'repair','type':'foreground_holdout','start':0,'end':1,'saturation':0,
        'corners':[[.6,.1],[.8,.1],[.8,.9],[.6,.9]],'feather':0,
        'source_patches':[{'source':[[.3,.2],[.35,.2],[.35,.4],[.3,.4]],
            'target':[[.1,.2],[.2,.2],[.2,.8],[.1,.8]],'feather':0,'end_blend':0}]}
    command=plan(cache);command['effects']=[hold];renderer=VfxFrameRenderer(command,cache)
    clean,_=renderer._prepare_foreground(Image.new('RGB',(128,72),(20,40,90)),Image.new('L',(128,72)),[hold],128,72)
    assert len(set(np.asarray(clean)[32,20]))==1, 'Newly restored real metal outside the original selection must stay neutral'


@pytest.mark.parametrize('bad',[
    [],[{'source':[[0,0],[1,0],[1,1],[0,1]],'target':[[0,0],[1,1],[1,0],[0,1]],'feather':0,'end_blend':0}],
    [{'source':[[0,0],[1,0],[1,1],[0,1]],'target':[[0,0],[.2,0],[.2,.2],[0,.2]],'feather':0,'end_blend':33}],
    [{'source':[[0,0],[1.1,0],[1,1],[0,1]],'target':[[0,0],[.2,0],[.2,.2],[0,.2]],'feather':0,'end_blend':0}],
])
def test_source_detail_repair_rejects_unbounded_or_degenerate_commands(source_cache,bad):
    _,_,cache=source_cache;command=plan(cache)
    command['effects']=[{'id':'bad','type':'foreground_holdout','start':0,'end':1,
        'corners':[[.6,.1],[.8,.1],[.8,.9],[.6,.9]],'feather':0,'source_patches':bad}]
    with pytest.raises(ValueError):validate_plan(command,cache)


@pytest.mark.parametrize('rod_width',[8,14])
def test_wide_person_edge_refinement_keeps_textured_equipment_opaque(source_cache,rod_width):
    _,_,cache=source_cache
    edge={"id":"wide-edge","type":"foreground_refine","start":0,"end":1,
        "edge_radius":8,"decontaminate":0,"choke":0,"feather":0,
        "recover_box":[0,0,0,0],"recover_hue":0,"hue_tolerance":0,"saturation_min":1,
        "detail_box":[0,0,0,0],"dark_max":0,"clear_box":[0,0,0,0],
        "reject_hue":0,"reject_tolerance":0,"reject_saturation":1,"reject_value":1}
    command=plan(cache);command['effects']=[edge]
    alpha=np.zeros((72,128),np.uint8);alpha[4:68,15:15+rod_width]=255
    alpha[:,80:]=255  # Wide person and narrow equipment share one edge control.
    pixels=np.full((72,128,3),190,np.uint8);pixels[alpha>0]=25
    pixels[4:68,18:20]=185  # Real bright metal close to the old room's colour.
    renderer=VfxFrameRenderer(command,cache)
    _,result=renderer._prepare_foreground(Image.fromarray(pixels),Image.fromarray(alpha),[edge],128,72)
    values=np.asarray(result)
    assert np.all(values[20:52,18:20]==255), 'Retain photographed metal highlights inside a narrow support'
    assert np.all(values[20:52,40:60]==0), 'Keep the surrounding background and inter-object gap clear'


def test_local_edge_solve_softens_colour_steps_without_changing_equipment_or_explicit_removal(source_cache):
    _,_,cache=source_cache
    fine={"id":"local-edge","type":"foreground_refine","start":0,"end":1,
        "edge_radius":4,"edge_polygon":[[.42,0],[.7,0],[.7,1],[.42,1]],
        "decontaminate":0,"choke":0,"feather":0,"recover_box":[0,0,0,0],
        "recover_hue":0,"hue_tolerance":0,"saturation_min":1,"detail_box":[0,0,0,0],
        "dark_max":0,"clear_box":[.5,.5,.55,.6],"reject_hue":0,
        "reject_tolerance":0,"reject_saturation":1,"reject_value":1}
    command=plan(cache);command['effects']=[fine]
    pixels=np.full((72,128,3),(210,170,100),np.uint8)
    # A photographed clothing edge moves independently of the coarse mask.
    for boundary in [63,65]:
        values=cache.frame(1).copy();values[8:64,18:21]=173
        pixels[:,boundary:]=(35,45,65)
        pixels[8:64,18:21]=(160,155,150)
        renderer=VfxFrameRenderer(command,cache)
        _,alpha=renderer._prepare_foreground(Image.fromarray(pixels),Image.fromarray(values),[fine],128,72)
        result=np.asarray(alpha)
        assert np.array_equal(result[:,:50],values[:,:50]), 'Unrelated narrow equipment keeps its exact original alpha'
        assert np.all(result[36:43,64:70]==0), 'An explicit source removal stays excluded inside the local solve'
        assert result[15,boundary+3]>250 and result[15,boundary-3]<5
    for polygon in [[],[[0,0],[1,1]],[[0,0],[1.1,0],[1,1]],[[0,0],[.1,.1],[.2,.2]]]:
        bad=copy.deepcopy(command);bad['effects'][0]['edge_polygon']=polygon
        with pytest.raises(ValueError):validate_plan(bad,cache)
    bad=copy.deepcopy(command);bad['effects'][0]['edge_radius']=0
    with pytest.raises(ValueError,match='positive edge radius'):validate_plan(bad,cache)


def test_text_changes_background_while_subject_pixels_remain_exact(source_cache):
    _, _, cache = source_cache
    frame = Image.new("RGB", (128, 72), "navy")
    original = np.array(frame)
    output = np.array(VfxFrameRenderer(plan(cache), cache).render(frame, 1))
    assert np.array_equal(output[:, 64:], original[:, 64:])
    assert np.count_nonzero(output[:, :64] != original[:, :64]) > 100


def test_owned_still_background_replaces_set_without_changing_foreground(source_cache, tmp_path):
    _, _, cache = source_cache
    asset = tmp_path / "set.png"
    Image.new("RGB", (200, 100), (90, 50, 70)).save(asset)
    command = plan(cache)
    command["effects"] = [{"id": "set", "type": "background_replace", "start": 0, "end": 1,
                           "asset_id": "owned-set", "asset_sha256": sha256(asset), "blur": 0, "exposure": 0, "saturation": 1}]
    frame = Image.new("RGB", (128, 72), "navy")
    renderer = VfxFrameRenderer(command, cache, lambda asset_id: asset)
    output = np.array(renderer.render(frame, 1))
    assert np.all(output[:, :64] == [90, 50, 70])
    assert np.array_equal(output[:, 64:], np.array(frame)[:, 64:])
    asset.write_bytes(b"changed image")
    with pytest.raises(ValueError, match="hash"):
        VfxFrameRenderer(command, cache, lambda asset_id: asset)


def test_colour_cleanup_uses_final_alpha_after_protected_object_edits(source_cache, monkeypatch):
    _, _, cache = source_cache
    import pymatting
    observed = []
    def estimate_foreground(pixels, alpha):
        observed.append(alpha.copy())
        return pixels
    monkeypatch.setattr(pymatting, "estimate_foreground_ml", estimate_foreground)
    refine = {"id":"edge-colour", "type":"foreground_refine", "start":0, "end":1,
              "choke":0, "feather":0, "edge_radius":0, "decontaminate":1,
              "recover_box":[0,0,0,0], "recover_hue":0, "hue_tolerance":0, "saturation_min":1,
              "detail_box":[0,0,0,0], "dark_max":0, "clear_box":[0,0,0,0],
              "reject_hue":0, "reject_tolerance":0, "reject_saturation":1, "reject_value":1}
    cleanup = {**refine, "id":"object-cleanup", "decontaminate":0, "after_holdout":True,
               "clear_box":[.1,.2,.2,.8]}
    command = plan(cache)
    command["effects"] = [refine, {"id":"thin-rig", "type":"foreground_holdout", "start":0, "end":1,
        "corners":[[.1,.2],[.3,.2],[.3,.8],[.1,.8]], "feather":.5, "after_refine":True}, cleanup]
    renderer = VfxFrameRenderer(command, cache)
    _, alpha = renderer._prepare_foreground(Image.new("RGB", (128,72), (80,90,110)),
        Image.fromarray(cache.frame(1)), command["effects"], 128,72)
    assert len(observed) == 1
    assert np.array_equal(observed[0], np.asarray(alpha)/255), "Late object edits must condition edge RGB recovery"
    assert np.asarray(alpha)[30,30] == 255, "Retain the protected microphone core"
    assert np.asarray(alpha)[30,16] == 0, "Keep the removed old-background fragment excluded"


def test_restored_soft_object_edges_remove_the_photographed_background_colour(source_cache):
    _, _, cache = source_cache
    edge = {"id":"edge-colour", "type":"foreground_refine", "start":0, "end":1,
            "choke":0, "feather":0, "edge_radius":0, "decontaminate":1,
            "recover_box":[0,0,0,0], "recover_hue":0, "hue_tolerance":0, "saturation_min":1,
            "detail_box":[0,0,0,0], "dark_max":0, "clear_box":[0,0,0,0],
            "reject_hue":0, "reject_tolerance":0, "reject_saturation":1, "reject_value":1}
    rod = {"id":"protected-rig", "type":"foreground_holdout", "start":0, "end":1,
           "corners":[[.12,.2],[.27,.2],[.27,.8],[.12,.8]], "feather":1, "after_refine":True}
    command = plan(cache)
    command["effects"] = [edge, rod]
    renderer = VfxFrameRenderer(command, cache)
    # Known photographed mixture: dark equipment against the old red set.
    _, alpha = renderer._prepare_foreground(Image.new("RGB",(128,72)),
        Image.fromarray(cache.frame(1)), [rod], 128,72)
    a = np.asarray(alpha)/255
    foreground_colour = np.array([25,35,45])
    source = np.rint(a[:,:,None]*foreground_colour + (1-a[:,:,None])*np.array([230,40,30])).astype(np.uint8)
    clean, final_alpha = renderer._prepare_foreground(Image.fromarray(source),
        Image.fromarray(cache.frame(1)), command["effects"], 128,72)
    assert np.array_equal(np.asarray(final_alpha), np.asarray(alpha))
    boundary = (a>.1)&(a<.9)&(np.indices(a.shape)[1]<50)
    contaminated_error = np.abs(source[boundary].astype(float)-foreground_colour).mean()
    recovered_error = np.abs(np.asarray(clean)[boundary].astype(float)-foreground_colour).mean()
    assert recovered_error < contaminated_error*.25


def test_background_swap_reuses_exact_foreground_and_matches_uncached_pixels(source_cache,tmp_path,monkeypatch):
    _,_,cache=source_cache
    first=tmp_path/'first.png';second=tmp_path/'second.png'
    Image.new('RGB',(128,72),(30,80,130)).save(first)
    Image.new('RGB',(128,72),(110,90,40)).save(second)
    command=plan(cache)
    command['effects']=[{'id':'rod','type':'foreground_holdout','start':0,'end':1,
        'corners':[[.1,.2],[.2,.2],[.2,.8],[.1,.8]],'feather':.5},
        {'id':'room','type':'background_replace','start':0,'end':1,'asset_id':'first','asset_sha256':sha256(first),'blur':0,'exposure':0,'saturation':1,'reveal_seconds':1},
        {'id':'fg','type':'foreground_grade','start':0,'end':1,'exposure':-.1,'saturation':.9,'contrast':1.05}]
    monkeypatch.setenv('STUDIO_VFX_FOREGROUND_CACHE_DIR',str(tmp_path/'prepared-foreground'))
    frame=Image.new('RGB',(128,72),(75,60,100))
    renderer=VfxFrameRenderer(command,cache,lambda _:first)
    original=np.array(renderer.render(frame,1))
    assert renderer.foreground_cache.misses==1
    changed=copy.deepcopy(command)
    changed['effects'][1].update(asset_id='second',asset_sha256=sha256(second))
    renderer=VfxFrameRenderer(changed,cache,lambda _:second)
    cached=np.array(renderer.render(frame,1))
    assert renderer.foreground_cache.hits==1
    monkeypatch.delenv('STUDIO_VFX_FOREGROUND_CACHE_DIR')
    fresh=np.array(VfxFrameRenderer(changed,cache,lambda _:second).render(frame,1))
    assert np.array_equal(cached,fresh)
    assert np.array_equal(cached[:,64:],original[:,64:])
    assert not np.array_equal(cached[:,:64],original[:,:64])


def test_background_wipe_reveals_real_set_in_order_and_foreground_grade_is_local(source_cache,tmp_path):
    _,_,cache=source_cache
    plate=tmp_path/'room.png';Image.new('RGB',(128,72),(100,100,100)).save(plate)
    command=plan(cache);command['effects']=[{'id':'set','type':'background_replace','start':0,'end':1,
        'asset_id':'room','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1,'reveal_seconds':1},
        {'id':'foreground','type':'foreground_grade','start':0,'end':1,'exposure':-1,'saturation':1,'contrast':1}]
    frame=Image.new('RGB',(128,72),(40,40,40));renderer=VfxFrameRenderer(command,cache,lambda _:plate)
    initial=np.array(renderer.render(frame,0));middle=np.array(renderer.render(frame,1))
    assert np.array_equal(initial[36,10],[40,40,40])
    assert np.array_equal(middle[36,10],[100,100,100])
    assert 40 < middle[36,55,0] < 100
    assert np.array_equal(initial[36,100],[20,20,20])
    assert np.array_equal(middle[36,100],[20,20,20])
    command['effects'][0]['reveal_seconds']=float('nan')
    with pytest.raises(ValueError):validate_plan(command,cache)


def test_manual_holdout_preserves_thin_real_foreground_without_filling_surrounding_background(source_cache,tmp_path):
    _,_,cache=source_cache
    plate=tmp_path/'room.png';Image.new('RGB',(128,72),'gray').save(plate)
    frame=Image.new('RGB',(128,72),'orange');pixels=np.array(frame);pixels[25:28,10:50]=[25,15,10]
    command=plan(cache);command['effects']=[{'id':'rod','type':'foreground_holdout','start':0,'end':1,
        'corners':[[10/128,25/72],[49/128,25/72],[49/128,27/72],[10/128,27/72]],'feather':0},
        {'id':'set','type':'background_replace','start':0,'end':1,'asset_id':'room','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1}]
    result=np.array(VfxFrameRenderer(command,cache,lambda _:plate).render(Image.fromarray(pixels),1))
    assert np.array_equal(result[26,30],pixels[26,30])
    assert np.array_equal(result[23,30],[128,128,128])
    command['effects'][0]['corners'][1]=[0,0]
    with pytest.raises(ValueError):validate_plan(command,cache)

@pytest.mark.parametrize('preserve', [False, True])
def test_explicit_thin_detail_survives_cleanup_without_restoring_its_surroundings(source_cache,tmp_path,preserve):
    _,directory,cache=source_cache
    immutable=(directory/'matte_0001.png').read_bytes()
    plate=tmp_path/'room.png';Image.new('RGB',(128,72),'gray').save(plate)
    pixels=np.full((72,128,3),[240,60,30],dtype=np.uint8)
    pixels[20:40,20:23]=[145,40,20]  # Real stem tinted by the old display.
    cleanup={'id':'cleanup','type':'foreground_refine','start':0,'end':1,'choke':0,'feather':0,
        'recover_box':[0,0,0,0],'recover_hue':0,'hue_tolerance':0,'saturation_min':1,
        'detail_box':[0,0,.5,1],'dark_max':0,'clear_box':[0,0,.5,1],
        'reject_hue':15,'reject_tolerance':30,'reject_saturation':.5,'reject_value':.4}
    stem={'id':'stem','type':'foreground_holdout','start':0,'end':1,
        'corners':[[20/128,20/72],[22/128,20/72],[22/128,39/72],[20/128,39/72]],
        'feather':0,'after_refine':preserve}
    command=plan(cache);command['effects']=[stem,cleanup,{'id':'set','type':'background_replace','start':0,'end':1,
        'asset_id':'room','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1}]
    output=np.asarray(VfxFrameRenderer(command,cache,lambda _:plate).render(Image.fromarray(pixels),1))
    assert np.array_equal(output[30,21],pixels[30,21] if preserve else [128,128,128])
    assert np.array_equal(output[30,19],[128,128,128])
    assert (directory/'matte_0001.png').read_bytes()==immutable
    command['effects'][0]['after_refine']=1
    with pytest.raises(ValueError):validate_plan(command,cache)


def test_graded_kinetic_type_preserves_subject_and_renders_deterministically(source_cache):
    _, _, cache = source_cache
    command = plan(cache)
    command["effects"] = [
        {"id": "grade", "type": "background_grade", "start": 0, "end": 1, "exposure": -1, "saturation": .4, "contrast": 1.1},
        {"id": "title", "type": "kinetic_type", "start": 0, "end": 1, "text": "VOICE", "x": 5, "y": 50,
         "font_size": 24, "color": "#eeeeee", "tracking": 1, "travel": 20, "align": "left"}]
    frame = Image.new("RGB", (128, 72), "navy")
    renderer = VfxFrameRenderer(command, cache)
    first, second = np.array(renderer.render(frame, 1)), np.array(renderer.render(frame, 1))
    assert np.array_equal(first, second)
    assert np.array_equal(first[:, 64:], np.array(frame)[:, 64:])
    assert np.count_nonzero(first[:, :64] != np.array(frame)[:, :64]) > 100


def test_explicit_cleanup_removes_wrongly_protected_background_without_touching_adjacent_stem(source_cache,tmp_path):
    _,directory,cache=source_cache
    original=(directory/'matte_0001.png').read_bytes()
    plate=tmp_path/'room.png';Image.new('RGB',(128,72),'gray').save(plate)
    frame=Image.new('RGB',(128,72),'orange')
    cleanup={'id':'cleanup','type':'foreground_refine','start':0,'end':1,'choke':0,'feather':0,
        'recover_box':[0,0,0,0],'recover_hue':0,'hue_tolerance':0,'saturation_min':1,
        'detail_box':[0,0,0,0],'dark_max':0,'clear_box':[0,0,0,0],
        'reject_hue':0,'reject_tolerance':0,'reject_saturation':1,'reject_value':1,
        'clear_paths':[[[.2,.2],[.3,.2],[.3,.8],[.2,.8]]],'after_holdout':True}
    command=plan(cache);command['effects']=[cleanup,
        {'id':'protected','type':'foreground_holdout','start':0,'end':1,'feather':0,'after_refine':True,
         'corners':[[.1,.1],[.4,.1],[.4,.9],[.1,.9]]},
        {'id':'room','type':'background_replace','start':0,'end':1,'asset_id':'room','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1}]
    output=np.asarray(VfxFrameRenderer(command,cache,lambda _:plate).render(frame,1))
    assert np.array_equal(output[30,32],[128,128,128])
    assert np.array_equal(output[30,20],np.asarray(frame)[30,20])
    assert np.array_equal(output[30,100],np.asarray(frame)[30,100])
    assert (directory/'matte_0001.png').read_bytes()==original
    for invalid in [1,'true']:
        cleanup['after_holdout']=invalid
        with pytest.raises(ValueError):validate_plan(command,cache)
    cleanup['after_holdout']=True;cleanup['choke']=1
    with pytest.raises(ValueError):validate_plan(command,cache)


@pytest.mark.parametrize('opacity',[12,52,128,255])
@pytest.mark.parametrize('feather',[.4,1])
def test_feathered_background_exclusion_fully_removes_isolated_alpha(source_cache,opacity,feather):
    _,directory,cache=source_cache
    original=(directory/'matte_0001.png').read_bytes()
    alpha=cache.frame(1).copy();alpha[30,32]=opacity;alpha[30,20]=255
    cleanup={'id':'cleanup','type':'foreground_refine','start':0,'end':1,'choke':0,'feather':feather,
        'recover_box':[0,0,0,0],'recover_hue':0,'hue_tolerance':0,'saturation_min':1,
        'detail_box':[0,0,0,0],'dark_max':0,'clear_box':[0,0,0,0],
        'reject_hue':0,'reject_tolerance':0,'reject_saturation':1,'reject_value':1,
        'clear_paths':[[[.2,.2],[.3,.2],[.3,.8],[.2,.8]]],'after_holdout':True}
    command=plan(cache);command['effects']=[cleanup]
    renderer=VfxFrameRenderer(command,cache)
    _,cleaned=renderer._prepare_foreground(Image.new('RGB',(128,72),'orange'),Image.fromarray(alpha),command['effects'],128,72)
    result=np.asarray(cleaned)
    assert result[30,32]==0,'A feathered explicit exclusion must not leave a soft background ghost'
    assert result[30,20]==255
    assert np.array_equal(result[:,70:],alpha[:,70:])
    assert (directory/'matte_0001.png').read_bytes()==original


def test_post_protection_colour_recovery_keeps_selected_cloth_without_adding_background(source_cache,tmp_path):
    _,directory,cache=source_cache
    original=(directory/'matte_0001.png').read_bytes()
    plate=tmp_path/'room.png';Image.new('RGB',(128,72),'gray').save(plate)
    frame=Image.new('RGB',(128,72),'orange');draw=ImageDraw.Draw(frame)
    draw.rectangle((30,20,35,39),fill=(90,100,130))
    draw.rectangle((10,20,15,39),fill=(90,100,130))
    cleanup={'id':'cleanup','type':'foreground_refine','start':0,'end':1,'choke':0,'feather':.4,
        'recover_box':[0,0,.5,1],'recover_hue':270,'hue_tolerance':60,'saturation_min':0,
        'detail_box':[0,0,0,0],'dark_max':0,'clear_box':[0,0,.5,1],
        'reject_hue':0,'reject_tolerance':0,'reject_saturation':1,'reject_value':1,'after_holdout':True}
    command=plan(cache);command['effects']=[cleanup,
        {'id':'protected','type':'foreground_holdout','start':0,'end':1,'feather':0,'after_refine':True,
         'corners':[[28/128,10/72],[50/128,10/72],[50/128,60/72],[28/128,60/72]]},
        {'id':'room','type':'background_replace','start':0,'end':1,'asset_id':'room','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1}]
    output=np.asarray(VfxFrameRenderer(command,cache,lambda _:plate).render(frame,1))
    assert np.array_equal(output[30,32],[90,100,130])
    assert np.array_equal(output[30,12],[128,128,128])
    assert np.array_equal(output[30,44],[128,128,128])
    assert np.array_equal(output[30,100],np.asarray(frame)[30,100])
    assert (directory/'matte_0001.png').read_bytes()==original


def test_background_connected_rejection_removes_an_edge_without_cutting_an_interior_clothing_patch(source_cache,tmp_path):
    _,directory,cache=source_cache
    original=(directory/'matte_0001.png').read_bytes()
    plate=tmp_path/'room.png';Image.new('RGB',(128,72),'gray').save(plate)
    frame=Image.new('RGB',(128,72),(150,155,160));draw=ImageDraw.Draw(frame)
    draw.rectangle((0,0,29,71),fill='orange')
    draw.rectangle((40,25,45,35),fill='orange')
    cleanup={'id':'cleanup','type':'foreground_refine','start':0,'end':1,'choke':0,'feather':0,
        'recover_box':[0,0,0,0],'recover_hue':0,'hue_tolerance':0,'saturation_min':1,
        'detail_box':[0,0,.5,1],'dark_max':0,'clear_box':[0,0,0,0],
        'reject_hue':30,'reject_tolerance':35,'reject_saturation':.15,'reject_value':.1,
        'after_holdout':True,'reject_connected':True}
    command=plan(cache);command['effects']=[cleanup,
        {'id':'protected','type':'foreground_holdout','start':0,'end':1,'feather':0,'after_refine':True,
         'corners':[[25/128,10/72],[55/128,10/72],[55/128,60/72],[25/128,60/72]]},
        {'id':'room','type':'background_replace','start':0,'end':1,'asset_id':'room','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1}]
    output=np.asarray(VfxFrameRenderer(command,cache,lambda _:plate).render(frame,1))
    assert np.array_equal(output[30,27],[128,128,128])
    assert np.array_equal(output[30,42],np.asarray(frame)[30,42])
    assert np.array_equal(output[30,100],np.asarray(frame)[30,100])
    cleanup['reject_connected']=False
    legacy=np.asarray(VfxFrameRenderer(command,cache,lambda _:plate).render(frame,1))
    assert np.array_equal(legacy[30,42],[128,128,128])
    cleanup['reject_connected']=1
    with pytest.raises(ValueError):validate_plan(command,cache)
    assert (directory/'matte_0001.png').read_bytes()==original


def test_fine_alpha_recovers_a_soft_edge_and_removes_old_background_colour(source_cache,tmp_path):
    _,directory,cache=source_cache
    immutable=(directory/'matte_0001.png').read_bytes()
    image=np.empty((72,128,3),dtype=np.float64)
    source_alpha=np.clip((np.arange(128)-61)/6,0,1)[None,:,None]
    fg=np.array([20,70,130]);bg=np.array([220,130,30])
    image[:]=fg*source_alpha+bg*(1-source_alpha)
    plate=tmp_path/'plate.png';Image.new('RGB',(128,72),(128,128,128)).save(plate)
    effect={'id':'edge','type':'foreground_refine','start':0,'end':1,'choke':0,'feather':0,
        'recover_box':[0,0,0,0],'recover_hue':0,'hue_tolerance':0,'saturation_min':1,
        'detail_box':[0,0,0,0],'dark_max':0,'clear_box':[0,0,0,0],
        'reject_hue':0,'reject_tolerance':0,'reject_saturation':1,'reject_value':1,
        'edge_radius':4,'decontaminate':1}
    command=plan(cache);command['effects']=[effect,{'id':'plate','type':'background_replace','start':0,'end':1,
        'asset_id':'plate','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1}]
    result=np.asarray(VfxFrameRenderer(command,cache,lambda _:plate).render(Image.fromarray(np.rint(image).astype(np.uint8)),1))
    expected=fg*source_alpha+128*(1-source_alpha)
    assert np.max(np.abs(result[36,62:67].astype(float)-expected[0,62:67]))<5
    assert np.array_equal(result[:,72:],np.rint(image).astype(np.uint8)[:,72:])
    assert np.all(result[:,:56]==128)
    assert (directory/'matte_0001.png').read_bytes()==immutable
    # The actual photograph must remain byte-identical before the set wipe;
    # edge colour removal must not alter the untouched opening.
    command['effects'][1].update(start=.5,reveal_seconds=.5)
    opening=np.asarray(VfxFrameRenderer(command,cache,lambda _:plate).render(Image.fromarray(np.rint(image).astype(np.uint8)),1))
    assert np.array_equal(opening,np.rint(image).astype(np.uint8))
    for change in [{'edge_radius':2.5},{'edge_radius':9},{'decontaminate':float('nan')}]:
        invalid=copy.deepcopy(command);invalid['effects'][0].update(change)
        with pytest.raises(ValueError):validate_plan(invalid,cache)


def test_edge_colour_cleanup_preserves_saved_fractional_alpha(source_cache, tmp_path):
    source, directory, cache = source_cache
    values = np.broadcast_to(np.rint(np.clip((np.arange(128)-59)/10, 0, 1)*255).astype(np.uint8), (72, 128)).copy()
    Image.fromarray(values).save(directory/'matte_0001.png')
    manifest = copy.deepcopy(cache.manifest)
    manifest['frames'][1].update(sha256=sha256(directory/'matte_0001.png'), **mask_geometry(values))
    (directory/'manifest.json').write_text(json.dumps(manifest))
    cache = CachedSubjectMatte(directory, source)
    immutable = (directory/'matte_0001.png').read_bytes()
    opacity = values[..., None]/255
    foreground, old_background = np.array([20, 70, 130]), np.array([220, 130, 30])
    photographed = np.rint(foreground*opacity+old_background*(1-opacity)).astype(np.uint8)
    plate = tmp_path/'plate.png'
    Image.new('RGB', (128, 72), (128, 128, 128)).save(plate)
    effect = {'id':'edge', 'type':'foreground_refine', 'start':0, 'end':1, 'choke':0, 'feather':0,
        'recover_box':[0,0,0,0], 'recover_hue':0, 'hue_tolerance':0, 'saturation_min':1,
        'detail_box':[0,0,0,0], 'dark_max':0, 'clear_box':[0,0,0,0],
        'reject_hue':0, 'reject_tolerance':0, 'reject_saturation':1, 'reject_value':1,
        'edge_radius':0, 'decontaminate':1}
    command = plan(cache)
    command['effects'] = [effect, {'id':'plate', 'type':'background_replace', 'start':0, 'end':1,
        'asset_id':'plate', 'asset_sha256':sha256(plate), 'blur':0, 'exposure':0, 'saturation':1}]
    output = np.asarray(VfxFrameRenderer(command, cache, lambda _:plate).render(Image.fromarray(photographed), 1))
    expected = foreground*opacity+128*(1-opacity)
    assert np.max(np.abs(output[36, 60:69].astype(float)-expected[36, 60:69])) < 5
    assert len(np.unique(output[36, 60:69, 0])) == 9
    assert np.array_equal(output[:, 70:], photographed[:, 70:])
    assert (directory/'matte_0001.png').read_bytes() == immutable


@pytest.mark.parametrize("feather", [0, .5])
def test_authored_matte_recovers_real_details_and_rejects_old_screen(source_cache, tmp_path, feather):
    _, directory, cache = source_cache
    before = (directory / "matte_0001.png").read_bytes()
    plate = tmp_path / "set.png"
    Image.new("RGB", (128, 72), "gray").save(plate)
    frame = Image.new("RGB", (128, 72), "orange")
    # The fixture mask omits the left half. Recover only a real blue chair and
    # dark boom there; reject orange pixels erroneously included on the right.
    pixels = np.array(frame)
    pixels[40:60, 12:30] = [20, 70, 130]
    pixels[20:24, 40:90] = [15, 15, 15]
    frame = Image.fromarray(pixels)
    effect = {"id":"refine", "type":"foreground_refine", "start":0, "end":1,
              "choke":0,"feather":feather,"recover_box":[0,.5,.5,1],"recover_hue":210,
              "hue_tolerance":35,"saturation_min":.2,"detail_box":[.25,0,1,.5],
              "dark_max":.24,"clear_box":[0,0,0,0],"reject_hue":30,
              "reject_tolerance":30,"reject_saturation":.7,"reject_value":.6}
    command = plan(cache)
    command["effects"] = [effect,{"id":"set","type":"background_replace","start":0,"end":1,
        "asset_id":"set","asset_sha256":sha256(plate),"blur":0,"exposure":0,"saturation":1}]
    result = np.array(VfxFrameRenderer(command,cache,lambda _:plate).render(frame,1))
    assert np.array_equal(result[50,20],pixels[50,20])
    # A four-pixel boom lies entirely in the feather band; it must retain
    # its dark source colour, with at most two levels of edge blending.
    assert np.max(np.abs(result[21,50].astype(int)-pixels[21,50])) <= (2 if feather else 0)
    assert np.array_equal(result[10,90],[128,128,128])
    assert np.array_equal(result[60,90],pixels[60,90])  # outside authored regions
    assert (directory / "matte_0001.png").read_bytes() == before
    for change in [{"recover_box":[.8,0,.2,1]},{"detail_box":[0,0,2,1]},{"choke":.5}]:
        invalid=copy.deepcopy(command);invalid["effects"][0].update(change)
        with pytest.raises(ValueError):validate_plan(invalid,cache)


def test_preview_and_final_reuse_identical_pixels_clock_and_audio(source_cache, tmp_path):
    source, matte, cache = source_cache
    first = render_vfx(source, matte, plan(cache), tmp_path / "preview.mp4", encoder="cpu")
    second = render_vfx(source, matte, plan(cache), tmp_path / "final.mp4", encoder="cpu")
    assert first["pixel_sha256"] == second["pixel_sha256"]
    assert first["matte_sha256"] == second["matte_sha256"]
    assert first["frames"] == second["frames"] == 2
    assert first["encoder"] == second["encoder"] == "libx264"
    assert any(stream["codec_type"] == "audio" for stream in first["probe"]["streams"])


def test_changed_source_and_changed_mask_are_rejected(source_cache, tmp_path):
    source, matte, cache = source_cache
    other = tmp_path / "other.mp4"
    other.write_bytes(source.read_bytes() + b"different-source")
    with pytest.raises(ValueError, match="different source"):
        CachedSubjectMatte(matte, other)
    Image.new("L", (128, 72), 0).save(matte / "matte_0001.png")
    with pytest.raises(ValueError, match="hash"):
        cache.frame(1)


def test_incomplete_clock_and_path_traversal_are_rejected(source_cache):
    source, matte, cache = source_cache
    changed = copy.deepcopy(cache.manifest)
    changed["frames"][0]["file"] = "../matte_0000.png"
    (matte / "manifest.json").write_text(json.dumps(changed))
    with pytest.raises(ValueError, match="path"):
        CachedSubjectMatte(matte, source)
    changed = copy.deepcopy(cache.manifest)
    changed["frames"][1]["time"] = .4
    (matte / "manifest.json").write_text(json.dumps(changed))
    with pytest.raises(ValueError, match="timestamp"):
        CachedSubjectMatte(matte, source)


@pytest.mark.parametrize("change", [
    {"type": "run_user_code"}, {"font_size": float("nan")}, {"end": 3},
    {"shell": "not allowed"}, {"text": "bad\ncommand"},
])
def test_unbounded_or_unknown_commands_are_rejected(source_cache, change):
    _, _, cache = source_cache
    command = plan(cache)
    command["effects"][0].update(change)
    with pytest.raises(ValueError):
        validate_plan(command, cache)


def test_screen_assets_require_an_approved_resolver(source_cache):
    _, _, cache = source_cache
    command = plan(cache)
    command["effects"] = [{"id": "screen", "type": "screen_replace", "start": 0, "end": 1, "asset_id": "owned-asset",
                           "asset_sha256": "0" * 64, "corners": [[1, 1], [60, 1], [60, 60], [1, 60]]}]
    with pytest.raises(ValueError, match="approved asset resolver"):
        VfxFrameRenderer(command, cache)


def test_reviewed_moving_background_replaces_only_background_pixels(source_cache, tmp_path):
    _, _, cache = source_cache
    asset = tmp_path / "background.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=purple:s=128x72:r=2:d=1", "-c:v", "libx264", str(asset)], check=True)
    command = plan(cache)
    command["effects"] = [{"id": "stage", "type": "background_replace", "start": 0, "end": 1, "asset_id": "reviewed-stage",
                           "asset_sha256": sha256(asset), "blur": 2, "exposure": -.5, "saturation": .7}]
    renderer = VfxFrameRenderer(command, cache, lambda asset_id: asset if asset_id == "reviewed-stage" else None)
    original = Image.new("RGB", (128, 72), "navy")
    first = np.array(renderer.render(original, 1))
    assert np.array_equal(first[:, 64:], np.array(original)[:, 64:])
    assert np.count_nonzero(first[:, :64] != np.array(original)[:, :64]) > 100
    assert np.array_equal(first, np.array(renderer.render(original, 1)))
    asset.write_bytes(asset.read_bytes() + b"changed")
    with pytest.raises(ValueError, match="hash"):
        VfxFrameRenderer(command, cache, lambda _asset_id: asset)


def test_shaped_colour_recovery_excludes_dark_display_graphics_outside_real_plant(source_cache,tmp_path):
    _,_,cache=source_cache
    plate=tmp_path/'room.png';Image.new('RGB',(128,72),'gray').save(plate)
    pixels=np.full((72,128,3),[245,80,25],dtype=np.uint8)
    pixels[16:50,20:24]=[55,75,35]  # The real thin plant.
    pixels[16:22,42:55]=[35,25,30]  # Dark printed screen artwork.
    refine={'id':'shape','type':'foreground_refine','start':0,'end':1,'choke':0,'feather':0,
        'recover_box':[0,0,0,0],'recover_hue':60,'hue_tolerance':30,'saturation_min':.2,
        'clear_box':[0,0,.5,1],'detail_box':[0,0,.5,1],'dark_max':.5,
        'detail_polygon':[[.12,.1],[.22,.1],[.22,.8],[.12,.8]],
        'reject_hue':0,'reject_tolerance':0,'reject_saturation':1,'reject_value':1}
    command=plan(cache);command['effects']=[refine,{'id':'set','type':'background_replace','start':0,'end':1,
        'asset_id':'room','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1}]
    result=np.array(VfxFrameRenderer(command,cache,lambda _:plate).render(Image.fromarray(pixels),1))
    assert np.array_equal(result[30,22],pixels[30,22])
    assert np.array_equal(result[18,45],[128,128,128])
    assert np.array_equal(result[30,30],[128,128,128])
    refine['detail_polygon']=[[0,0]]
    with pytest.raises(ValueError,match='3–64'):validate_plan(command,cache)


def test_grouped_rigid_paths_restore_arms_and_stems_after_keying_without_filling_gaps(source_cache,tmp_path):
    _,directory,cache=source_cache;original=(directory/'matte_0001.png').read_bytes()
    plate=tmp_path/'room.png';Image.new('RGB',(128,72),'gray').save(plate)
    frame=Image.new('RGB',(128,72),'orange')
    hold={'id':'equipment','type':'foreground_holdout','start':0,'end':1,'after_refine':True,'feather':0,
        'corners':[[.8,.8],[.9,.8],[.9,.9],[.8,.9]],
        'paths':[[[.1,.1],[.4,.1],[.4,.13],[.1,.13]],[[.2,.3],[.22,.3],[.22,.7],[.2,.7]]]}
    command=plan(cache);command['effects']=[hold,{'id':'set','type':'background_replace','start':0,'end':1,
        'asset_id':'room','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1}]
    result=np.array(VfxFrameRenderer(command,cache,lambda _:plate).render(frame,1))
    assert np.array_equal(result[8,30],[255,165,0])
    assert np.array_equal(result[30,27],[255,165,0])
    assert np.array_equal(result[16,30],[128,128,128])
    assert (directory/'matte_0001.png').read_bytes()==original
    hold['paths']=[[[0,0],[.1,.1],[.2,.2]]]
    with pytest.raises(ValueError,match='area'):validate_plan(command,cache)


def test_removal_paths_cut_old_set_fragments_without_erasing_neighboring_foreground(source_cache,tmp_path):
    _,directory,cache=source_cache;original=(directory/'matte_0001.png').read_bytes()
    plate=tmp_path/'room.png';Image.new('RGB',(128,72),'gray').save(plate)
    refine={'id':'garbage','type':'foreground_refine','start':0,'end':1,'choke':0,'feather':0,
        'recover_box':[0,0,0,0],'recover_hue':60,'hue_tolerance':0,'saturation_min':1,
        'clear_box':[0,0,0,0],'detail_box':[0,0,0,0],'dark_max':0,
        'clear_paths':[[[.6,.1],[.85,.1],[.6,.6]],[[.8,.7],[.95,.7],[.95,.9],[.8,.9]]],
        'reject_hue':0,'reject_tolerance':0,'reject_saturation':1,'reject_value':1}
    command=plan(cache);command['effects']=[refine,{'id':'set','type':'background_replace','start':0,'end':1,
        'asset_id':'room','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1}]
    result=np.array(VfxFrameRenderer(command,cache,lambda _:plate).render(Image.new('RGB',(128,72),'orange'),1))
    assert np.array_equal(result[15,82],[128,128,128])
    assert np.array_equal(result[55,112],[128,128,128])
    assert np.array_equal(result[15,120],[255,165,0])
    assert np.array_equal(result[50,82],[255,165,0])
    assert (directory/'matte_0001.png').read_bytes()==original
    refine['clear_paths']=[[[.6,.1],[.7,.2],[.8,.3]]]
    with pytest.raises(ValueError,match='area'):validate_plan(command,cache)


def test_post_matting_key_removes_screen_colour_and_preserves_protected_thin_detail(source_cache,tmp_path):
    _,_,cache=source_cache
    plate=tmp_path/'room.png';Image.new('RGB',(128,72),'gray').save(plate)
    frame=Image.new('RGB',(128,72),(30,50,220))
    base={'type':'foreground_refine','start':0,'end':1,'choke':0,'feather':0,
        'recover_box':[0,0,0,0],'recover_hue':0,'hue_tolerance':0,'saturation_min':1,
        'clear_box':[0,0,0,0],'detail_box':[0,0,0,0],'dark_max':0,
        'reject_hue':0,'reject_tolerance':0,'reject_saturation':1,'reject_value':1}
    fine={**base,'id':'fine','edge_radius':2,'decontaminate':1}
    key={**base,'id':'late-key','after_refine':True,'detail_box':[.5,0,1,1],
        'reject_hue':235,'reject_tolerance':20,'reject_saturation':.5,'reject_value':.5}
    hold={'id':'stem','type':'foreground_holdout','start':0,'end':1,'after_refine':True,'feather':0,
        'corners':[[.7,.2],[.72,.2],[.72,.8],[.7,.8]]}
    command=plan(cache);command['effects']=[fine,key,hold,{'id':'set','type':'background_replace','start':0,'end':1,
        'asset_id':'room','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1}]
    result=np.array(VfxFrameRenderer(command,cache,lambda _:plate).render(frame,1))
    assert np.array_equal(result[30,80],[128,128,128])
    assert np.array_equal(result[30,90],[30,50,220])
    key['edge_radius']=1
    with pytest.raises(ValueError,match='one fine alpha|Post-matting'):validate_plan(command,cache)


def test_blue_spill_is_corrected_only_in_authored_region_preserving_people_and_alpha(source_cache,tmp_path):
    _,_,cache=source_cache
    plate=tmp_path/'room.png';Image.new('RGB',(128,72),'gray').save(plate)
    pixels=np.full((72,128,3),[40,60,180],dtype=np.uint8)
    refine={'id':'spill','type':'foreground_refine','start':0,'end':1,'choke':0,'feather':0,
        'recover_box':[0,0,0,0],'recover_hue':60,'hue_tolerance':30,'saturation_min':.2,
        'clear_box':[0,0,0,0],'detail_box':[.55,0,.8,1],'dark_max':0,
        'blue_spill':1,'reject_hue':0,'reject_tolerance':0,'reject_saturation':1,'reject_value':1}
    command=plan(cache);command['effects']=[refine,{'id':'set','type':'background_replace','start':0,'end':1,
        'asset_id':'room','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1}]
    result=np.array(VfxFrameRenderer(command,cache,lambda _:plate).render(Image.fromarray(pixels),1))
    assert np.array_equal(result[30,80],[40,60,40])
    assert np.array_equal(result[30,120],pixels[30,120])
    assert np.array_equal(result[30,20],[128,128,128])


def test_surface_replacement_preserves_real_room_and_crops_owned_still(source_cache,tmp_path):
    _,_,cache=source_cache
    plate=tmp_path/'room.png';pixels=np.full((100,200,3),[200,90,30],np.uint8);pixels[:,100:]=[20,40,230];Image.fromarray(pixels).save(plate)
    command=plan(cache)
    surface={'id':'display','type':'background_replace','start':0,'end':1,'asset_id':'room','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1,
        'surface_corners':[[.1,.2],[.4,.15],[.4,.7],[.1,.8]],'asset_crop':[0,0,.49,1]}
    command['effects']=[surface]
    original=np.full((72,128,3),[70,90,80],np.uint8)
    output=np.array(VfxFrameRenderer(command,cache,lambda _:plate).render(Image.fromarray(original),1))
    assert np.array_equal(output[35,30],[200,90,30])
    assert np.array_equal(output[35,5],original[35,5])
    assert np.array_equal(output[5,30],original[5,30])
    assert np.array_equal(output[:,64:],original[:,64:])
    del surface['asset_crop']
    with pytest.raises(ValueError,match='crop'):validate_plan(command,cache)


def test_two_surface_replacements_retain_previous_surface_and_original_edges(source_cache,tmp_path):
    _,_,cache=source_cache
    plate=tmp_path/'room.png';Image.new('RGB',(128,72),(180,80,30)).save(plate)
    command=plan(cache)
    base={'type':'background_replace','start':0,'end':1,'asset_id':'room','asset_sha256':sha256(plate),'blur':0,'exposure':0,'saturation':1,'asset_crop':[0,0,1,1]}
    command['effects']=[{**base,'id':'one','surface_corners':[[.05,.1],[.2,.1],[.2,.3],[.05,.3]]},
        {**base,'id':'two','surface_corners':[[.3,.5],[.45,.5],[.45,.8],[.3,.8]]}]
    output=np.array(VfxFrameRenderer(command,cache,lambda _:plate).render(Image.new('RGB',(128,72),'navy'),1))
    assert np.array_equal(output[15,15],[180,80,30])
    assert np.array_equal(output[45,45],[180,80,30])
    assert np.array_equal(output[30,30],[0,0,128])


@pytest.mark.parametrize("after_refine", [False, True])
def test_refined_authored_paths_do_not_restore_rough_old_room_edges(source_cache, after_refine):
    _, _, cache = source_cache
    holdout={"id":"mic-support", "type":"foreground_holdout", "start":0, "end":1,
             "corners":[[.1,.1],[.2,.1],[.2,.8],[.1,.8]],
             "paths":[[[.25,.2],[.35,.2],[.35,.8],[.25,.8]]],
             "feather":.5,"after_refine":after_refine,"saturation":0}
    cache.manifest["refinement"]={"holdoutGroups":[{key:holdout[key] for key in
        ("id","start","end","corners","paths","feather")} ]}
    command=plan(cache);command["effects"]=[holdout]
    renderer=VfxFrameRenderer(command,cache)
    alpha=Image.fromarray(cache.frame(1))
    _, result=renderer._prepare_foreground(Image.new("RGB",(128,72),(60,80,100)),alpha,[holdout],128,72)
    assert np.array_equal(np.asarray(result),np.asarray(alpha)), "Already refined paths must not inflate alpha again"
    changed={**holdout,"paths":[[[.3,.2],[.4,.2],[.4,.8],[.3,.8]]]}
    _, edited=renderer._prepare_foreground(Image.new("RGB",(128,72)),alpha,[changed],128,72)
    assert np.asarray(edited)[30,43]>200, "A subsequent authored path change still applies"


def test_foreground_cache_binds_refined_holdout_provenance(source_cache, tmp_path, monkeypatch):
    _,_,cache=source_cache
    monkeypatch.setenv("STUDIO_VFX_FOREGROUND_CACHE_DIR",str(tmp_path/"foreground"))
    holdout={"id":"rig", "type":"foreground_holdout", "start":0, "end":1,
        "corners":[[.1,.2],[.3,.2],[.3,.8],[.1,.8]], "feather":0,"after_refine":True}
    command=plan(cache);command["effects"]=[holdout]
    frame=Image.new("RGB",(128,72),(60,80,100));alpha=Image.fromarray(cache.frame(1))
    first=VfxFrameRenderer(command,cache)
    _,old=first.foreground_cache.prepare(frame,alpha,[holdout],lambda:first._prepare_foreground(frame,alpha,[holdout],128,72))
    assert np.asarray(old)[30,20]==255
    cache.manifest["refinement"]={"holdoutGroups":[{k:holdout.get(k,[] if k=="paths" else 0) for k in ["id","start","end","corners","paths","feather"]}]}
    refined=VfxFrameRenderer(command,cache)
    _,soft=refined.foreground_cache.prepare(frame,alpha,[holdout],lambda:refined._prepare_foreground(frame,alpha,[holdout],128,72))
    assert np.asarray(soft)[30,20]==0, "A cache from the unrefined provenance cannot reinsert the old rigid outline"
    assert refined.foreground_cache.hits==0


def test_refined_thin_support_survives_colour_cleanup_without_restoring_rough_boundary(source_cache):
    _,_,cache=source_cache
    holdout={"id":"mic-support","type":"foreground_holdout","start":0,"end":1,
        "corners":[[.1,.1],[.2,.1],[.2,.8],[.1,.8]],"feather":0,"after_refine":True}
    cache.manifest["refinement"]={"holdoutGroups":[{k:holdout.get(k,[] if k=="paths" else 0) for k in
        ("id","start","end","corners","paths","feather")}]}
    cleanup={"id":"colour","type":"foreground_refine","start":0,"end":1,"choke":0,"feather":0,
        "clear_box":[.1,.1,.3,.8],"recover_box":[0,0,0,0],"recover_hue":0,"hue_tolerance":0,
        "saturation_min":1,"detail_box":[0,0,0,0],"dark_max":0,"reject_hue":0,
        "reject_tolerance":0,"reject_saturation":1,"reject_value":1}
    command=plan(cache);command["effects"]=[cleanup,holdout]
    renderer=VfxFrameRenderer(command,cache)
    values=np.zeros((72,128),np.uint8);values[30,20]=96;values[30,32]=96
    frame=Image.new("RGB",(128,72),(60,80,100))
    _,result=renderer._prepare_foreground(frame,Image.fromarray(values),[cleanup,holdout],128,72)
    assert np.asarray(result)[30,20]==96
    assert np.asarray(result)[30,21]==0, "No opaque polygon boundary may be reintroduced"
    assert np.asarray(result)[30,32]==0, "Cleanup outside the selected support still applies"
    final_cleanup={**cleanup,"id":"final-exclusion","after_holdout":True}
    _,final=renderer._prepare_foreground(frame,Image.fromarray(values),[cleanup,holdout,final_cleanup],128,72)
    assert np.asarray(final)[30,20]==0, "Explicit final background exclusions retain priority"


@pytest.mark.parametrize("after_refine", [False, True])
@pytest.mark.parametrize("decontaminate", [False, True])
def test_kept_object_colour_applies_once_in_both_cleanup_positions(source_cache, monkeypatch, after_refine, decontaminate):
    from PIL import ImageEnhance
    import pymatting
    monkeypatch.setattr(pymatting,"estimate_foreground_ml",lambda pixels,alpha:pixels)
    _,_,cache=source_cache
    holdout={"id":"rig-colour","type":"foreground_holdout","start":0,"end":1,
        "corners":[[.65,.2],[.75,.2],[.75,.8],[.65,.8]],"feather":0,
        "after_refine":after_refine,"saturation":.5}
    fine={"id":"fine","type":"foreground_refine","start":0,"end":1,"edge_radius":0,
        "decontaminate":1,"choke":0,"feather":0,"clear_box":[0,0,0,0],
        "recover_box":[0,0,0,0],"recover_hue":0,"hue_tolerance":0,"saturation_min":1,
        "detail_box":[0,0,0,0],"dark_max":0,"reject_hue":0,"reject_tolerance":0,
        "reject_saturation":1,"reject_value":1}
    effects=[holdout,*([fine]if decontaminate else [])]
    command=plan(cache);command["effects"]=effects;renderer=VfxFrameRenderer(command,cache)
    frame=Image.new("RGB",(128,72),(40,60,190));alpha=Image.fromarray(cache.frame(1))
    foreground,result=renderer._prepare_foreground(frame,alpha,effects,128,72)
    assert np.array_equal(np.asarray(result),np.asarray(alpha))
    assert foreground.getpixel((90,30))==ImageEnhance.Color(frame).enhance(.5).getpixel((90,30))
    assert foreground.getpixel((120,30))==frame.getpixel((120,30))


def test_final_alpha_refines_late_equipment_and_never_restores_excluded_room(source_cache):
    _,_,cache=source_cache
    fine={"id":"final-edge","type":"foreground_refine","start":0,"end":1,
        "edge_radius":3,"decontaminate":1,"choke":0,"feather":0,
        "recover_box":[0,0,0,0],"recover_hue":0,"hue_tolerance":0,"saturation_min":1,
        "detail_box":[0,0,0,0],"dark_max":0,"clear_box":[0,0,0,0],
        "reject_hue":0,"reject_tolerance":0,"reject_saturation":1,"reject_value":1}
    rod={"id":"late-rod","type":"foreground_holdout","start":0,"end":1,
        "corners":[[12/128,10/72],[21/128,10/72],[21/128,65/72],[12/128,65/72]],
        "feather":0,"after_refine":True}
    exclusion={**fine,"id":"room-exclusion","edge_radius":0,"decontaminate":0,
        "after_holdout":True,"after_refine":True,"clear_box":[12/128,40/72,22/128,45/72]}
    effects=[fine,rod,exclusion];command=plan(cache);command["effects"]=effects
    pixels=np.full((72,128,3),(220,160,130),np.uint8)
    pixels[:,64:]=(30,40,50);pixels[10:66,15:19]=(30,40,50)
    _,alpha=VfxFrameRenderer(command,cache)._prepare_foreground(
        Image.fromarray(pixels),Image.fromarray(cache.frame(1)),effects,128,72)
    values=np.asarray(alpha)
    assert values[30,13]<32, "The photographed old-room strip on a late holdout must be matted away"
    assert values[30,16]==255, "Preserve the real microphone core"
    assert np.all(values[40:45,12:22]==0), "Final alpha must never expand into an explicit exclusion"
    assert np.all(values[:,80:]==255), "The person interior must remain opaque"


@pytest.mark.parametrize("rod_width",[1,2,3])
def test_final_edge_solve_preserves_narrow_medial_cores_and_separate_gaps(source_cache,rod_width):
    _,_,cache=source_cache
    fine={"id":"final-edge","type":"foreground_refine","start":0,"end":1,
        "edge_radius":3,"decontaminate":0,"choke":0,"feather":0,
        "recover_box":[0,0,0,0],"recover_hue":0,"hue_tolerance":0,"saturation_min":1,
        "detail_box":[0,0,0,0],"dark_max":0,"clear_box":[0,0,0,0],
        "reject_hue":0,"reject_tolerance":0,"reject_saturation":1,"reject_value":1}
    values=cache.frame(1).copy();values[10:60,15:15+rod_width]=255;values[10:60,25:25+rod_width]=255
    values[30,40:50]=255  # Detached room speck, unlike the continuous cables.
    pixels=np.full((72,128,3),(200,180,150),np.uint8);pixels[values>0]=(25,35,45)
    command=plan(cache);command['effects']=[fine]
    _,alpha=VfxFrameRenderer(command,cache)._prepare_foreground(
        Image.fromarray(pixels),Image.fromarray(values),[fine],128,72)
    result=np.asarray(alpha)
    assert result[30,15+rod_width//2]==255
    assert result[30,25+rod_width//2]==255
    assert result[30,20]==0, "Narrow supports cannot be fused by refinement"
    assert np.all(result[30,40:50]==0), "Remove a detached ten-pixel room fragment"
