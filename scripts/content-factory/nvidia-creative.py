#!/usr/bin/env python3
"""Pinned offline NVIDIA creative planner/critic. No browser or cloud clients."""
import argparse
import hashlib
import json
from pathlib import Path
import time

MODEL = "Qwen/Qwen3-VL-8B-Instruct"
REVISION = "0c351dd01ed87e9c1b53cbc748cba10e6187ff3b"

def run(args):
    import torch
    from PIL import Image
    from transformers import AutoProcessor, AutoModelForImageTextToText
    from lmformatenforcer import JsonSchemaParser
    from lmformatenforcer.integrations.transformers import build_transformers_prefix_allowed_tokens_fn
    data = json.loads(args.request.read_text())
    if time.time() + 120 >= data["deadlineEpoch"]:
        raise RuntimeError("Insufficient authorized NVIDIA time")
    if not torch.cuda.is_available() or torch.cuda.get_device_name(0) != "NVIDIA L40S":
        raise RuntimeError("Existing authorized NVIDIA L40S required")
    processor = AutoProcessor.from_pretrained(args.model_dir, local_files_only=True,
        min_pixels=128*28*28, max_pixels=512*28*28 if any(x.get('frames') for x in data.get('requests',[data])) else 1280*28*28)
    model = AutoModelForImageTextToText.from_pretrained(args.model_dir, local_files_only=True,
        torch_dtype=torch.bfloat16, device_map="cuda", attn_implementation="sdpa").eval()
    results = []
    requests = data.get("requests", [data])
    for item in requests:
        if time.time() + 60 >= data["deadlineEpoch"]:
            raise RuntimeError("NVIDIA deadline reached")
        task_input=dict(item["input"])
        if item.get("contextFrom"):
            prior={r["id"]:r["value"] for r in results}
            task_input["priorStages"]={key:prior[key] for key in item["contextFrom"]}
        content = [{"type":"text", "text":json.dumps(task_input,ensure_ascii=False)}]
        evidence_sha = None
        frame_evidence=[]
        if item.get('frames'):
            if not 2<=len(item['frames'])<=16:raise RuntimeError('Invalid visual evidence count')
            visuals=[]
            for frame in item['frames']:
                p=Path(frame['path']);sha=hashlib.sha256(p.read_bytes()).hexdigest()
                if frame.get('sha256')!=sha:raise RuntimeError('Visual evidence hash mismatch')
                frame_evidence.append({'timestamp':frame['timestamp'],'sha256':sha})
                visuals.extend([{'type':'text','text':f"Actual sampled frame at {frame['timestamp']:.3f} seconds"},{'type':'image','image':Image.open(p).convert('RGB')}])
            content=visuals+content
            evidence_sha=hashlib.sha256(json.dumps(frame_evidence,sort_keys=True).encode()).hexdigest()
        if item.get("image"):
            p = Path(item["image"])
            evidence_sha = hashlib.sha256(p.read_bytes()).hexdigest()
            content.insert(0, {"type":"image", "image":Image.open(p).convert("RGB")})
        schema = item["schema"]
        repairs=[]
        if item.get('entitySchemaFrom'):
            breakdown=task_input['priorStages'][item['entitySchemaFrom']]
            names=list(dict.fromkeys(item.get('existingEntityNames',[])+[e['name'] for e in breakdown['props']+breakdown['characterDesigns']]))
            if not names:raise RuntimeError('Scene generation needs established entities')
            schema['properties']['shots']['items']['properties']['entityNames']['items']={'enum':names}
            schema['properties']['continuity']['items']['properties']['entityName']={'enum':names}
        if item.get('id')=='edits' and task_input.get('priorStages',{}).get('assets'):
            # Resolve IDs from the actual previous stage rather than asking
            # the model to recall display names or original library names.
            assets=task_input['priorStages']['assets']['assets'];visual=[x['assetId'] for x in assets if x['type']!='audio'];audio=[x['assetId'] for x in assets if x['type']=='audio']
            library={x['libraryRef']:x for x in task_input.get('availableLibrary',[])}
            music=[x['assetId'] for x in assets if x['type']=='audio' and (x['provider']=='original_audio' or library.get(x.get('libraryRef'),{}).get('audioRole')=='music')]
            output=schema['properties']['outputs']['items']['properties']
            output['sequence']['items']['properties']['assetId']={'enum':visual}
            output['musicAssetId']={'enum':music} if music else {'type':'null'}
            if audio:output['audioCues']['items']['properties']['assetId']={'enum':audio}
            else:output['audioCues']['maxItems']=0
        instruction = item["system"] + "\nReturn only JSON matching this schema. Never claim a person reviewed this.\n" + json.dumps(schema)
        messages = [{"role":"system","content":[{"type":"text","text":instruction}]}, {"role":"user","content":content}]
        inputs = processor.apply_chat_template(messages, add_generation_prompt=True, tokenize=True,
            return_dict=True, return_tensors="pt").to("cuda")
        prefix = build_transformers_prefix_allowed_tokens_fn(processor.tokenizer, JsonSchemaParser(schema))
        started = time.monotonic()
        with torch.inference_mode():
            result = model.generate(**inputs, max_new_tokens=item.get("maxTokens", 4500),
                do_sample=False, repetition_penalty=1.05, prefix_allowed_tokens_fn=prefix)
        completion=processor.decode(result[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True).strip()
        try:value=json.loads(completion)
        except json.JSONDecodeError:
            args.output.with_name(args.output.stem+"-incomplete.txt").write_text(completion)
            raise RuntimeError(f"Incomplete structured {item.get('id')} response at token limit {item.get('maxTokens',4500)}; preserved completion for recovery")
        raw_value=json.loads(completion)
        if item.get('id')=='assets' and task_input.get('availableLibrary'):
            library={x['libraryRef']:x for x in task_input['availableLibrary']}
            music_sources=[x for x in library.values() if x.get('audioRole')=='music']
            has_music=any(library.get(x.get('libraryRef'),{}).get('audioRole')=='music' for x in value['assets'])
            if not has_music and len(music_sources)==1 and len(value['assets'])<12:
                source=music_sources[0];beat=task_input['priorStages']['direction']['script'][0]['beatId']
                value['assets'].append({'assetId':'factory-original-score','type':'audio','provider':'reuse','libraryRef':source['libraryRef'],
                    'beatId':beat,'duration':source['duration'],'seed':0,'prompt':'Use the available original score for the complete story',
                    'reason':'The brief requests original score; speech must remain on the separate voiceover bus',
                    'acceptanceCriteria':['Audible stereo audio','48000 Hz sample rate','No clipped samples','Duration covers the complete output']})
                repairs.append({'assetId':'factory-original-score','reason':'Required original score dependency resolved from the sole owner-approved music source; narrator cannot serve as score'})
        results.append({"id":item.get("id"), "value":value, "rawValue":raw_value,"contractRepairs":repairs, "model":MODEL, "modelRevision":REVISION,
            "settings":{"dtype":"bfloat16","attention":"sdpa","do_sample":False,"max_tokens":item.get("maxTokens",4500)},
            "evidenceSha256":evidence_sha,"frameEvidence":frame_evidence, "seconds":time.monotonic()-started, "gpu":torch.cuda.get_device_name(0)})
        print(json.dumps({"event":"creative_result","id":item.get("id"),"seconds":results[-1]["seconds"]}), flush=True)
        args.output.write_text(json.dumps(results, indent=2))

if __name__ == "__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--request",type=Path,required=True);p.add_argument("--output",type=Path,required=True)
    p.add_argument("--model-dir",type=Path,required=True)
    run(p.parse_args())
