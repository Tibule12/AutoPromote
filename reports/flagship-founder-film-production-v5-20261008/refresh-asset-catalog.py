"""Hash-bound private production checkpoint; not a second editor or approval."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def reference(relative, role=None):
    item = {"path": relative, "sha256": sha(ROOT / relative)}
    if role:
        item["role"] = role
    return item


def asset(asset_id, kind, file, receipt_file, review_file, status, reusable=()):
    artifact = ROOT / file
    receipt = json.loads((ROOT / receipt_file).read_text())
    review = json.loads((ROOT / review_file).read_text())
    artifact_sha = sha(artifact)
    assert review["artifactSha256"] == artifact_sha, asset_id
    brief = receipt.get("sourceBrief", "")
    return {
        "assetId": asset_id, "type": kind, "status": status,
        "artifact": {"path": file, "sha256": artifact_sha, "bytes": artifact.stat().st_size},
        "generationReceipt": reference(receipt_file),
        "review": {**reference(review_file), "acceptedForPrivateAssetUse": bool(review.get("accepted")), "wholeFilmCreativeApproval": False},
        "provenance": {"sourceBrief": brief, "sourceBriefHash": hashlib.sha256(brief.encode()).hexdigest(),
                       "model": receipt.get("model"), "modelRevision": receipt.get("modelRevision"),
                       "settings": receipt.get("settings"), "seed": receipt.get("seed", receipt.get("shot", {}).get("seed", receipt.get("settings", {}).get("seed"))),
                       "device": receipt.get("gpu", receipt.get("device"))},
        "reusableArtifacts": [reference(file, role) for role, file in reusable],
    }


entries = [
    asset("helm-response-v2", "video", "helm-response-i2v-720p/sailor-holds-course-looks-to-sea/video.mp4", "helm-response-i2v-720p/sailor-holds-course-looks-to-sea/receipt.json", "helm-response-review/creative-verdict.json", "accepted_private_visual_asset"),
    asset("ident-v8", "three_d", "ident-v8-full/ident-v8-with-sound.mp4", "ident-v8-full/render-receipt.json", "ident-v8-full/creative-verdict.json", "pending_whole_film_review", [
        ("native_scene", "ident-v8-full/scene.blend"), ("editable_template", "gpu-package/original-ident-v6.py"),
        ("editable_request", "gpu-package/original-ident-v8-preview.json"),
        ("audio_source", "audio/ident-v8/ident.wav"), ("audio_receipt", "audio/ident-v8/audio-receipt.json")]),
    asset("endpoint-i2v-transform", "video", "morph-i2v-65f/paper-to-yacht-single-vessel/video.mp4", "morph-i2v-65f/paper-to-yacht-single-vessel/receipt.json", "morph-i2v-review/creative-verdict.json", "rejected"),
    asset("trained-flf-transform", "video", "flf-transform-preview/paper-to-yacht-trained-flf/video.mp4", "flf-transform-preview/paper-to-yacht-trained-flf/receipt.json", "flf-transform-preview-review/creative-verdict.json", "rejected"),
]
if (ROOT / "vace14b-review/creative-verdict.json").exists():
    review = json.loads((ROOT / "vace14b-review/creative-verdict.json").read_text())
    entries.append(asset("structural-transform-vace14b", "video", "vace14b-edges/video.mp4", "vace14b-edges/receipt.json", "vace14b-review/creative-verdict.json", "accepted_private_visual_asset" if review["accepted"] else "rejected"))
else:
    request = json.loads((ROOT / "gpu-package/vace14b-edge-request-template.json").read_text())
    entries.append({"assetId": "structural-transform-vace14b", "type": "video", "status": "generating_pending_all_frame_review", "artifact": None,
                    "request": reference("gpu-package/vace14b-edge-request-template.json"),
                    "provenance": {"model": "Wan-AI/Wan2.1-VACE-14B-diffusers", "modelRevision": "db79b90c60bbb45ceec9e41b9d5a4df934538ac4",
                                   "modelPreparationReceipt": reference("vace14b-model-evidence/model-receipt.json"),
                                   "sourceBrief": request["sourceBrief"], "seed": request["seed"],
                                   "sourceHashes": {k: v for k, v in request.items() if k.endswith("Sha256")},
                                   "settings": {"width": 832, "height": 480, "frames": 81, "fps": 16, "steps": 30,
                                                "conditioning": "single connected unfolding geometry; first/last photographic endpoints"}},
                    "wholeFilmCreativeApproval": False})
(ROOT / "asset-catalog-current.json").write_text(json.dumps({"at": datetime.now(timezone.utc).isoformat(), "status": "PRIVATE_ASSET_CHECKPOINT_NOT_FINISHED_FILM", "assets": entries, "publicApproved": False, "ordinaryStudioQualification": False}, indent=2) + "\n")
print(json.dumps({"assets": len(entries), "approvedFilms": 0}))
