const axios = require("axios");
jest.mock("axios", () => ({ post: jest.fn(), get: jest.fn() }));
jest.mock("../utils/cloudRunAuth", () => ({
  buildWorkerRequestConfig: jest.fn(async (url, config) => ({ ...config, headers: { Authorization: `identity:${new URL(url).host}` } })),
}));
jest.mock("../services/unifiedCredits/application", () => ({
  getApplicationContext: jest.fn(() => null), assertApplicationTransport: jest.fn(),
}));
jest.mock("../services/unifiedCredits/workerTransport", () => ({
  applicationWorkerConfig: jest.fn(async (_url, _body, config) => config),
}));
const application = require("../services/unifiedCredits/application");
const { selectMediaWorker, postMediaWorker, safeToFailOver, assertMediaWorkerReady, mediaWorkerHealth } = require("../services/mediaWorkerRouting");
const prior = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.MEDIA_WORKER_URL = "https://cpu.example";
  process.env.MEDIA_WORKER_GPU_URL = "https://gpu.example";
  delete process.env.MEDIA_WORKER_GPU_FALLBACK;
  delete process.env.MEDIA_WORKER_CPU_BUDGET_SECONDS;
  application.getApplicationContext.mockReturnValue(null);
});
afterAll(() => { process.env = prior; });

test("all speech sources use the GPU first, including short recordings", () => {
  expect(selectMediaWorker("/analyze-clips", { source_duration_seconds: 375 })).toMatchObject({device:"gpu",reason:"gpu_primary"});
  expect(selectMediaWorker("/analyze-clips", { source_duration_seconds: 20 })).toMatchObject({device:"gpu"});
  expect(selectMediaWorker("/analyze-clips")).toMatchObject({device:"gpu"});
});
test("render budget follows output timeline duration, not a long source's original duration", () => {
  expect(selectMediaWorker("/render-viral-clip", { timeline_segments:[{start_time:300,end_time:332.8,duration:32.8}], motion_graphics:{} })).toMatchObject({device:"gpu",sourceSeconds:32.8});
  expect(selectMediaWorker("/render-viral-clip", {start_time:0,end_time:180})).toMatchObject({device:"gpu"});
  expect(selectMediaWorker("/render-viral-clip", {start_time:0,end_time:40,export_settings:{resolution:"2160p"}})).toMatchObject({device:"gpu"});
  expect(selectMediaWorker("/render-viral-clip", {start_time:0,end_time:20,output_settings:{resolution:"2160p",fps:"60"}})).toMatchObject({device:"gpu"});
  expect(selectMediaWorker("/render-viral-clip", {source_duration_seconds:375,timeline_segments:[{duration:20}]})).toMatchObject({device:"gpu",sourceSeconds:20});
  expect(selectMediaWorker("/process-video", {source_duration_seconds:180})).toMatchObject({device:"gpu"});
});
test("native per-frame composition uses its raster cost before choosing or charging a worker", async () => {
  const payload = { timeline_segments: [{ duration: 10 }], output_settings: { resolution: "1080p", fps: "60" },
    overlays: [{ type: "video" }, { type: "image" }], composition_plan: { layers: [
      { id: "base", type: "video" }, { id: "portal", type: "video", motion_keyframes: [{ time: 1.2, property: "scale", value: .1 }] },
      { id: "rim", type: "image", motion_keyframes: [{ time: 7.4, property: "rotation", value: 80 }] },
    ] } };
  expect(selectMediaWorker("/render-viral-clip", payload)).toMatchObject({ device: "gpu", estimatedCpuSeconds: 160 });
  expect(selectMediaWorker("/render-viral-clip", { ...payload, timeline_segments: [{ duration: 4 }],
    output_settings: { resolution: "720p", fps: "30" } })).toMatchObject({ device: "gpu" });
  expect(selectMediaWorker("/render-viral-clip", { timeline_segments: [{ duration: 54.13 }],
    composition_plan: { layers: [{ id: "base", type: "video" }] } })).toMatchObject({ device: "gpu", estimatedCpuSeconds: 54.13 });
  axios.get.mockResolvedValueOnce({ data: { status: "ok", worker_state: { status: "idle" },
    computeDevice: "cuda", videoEncoder: "h264_nvenc", gpuRequired: true } });
  await expect(assertMediaWorkerReady(payload)).resolves.toMatchObject({ device: "gpu" });
  expect(axios.get.mock.calls[0][0]).toBe("https://gpu.example/health");
  axios.post.mockResolvedValueOnce({ data: { status: "completed" } });
  await postMediaWorker("/render-viral-clip", payload, { preferredDevice: "gpu" });
  expect(axios.post.mock.calls[0][0]).toBe("https://gpu.example/render-viral-clip");
  expect(axios.post.mock.calls[0][1]).toBe(payload);
});

