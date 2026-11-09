import json
from unittest.mock import Mock
import pytest
import studio_subject_vfx_job as job

def spec():
    return {"sourceUrl":"https://storage.googleapis.com/private/source.mp4?signature=local-test","requestHash":"a"*64,"scene":{"sourceRange":{"start":2,"end":8.01},"prompt":{"points":[[.5,.3]],"labels":[1],"shotPrompts":[]},"effects":[{"id":"title","type":"text_behind","start":0,"end":6.01,"text":"STORY","x":50,"y":45,"font_size":100,"color":"#f5f1ed"}]}}

def test_normalization_uses_nvenc_and_explicit_nearest_frame_clock(tmp_path,monkeypatch):
    response=Mock(status_code=200);response.iter_content.return_value=[b"original"]
    response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False)
    monkeypatch.setattr(job.requests,"get",Mock(return_value=response));run=Mock();monkeypatch.setattr(job.subprocess,"run",run)
    job.materialize(spec(),tmp_path)
    command=run.call_args.args[0]
    assert command[command.index("-c:v")+1]=="h264_nvenc"
    assert command[command.index("-frames:v")+1]=="144"
    assert command[command.index("-t")+1]=="6.0"
    assert "0:a?" in command

def test_strict_effect_validation_precedes_inference_and_clamps_only_frame_boundary(tmp_path,monkeypatch):
    original=tmp_path/"original.mp4";original.write_bytes(b"original")
    source=tmp_path/"source.mp4";source.write_bytes(b"normalized")
    monkeypatch.setattr(job.subprocess,"run",Mock(return_value=Mock(stdout="NVIDIA L40S")))
    monkeypatch.setattr(job,"materialize",lambda _spec,_work:(original,source))
    monkeypatch.setattr(job,"video_geometry",lambda _path:{"width":640,"height":360,"fps":24,"frame_count":144})
    monkeypatch.setenv("STUDIO_VFX_MODEL_DIR",str(tmp_path/"offline-model"))
    def matte(_source,prompt,_model,path,**kwargs):
        path.mkdir();(path/"manifest.json").write_text("{}");assert prompt["points"]==[[320,108]]
    inference=Mock(side_effect=matte);monkeypatch.setattr(job,"generate_matte",inference)
    render=Mock(return_value={"frames":144,"seconds":6,"encoder":"h264_nvenc"});monkeypatch.setattr(job,"render_vfx",render)
    value=spec();job.execute(value,tmp_path)
    assert render.call_args.args[2]["effects"][0]["end"]==6
    assert value["scene"]["effects"][0]["end"]==6.01
    assert json.loads((tmp_path/"result.json").read_text())["original_source_sha256"]==job.sha256(original)
    value["scene"]["effects"][0]["script"]="bad";inference.reset_mock()
    with pytest.raises(ValueError,match="unknown command"): job.execute(value,tmp_path)
    inference.assert_not_called()
