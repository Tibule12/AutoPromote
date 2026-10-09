#!/usr/bin/env python3
"""Copy the renderer's existing caption definitions into the editable preview.

Run --check in validation to catch drift. AST reading needs no worker imports,
models, GPU, credentials, network access or new caption presets.
"""
import argparse
import ast
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / "python_media_worker/main_media_server.py"
destination = root / "frontend/src/components/studioCaptionRenderStyles.json"
tree = ast.parse(source.read_text())
styles = next(ast.literal_eval(node.value) for node in tree.body
              if isinstance(node, ast.Assign)
              and any(isinstance(target, ast.Name) and target.id == "CAPTION_STYLES"
                      for target in node.targets))
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
expected = json.dumps(styles, indent=2, sort_keys=True) + "\n"
if args.check:
    if not destination.exists() or destination.read_text() != expected:
        raise SystemExit("Studio caption preview definitions differ from the renderer. Run sync-studio-caption-styles.py.")
    print(f"{len(styles)} existing caption styles match the renderer")
else:
    destination.write_text(expected)
    print(f"Synced {len(styles)} existing renderer caption styles")
