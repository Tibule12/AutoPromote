#!/usr/bin/env python3
"""Reuse byte-identical source reframes while rebuilding a reviewed local edit."""

import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python_media_worker"))
from main_media_server import build_reframe_segment_filter, plan_reframe_timeline_segments  # noqa: E402

BASE = ROOT / "proof/viral-clip-studio/ten-minute-director/local-revision"
OLD = BASE / "full-picture-fill-v6"
NEW = BASE / "full-picture-fill-v8"
LATEST = BASE / "picture-fill-v8/review-settings.json"


def localized(items, start):
    return [{**item, "time": round(float(item["time"]) - start, 6)} for item in items]


def plan(payload, start, end):
    import copy

    reframe = payload["finish_plan"]["reframe"]
    cuts = localized(reframe["timeline_cuts"], start)
    earlier = max((cut for cut in cuts if cut["time"] <= 0), key=lambda cut: cut["time"])
    cuts = [{**earlier, "time": 0}, *(cut for cut in cuts if 0 < cut["time"] < end-start)]
    split = copy.deepcopy(reframe["split_source"])
    for slot in ("top", "bottom"):
        for name in ("keyframes", "source_time_offset_keyframes"):
            if split[slot].get(name):
                split[slot][name] = localized(split[slot][name], start)
    return plan_reframe_timeline_segments(
        end-start, cuts, split,
        localized(reframe["speaker_order_cuts"], start),
        localized(reframe["keyframes"], start),
    )


def signature(segment, base_zoom):
    zoom = (segment.get("split_framing") or {}).get("bottom") or {}
    alternate = abs(float(zoom.get("source_time_offset_seconds", 0) or 0)) > 1e-6
    graph = build_reframe_segment_filter(
        1920, 1080, 540, 960, segment, base_zoom,
        alternate_input_label="[1:v]" if alternate else None,
    )
    return graph, float(zoom.get("source_time_offset_seconds", 0) or 0)


def main():
    old = json.loads((OLD / "review-settings.json").read_text())
    new = json.loads(LATEST.read_text())
    NEW.mkdir(parents=True, exist_ok=True)
    reused = 0
    regenerated = []
    for start, end in ((0, 170), (170, 240), (240, 600)):
        before = plan(old, start, end)
        after = plan(new, start, end)
        if len(before) != len(after):
            raise ValueError(f"Edit boundaries changed inside {start}-{end}s")
        for index, (old_segment, new_segment) in enumerate(zip(before, after)):
            if (old_segment["start"], old_segment["end"]) != (new_segment["start"], new_segment["end"]):
                raise ValueError(f"Camera cut moved inside {start}-{end}s")
            name = f"{start:g}-{end:g}-segment-{index:02d}.mp4"
            original = OLD / name
            if not original.exists():
                raise FileNotFoundError(original)
            if signature(old_segment, old["finish_plan"]["reframe"]["zoom"]) == signature(
                new_segment, new["finish_plan"]["reframe"]["zoom"]
            ):
                os.link(original, NEW / name)
                reused += 1
            else:
                regenerated.append(name)
    receipt = {"reused_exact_filter_segments": reused, "segments_to_render": regenerated,
               "source_proof_preserved": str(OLD.relative_to(ROOT))}
    (NEW / "segment-reuse-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
