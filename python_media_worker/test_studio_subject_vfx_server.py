import json
import threading
import time
from unittest.mock import Mock
import pytest
from fastapi.testclient import TestClient
import studio_subject_vfx_server as worker

SECRET="local-worker-test-secret-32-characters"
HEADERS={"Authorization":f"Bearer {SECRET}"}
def spec():
    return {"jobId":"test-job-123","ownerUid":"owner","requestHash":"a"*64,"sourceUrl":"https://storage.googleapis.com/bucket/source.mp4?signature=one","scene":{"sourceRange":{"start":2,"end":8}}}

@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setenv("STUDIO_NVIDIA_VFX_SECRET",SECRET)
    monkeypatch.setenv("NVIDIA_SERVICE_DEADLINE_EPOCH",str(time.time()+600))
    monkeypatch.setenv("STUDIO_VFX_JOB_ROOT",str(tmp_path))
    monkeypatch.setattr(worker,"lock",threading.Lock())
    monkeypatch.setattr(worker,"process_lock",threading.Lock())
    monkeypatch.setattr(worker,"processes",{})
    monkeypatch.setattr(worker,"gpu_available",lambda:True)
    monkeypatch.setattr(worker.threading,"Thread",Mock(return_value=Mock()))
    return TestClient(worker.app)

def test_unauthenticated_or_expired_never_launches(client,monkeypatch):
    assert client.post("/jobs",json=spec()).status_code==401
    monkeypatch.setenv("NVIDIA_SERVICE_DEADLINE_EPOCH",str(time.time()-1))
    assert client.post("/jobs",json=spec(),headers=HEADERS).status_code==503
    worker.threading.Thread.assert_not_called()

def test_busy_gpu_is_checked_before_launch(client,monkeypatch):
    monkeypatch.setattr(worker,"gpu_available",lambda:False)
    assert client.post("/jobs",json=spec(),headers=HEADERS).status_code==429
    worker.threading.Thread.assert_not_called()

def test_duplicate_id_rotates_source_url_without_another_job(client,monkeypatch):
    assert client.post("/jobs",json=spec(),headers=HEADERS).status_code==202
    value=spec();value["sourceUrl"]="https://storage.googleapis.com/bucket/source.mp4?signature=two"
    monkeypatch.setenv("NVIDIA_SERVICE_DEADLINE_EPOCH",str(time.time()-1))
    duplicate=client.post("/jobs",json=value,headers=HEADERS)
    assert duplicate.status_code==202 and duplicate.json()["reused"]
    assert worker.threading.Thread.call_count==1
    value["scene"]["sourceRange"]["end"]=9
    assert client.post("/jobs",json=value,headers=HEADERS).status_code==409

def test_cancel_queued_job_before_thread_entry_cannot_launch(client,monkeypatch):
    assert client.post("/jobs",json=spec(),headers=HEADERS).status_code==202
    assert client.delete("/jobs/test-job-123",headers=HEADERS).json()["status"]=="cancelled"
    popen=Mock();monkeypatch.setattr(worker.subprocess,"Popen",popen)
    worker.run_job("test-job-123")
    popen.assert_not_called()
    assert not worker.lock.locked()
    assert client.get("/jobs/test-job-123",headers=HEADERS).json()["status"]=="cancelled"

def test_restart_fails_saved_inflight_job_without_resubmitting(client):
    client.post("/jobs",json=spec(),headers=HEADERS)
    worker.reconcile_restart()
    state=client.get("/jobs/test-job-123",headers=HEADERS).json()
    assert state["status"]=="failed" and "not submitted again" in state["error"]
    assert "fingerprint" not in state
    assert client.get("/jobs/test-job-123/media",headers=HEADERS).status_code==409

@pytest.mark.parametrize("field,value",[("requestHash",None),("ownerUid",["owner"]),("scene",None),("sourceUrl",2)])
def test_invalid_spec_is_rejected_before_gpu_launch(client,field,value):
    value_spec=spec();value_spec[field]=value
    assert client.post("/jobs",json=value_spec,headers=HEADERS).status_code==422
    worker.threading.Thread.assert_not_called()

def test_compute_occupancy_probe_refuses_existing_processes(monkeypatch):
    run=Mock(side_effect=[Mock(stdout="NVIDIA L40S\n"),Mock(stdout="4352\n")]);monkeypatch.setattr(worker.subprocess,"run",run)
    assert not worker.gpu_available()
    assert "--query-compute-apps=pid" in run.call_args_list[1].args[0]

def test_explicit_cpu_composition_window_is_bounded(monkeypatch):
    monkeypatch.delenv('STUDIO_VFX_CPU_TIMEOUT_SECONDS',raising=False)
    assert worker.cpu_timeout()==1100
    monkeypatch.setenv('STUDIO_VFX_CPU_TIMEOUT_SECONDS','2400')
    assert worker.cpu_timeout()==2400
    for value in ['0','3601','invalid']:
        monkeypatch.setenv('STUDIO_VFX_CPU_TIMEOUT_SECONDS',value)
        with pytest.raises(ValueError):worker.cpu_timeout()

def test_cpu_artifact_composition_never_probes_or_requires_gpu(client,monkeypatch):
    monkeypatch.setenv('STUDIO_VFX_MODE','model_artifact_cpu')
    monkeypatch.setenv('STUDIO_MODEL_VFX_SECRET',SECRET)
    monkeypatch.delenv('NVIDIA_SERVICE_DEADLINE_EPOCH')
    gpu=Mock(side_effect=AssertionError('CPU composition must not probe a GPU'))
    monkeypatch.setattr(worker,'gpu_available',gpu)
    value=spec()
    value['scene']['effects']=[]
    value['modelInput']={'schemaVersion':1,'artifactHash':'b'*64,'sourceSha256':'c'*64,
        'sourceRange':{'space':'source','startTick':180000,'endTick':720000},
        'manifestSha256':'d'*64,'frameCount':144,'width':960,'height':540,
        'files':{key:{'url':'https://storage.googleapis.com/bucket/'+key+'?signature=one','sha256':'e'*64,'bytes':1024}
                 for key in ['normalizedSource','maskBundle']}}
    assert client.post('/jobs',json=value,headers=HEADERS).status_code==202
    assert client.get('/health',headers=HEADERS).json()['gpuCount']==0
    for ref in value['modelInput']['files'].values():ref['url']=ref['url'].replace('one','two')
    response=client.post('/jobs',json=value,headers=HEADERS)
    assert response.status_code==202 and response.json()['reused']
    value['modelInput']['artifactHash']='f'*64
    assert client.post('/jobs',json=value,headers=HEADERS).status_code==409
    gpu.assert_not_called()

def test_detailed_cpu_scene_has_a_bounded_request_budget_without_expanding_gpu_limit(client,monkeypatch):
    import studio_model_subject_vfx_job as model_job
    value=spec();value['scene']['editable_detail']='x'*40000
    assert client.post('/jobs',json=value,headers=HEADERS).status_code==413
    monkeypatch.setenv('STUDIO_VFX_MODE','model_artifact_cpu')
    monkeypatch.setenv('STUDIO_MODEL_VFX_SECRET',SECRET)
    monkeypatch.setattr(model_job,'valid_model_input',lambda _:None)
    monkeypatch.setattr(model_job,'valid_replacement_assets',lambda _:None)
    value['modelInput']={'files':{}}
    assert client.post('/jobs',json=value,headers=HEADERS).status_code==202
    value['scene']['editable_detail']='x'*(256*1024)
    assert client.post('/jobs',json=value,headers=HEADERS).status_code==413
    assert worker.threading.Thread.call_count==1
