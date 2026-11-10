"""Private BMV2 pair-matting check, restricted to photographed B support.

Unobserved model-input pixels equal current source, not an asserted empty plate.
Every output there is discarded. No generated background or model admission.
"""
import argparse, copy, importlib.util, json, socket, time
from pathlib import Path
import cv2, numpy as np, torch
from PIL import Image, ImageDraw
from safetensors.torch import load_file
from model_workers.common import sha, write_json
from model_workers.adapters.moving_detail_alpha import measured_motion_trimap
from model_workers.adapters.temporal_alpha import source_motion_radius
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('out', type=Path); parser.add_argument('--estimated-context', action='store_true'); a = parser.parse_args(); a.out.mkdir(exist_ok=False)
    private = Path('reports/background-replacement-20261101/private')
    root = Path('/home/tibule12/.cache/autopromote-model-runtime/background-matting-v2-private-20261106')
    provenance = json.loads((root/'provenance.json').read_text())
    assert sha(root/'model.safetensors') == provenance['safeTensorSha256']
    for row in provenance['files']: assert sha(root/row['path']) == row['sha256']
    socket.socket.connect = lambda *args, **kw: (_ for _ in ()).throw(RuntimeError('Diagnostic inference is offline'))
    spec = importlib.util.spec_from_file_location('bmv2_private', root/'model/__init__.py', submodule_search_locations=[str(root/'model')])
    module = importlib.util.module_from_spec(spec)
    import sys
    sys.modules[spec.name] = module; spec.loader.exec_module(module)
    torch.set_num_threads(2)
    model = module.MattingRefine(backbone='mobilenetv2', backbone_scale=.5, refine_mode='full').to('cuda').eval()
    model.load_state_dict(load_file(root/'model.safetensors'), strict=True)
    work = Path('/tmp/autopromote-application-demo-FDokC2/subject-previews/608ba066-166e-49c1-ba79-b1c28940c569')
    job = Path('/tmp/autopromote-application-demo-FDokC2/model-jobs/18f335240ae4777cd864a862acd96d59d5cbd1d4452a637391956c98bdfa56cf/a59210fa-0254-4000-b1b6-0e92ac9535e8')
    guide = job/'component_dependency'; data = json.loads((guide/'manifest.json').read_text())
    cache = CachedSubjectMatte(work/'matte', work/'source.mp4'); background, observed = cache.observed_background
    estimated_context = None
    if a.estimated_context:
        # Auxiliary conditioning only, explicitly estimated rather than a
        # photographed plate. No prediction outside measured support is used.
        from scipy.ndimage import distance_transform_edt
        _, nearest = distance_transform_edt(~observed, return_indices=True)
        estimated_context = background[nearest[0], nearest[1]].copy()
        smooth = cv2.GaussianBlur(estimated_context, (0,0), 15)
        estimated_context[~observed] = smooth[~observed]
        Image.fromarray(estimated_context).save(a.out/'estimated-source-background-NOT-PHOTOGRAPHED.png')
    effects = json.loads((work/'spec.json').read_text())['spec']['scene']['effects']
    plan = {'version': 1, 'source_sha256': cache.manifest['source_sha256'], 'matte_sha256': cache.artifact_sha256, 'effects': copy.deepcopy(effects)}
    renderer = VfxFrameRenderer(plan, cache, lambda _: private/'replacement.png'); renderer.foreground_cache.root = None
    prepare = renderer._prepare_foreground; rows = []; start = time.monotonic()
    for index in [15, 6, 10, 12, 23, 39, 47]:
        source = private/f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png'
        rgb = np.asarray(Image.open(source).convert('RGB')); prior = cache.frame(index); alpha = prior.copy(); colour = rgb.copy(); allowed = np.zeros(prior.shape, bool)
        previous = np.asarray(Image.open(private/f'recovered-gesture-r180-20261105/rgb/rgb_{index-1:04d}.png'))
        motion = source_motion_radius(rgb, previous, 1)
        primary = np.asarray(Image.open(guide/data['components'][0]['frames'][index]['file']))
        full_values = full_colour = None
        if a.estimated_context:
            def full_tensor(v):
                t = torch.from_numpy(v.copy()).to('cuda').permute(2,0,1)[None].float()/255
                return torch.nn.functional.pad(t, (0,2,0,0), mode='replicate')
            with torch.inference_mode():
                full_values, full_colour = model(full_tensor(rgb), full_tensor(estimated_context))[:2]
            full_values = full_values[0,0,:1000,:1430].cpu().numpy()
            full_colour = full_colour[0,:,:1000,:1430].permute(1,2,0).cpu().numpy()
        for n in [1, 2]:
            hand = np.asarray(Image.open(guide/data['components'][n]['frames'][index]['file']))
            _, domain = measured_motion_trimap(prior, hand, primary, rgb, background, observed, motion)
            ys, xs = np.where(domain)
            if not len(xs): continue
            x0, y0 = max(0, int(xs.min())-32), max(0, int(ys.min())-32)
            x1, y1 = min(1430, int(xs.max())+33), min(1000, int(ys.max())+33)
            sl = np.s_[y0:y1, x0:x1]; local = rgb[sl]; h, w = local.shape[:2]
            # Only the saved support pixels are a photographed empty plate.
            b = local.copy(); b[observed[sl]] = background[sl][observed[sl]]
            def tensor(v):
                t = torch.from_numpy(v.copy()).to('cuda').permute(2,0,1)[None].float()/255
                return torch.nn.functional.pad(t, (0,(-w)%4,0,(-h)%4), mode='replicate')
            if a.estimated_context:
                values, foreground = full_values[sl], full_colour[sl]
            else:
                with torch.inference_mode(): values, foreground = model(tensor(local), tensor(b))[:2]
                values = values[0,0,:h,:w].cpu().numpy(); foreground = foreground[0,:,:h,:w].permute(1,2,0).cpu().numpy()
            weight = np.minimum(cv2.distanceTransform(domain[sl].astype(np.uint8), cv2.DIST_L2, 5)/8,1)
            alpha[sl] = np.rint(prior[sl]*(1-weight)+values*255*weight).clip(0,255).astype(np.uint8)
            colour[sl] = np.rint(local*(1-weight[...,None])+foreground*255*weight[...,None]).clip(0,255).astype(np.uint8)
            allowed |= domain
        assert np.array_equal(alpha[~allowed], prior[~allowed])
        Image.fromarray(alpha).save(a.out/f'alpha-{index:04d}.png'); Image.fromarray(colour).save(a.out/f'foreground-{index:04d}.png')
        before = renderer.render(Image.fromarray(rgb), index)
        active = [e for e in effects if e['start'] <= index/24 < e['end']]
        fg, effective = prepare(Image.fromarray(rgb), Image.fromarray(alpha), active, 1430, 1000)
        replacement_fg = np.asarray(fg).copy(); replacement_fg[allowed] = colour[allowed]
        renderer._prepare_foreground = lambda *args: (Image.fromarray(replacement_fg), effective)
        after = renderer.render(Image.fromarray(rgb), index); renderer._prepare_foreground = prepare
        after.save(a.out/f'actual-{index:04d}.png')
        for side, box in [('left',(280,230,720,730)),('right',(1020,150,1430,760))]:
            w,h = box[2]-box[0],box[3]-box[1]; sheet = Image.new('RGB',(w*3,h+24)); draw = ImageDraw.Draw(sheet)
            for n,(label,picture) in enumerate([('Exact source',Image.fromarray(rgb)),('Native current',before),('Photographed B neural pair / bounded support',after)]):
                sheet.paste(picture.crop(box),(n*w,24)); draw.text((n*w+3,4),label,fill='white')
            sheet.save(a.out/f'{side}-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'gapAlpha':int(alpha[329,1250]),'changedPixels':int(np.count_nonzero(alpha!=prior)),'sourceSha256':sha(source),'seconds':time.monotonic()-start});print(json.dumps(rows[-1]),flush=True)
    write_json(a.out/'receipt.json',{'rows':rows,'model':provenance,'photographedSupportOnly':True,'context': 'Estimated nearest observed source colour, NOT a photographed plate' if a.estimated_context else 'Unobserved input equals source','predictionsOutsideMeasuredSupportDiscarded':True,'nativeAdmission':False,'registeredModelChanged':False,'visualReviewPending':True,'fourMinuteProof':False,'paidCloud':False})


if __name__ == '__main__': main()
