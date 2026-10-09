import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import StudioSubjectVfxPanel from "../StudioSubjectVfxPanel";

const scene = () => ({
  version: 1,
  id: "scene-1",
  sourceId: "source-a",
  sourceStoragePath: "studio/sources/owner/a.mp4",
  sourceRange: { start: 2, end: 8 },
  prompt: { points: [[0.5, 0.3]], labels: [1], shotPrompts: [] },
  effects: [
    {
      id: "title",
      type: "text_behind",
      start: 0,
      end: 6,
      text: "STORY",
      x: 50,
      y: 45,
      font_size: 100,
      color: "#f5f1ed",
    },
  ],
});
const deferred = () => {
  let resolve;
  const promise = new Promise(value => {
    resolve = value;
  });
  return { promise, resolve };
};
const response = data => ({ ok: true, json: async () => data });
let sequence = 0;
function Harness({modelArtifactRef}) {
  const [items, setItems] = useState([{ scene: scene(), enabled: true,...(modelArtifactRef?{modelArtifactRef}:{}) }]);
  return (
    <>
      <StudioSubjectVfxPanel
        items={items}
        onChange={setItems}
        sources={[
          {
            id: "source-a",
            name: "Podcast",
            url: "/source.mp4",
            storagePath: scene().sourceStoragePath,
            start: 2,
            end: 8,
          },
        ]}
        getToken={async () => "local-test-only"}
        apiBase="http://fixture.invalid"
        createId={() => `test-request-${++sequence}`}
      />
      <div data-testid="saved">{JSON.stringify(items)}</div>
    </>
  );
}
const result = {
  jobId: "render-job-123",
  status: "completed",
  url: "https://preview.invalid/render.mp4",
  receipt: { pixel_sha256: "a".repeat(64) },
};
beforeEach(() => {
  sequence = 0;
  global.fetch = jest.fn();
});
afterEach(() => {
  delete global.fetch;
});

test("disjoint ranges of one owned source remain independently selectable", () => {
  const onChange = jest.fn();
  render(<StudioSubjectVfxPanel items={[]} onChange={onChange}
    sources={[
      { id: "source-a", name: "Opening", url: "/source.mp4", storagePath: scene().sourceStoragePath, start: 0, end: 10 },
      { id: "source-a", name: "Second passage", url: "/source.mp4", storagePath: scene().sourceStoragePath, start: 10, end: 20 },
    ]}
    getToken={async () => "local-test-only"} apiBase="http://fixture.invalid"
    createId={() => `test-request-${++sequence}`} />);
  const second = screen.getByRole("option", { name: /Second passage/ });
  fireEvent.change(screen.getByLabelText("Subject effect source clip"), { target: { value: second.value } });
  const added = onChange.mock.calls[0][0][0].scene;
  expect(added.sourceId).toBe("source-a");
  expect(added.sourceStoragePath).toBe(scene().sourceStoragePath);
  expect(added.sourceRange).toEqual({ start: 10, end: 20 });
});

