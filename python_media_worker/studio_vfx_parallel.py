"""Bounded local CPU composition using the existing canonical pixel renderer.

Workers own separate renderer/cache/asset state. Spawning avoids inheriting a
running CUDA context; two frames at most are submitted and results stay ordered.
No source frame, mask, colour operation or encoder setting is substituted.
"""
from collections import deque
from concurrent.futures import ProcessPoolExecutor
import multiprocessing

from PIL import Image


def _initialize(source, matte, plan, assets):
    global _renderer
    from python_media_worker.studio_subject_matte import CachedSubjectMatte
    from python_media_worker.studio_vfx_plan import VfxFrameRenderer
    _renderer = VfxFrameRenderer(plan, CachedSubjectMatte(matte, source),
                                 lambda asset_id: assets[asset_id])


def _compose(frame):
    index, size, pixels = frame
    return index, _renderer.render(Image.frombytes('RGB', size, pixels), index).tobytes()


def compose_frames(frames, source, matte, plan, assets, *, workers=2):
    """Yield (source index, RGB image), preserving order and a two-frame bound."""
    if type(workers) is not int or workers not in (1, 2):
        raise ValueError('Local composition permits one or two CPU workers')
    if workers == 1:
        from python_media_worker.studio_subject_matte import CachedSubjectMatte
        from python_media_worker.studio_vfx_plan import VfxFrameRenderer
        renderer = VfxFrameRenderer(plan, CachedSubjectMatte(matte, source),
                                    lambda asset_id: assets[asset_id])
        for index, image in frames:
            yield index, renderer.render(image, index)
        return
    iterator = iter(frames)
    pending = deque()
    with ProcessPoolExecutor(max_workers=workers,
            mp_context=multiprocessing.get_context('spawn'),
            initializer=_initialize, initargs=(str(source), str(matte), plan, assets)) as pool:
        def submit():
            try:
                index, picture = next(iterator)
            except StopIteration:
                return False
            if picture.mode != 'RGB':
                raise ValueError('Canonical composition requires RGB source pictures')
            pending.append((index, picture.size,
                pool.submit(_compose, (index, picture.size, picture.tobytes()))))
            return True
        try:
            for _ in range(workers):
                if not submit():
                    break
            while pending:
                index, size, future = pending.popleft()
                actual_index, pixels = future.result()
                if actual_index != index:
                    raise RuntimeError('Parallel composition source clock differs')
                yield index, Image.frombytes('RGB', size, pixels)
                submit()
        finally:
            for _, _, future in pending:
                future.cancel()
