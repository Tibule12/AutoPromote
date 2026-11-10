"""Bounded private adaptation using annotated alpha, not source pseudo-labels.

RGB backgrounds are procedural; actual podcast frames never supply supervised
targets. Motion exposure and compression are synthetic and explicitly labelled.
The model is not registered or qualified by a lower synthetic validation loss.
"""
import hashlib
import argparse
import json
import time
from pathlib import Path
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt
import torch
from torch.nn import functional as functional
from safetensors.torch import load_file, save_file

from model_workers.common import sha, write_json


SEED = 20261107
RAM = Path('/dev/shm/autopromote-p3m-ground-truth-r291-20261107')
PUBLISHER = Path('/dev/shm/autopromote-p3m-private-r285-20261107')
PRIVATE = Path('reports/background-replacement-20261101/private')


def photo(index):
    rgb = np.array(Image.open(RAM/f'{index:02d}-image.png').convert('RGB'))
    alpha = np.array(Image.open(RAM/f'{index:02d}-mask.png').convert('L'))
    assert alpha.shape == rgb.shape[:2]
    scale = min(1, 768/max(alpha.shape))
    width, height = round(rgb.shape[1]*scale), round(rgb.shape[0]*scale)
    rgb = cv2.resize(rgb, (width, height), interpolation=cv2.INTER_AREA).astype(np.float32)/255
    alpha = cv2.resize(alpha, (width, height), interpolation=cv2.INTER_AREA).astype(np.float32)/255
    opaque = alpha >= .995
    assert opaque.sum() >= 32
    _, nearest = distance_transform_edt(~opaque, return_indices=True)
    # Define synthetic foreground RGB from real opaque photographed colours.
    # No claim is made to recover the dataset's unobserved true edge RGB.
    filled = rgb[nearest[0], nearest[1]]
    foreground = np.where(opaque[..., None], rgb, filled).astype(np.float32)
    border = cv2.dilate((alpha > .01).astype(np.uint8), np.ones((9, 9), np.uint8))-cv2.erode((alpha > .98).astype(np.uint8), np.ones((9, 9), np.uint8))
    yy, xx = np.nonzero(border)
    return foreground, alpha, yy, xx


def linear(rgb):
    return np.where(rgb <= .04045, rgb/12.92, ((rgb+.055)/1.055)**2.4)


def encoded(rgb):
    return np.where(rgb <= .0031308, rgb*12.92, 1.055*np.maximum(rgb, 0)**(1/2.4)-.055)


def procedural_fingers(foreground, rng):
    """Known synthetic geometry with genuine internal gaps, not podcast labels."""
    canvas = np.zeros((256, 256), np.uint8)
    palm = (int(rng.integers(108, 148)), int(rng.integers(155, 182)))
    cv2.ellipse(canvas, palm, (int(rng.integers(40, 55)), 51), 0, 0, 360, 255, -1)
    cv2.rectangle(canvas, (palm[0]-27, palm[1]), (palm[0]+29, 255), 255, -1)
    for n in range(4):
        start = (palm[0]-32+n*21, palm[1]-24)
        tip = (start[0]+int((n-1.5)*rng.uniform(7, 16)),
               int(rng.integers(29, 85)))
        radius = int(rng.integers(7, 12))
        cv2.line(canvas, start, tip, 255, radius*2, cv2.LINE_AA)
        cv2.circle(canvas, tip, radius, 255, -1, cv2.LINE_AA)
    cv2.line(canvas, (palm[0]+25, palm[1]),
             (palm[0]+int(rng.integers(65, 89)), palm[1]-int(rng.integers(22, 58))),
             255, int(rng.integers(19, 27)), cv2.LINE_AA)
    rotation = cv2.getRotationMatrix2D((128, 128), float(rng.uniform(-75, 75)), 1)
    alpha = cv2.warpAffine(canvas, rotation, (256, 256), flags=cv2.INTER_LINEAR).astype(np.float32)/255
    # All colours are procedural, with a photographed texture modulation.
    tones = np.array([[126, 84, 52], [185, 132, 94], [80, 52, 37],
                      [210, 169, 136], [43, 48, 55]], np.float32)/255
    tone = np.clip(tones[int(rng.integers(len(tones)))]+rng.normal(0, .03, 3), .03, .95)
    texture = cv2.GaussianBlur(foreground.mean(axis=2), (0, 0), 2)
    texture = np.clip(texture-np.median(texture), -.15, .15)
    light = np.linspace(float(rng.uniform(.65, .95)), 1.1, 256)[None, :, None]
    picture = np.clip((tone[None, None]+texture[..., None]*.3)*light, 0, 1).astype(np.float32)
    return picture, alpha


