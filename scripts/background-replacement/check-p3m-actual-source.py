"""Bounded private P3M comparison on retained real gesture source.

Uses the publisher's RESIZE preprocessing and exact checkpoint state. Standalone
person inference and hand-local composition are separate evidence; neither
qualifies a native result, temporal consistency, or a four-minute video.
"""
import copy
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw
from safetensors.torch import load_file
from skimage.transform import resize

from model_workers.common import sha, write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def network_input(rgb, shape, device, reference=None):
    scaled = resize(rgb, shape, preserve_range=True, anti_aliasing=True).astype(np.float32)/255
    value = torch.from_numpy(scaled).permute(2, 0, 1)[None]
    mean, std = torch.tensor([.485, .456, .406])[None, :, None, None], torch.tensor([.229, .224, .225])[None, :, None, None]
    result = (value-mean)/std
    if reference is not None:
        background, observed, coarse = reference
        b = np.where(observed[..., None], background, rgb)
        b = resize(b, shape, preserve_range=True, anti_aliasing=True).astype(np.float32)/255
        s = resize(observed.astype(np.float32), shape, order=0, preserve_range=True, anti_aliasing=False)
        c = resize(coarse.astype(np.float32)/255, shape, preserve_range=True, anti_aliasing=True)
        result = torch.cat([result, (torch.from_numpy(b).permute(2, 0, 1)[None]-mean)/std,
                            torch.from_numpy(s.copy())[None, None], torch.from_numpy(c.copy())[None, None]], dim=1)
    return result.to(device)


