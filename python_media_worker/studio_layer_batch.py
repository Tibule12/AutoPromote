"""Bounded scheduling of independent layers through the canonical renderer.

Only preparation runs concurrently. Compositing order, mattes, clocks, pixels
and the final encoder remain those of the ordinary Studio graph.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
import asyncio
import os
from pathlib import Path


def layer_parallelism():
    cpus = float(os.cpu_count() or 1)
    try:
        quota, period = Path('/sys/fs/cgroup/cpu.max').read_text().split()
        if quota != 'max':
            cpus = min(cpus, int(quota) / int(period))
    except (OSError, ValueError, ZeroDivisionError):
        pass
    # Leave room for the event loop and encoder. CPU fallback has a smaller
    # memory/CPU envelope; do not infer its allocation from the host's cores.
    gpu = (str(os.environ.get('MEDIA_WORKER_REQUIRE_GPU', '')).lower() in {'1', 'true'}
           or str(os.environ.get('VIDEO_ENCODER', '')).lower().endswith('_nvenc'))
    return min(4 if gpu else 2, max(1, int(cpus // 2)))


def render_layer_batch(jobs, renderer, on_progress=None):
    if not jobs:
        return {}
    pool = ThreadPoolExecutor(max_workers=layer_parallelism(), thread_name_prefix='studio-layer')
    futures = {pool.submit(renderer, *args): identity for identity, args in jobs}
    try:
        result = {}
        for future in as_completed(futures):
            result[futures[future]] = future.result()
            if on_progress:
                on_progress(len(result), len(futures))
        return {identity: result[identity] for identity, _args in jobs}
    finally:
        # A failed/cancelled export must not delete scratch while an encoder
        # is still writing to it. Cancel queued work and join the bounded set.
        pool.shutdown(wait=True, cancel_futures=True)


async def prepare_layer_batch(jobs, renderer, on_progress=None):
    task = asyncio.create_task(asyncio.to_thread(render_layer_batch, jobs, renderer, on_progress))
    try:
        return await asyncio.shield(task)
    except BaseException:
        # Cancellation cannot interrupt Python/FFmpeg running in a thread.
        # Join before the caller releases this export's scratch directory.
        try:
            await task
        except BaseException:
            pass
        raise
