#!/usr/bin/env python3
"""Fail when an editor snapshot field has no declared canonical/UI owner.

This inventories serialization, not preview/render functionality. Nested
parameter consumers and output parity remain independent qualification gates.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
studio = (ROOT / "frontend/src/components/ViralClipStudio.js").read_text()
document = (ROOT / "frontend/src/components/studioProjectDocument.js").read_text()
decisions = (ROOT / "frontend/src/components/studioEditDecisions.js").read_text()

def fields(source, name):
    match = re.search(r"(?:export )?const " + name + r" = \[(.*?)\];", source, re.S)
    if not match:
        raise ValueError("Missing declared schema: " + name)
    return re.findall(r'"([A-Za-z_][A-Za-z_0-9]*)"', match.group(1))

owners = {}
def own(names, location, kind="CANONICAL_DECISION"):
    for name in names:
        owners[name] = {"owner": location, "classification": kind}

own(fields(document, "VISUAL_SETTING_FIELDS"), "visualGraph.settings")
own(fields(document, "AUDIO_SETTING_FIELDS"), "audioGraph.settings")
own(fields(decisions, "STUDIO_EDIT_SETTING_FIELDS"), "editGraph.settings")
own(["orderedClips", "projectMedia", "angleGroups", "extractedAudio"], "editGraph owned media/angle/audio records")
own(["overlays", "motionScenes", "threeDScenes", "subjectVfxScenes", "captionSegments"], "layers")
own(["timeline"], "assets/clipOccurrences + occurrence parameters")
own(["motionKeyframes", "finishKeyframes", "reframeKeyframes", "reframeModeCuts", "speakerFocusCuts",
     "audioKeyframes", "soundEffects", "voiceovers", "adjustmentLayers"], "linkedTiming")
own(["speakerStackSources"], "visualGraph.cameraSources")
own(["musicTrack"], "audioGraph.music + editGraph.musicMix")
own(["trackStates"], "audioGraph.routes")
own(["previewSpeed", "speedKeyframes"], "fallbackSpeed/programmeSpeedKeys/outputTimeMap")
own(["activeTimelineIndex"], "editGraph.hookBinding when hook enabled; otherwise UI selection", "CONDITIONAL_DECISION")
own(["activeAngleGroupId", "selectedClipId", "activeOverlayId", "cutRangeStart", "cutRangeEnd",
     "activeReframeKeyframeId", "activeWatermarkRegionId", "hookPreviewLoop", "activeSoundEffectId",
     "timelineZoom", "timelineEditTool", "timelineSnapping", "linkedSelection", "rippleMode",
     "motionTargetId", "compositeTargetId"], "legacy snapshot: selection, pending action or editor preference", "UI_CONTEXT")

start = studio.index("const getEditorSnapshot =")
end = studio.index("    };", start)
snapshot_fields = re.findall(r"^    (\w+)(?::[^\n]+)?,?$", studio[start:end], re.M)
missing = sorted(set(snapshot_fields) - owners.keys())
assert not missing, "Unclassified Studio snapshot fields: " + ", ".join(missing)
inspector = (ROOT / "frontend/src/components/StudioAdvancedInspectors.js").read_text()
layer_fields = fields(document, "LAYER_PARAMETER_FIELDS") + fields(decisions, "STUDIO_ADDITIONAL_LAYER_FIELDS")
missing_layers = sorted(set(re.findall(r'onUpdateOverlay\("(\w+)"', inspector)) - set(layer_fields))
assert not missing_layers, "Unserialized layer controls: " + ", ".join(missing_layers)
report = {
    "scope": "Serialization inventory; does not qualify any active control or rendered result",
    "snapshotFieldCount": len(snapshot_fields), "unclassified": missing,
    "fields": [{"field": name, **owners[name]} for name in snapshot_fields],
    "remainingQualification": ["Nested field validation/consumer audit", "Unified hook/silence/output clock",
        "Global composition order", "3D access-expiry/HQ compatibility", "Owned LUT/proxy/generation artifact binding"],
}
target = ROOT / "reports/studio-canonical-completion-20261008/decision-inventory.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"snapshotFields": len(snapshot_fields), "unclassified": missing,
    "unserializedAdvancedLayerControls": missing_layers}))
