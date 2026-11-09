import copy
import gzip
import hashlib
import io
import json
import tarfile

import numpy as np
from PIL import Image
import pytest

from studio_source_background import FILES, digest, evidence_files, load_evidence, recover_foreground
from studio_model_subject_vfx_job import extract_masks


@pytest.mark.parametrize('shape',[(1,1),(1,19),(17,1),(11,23)])
@pytest.mark.parametrize('strength',[.1,.7,1.])
def test_fused_colour_iterations_match_original_reflected_float64_solve(shape,strength):
    import cv2
    from studio_source_background import _colour_step_kernel
    rng=np.random.default_rng(41)
    initial=rng.random((*shape,3))
    rhs=rng.uniform(-.8,1.8,initial.shape)
    base=rng.uniform(.001,51,shape)
    original=initial.copy();fused=initial.copy()
    kernel=np.array([[0,1,0],[1,0,1],[0,1,0]],np.float64)
    step=_colour_step_kernel()
    for _ in range(20):
        near=cv2.filter2D(original,-1,kernel,borderType=cv2.BORDER_REFLECT)
        following=np.clip((rhs+strength*near)/(base+4*strength)[...,None],0,1)
        expected_change=float(np.max(np.abs(following-original)))
        fused,change=step(fused,rhs,base,strength)
        np.testing.assert_array_equal(fused,following)
        assert change==expected_change
        original=following


def fixture(directory):
    directory.mkdir(exist_ok=True)
    Image.new('RGB',(64,64),(20,70,190)).save(directory/FILES['rgb'])
    Image.new('L',(64,64),255).save(directory/FILES['support'])
    return {'source_sha256':'a'*64,'shot_cuts':[],'width':64,'height':64,
        'observed_background':{'version':1,'source_sha256':'a'*64,
            'method':'separated_unselected_source_rgb_v1',
            'files':{key:{'file':name,'sha256':digest(directory/name)}for key,name in FILES.items()}}}


def test_evidence_is_optional_and_source_bound(tmp_path):
    assert load_evidence(tmp_path,{}) is None
    data=fixture(tmp_path)
    rgb,observed=load_evidence(tmp_path,data)
    assert rgb.shape==(64,64,3) and observed.all()
    for mutation in ['source','cut','path','method']:
        bad=copy.deepcopy(data)
        if mutation=='source':bad['source_sha256']='b'*64
        if mutation=='cut':bad['shot_cuts']=[24]
        if mutation=='path':bad['observed_background']['files']['rgb']['file']='../photo.png'
        if mutation=='method':bad['observed_background']['method']='generated_plate'
        with pytest.raises(ValueError):load_evidence(tmp_path,bad)


@pytest.mark.parametrize('change',['bytes','mode','geometry','nonbinary'])
def test_corrupt_evidence_rejected(tmp_path,change):
    data=fixture(tmp_path)
    if change=='bytes':(tmp_path/FILES['rgb']).write_bytes(b'changed')
    elif change=='mode':Image.new('L',(64,64),100).save(tmp_path/FILES['rgb'])
    elif change=='geometry':Image.new('RGB',(32,64)).save(tmp_path/FILES['rgb'])
    else:Image.new('L',(64,64),128).save(tmp_path/FILES['support'])
    if change!='bytes':
        for row in data['observed_background']['files'].values():row['sha256']=digest(tmp_path/row['file'])
    with pytest.raises(ValueError):load_evidence(tmp_path,data)


def test_recovery_removes_original_room_without_changing_alpha_or_unobserved_pixels():
    alpha=np.zeros((64,64),np.uint8);alpha[:,8:32]=255;alpha[:,32:48]=100
    fg=np.broadcast_to([170,100,60],(64,64,3)).astype(np.uint8)
    bg=np.broadcast_to([20,70,190],fg.shape).astype(np.uint8)
    a=alpha[...,None]/255
    rgb=np.rint(fg*a+bg*(1-a)).astype(np.uint8)
    support=np.ones(alpha.shape,bool);support[40:]=False
    fallback=rgb.astype(float)/255;before=alpha.copy()
    result=recover_foreground(rgb,alpha,bg,support,fallback)
    assert np.max(abs(result[10:35,32:47]-fg[10:35,32:47]/255))<.04
    assert np.array_equal(result[~support],fallback[~support])
    assert np.array_equal(result[alpha==255],fallback[alpha==255])
    assert np.array_equal(alpha,before)
    assert np.array_equal(result[alpha==0],fallback[alpha==0])


def archive(directory,target,manifest,extra=None):
    (directory/'manifest.json').write_text(json.dumps(manifest))
    Image.new('L',(64,64),255).save(directory/'matte_0000.png')
    with tarfile.open(target,'w:gz') as output:
        for path in directory.iterdir():output.add(path,arcname=path.name)
        if extra:
            row=tarfile.TarInfo(extra);row.size=3;output.addfile(row,io.BytesIO(b'bad'))


def test_verified_evidence_survives_actual_mask_bundle_round_trip(tmp_path):
    source=tmp_path/'source';data=fixture(source);bundle=tmp_path/'bundle.gz'
    archive(source,bundle,data)
    target=tmp_path/'restored'
    extract_masks(bundle,target,{'frameCount':1,'manifestSha256':digest(source/'manifest.json')})
    restored=json.loads((target/'manifest.json').read_text())
    rgb,support=load_evidence(target,restored)
    assert rgb[0,0].tolist()==[20,70,190] and support.all()


@pytest.mark.parametrize('bad',['unexpected.png','../outside.png','observed_background.png'])
def test_extra_traversal_and_duplicate_bundle_members_rejected(tmp_path,bad):
    source=tmp_path/'source';data=fixture(source);bundle=tmp_path/'bundle.gz'
    archive(source,bundle,data,bad)
    with pytest.raises(ValueError):
        extract_masks(bundle,tmp_path/'restored',{'frameCount':1,'manifestSha256':digest(source/'manifest.json')})


def test_unverified_manifest_cannot_expand_bundle_allowlist(tmp_path):
    source=tmp_path/'source';data=fixture(source);bundle=tmp_path/'bundle.gz'
    archive(source,bundle,data)
    with pytest.raises(ValueError,match='manifest changed'):
        extract_masks(bundle,tmp_path/'restored',{'frameCount':1,'manifestSha256':'b'*64})