def predict_tracked_hand_tiles(model, rgb, reference, selection, device):
    """Source-fixed overlapping tiles; no frame-specific hand coordinates."""
    height, width = selection.shape
    assert height >= 256 and width >= 256
    axes = [sorted(set(list(range(0, length-255, 128))+[length-256]))
            for length in (height, width)]
    window = np.outer(np.hanning(256), np.hanning(256)).astype(np.float32)
    window = np.maximum(window, .001)
    total, weights = np.zeros((height, width), np.float32), np.zeros((height, width), np.float32)
    tiles = []
    for top in axes[0]:
        for left in axes[1]:
            sl = np.s_[top:top+256, left:left+256]
            if np.count_nonzero(selection[sl]) < 4:
                continue
            inputs = network_input(rgb[sl], (256, 256), device,
                                   tuple(value[sl] for value in reference))
            with torch.inference_mode():
                local = model(inputs)[1][0, 0].cpu().numpy()
            total[sl] += local*window
            weights[sl] += window
            tiles.append([left, top, left+256, top+256])
    assert np.all(weights[selection] > 0), 'Every tracked hand pixel needs a real tile'
    prediction = reference[-1].astype(np.float32)/255
    np.divide(total, weights, out=prediction, where=weights > 0)
    return prediction.clip(0, 1), tiles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cpu')
    parser.add_argument('--full-resolution', action='store_true')
    parser.add_argument('--chunk-attention', action='store_true')
    parser.add_argument('--adaptation', type=Path)
    parser.add_argument('--current-native', action='store_true')
    parser.add_argument('--honor-source-trimap', action='store_true')
    parser.add_argument('--indices')
    parser.add_argument('--focus-tile', action='store_true')
    parser.add_argument('--hand-tiles', action='store_true')
    parser.add_argument('--subtract-only', action='store_true')
    parser.add_argument('--opaque-core-from', type=Path)
    args = parser.parse_args()
    if args.focus_tile:
        assert not args.full_resolution
    assert not args.hand_tiles or not (args.focus_tile or args.full_resolution)
    private = Path('reports/background-replacement-20261101/private')
    out = args.out or private/'p3m-actual-source-r286-20261107'
    out.mkdir(mode=0o700, exist_ok=False)
    publisher = Path('/dev/shm/autopromote-p3m-private-r285-20261107')
    proof = json.loads((private/'p3m-source-license-r285-20261107/weight-provenance.json').read_text())
    assert sha(publisher/'model.safetensors') == proof['safeTensorSha256']
    sys.path.insert(0, str(publisher/'core'))
    from network import build_model
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    cv2.setNumThreads(2)
    adaptation = json.loads(args.adaptation.read_text()) if args.adaptation else None
    if adaptation:
        assert adaptation['baseWeightsSha256'] == proof['safeTensorSha256']
        torch.manual_seed(adaptation['constructorSeed'])
    if args.device == 'cuda':
        torch.cuda.set_per_process_memory_fraction(.65)
    model = build_model('vitae', pretrained=False).eval()
    model.load_state_dict(load_file(publisher/'model.safetensors'), strict=True)
    if adaptation:
        if adaptation.get('referenceConditioned'):
            name = adaptation['referenceStem']
            original = model.get_submodule(name)
            assert original.in_channels == 3 and original.groups == 1
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
        checkpoint = Path(adaptation.get('retainedAdapterFile', adaptation['adapterFile']))
        assert sha(checkpoint) == adaptation['adapterSha256']
        trained = load_file(checkpoint)
        assert sorted(trained) == adaptation['trainedParameterNames']
        assert set(trained) <= set(model.state_dict())
        unchanged = {name: hashlib.sha256(value.numpy().tobytes()).hexdigest()
                     for name, value in model.state_dict().items() if name not in trained}
        loaded = model.load_state_dict(trained, strict=False)
        assert not loaded.unexpected_keys
        # BatchNorm's legacy loader omits num_batches_tracked from missing_keys.
        # Verify the actual full state instead of relying on that metadata list.
        for name, value in model.state_dict().items():
            if name in trained:
                assert torch.equal(value, trained[name]), name
            else:
                assert hashlib.sha256(value.numpy().tobytes()).hexdigest() == unchanged[name], name
        write_json(out/'adaptation-restore.json', {'trainedTensorsExact': len(trained),
            'allUnchangedBaseTensorsExact': len(unchanged), 'unexpectedKeys': loaded.unexpected_keys})
        if adaptation.get('nonpersistentProjectionsFile'):
            projections = Path(adaptation.get('retainedProjectionsFile', adaptation['nonpersistentProjectionsFile']))
            assert sha(projections) == adaptation['nonpersistentProjectionsSha256']
            modules = dict(model.named_modules())
            for name, value in load_file(projections).items():
                assert name in modules and modules[name].w.shape == value.shape
                modules[name].w.copy_(value)
    model = model.to(args.device)
    attention_check = None
    if args.chunk_attention:
        from network.ViTAE_S.NormalCell import Attention
        original_attention = Attention.forward

        def chunk_attention(self, x):
            assert not self.training, 'This private memory optimization is inference only'
            batch, count, channels = x.shape
            qkv = self.qkv(x).reshape(batch, count, 3, self.num_heads, channels//self.num_heads).permute(2, 0, 3, 1, 4)
            q, k, v = qkv.unbind(0)
            pieces = []
            for start in range(0, count, 128):
                attention = (q[:, :, start:start+128] @ k.transpose(-2, -1))*self.scale
                attention = self.attn_drop(attention.softmax(dim=-1))
                pieces.append(attention @ v)
            result = torch.cat(pieces, dim=2).transpose(1, 2).reshape(batch, count, channels)
            return self.proj_drop(self.proj(result))

        actual = next(m for m in model.modules() if isinstance(m, Attention))
        probe = torch.randn(1, 257, actual.qkv.in_features, device=args.device)
        with torch.inference_mode():
            expected = original_attention(actual, probe)
            candidate = chunk_attention(actual, probe)
        error = float((expected-candidate).abs().max().cpu())
        assert torch.allclose(expected, candidate, atol=1e-6, rtol=1e-5), error
        attention_check = {'queryChunkSize': 128, 'probeTokens': 257, 'maximumOutputError': error,
                           'weightsChanged': False, 'fullKeyValueContextPreserved': True}
        write_json(out/'attention-equivalence.json', attention_check)
        Attention.forward = chunk_attention
    job = Path('/tmp/autopromote-application-demo-FDokC2/model-jobs/72d11d8677a384bf5e779d794978ec07f51e671c8759ebdaae6bd550ebd2ca67/a72eb85d-6a69-475c-96e3-9a82f934ff8c')
    if args.current_native:
        job = Path('/dev/shm/autopromote-background-native-r280-20261107/model-jobs/a02e18c4a5e0d968c169fdd645d3fc8c537067eab4ede800802ff7fe2ddc21f8/ccd48ee2-bd53-413d-9ece-45b09a7a662b')
    guide = job/'component_dependency'
    manifest = json.loads((guide/'manifest.json').read_text())
    work = Path('/tmp/autopromote-application-demo-FDokC2/subject-previews/0357ddba-d7bc-4d96-8fe1-b55bb7eab16d')
    if args.current_native:
        work = Path('/tmp/autopromote-application-demo-FDokC2/subject-previews/1d977b58-4f18-4bd7-a6a3-7e37ec9e61ac')
    cache = CachedSubjectMatte(work/'matte', work/'source.mp4')
    body_proof = None
    if args.opaque_core_from:
        body_proof = json.loads((args.opaque_core_from/'receipt.json').read_text())
        assert args.hand_tiles and args.subtract_only and args.current_native
        assert body_proof['opaqueBodyCoreOnly'] and body_proof['preservesActualAuthorClicks']
        assert body_proof['nativeParentPreviewSha256'] == sha(work/'render.mp4')
    effects = json.loads((work/'spec.json').read_text())['spec']['scene']['effects']
    plan = {'version': 1, 'source_sha256': cache.manifest['source_sha256'],
            'matte_sha256': cache.artifact_sha256, 'effects': copy.deepcopy(effects)}
    rows = []
    started = time.monotonic()
    indices = list(map(int, args.indices.split(','))) if args.indices else ([15] if args.full_resolution else [15, 6])
    assert indices and all(0 <= i < 48 for i in indices)
    for index in indices:
        source = private/f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png'
        rgb = np.array(Image.open(source).convert('RGB'))
        reference = (*cache.observed_background, cache.frame(index)) if adaptation and adaptation.get('referenceConditioned') else None
        hands = np.maximum(*[np.array(Image.open(guide/manifest['components'][n]['frames'][index]['file'])) for n in [1, 2]])
        tiles = None
        tensor = network_input(rgb, (480, 704), args.device, reference)
        with torch.inference_mode():
            global_pred, local_pred, fused_pred = model(tensor)[:3]
        local = resize(local_pred[0, 0].cpu().numpy(), (1000, 1430), preserve_range=True).clip(0, 1)
        fused = resize(fused_pred[0, 0].cpu().numpy(), (1000, 1430), preserve_range=True).clip(0, 1)
        classes = global_pred.argmax(dim=1)[0].cpu().numpy()
        if args.hand_tiles:
            assert reference is not None
            selection = cv2.dilate((hands >= 64).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
            local, tiles = predict_tracked_hand_tiles(model, rgb, reference, selection, args.device)
            fused = local.copy()
        if args.focus_tile:
            assert reference is not None and index == 15
            # Internal scale check only; not an authored holdout or a new mask.
            tile_box = (1122, 201, 1378, 457)
            x0, y0, x1, y1 = tile_box
            sl = np.s_[y0:y1, x0:x1]
            tile_reference = tuple(value[sl] for value in reference)
            with torch.inference_mode():
                tile = model(network_input(rgb[sl], (256, 256), args.device, tile_reference))[1][0, 0].cpu().numpy()
            local = cache.frame(index).astype(np.float32)/255
            local[sl] = tile
            fused = local.copy()
        if args.full_resolution:
            # Publisher HYBRID: half-size semantic prediction, source-size
            # local decoder. Keep the real full body context, not a hand tile.
            full = network_input(rgb, (992, 1408), args.device, reference)
            with torch.inference_mode():
                full_local = model(full.to(args.device))[1][0, 0].cpu().numpy()
            local = resize(full_local, (1000, 1430), preserve_range=True).clip(0, 1)
            coded = np.choose(classes, [0., 128., 255.])
            semantic = resize(coded, (1000, 1430), preserve_range=True)
            fused = np.where(semantic == 255, 1, np.where(semantic == 0, 0, local))
        print(json.dumps({'event': 'actual_source_alpha_prediction', 'frame': index,
                          'localGapAlpha': round(float(local[329, 1250])*255),
                          'adapted': bool(adaptation), 'visualPass': False}), flush=True)
        Image.fromarray(np.rint(fused*255).astype(np.uint8)).save(out/f'standalone-person-alpha-{index:04d}.png')
        Image.fromarray(np.rint(local*255).astype(np.uint8)).save(out/f'local-head-alpha-{index:04d}.png')
        Image.fromarray(classes.astype(np.uint8)*127).save(out/f'global-classes-{index:04d}.png')
        prior = cache.frame(index)
        domain = cv2.dilate((hands >= 64).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
        fixed = np.maximum.reduce([np.array(Image.open(guide/c['frames'][index]['file'])) for c in manifest['components'][3:]])
        domain &= fixed < 64
        if reference is not None:
            domain &= reference[1]
        weight = np.minimum(cv2.distanceTransform(domain.astype(np.uint8), cv2.DIST_L2, 5)/8, 1)
        if args.focus_tile:
            tile_domain = np.zeros(prior.shape, np.uint8)
            x0, y0, x1, y1 = tile_box
            tile_domain[y0:y1, x0:x1] = 1
            weight *= np.minimum(cv2.distanceTransform(tile_domain, cv2.DIST_L2, 5)/16, 1)
        pictures = [Image.fromarray(rgb)]
        baseline = VfxFrameRenderer(plan, cache, lambda _: private/'replacement.png')
        baseline.foreground_cache.root = None
        retained_preview = private/f'native-current-fixes-r280-20261107/actual-native-frame-review/actual-preview-{index:04d}.png'
        pictures.append(Image.open(retained_preview).convert('RGB') if args.current_native and retained_preview.is_file()
                        else baseline.render(Image.fromarray(rgb), index))
        rendered = {}
        saved_identities = set()
        for name, prediction in [('P3M-fused-hand', fused), ('P3M-local-hand', local)]:
            if args.honor_source_trimap:
                tri = np.array(Image.open(job/f'outputs/trimaps/trimap_{index:04d}.png'))
                prediction = prediction.copy()
                prediction[tri == 0] = 0
                prediction[tri == 255] = 1
            alpha = np.rint(prior*(1-weight)+prediction*255*weight).astype(np.uint8)
            if args.subtract_only:
                # A background-gap repair cannot add a new outer hand rim.
                # Existing opaque author seeds remain protected above.
                alpha = np.minimum(prior, alpha)
            if body_proof:
                body = args.opaque_core_from/f'alpha-{index:04d}.png'
                binding = next(row for row in body_proof['bindings'] if row['frame'] == index)
                assert sha(body) == binding['derivedAlphaSha256']
                body_alpha = np.array(Image.open(body).convert('L'))
                # Transfer only independent confirmed additions. Taking the
                # union with the entire old matte would undo the gap repair.
                added = (body_alpha > prior) & (body_alpha == 255)
                alpha[added] = 255
            identity = hashlib.sha256(alpha.tobytes()).hexdigest()
            candidate = SimpleNamespace(manifest=cache.manifest, artifact_sha256=identity,
                                        observed_background=cache.observed_background,
                                        frame=lambda _: alpha)
            renderer = VfxFrameRenderer({**plan, 'matte_sha256': identity}, candidate, lambda _: private/'replacement.png')
            renderer.foreground_cache.root = None
            picture = rendered.get(identity)
            if picture is None:
                picture = renderer.render(Image.fromarray(rgb), index)
                rendered[identity] = picture
            pictures.append(picture)
            if name == 'P3M-local-hand' and identity in saved_identities:
                import os
                for suffix in ['actual', 'alpha']:
                    os.link(out/f'P3M-fused-hand-{suffix}-{index:04d}.png', out/f'{name}-{suffix}-{index:04d}.png')
            else:
                picture.save(out/f'{name}-actual-{index:04d}.png')
                Image.fromarray(alpha).save(out/f'{name}-alpha-{index:04d}.png')
            saved_identities.add(identity)
        for side, box in [('right', (1020, 150, 1430, 760)), ('left', (280, 230, 720, 730))]:
            w, h = box[2]-box[0], box[3]-box[1]
            sheet = Image.new('RGB', (w*4, h+24))
            for n, (label, picture) in enumerate(zip(['Actual source', 'Current native', 'P3M fused / retained props', 'P3M local / retained props'], pictures)):
                sheet.paste(picture.crop(box), (n*w, 24))
                ImageDraw.Draw(sheet).text((n*w+3, 4), label, fill='white')
            sheet.save(out/f'{side}-{index:04d}.jpg', quality=98)
        rows.append({'frame': index, 'sourceSha256': sha(source), 'fusedGapAlpha': round(float(fused[329, 1250])*255),
                     'localGapAlpha': round(float(local[329, 1250])*255), 'sourceFixedHandTiles': tiles,
                     'seconds': time.monotonic()-started})
        print(json.dumps(rows[-1]), flush=True)
        write_json(out/'receipt.json', {'rows': rows, 'publisherPreprocessing': 'HYBRID: 480x704 global / 992x1408 local + ImageNet normalization' if args.full_resolution else 'RESIZE 480x704 + ImageNet normalization',
            'device': args.device, 'paidCloudInference': False, 'providerUpload': False,
            'attentionEquivalence': attention_check,
            'adaptationReceiptSha256': sha(args.adaptation) if args.adaptation else None,
            'usesCurrentNative2_5_13': args.current_native,
            'preservesExistingSourceTrimapConstraints': args.honor_source_trimap,
            'referenceConditioned': bool(reference is not None),
            'privateSingleTileScaleCheck': args.focus_tile,
            'trackedHandSourceFixedTiles': args.hand_tiles,
            'onlySubtractsFromExistingAlpha': args.subtract_only,
            'opaqueBodyRecoveryFrom': str(args.opaque_core_from) if body_proof else None,
            'strictCheckpointLoaded': True, 'weightsProofSha256': sha(private/'p3m-source-license-r285-20261107/weight-provenance.json'),
            'nativeAdmission': False, 'visualReviewPending': True, 'motionQualified': False, 'fourMinuteProof': False})


if __name__ == '__main__':
    main()
