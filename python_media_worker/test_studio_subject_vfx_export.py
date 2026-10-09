from copy import deepcopy
import hashlib
import json
from unittest.mock import Mock
import pytest
import studio_subject_vfx_export as export

def reference():
    return {"jobId":"test-job-123","ownerUid":"owner","source_clip_id":"source-a","start_time":2,"end_time":8,"url":"https://storage.googleapis.com/private/temp_studio_vfx/owner/test-job-123/render.mp4?X-Goog-Signature=test","sha256":"a"*64,"pixel_sha256":"b"*64,"source_sha256":"c"*64}

def test_source_clock_survives_splits_and_other_clips_use_original(tmp_path):
    original=tmp_path/"original.mp4";original.write_bytes(b"original source bytes")
    item=reference();item["source_sha256"]=export.file_hash(original)
    reviewed={item["jobId"]:"reviewed.mp4"};verified=set()
    assert export.subject_video_input([item],"source-a",5,8,original,reviewed,verified)==("reviewed.mp4",3)
    assert export.subject_video_input([item],"source-a",2,5,original,reviewed,verified)==("reviewed.mp4",0)
    assert export.subject_video_input([item],"source-b",5,8,original,reviewed,verified)==(str(original),5)
    with pytest.raises(ValueError,match="Split"):
        export.subject_video_input([item],"source-a",1,5,original,reviewed,verified)

def test_changed_original_source_cannot_reuse_reviewed_frames(tmp_path):
    original=tmp_path/"original.mp4";original.write_bytes(b"replacement bytes")
    with pytest.raises(ValueError,match="Original source"):
        export.subject_video_input([reference()],"source-a",2,5,original,{"test-job-123":"reviewed.mp4"},set())

@pytest.mark.parametrize("change",[{"url":"http://127.0.0.1/render.mp4"},{"url":"https://storage.googleapis.com/private/temp_studio_vfx/another/test-job-123/render.mp4?signature=test"},{"start_time":float("nan")},{"end_time":20},{"sha256":"x"*64},{"script":"anything"}])
def test_forged_or_invalid_reference_cannot_enter_export(change):
    with pytest.raises(ValueError): export.validate_resolved_subject_vfx([{**reference(),**change}])

def test_download_checks_checksum_and_actual_picture_clock(tmp_path,monkeypatch):
    content=b"downloaded rendered bytes";item=reference();item["sha256"]=hashlib.sha256(content).hexdigest()
    response=Mock(status_code=200);response.iter_content.return_value=[content];response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False)
    monkeypatch.setattr(export.requests,"get",Mock(return_value=response))
    stream={"codec_type":"video","codec_name":"h264","pix_fmt":"yuv420p","avg_frame_rate":"24/1","nb_read_frames":"144","duration":"6.0"}
    probe=Mock(return_value=Mock(stdout=json.dumps({"streams":[stream]})));monkeypatch.setattr(export.subprocess,"run",probe)
    assert export.download_subject_vfx(item,tmp_path/"render.mp4")==str(tmp_path/"render.mp4")
    stream["nb_read_frames"]="143";probe.return_value.stdout=json.dumps({"streams":[stream]});response.iter_content.return_value=[content]
    with pytest.raises(ValueError,match="picture clock"): export.download_subject_vfx(item,tmp_path/"other.mp4")
    response.iter_content.return_value=[b"changed"]
    with pytest.raises(ValueError,match="checksum"): export.download_subject_vfx(item,tmp_path/"changed.mp4")
