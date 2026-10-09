#!/usr/bin/env python3
"""Offline NVIDIA vision planner. Exchanges bounded JSON through a local spool.

Model preparation is separate. Run inference with Docker --network none. This
process has no browser, credentials, cloud client or ability to execute actions.
"""
import argparse
import base64
from datetime import datetime, timezone
import io
import json
import os
from pathlib import Path
import time

from PIL import Image

MODEL = "Qwen/Qwen3-VL-8B-Instruct"
REVISION = "0c351dd01ed87e9c1b53cbc748cba10e6187ff3b"


def grammar_schema(value):
    """Preserve constraints when LMFE expands nullable JSON-schema types."""
    if isinstance(value, list):
        return [grammar_schema(item) for item in value]
    if not isinstance(value, dict):
        return value
    result = {key: grammar_schema(item) for key, item in value.items()}
    if isinstance(result.get("type"), list):
        types = result.pop("type")
        return {"anyOf": [{"type": kind, **(result if kind != "null" else {})} for kind in types]}
    return result


def main():
    import torch
    from lmformatenforcer import JsonSchemaParser
    from lmformatenforcer.integrations.transformers import build_transformers_prefix_allowed_tokens_fn
    from transformers import AutoProcessor, AutoModelForImageTextToText
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--spool", type=Path, required=True)
    parser.add_argument("--expected-gpu", default="NVIDIA L40S")
    parser.add_argument("--deadline", default="2026-10-06T20:02:00+00:00")
    args = parser.parse_args()
    deadline = datetime.fromisoformat(args.deadline)
    if deadline.tzinfo is None or datetime.now(timezone.utc) >= deadline:
        raise RuntimeError("An unexpired authorized UTC deadline is required before loading the GPU model")
    if not torch.cuda.is_available() or args.expected_gpu not in torch.cuda.get_device_name(0):
        raise RuntimeError("Authorized NVIDIA GPU unavailable")
    args.spool.mkdir(parents=True, exist_ok=True)
    processor = AutoProcessor.from_pretrained(args.model_dir, local_files_only=True, min_pixels=256 * 28 * 28, max_pixels=1024 * 28 * 28)
    model = AutoModelForImageTextToText.from_pretrained(args.model_dir, local_files_only=True,
             torch_dtype=torch.bfloat16, device_map="cuda", attn_implementation="sdpa").eval()
    print(json.dumps({"event": "planner_ready", "gpu": torch.cuda.get_device_name(0), "model": MODEL, "revision": REVISION}), flush=True)
    while datetime.now(timezone.utc) < deadline:
        for request in sorted(args.spool.glob("*.request.json")):
            result_path = request.with_name(request.name.replace(".request.json", ".response.json"))
            if result_path.exists():
                continue
            clock = time.monotonic()
            result = {}
            text = None
            try:
                if request.stat().st_size > 8_000_000:
                    raise ValueError("Planner request too large")
                data = json.loads(request.read_text())
                if data.get("expires_at", 0) < time.time():
                    raise ValueError("Planner request expired before inference")
                if (deadline - datetime.now(timezone.utc)).total_seconds() < 60:
                    raise ValueError("Insufficient authorized GPU time for another decision")
                image = Image.open(io.BytesIO(base64.b64decode(data["image"]))).convert("RGB") if data.get("image") else None
                content = [{"type": "text", "text": json.dumps(data["input"], separators=(",", ":"))}]
                if image:
                    content.insert(0, {"type": "image", "image": image})
                schema = grammar_schema(data["schema"])
                allowed_refs = [control["ref"] for frame in data["input"]["observation"]["frames"] for control in frame["controls"]]
                schema["properties"]["target"] = {"anyOf": [{"type": "null"}, {"type": "string", "enum": allowed_refs}]} if allowed_refs else {"type": "null"}
                system = data["system"] + "\nReturn ONLY a JSON object matching this schema. No markdown. Keep reason to one short sentence.\n" + json.dumps(schema, separators=(",", ":"))
                example = {"type": "click", "target": "example-ref", "value": None, "url": None,
                    "pageId": None, "deltaY": None, "durationMs": None, "operationId": None,
                    "reason": "Open the workspace and inspect its next screen.", "expect": [{"type": "state_changed",
                        "role": None, "name": None, "value": None, "pageId": None, "frameIndex": None}]}
                modal_example = {**example, "target": "modal-example-ref", "reason": "Continue from the modal and inspect the next editing screen."}
                messages = [{"role": "system", "content": [{"type": "text", "text": system}]},
                    {"role": "user", "content": [{"type": "text", "text": 'Example only: goal is to edit a document. Current page contains button Open workspace, ref example-ref. Its next screen is unknown. Choose the immediate action, not the final task outcome.'}]},
                    {"role": "assistant", "content": [{"type": "text", "text": json.dumps(example)}]},
                    {"role": "user", "content": [{"type": "text", "text": 'Example only: final goal is exporting an edited document. Current modal has button Continue editing, ref modal-example-ref. No export has occurred. Choose only the immediate step; the next editing screen is unknown.'}]},
                    {"role": "assistant", "content": [{"type": "text", "text": json.dumps(modal_example)}]},
                    {"role": "user", "content": content}]
                inputs = processor.apply_chat_template(messages, add_generation_prompt=True, tokenize=True,
                          return_dict=True, return_tensors="pt").to("cuda")
                prefix = build_transformers_prefix_allowed_tokens_fn(processor.tokenizer, JsonSchemaParser(schema))
                with torch.inference_mode():
                    outputs = model.generate(**inputs, max_new_tokens=900, do_sample=False, repetition_penalty=1.05, prefix_allowed_tokens_fn=prefix)
                text = processor.decode(outputs[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True).strip()
                if text.startswith("```"):
                    text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                action = json.loads(text)
                if isinstance(action, dict) and set(action) == {"action"} and isinstance(action["action"], dict):
                    action = action["action"]
                result = {"action": action, "model": MODEL, "revision": REVISION, "gpu": torch.cuda.get_device_name(0),
                          "input_tokens": int(inputs["input_ids"].shape[-1]), "output_tokens": int(outputs.shape[-1] - inputs["input_ids"].shape[-1]),
                          "seconds": time.monotonic() - clock}
            except Exception as error:
                result = {"error": str(error)[:1200], "seconds": time.monotonic() - clock}
                if text is not None:
                    result["diagnostic_output"] = text[:5000]
            temporary = result_path.with_suffix(".tmp")
            temporary.write_text(json.dumps(result))
            os.chmod(temporary, 0o600)
            temporary.replace(result_path)
            print(json.dumps({"event": "planner_response", "request": request.name, "seconds": result["seconds"], "ok": "action" in result}), flush=True)
        time.sleep(.15)


if __name__ == "__main__":
    main()