def example(row, rng, reference=False, internal_gaps=False):
    foreground, alpha, yy, xx = row
    center = rng.integers(len(xx))
    size = int(rng.choice([192, 256, 320, 384]))
    h, w = alpha.shape
    size = min(size, h, w)
    left = int(np.clip(xx[center]-size//2, 0, w-size))
    top = int(np.clip(yy[center]-size//2, 0, h-size))
    f = cv2.resize(foreground[top:top+size, left:left+size], (256, 256), interpolation=cv2.INTER_LINEAR)
    a = cv2.resize(alpha[top:top+size, left:left+size], (256, 256), interpolation=cv2.INTER_LINEAR)
    if rng.random() < .5:
        f, a = f[:, ::-1].copy(), a[:, ::-1].copy()
    if internal_gaps and rng.random() < .7:
        f, a = procedural_fingers(f, rng)
    f = np.clip(f*rng.uniform(.55, 1.15)+rng.uniform(-.025, .025), 0, 1)
    # Match broad room colour families, never source-video geometry or masks.
    colors = np.array([[32, 53, 88], [180, 178, 154], [230, 70, 14], [130, 130, 130]], np.float32)/255
    base = np.clip(colors[int(rng.integers(4))]+rng.normal(0, .035, (3,)), 0, 1)
    noise = rng.normal(0, .02, (256, 256, 3)).astype(np.float32)
    b = np.clip(base+cv2.GaussianBlur(noise, (0, 0), 1.2), 0, 1).astype(np.float32)
    if rng.random() < .6:
        column = int(rng.integers(30, 220))
        b[:, column:column+int(rng.integers(2, 7))] *= rng.uniform(.1, .5)
    use_linear = rng.random() < .5
    f_work, b_work = (linear(f), linear(b)) if use_linear else (f, b)
    distance = float(rng.uniform(0, 32))
    angle = rng.uniform(0, np.pi*2)
    premultiplied = np.zeros_like(f_work)
    exposed_alpha = np.zeros_like(a)
    for fraction in np.linspace(-.5, .5, 13):
        matrix = np.array([[1, 0, fraction*distance*np.cos(angle)], [0, 1, fraction*distance*np.sin(angle)]], np.float32)
        premultiplied += cv2.warpAffine(f_work*a[..., None], matrix, (256, 256), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)/13
        exposed_alpha += cv2.warpAffine(a, matrix, (256, 256), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)/13
    picture = premultiplied+(1-exposed_alpha[..., None])*b_work
    if use_linear:
        picture = encoded(picture)
    picture = np.rint(picture.clip(0, 1)*255).astype(np.uint8)
    if rng.random() < .8:
        ok, compressed = cv2.imencode('.jpg', cv2.cvtColor(picture, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, int(rng.integers(70, 96))])
        assert ok
        picture = cv2.cvtColor(cv2.imdecode(compressed, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)
    truth = exposed_alpha.clip(0, 1).astype(np.float32)
    if reference:
        support = np.ones_like(a)
        if rng.random() < .5:
            support[cv2.erode((truth > .8).astype(np.uint8), np.ones((17, 17), np.uint8)) > 0] = 0
        if rng.random() < .1:
            support[:] = 0
        background = np.where(support[..., None] > 0, b, picture.astype(np.float32)/255)
        coarse = (truth > rng.uniform(.15, .65)).astype(np.uint8)
        radius = int(rng.choice([3, 7, 13, 21, 39, 59] if internal_gaps else [3, 7, 13, 21]))
        coarse = cv2.morphologyEx(coarse, cv2.MORPH_CLOSE, np.ones((radius, radius), np.uint8))
        if internal_gaps and rng.random() < .5:
            points = cv2.findNonZero(coarse)
            if points is not None and len(points) > 3:
                cv2.fillConvexPoly(coarse, cv2.convexHull(points), 1)
        if rng.random() < .5:
            coarse = cv2.dilate(coarse, np.ones((5, 5), np.uint8))
        coarse = cv2.GaussianBlur(coarse.astype(np.float32), (0, 0), rng.uniform(.5, 2))
        return picture, truth, background, support, coarse
    return picture, truth


def tensor(picture, device, background=None, support=None, coarse=None):
    value = torch.from_numpy(picture.copy()).permute(2, 0, 1).float()[None].to(device)/255
    mean, std = value.new_tensor([.485, .456, .406])[None, :, None, None], value.new_tensor([.229, .224, .225])[None, :, None, None]
    normalized = (value-mean)/std
    if background is None:
        return normalized
    b = torch.from_numpy(background.copy()).permute(2, 0, 1).float()[None].to(device)
    s = torch.from_numpy(support.copy()).float()[None, None].to(device)
    c = torch.from_numpy(coarse.copy()).float()[None, None].to(device)
    return torch.cat([normalized, (b-mean)/std, s, c], dim=1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference-conditioned', action='store_true')
    parser.add_argument('--internal-gaps', action='store_true')
    parser.add_argument('--warm-start', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--steps', type=int)
    args = parser.parse_args()
    assert not args.internal_gaps or args.reference_conditioned
    assert args.steps is None or 1 <= args.steps <= 1536
    out = args.out or PRIVATE/('reference-conditioned-motion-r295-20261107' if args.reference_conditioned
                              else 'annotated-motion-adapter-r292-20261107')
    out.mkdir(mode=0o700, exist_ok=False)
    provenance = PRIVATE/'p3m-source-license-r285-20261107/licensed-data-provenance-48.json'
    # Downloading public bytes and training are separate bounded phases.
    deadline = time.monotonic()+600
    while not provenance.exists():
        if time.monotonic() > deadline:
            raise RuntimeError('Bounded annotated-data preparation did not finish')
        time.sleep(2)
    data = json.loads(provenance.read_text())
    assert data['publisherAndMirrorLicense'] == 'MIT'
    for entry in data['samples']:
        assert sha(Path(entry['savedFile'])) == entry['savedSha256']
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    cv2.setNumThreads(2)
    torch.manual_seed(SEED)
    torch.cuda.set_per_process_memory_fraction(.65)
    sys.path.insert(0, str(PUBLISHER/'core'))
    from network import build_model
    model = build_model('vitae', pretrained=False).eval()
    model.load_state_dict(load_file(PUBLISHER/'model.safetensors'), strict=True)
    reference_stem = None
    if args.reference_conditioned:
        name, original = next((name, layer) for name, layer in model.named_modules()
                              if isinstance(layer, torch.nn.Conv2d) and layer.in_channels == 3)
        assert original.groups == 1
        extended = torch.nn.Conv2d(8, original.out_channels, original.kernel_size,
            original.stride, original.padding, original.dilation, original.groups,
            bias=original.bias is not None, padding_mode=original.padding_mode)
        with torch.no_grad():
            extended.weight.zero_()
            extended.weight[:, :3].copy_(original.weight)
            if original.bias is not None:
                extended.bias.copy_(original.bias)
        parent, leaf = name.rsplit('.', 1)
        setattr(model.get_submodule(parent), leaf, extended)
        reference_stem = name
    warm = None
    if args.warm_start:
        warm = json.loads(args.warm_start.read_text())
        assert warm['baseWeightsSha256'] == sha(PUBLISHER/'model.safetensors')
        assert warm['constructorSeed'] == SEED
        assert warm['referenceConditioned'] == args.reference_conditioned
        prior_weights = Path(warm['adapterFile'])
        assert sha(prior_weights) == warm['adapterSha256']
        loaded = model.load_state_dict(load_file(prior_weights), strict=False)
        assert not loaded.unexpected_keys
        for name, value in load_file(prior_weights).items():
            assert torch.equal(model.state_dict()[name], value), name
        prior_projections = Path(warm['nonpersistentProjectionsFile'])
        assert sha(prior_projections) == warm['nonpersistentProjectionsSha256']
        for name, value in load_file(prior_projections).items():
            model.get_submodule(name).w.copy_(value)
    model = model.cuda()
    for parameter in model.parameters():
        parameter.requires_grad_(args.reference_conditioned)
    prefixes = ('decoder.decoder1_l.', 'decoder.decoder0_l.', 'decoder.decoder_final_l.', 'decoder.sbfi_0.')
    chosen = {name: parameter for name, parameter in model.named_parameters()
              if args.reference_conditioned or name.startswith(prefixes)}
    assert chosen
    for parameter in chosen.values():
        parameter.requires_grad_(True)
    # Preserve any publisher random projection tensors absent from state_dict.
    projections = {name: module.w.detach().cpu().contiguous() for name, module in model.named_modules()
                   if hasattr(module, 'w') and isinstance(module.w, torch.Tensor)}
    variant = 'gap-curriculum' if args.internal_gaps else ('reference' if args.reference_conditioned else 'adapter')
    projection_file = PUBLISHER/f'{variant}-fixed-projections.safetensors'
    if projections:
        save_file(projections, str(projection_file))
    rows = [photo(i) for i in range(48)]
    validation_rng = np.random.default_rng(SEED+1)
    validation = [example(rows[i], validation_rng, args.reference_conditioned, args.internal_gaps) for i in range(40, 48)]
    captures = []
    handle = model.decoder.decoder_final_l.register_forward_hook(lambda _m, _i, value: captures.append(value))

    def evaluate(label):
        errors = []
        sheet = Image.new('RGB', (768, 256*len(validation)))
        with torch.inference_mode():
            for i, (picture, truth, *reference) in enumerate(validation):
                captures.clear()
                prediction = model(tensor(picture, 'cuda', *reference))[1][0, 0].cpu().numpy()
                edge = (truth > .01) & (truth < .99)
                false_interior = (reference[-1] > .8) & (truth < .5) if reference else np.zeros_like(edge)
                errors.append({'row': 40+i, 'mae': float(np.abs(prediction-truth).mean()),
                               'mixedMae': float(np.abs(prediction-truth)[edge].mean()) if edge.any() else None,
                               'falseOpaqueInteriorMae': float(np.abs(prediction-truth)[false_interior].mean()) if false_interior.any() else None})
                for n, image in enumerate([Image.fromarray(picture), Image.fromarray(np.rint(truth*255).astype(np.uint8)).convert('RGB'), Image.fromarray(np.rint(prediction*255).astype(np.uint8)).convert('RGB')]):
                    sheet.paste(image, (n*256, i*256))
        sheet.save(out/f'synthetic-heldout-{label}.jpg', quality=95)
        captures.clear()
        return errors

    before = evaluate('before')
    optimizer = torch.optim.AdamW(chosen.values(), lr=2e-5 if args.reference_conditioned else 1e-4, weight_decay=1e-4)
    rng = np.random.default_rng(SEED)
    history = []
    started = time.monotonic()
    steps = args.steps or (1280 if args.reference_conditioned else 320)
    for step in range(steps):
        picture, truth, *reference = example(rows[int(rng.integers(40))], rng, args.reference_conditioned, args.internal_gaps)
        target = torch.from_numpy(truth.copy())[None, None].cuda()
        captures.clear()
        optimizer.zero_grad(set_to_none=True)
        model(tensor(picture, 'cuda', *reference))
        logits = captures[-1]
        prediction = logits.sigmoid()
        weight = 1+4*((target > .01) & (target < .99)).float()
        if args.internal_gaps:
            coarse_tensor = torch.from_numpy(reference[-1].copy())[None, None].cuda()
            weight += 4*((coarse_tensor > .8) & (target < .5)).float()
        loss = (functional.binary_cross_entropy_with_logits(logits, target, reduction='none')*weight).mean()
        loss += 2*((prediction-target).abs()*weight).mean()
        loss += .2*((prediction[:, :, 1:]-prediction[:, :, :-1]-(target[:, :, 1:]-target[:, :, :-1])).abs().mean()
                    +(prediction[:, :, :, 1:]-prediction[:, :, :, :-1]-(target[:, :, :, 1:]-target[:, :, :, :-1])).abs().mean())
        assert torch.isfinite(loss)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(chosen.values(), 1)
        optimizer.step()
        if step % 32 == 0 or step == steps-1:
            row = {'step': step+1, 'loss': float(loss.detach().cpu()), 'wallSeconds': time.monotonic()-started}
            history.append(row)
            print(json.dumps(row), flush=True)
            write_json(out/'progress.json', {'rows': history, 'actualFootageQualified': False, 'fourMinuteProof': False})
        if time.monotonic()-started > 600:
            break
    captures.clear()
    after = evaluate('after')
    checkpoint = PUBLISHER/('gap-curriculum-adapter.safetensors' if args.internal_gaps else
                           'reference-conditioned-adapter.safetensors' if args.reference_conditioned
                           else 'annotated-motion-adapter.safetensors')
    save_file({name: parameter.detach().cpu().contiguous() for name, parameter in chosen.items()}, str(checkpoint))
    handle.remove()
    write_json(out/'training-receipt.json', {
        'constructorSeed': SEED, 'baseWeightsSha256': sha(PUBLISHER/'model.safetensors'),
        'adapterSha256': sha(checkpoint), 'adapterFile': str(checkpoint), 'adapterBytes': checkpoint.stat().st_size,
        'nonpersistentProjectionsFile': str(projection_file) if projections else None,
        'nonpersistentProjectionsSha256': sha(projection_file) if projections else None,
        'referenceConditioned': args.reference_conditioned, 'referenceStem': reference_stem,
        'warmStartReceiptSha256': sha(args.warm_start) if warm else None,
        'internalGapCurriculum': args.internal_gaps,
        'syntheticGeometry': '70 percent procedural five-finger silhouettes, random pose/colour, same exposure integration; coarse closing/convex hull deliberately occludes internal gaps.' if args.internal_gaps else None,
        'inputChannels': ['rgb', 'rgb', 'rgb', 'background', 'background', 'background', 'observedSupport', 'coarseAlpha'] if args.reference_conditioned else ['rgb']*3,
        'trainedParameterNames': sorted(chosen), 'trainedParameters': sum(p.numel() for p in chosen.values()),
        'batchNormRunningBuffersFrozen': True, 'supervisedTrainRows': list(range(40)), 'syntheticValidationRows': list(range(40, 48)),
        'alphaLabels': 'Publisher annotated mattes with controlled thirteen-sample synthetic motion exposure; no podcast pseudo-alpha targets.',
        'foregroundRgb': 'Opaque public photographed colours propagated to define synthetic edge RGB; not measured original edge RGB.',
        'backgrounds': 'Procedural room colour families and panel edges. No podcast frame used as a supervised training image.',
        'datasetProofSha256': sha(provenance), 'history': history, 'validationBefore': before, 'validationAfter': after,
        'torch': torch.__version__, 'device': torch.cuda.get_device_name(), 'trainingWallSeconds': time.monotonic()-started,
        'actualFootageQualified': False, 'nativeAdmission': False, 'modelRegistered': False,
        'fourMinuteProof': False, 'paidCloudInference': False, 'providerUpload': False})
    print('BOUNDED_ANNOTATED_MOTION_ADAPTATION_COMPLETE', flush=True)


if __name__ == '__main__':
    main()