test("local credit verification cannot escape its loopback worker onto a cloud GPU", () => {
  application.getApplicationContext.mockReturnValue({workerVerifier:{}});
  expect(selectMediaWorker("/analyze-clips", {source_duration_seconds:375})).toMatchObject({device:"cpu",gpuUrl:null});
  expect(() => selectMediaWorker("/analyze-clips", {}, {...process.env,MEDIA_WORKER_GPU_URL:"https://user:password@gpu.example"})).not.toThrow();
});
test("misconfigured external GPU credentials or insecure transport are rejected", () => {
  for(const url of ["http://gpu.example", "https://user:password@gpu.example", "https://gpu.example?token=x"])
    expect(() => selectMediaWorker("/analyze-clips",{}, {...process.env,MEDIA_WORKER_GPU_URL:url})).toThrow(/HTTPS worker origin/);
});
test("a pre-dispatch GPU busy response hands off the same render payload to CPU exactly once", async () => {
  const body={job_id:"same-owned-job",start_time:0,end_time:32.8,timeline_segments:[{duration:32.8}]};
  axios.post.mockRejectedValueOnce({response:{status:503,data:{detail:"Worker is busy. Try again"}}}).mockResolvedValueOnce({data:{status:"completed"}});
  const route=jest.fn();const result=await postMediaWorker("/render-viral-clip",body,{onRoute:route});
  expect(axios.post.mock.calls.map(c=>c[0])).toEqual(["https://gpu.example/render-viral-clip","https://cpu.example/render-viral-clip"]);
  expect(axios.post.mock.calls[0][1]).toBe(body);expect(axios.post.mock.calls[1][1]).toBe(body);
  expect(axios.post.mock.calls[1][2].headers.Authorization).toBe("identity:cpu.example");
  expect(result).toMatchObject({device:"cpu",routeReason:"gpu_unavailable"});expect(route).toHaveBeenCalledTimes(2);
});
test("an uncertain accepted render is never duplicated on another worker", async () => {
  const error={code:"ECONNABORTED"};axios.post.mockRejectedValueOnce(error);
  await expect(postMediaWorker("/render-viral-clip",{start_time:0,end_time:20})).rejects.toBe(error);
  expect(axios.post).toHaveBeenCalledTimes(1);expect(safeToFailOver({response:{status:502}},"/render-viral-clip")).toBe(false);
});
test("temporary GPU unavailability can still complete read-only analysis on the qualified CPU lane", async () => {
  axios.post.mockRejectedValueOnce({response:{status:503,data:"No available instance"}}).mockResolvedValueOnce({data:{scenes:[{start:0,end:30}]}});
  const result=await postMediaWorker("/analyze-clips",{source_duration_seconds:375});
  expect(result).toMatchObject({device:"cpu",routeReason:"gpu_unavailable"});expect(axios.post).toHaveBeenCalledTimes(2);
});
test("validation and authorization errors do not start a second processing attempt", async () => {
  for(const status of [400,401,403,422]){
    axios.post.mockReset();const error={response:{status}};axios.post.mockRejectedValueOnce(error);
    await expect(postMediaWorker("/analyze-clips",{source_duration_seconds:20})).rejects.toBe(error);expect(axios.post).toHaveBeenCalledTimes(1);
  }
});
test("GPU health is checked before charging even short renders and a busy GPU uses CPU", async () => {
  const readyGpu={status:"ok",worker_state:{status:"idle"},computeDevice:"cuda",videoEncoder:"h264_nvenc",gpuRequired:true};
  axios.get.mockResolvedValueOnce({data:readyGpu});
  await expect(assertMediaWorkerReady({end_time:180})).resolves.toMatchObject({device:"gpu"});expect(axios.get.mock.calls[0][0]).toBe("https://gpu.example/health");
  axios.get.mockReset();axios.get.mockResolvedValueOnce({data:{status:"ok",worker_state:{status:"busy"}}}).mockResolvedValueOnce({data:{status:"ok",worker_state:{status:"idle"}}});
  await expect(assertMediaWorkerReady({end_time:20})).resolves.toMatchObject({device:"cpu",reason:"gpu_unavailable"});
});
test("HTTP health without real GPU qualification uses CPU and dispatch honors that readiness choice", async () => {
  axios.get.mockResolvedValueOnce({data:{status:"ok",computeDevice:"cpu",videoEncoder:"libx264"}}).mockResolvedValueOnce({data:{status:"ok"}});
  const ready=await assertMediaWorkerReady({end_time:180});expect(ready.device).toBe("cpu");
  axios.post.mockResolvedValueOnce({data:{status:"completed"}});
  await postMediaWorker("/render-viral-clip",{job_id:"same-job",end_time:180},{preferredDevice:ready.device});
  expect(axios.post.mock.calls[0][0]).toBe("https://cpu.example/render-viral-clip");
});
test("analysis readiness warms the same selected worker and can recover from GPU capacity errors", async () => {
  axios.get.mockRejectedValueOnce({response:{status:503}}).mockResolvedValueOnce({data:{status:"ok"}});
  await expect(mediaWorkerHealth(375)).resolves.toMatchObject({data:{status:"ok"}});
  expect(axios.get.mock.calls.map(c=>c[0])).toEqual(["https://gpu.example/health","https://cpu.example/health"]);
});
test("GPU pre-dispatch busy renders can return to CPU without changing their identity", async () => {
  const body={job_id:"one-job",end_time:180};
  axios.post.mockRejectedValueOnce({response:{status:503,data:{detail:"Worker is busy"}}}).mockResolvedValueOnce({data:{status:"completed"}});
  const result=await postMediaWorker("/render-viral-clip",body);
  expect(result).toMatchObject({device:"cpu",routeReason:"gpu_unavailable"});
  expect(axios.post.mock.calls.map(c=>c[1])).toEqual([body,body]);
});
