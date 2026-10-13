"""Reuse reviewed source-effect frames in the existing media export pipeline.

This lightweight boundary does not load Torch or infer a new mask. Source audio
stays in the existing audio path, including J/L cuts and speed changes.
"""
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
from urllib.parse import urlparse, unquote
import requests

def file_hash(path):
    value=hashlib.sha256()
    with open(path,"rb") as file:
        for block in iter(lambda:file.read(1024*1024),b""): value.update(block)
    return value.hexdigest()

def validate_resolved_subject_vfx(items):
    if items is None: return []
    if not isinstance(items,list) or len(items)>8: raise ValueError("Invalid resolved subject renders")
    required={"jobId","ownerUid","source_clip_id","start_time","end_time","url","sha256","pixel_sha256","source_sha256"}
    for item in items:
        if not isinstance(item,dict) or set(item)!=required: raise ValueError("Invalid subject render reference fields")
        if any(not isinstance(item[key],str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}",item[key]) for key in ("jobId","ownerUid")): raise ValueError("Invalid subject render identity")
        if not isinstance(item["source_clip_id"],str) or not 1<=len(item["source_clip_id"])<=160: raise ValueError("Invalid subject source identity")
        if any(not isinstance(item[key],str) or not re.fullmatch(r"[a-f0-9]{64}",item[key]) for key in ("sha256","pixel_sha256","source_sha256")): raise ValueError("Invalid subject render digest")
        start,end=item["start_time"],item["end_time"]
        if any(isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) for value in (start,end)) or start<0 or not .25<=end-start<=10: raise ValueError("Invalid subject source range")
        if not isinstance(item["url"],str) or len(item["url"])>8192: raise ValueError("Invalid subject media URL")
        url=urlparse(item["url"]);path=unquote(url.path)
        expected=f"/temp_studio_vfx/{item['ownerUid']}/{item['jobId']}/render.mp4"
        if url.scheme!="https" or url.hostname!="storage.googleapis.com" or url.username or url.password or not url.query or not path.endswith(expected) or ".." in path: raise ValueError("Subject media must be an owned signed storage object")
    for a,left in enumerate(items):
        if any(left["source_clip_id"]==right["source_clip_id"] and left["start_time"]<right["end_time"] and right["start_time"]<left["end_time"] for right in items[a+1:]): raise ValueError("Overlapping subject render ranges")
    return items

def match_subject_vfx(items,source_id,start,end):
    matches=[item for item in items if item["source_clip_id"]==str(source_id) and start<item["end_time"] and end>item["start_time"]]
    if not matches: return None
    if len(matches)!=1 or start<matches[0]["start_time"]-.001 or end>matches[0]["end_time"]+.001: raise ValueError("Split the timeline at subject effect range edges")
    return matches[0]

def download_subject_vfx(item,destination):
    validate_resolved_subject_vfx([item])
    total=0
    with requests.get(item["url"],stream=True,timeout=(15,60),allow_redirects=False) as response:
        response.raise_for_status()
        if response.status_code!=200: raise ValueError("Subject media redirects are not accepted")
        with open(destination,"wb") as output:
            for block in response.iter_content(1024*1024):
                total+=len(block)
                if total>75*1024*1024: raise ValueError("Subject render exceeds 75 MB")
                output.write(block)
    if file_hash(destination)!=item["sha256"]: raise ValueError("Reviewed subject render checksum changed")
    probe=json.loads(subprocess.run(["ffprobe","-v","error","-count_frames","-show_streams","-of","json",str(destination)],capture_output=True,text=True,check=True,timeout=60).stdout)
    streams=[stream for stream in probe["streams"] if stream.get("codec_type")=="video"]
    seconds=item["end_time"]-item["start_time"]
    if len(streams)!=1 or streams[0].get("codec_name")!="h264" or streams[0].get("pix_fmt")!="yuv420p" or streams[0].get("avg_frame_rate")!="24/1" or int(streams[0]["nb_read_frames"])!=math.floor(seconds*24+.5) or abs(float(streams[0]["duration"])-seconds)>1/24+.001: raise ValueError("Reviewed subject render picture clock changed")
    return str(destination)

def subject_video_input(items,source_id,start,end,original,rendered_paths,verified_sources):
    item=match_subject_vfx(items,source_id,start,end)
    if item is None: return str(original),start
    identity=(str(original),item["source_sha256"])
    if identity not in verified_sources:
        if file_hash(original)!=item["source_sha256"]: raise ValueError("Original source no longer matches its reviewed subject render")
        verified_sources.add(identity)
    return rendered_paths[item["jobId"]],max(0,start-item["start_time"])