test("rapid submissions dispatch one job, and approval requires actual preview playback", async () => {
  const acknowledged = deferred();
  fetch.mockReturnValueOnce(acknowledged.promise).mockResolvedValueOnce(response(result));
  render(<Harness />);
  const button = screen.getByRole("button", { name: "Render subject preview" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await act(async () => acknowledged.resolve(response({ jobId: result.jobId })));
  const approval = await screen.findByLabelText(/I reviewed the sound/);
  expect(approval).toBeDisabled();
  fireEvent.playing(screen.getByLabelText("Rendered subject effects with original audio"));
  expect(approval).toBeEnabled();
  fireEvent.click(approval);
  expect(screen.getByTestId("saved")).toHaveTextContent('"reviewed":true');
  fireEvent.change(screen.getByDisplayValue("STORY"), { target: { value: "NEW STORY" } });
  expect(screen.queryByLabelText(/I reviewed the sound/)).not.toBeInTheDocument();
  expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
});

test('a saved runtime mask is forwarded without model choices through the existing preview controls',async()=>{
  const modelArtifactRef={kind:'model_capability',schemaVersion:1,artifactHash:'b'.repeat(64),
    sourceAssetId:'source-a',sourceContentHash:'c'.repeat(64),capability:'segment_subject',
    sourceRange:{space:'source',startTick:180000,endTick:720000}};
  fetch.mockResolvedValueOnce(response({jobId:result.jobId})).mockResolvedValueOnce(response(result));
  render(<Harness modelArtifactRef={modelArtifactRef}/>);
  fireEvent.click(screen.getByRole('button',{name:'Render subject preview'}));
  await screen.findByLabelText(/I reviewed the sound/);
  const body=JSON.parse(fetch.mock.calls.find(([,options])=>options.method==='POST')[1].body);
  expect(body).toEqual({scene:scene(),clientRequestId:expect.any(String),modelArtifactRef});
  expect(screen.getByTestId('saved')).toHaveTextContent(modelArtifactRef.artifactHash);
});
test("a render cannot overwrite edits made while it was running", async () => {
  const completed = deferred();
  fetch
    .mockResolvedValueOnce(response({ jobId: result.jobId }))
    .mockReturnValueOnce(completed.promise);
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Render subject preview" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  fireEvent.change(screen.getByDisplayValue("STORY"), { target: { value: "CHANGED" } });
  await act(async () => completed.resolve(response(result)));
  expect(screen.getByRole("status")).toHaveTextContent("scene changed");
  expect(screen.queryByLabelText(/Rendered subject/)).not.toBeInTheDocument();
  expect(screen.getByTestId("saved")).toHaveTextContent("CHANGED");
});

test("expired completed preview refreshes the same owned job and preserves matching pixel review", async () => {
  fetch.mockResolvedValueOnce(response({ jobId: result.jobId })).mockResolvedValueOnce(response(result));
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Render subject preview" }));
  const player = await screen.findByLabelText("Rendered subject effects with original audio");
  fireEvent.playing(player);
  fireEvent.click(screen.getByLabelText(/I reviewed the sound/));
  fetch.mockResolvedValueOnce(response({ ...result, url: "https://preview.invalid/refreshed.mp4" }));
  fireEvent.error(player);
  await waitFor(() => expect(player).toHaveAttribute("src", "https://preview.invalid/refreshed.mp4"));
  expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  expect(fetch.mock.calls.at(-1)[0]).toMatch(/render-job-123$/);
  expect(screen.getByTestId("saved")).toHaveTextContent('"reviewed":true');
});
test("an uncertain request is retried with the persisted identity", async () => {
  fetch.mockRejectedValueOnce(new Error("Connection lost"));
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Render subject preview" }));
  await screen.findByText("Connection lost");
  const first = JSON.parse(fetch.mock.calls[0][1].body).clientRequestId;
  fetch
    .mockResolvedValueOnce(response({ jobId: result.jobId }))
    .mockResolvedValueOnce(response(result));
  fireEvent.click(screen.getByRole("button", { name: "Render subject preview" }));
  await screen.findByLabelText(/I reviewed the sound/);
  expect(JSON.parse(fetch.mock.calls[1][1].body).clientRequestId).toBe(first);
});
test("late poll completion cannot undo a confirmed cancellation", async () => {
  const completed = deferred();
  fetch
    .mockResolvedValueOnce(response({ jobId: result.jobId }))
    .mockReturnValueOnce(completed.promise)
    .mockResolvedValueOnce(response({ jobId: result.jobId, status: "cancelled" }));
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Render subject preview" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Cancel render" }));
  await screen.findByText(/Subject render cancelled/);
  await act(async () => completed.resolve(response(result)));
  expect(screen.queryByLabelText(/Rendered subject/)).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("cancelled");
});
test("a completed response to DELETE is not reported as cancellation", async () => {
  const completed = deferred();
  fetch
    .mockResolvedValueOnce(response({ jobId: result.jobId }))
    .mockReturnValueOnce(completed.promise)
    .mockResolvedValueOnce(response({ jobId: result.jobId, status: "completed" }));
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Render subject preview" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Cancel render" }));
  await screen.findByText(/Cancellation was not confirmed/);
  await act(async () => completed.resolve(response(result)));
  expect(screen.getByRole("status")).not.toHaveTextContent("Subject render cancelled");
});
