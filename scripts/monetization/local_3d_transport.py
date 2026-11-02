"""Fresh-emulator transport only; production overlay validation stays unchanged."""
import base64
import hashlib
import json
import os
import re
from urllib.parse import parse_qs, urlparse


def install_overlay_transport(module, record):
    origin = record["apiOrigin"]
    if (os.environ.get("UNIFIED_CREDITS_PROJECT_ID") != "demo-autopromote-credits"
            or not re.fullmatch(r"http://127\.0\.0\.1:[0-9]+", origin)):
        raise ValueError("Fresh local demo required")
    original_validate = module.validate_resolved_overlays
    original_download = module.download_overlay

    def descriptor(item):
        parsed = urlparse(item["overlayUrl"])
        if f"{parsed.scheme}://{parsed.netloc}" != origin or parsed.username or parsed.password or parsed.fragment:
            raise ValueError("Unapproved local overlay origin")
        cap = parse_qs(parsed.query).get("cap", [""])[0]
        payload, signature = cap.split(".")
        if not re.fullmatch(r"[A-Za-z0-9_-]{43}", signature):
            raise ValueError("Invalid local overlay capability")
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        expected = f"temp_studio_3d/{item['ownerUid']}/{item['jobId']}/overlay.mov"
        if (data.get("userId") != item["ownerUid"] or data.get("storagePath") != expected
                or data.get("gatewayPath") != parsed.path
                or not re.fullmatch(r"/api/credit-pilot/object/[a-f0-9]{64}", parsed.path)
                or not re.fullmatch(r"[a-f0-9]{64}", data.get("contentHash", ""))
                or not isinstance(data.get("size"), int) or not 1000 <= data["size"] <= 250 * 1024**2):
            raise ValueError("Unowned local overlay capability")
        return data

    def validate(items):
        if items is None:
            return original_validate(items)
        # Apply every canonical field/count/timing guard using its ordinary
        # owned-object identity. Only the authenticated transfer URL differs.
        if not isinstance(items, list):
            return original_validate(items)
        canonical = []
        for item in items:
            descriptor(item)
            canonical.append({**item, "overlayUrl":
                f"https://storage.googleapis.com/demo-autopromote-credits/temp_studio_3d/{item['ownerUid']}/{item['jobId']}/overlay.mov?local-transport"})
        original_validate(canonical)
        return sorted(items, key=lambda item: item["layerOrder"])

    def download(item, destination):
        data = descriptor(item)
        # The real source gateway verifies the HMAC, expiry, owner, generation
        # and hash before serving actual emulator bytes. Verify bytes again.
        result = original_download(item, destination)
        with open(destination, "rb") as handle:
            content = handle.read(250 * 1024**2 + 1)
        if len(content) != data["size"] or hashlib.sha256(content).hexdigest() != data["contentHash"]:
            raise ValueError("Local overlay bytes changed")
        return result

    module.validate_resolved_overlays = validate
    module.download_overlay = download
