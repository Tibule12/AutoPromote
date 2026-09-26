import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import VideoEditor from "../VideoEditor";
import { getMediaAuthToken } from "../../utils/mediaAuth";

let mockStudioMounts = 0;
let mockStudioUnmounts = 0;

jest.mock("firebase/auth", () => ({
  getAuth: () => ({
    currentUser: { uid: "creator-a", getIdToken: jest.fn().mockResolvedValue("test-token") },
  }),
}));

jest.mock("../../utils/mediaAuth", () => ({
  getMediaAuthToken: jest.fn(() => Promise.resolve("test-token")),
}));

jest.mock("../../hooks/useSubscription", () => ({
  useSubscription: () => ({ editing: { features: {} }, credits: { remaining: 100 } }),
}));

jest.mock("../../hooks/useCinematicEffects", () => () => ({
  fx: {},
  showPanel: false,
  setShowPanel: jest.fn(),
  applyPreset: jest.fn(),
  updateFx: jest.fn(),
  resetFx: jest.fn(),
  mediaStyle: {},
  hasEffects: false,
  attachVideo: jest.fn(),
}));

jest.mock("../ViralClipStudio", () => props => {
  const React = require("react");
  React.useEffect(() => {
    mockStudioMounts += 1;
    return () => {
      mockStudioUnmounts += 1;
    };
  }, []);
  const assets = [
    {
      id: "angle-1",
      name: "Wide.mp4",
      url: "https://media.example.com/wide.mp4",
      storagePath: "studio/sources/creator-a/wide.mp4",
    },
    {
      id: "angle-2",
      name: "Close.mp4",
      url: "https://media.example.com/close.mp4",
      storagePath: "studio/sources/creator-a/close.mp4",
    },
  ];
  return (
    <div data-testid="mock-studio">
      <button type="button" onClick={() => props.onOpenCameraAngles({ assets })}>
        Group selected angles
      </button>
      <button
        type="button"
        onClick={() => props.onOpenCameraAngles({ assets: [...assets, ...assets] })}
      >
        Group four angles
      </button>
      <button
        type="button"
        onClick={() =>
          props.onSave(
            { id: "full-video", start: 0, end: 12, duration: 12 },
            [],
            {
              timelineSegments: [
                {
                  id: "first-shot",
                  url: props.videoUrl,
                  sourceStoragePath: "studio/sources/creator-a/selected-shot.mp4",
                  start: 0,
                  end: 12,
                },
              ],
            }
          )
        }
      >
        Render selected shot
      </button>
      <span data-testid="studio-paused">{String(Boolean(props.isWorkflowPaused))}</span>
      <span data-testid="studio-imported-master">
        {props.importedCameraMaster?.storagePath || props.importedCameraMaster?.file?.name || ""}
      </span>
    </div>
  );
});

jest.mock("../MultiCamCombiner", () => props => (
  <div data-testid="mock-cam-combiner">
    <span data-testid="seeded-camera-names">
      {(props.initialFiles || []).map(item => item.name).join(", ")}
    </span>
    <span data-testid="seeded-camera-paths">
      {(props.initialFiles || []).map(item => item.storagePath).join(", ")}
    </span>
    <button type="button" onClick={props.onCancel}>
      Back to Studio
    </button>
    <button
      type="button"
      onClick={() =>
        props.onComplete({
          url: "https://media.example.com/temporary-master.mp4",
          renderJobId: "render-job-1",
          name: "camera-master.mp4",
          isRemote: true,
        })
      }
    >
      Use server master
    </button>
    <button
      type="button"
      onClick={() =>
        props.onComplete({
          file: new File(["video"], "browser-master.webm", { type: "video/webm" }),
          name: "browser-master.webm",
        })
      }
    >
      Use browser master
    </button>
  </div>
));

jest.mock("../ThumbnailGenerator", () => () => null);
jest.mock("../SmartPromoSummaryPanel", () => () => null);

const source = {
  name: "source.mp4",
  url: "https://media.example.com/source.mp4",
  type: "video/mp4",
  isRemote: true,
  openStudio: true,
  clips: [{ id: "full-video", start: 0, end: 12, duration: 12 }],
};

const creditResponse = {
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ balance: 100, costs: {} }),
};

describe("VideoEditor camera-angle handoff", () => {
  beforeEach(() => {
    mockStudioMounts = 0;
    mockStudioUnmounts = 0;
    getMediaAuthToken.mockResolvedValue("test-token");
    global.fetch = jest.fn(url => {
      if (String(url).endsWith("/api/media/credits")) return Promise.resolve(creditResponse);
      throw new Error(`Unexpected request: ${url}`);
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    delete global.fetch;
  });

  test("opens selected remote angles and returns to the same mounted Studio on cancel", async () => {
    render(<VideoEditor file={source} onSave={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Group selected angles" }));

    expect(screen.getByTestId("seeded-camera-names")).toHaveTextContent("Wide.mp4, Close.mp4");
    expect(screen.getByTestId("seeded-camera-paths")).toHaveTextContent(
      "studio/sources/creator-a/wide.mp4, studio/sources/creator-a/close.mp4"
    );
    expect(screen.getByTestId("studio-paused")).toHaveTextContent("true");
    expect(screen.getByTestId("mock-studio").parentElement).toHaveStyle("display: none");
    expect(mockStudioMounts).toBe(1);
    expect(mockStudioUnmounts).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Back to Studio" }));
    expect(screen.queryByTestId("mock-cam-combiner")).not.toBeInTheDocument();
    expect(screen.getByTestId("studio-paused")).toHaveTextContent("false");
    expect(mockStudioMounts).toBe(1);
    expect(mockStudioUnmounts).toBe(0);
  });

  test("imports a server master into durable owned storage before Studio receives it", async () => {
    let finishImport;
    const importResponse = new Promise(resolve => {
      finishImport = resolve;
    });
    global.fetch = jest.fn(url => {
      if (String(url).endsWith("/api/media/credits")) return Promise.resolve(creditResponse);
      if (String(url).endsWith("/api/media/studio-assets/import-render")) return importResponse;
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<VideoEditor file={source} onSave={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Group selected angles" }));
    fireEvent.click(screen.getByRole("button", { name: "Use server master" }));
    expect(screen.getByText(/Saving the camera master to your Studio media library/)).toBeInTheDocument();
    expect(screen.getByTestId("studio-imported-master")).toBeEmptyDOMElement();

    finishImport({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        asset: {
          id: "durable-master-1",
          name: "camera-master.mp4",
          url: "https://media.example.com/durable-master.mp4",
          storagePath: "studio/sources/creator-a/durable-master.mp4",
        },
      }),
    });

    await waitFor(() =>
      expect(screen.getByTestId("studio-imported-master")).toHaveTextContent(
        "studio/sources/creator-a/durable-master.mp4"
      )
    );
    expect(screen.queryByTestId("mock-cam-combiner")).not.toBeInTheDocument();
    expect(mockStudioMounts).toBe(1);
    const [, request] = global.fetch.mock.calls.find(([url]) =>
      String(url).endsWith("/api/media/studio-assets/import-render")
    );
    expect(request.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(request.body)).toEqual({ renderJobId: "render-job-1" });
  });

  test("keeps the completed podcast master available when durable import fails", async () => {
    let importAttempts = 0;
    global.fetch = jest.fn(url => {
      if (String(url).endsWith("/api/media/credits")) return Promise.resolve(creditResponse);
      if (String(url).endsWith("/api/media/studio-assets/import-render")) {
        importAttempts += 1;
        return Promise.resolve(
          importAttempts === 1
            ? {
                ok: false,
                status: 503,
                json: async () => ({ message: "Storage is temporarily unavailable." }),
              }
            : {
                ok: true,
                status: 200,
                json: async () => ({
                  success: true,
                  asset: {
                    id: "durable-master-1",
                    name: "camera-master.mp4",
                    url: "https://media.example.com/durable-master.mp4",
                    storagePath: "studio/sources/creator-a/durable-master.mp4",
                  },
                }),
              }
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<VideoEditor file={source} onSave={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Group selected angles" }));
    fireEvent.click(screen.getByRole("button", { name: "Use server master" }));
    expect(await screen.findByText("Storage is temporarily unavailable.")).toBeInTheDocument();
    expect(screen.getByTestId("mock-cam-combiner")).toBeInTheDocument();
    expect(screen.getByTestId("studio-imported-master")).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Use server master" }));
    await waitFor(() => expect(screen.queryByTestId("mock-cam-combiner")).not.toBeInTheDocument());
    expect(importAttempts).toBe(2);
    expect(mockStudioMounts).toBe(1);
  });

  test("hands a browser master to Studio as a file and blocks more than three angles", async () => {
    render(<VideoEditor file={source} onSave={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Group four angles" }));
    expect(screen.queryByTestId("mock-cam-combiner")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Group selected angles" }));
    fireEvent.click(screen.getByRole("button", { name: "Use browser master" }));
    expect(screen.getByTestId("studio-imported-master")).toHaveTextContent("browser-master.webm");
    expect(screen.queryByTestId("mock-cam-combiner")).not.toBeInTheDocument();
    expect(mockStudioMounts).toBe(1);
    expect(
      global.fetch.mock.calls.some(([url]) => String(url).includes("import-render"))
    ).toBe(false);
  });

  test("sends the selected timeline source storage path to the render backend", async () => {
    global.fetch = jest.fn(url => {
      if (String(url).endsWith("/api/media/credits")) return Promise.resolve(creditResponse);
      if (String(url).endsWith("/api/media/process")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ url: "https://media.example.com/rendered.mp4" }),
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    render(
      <VideoEditor
        file={{ ...source, storagePath: "studio/sources/creator-a/old-primary.mp4" }}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Render selected shot" }));
    await waitFor(() =>
      expect(
        global.fetch.mock.calls.some(([url]) => String(url).endsWith("/api/media/process"))
      ).toBe(true)
    );
    const [, request] = global.fetch.mock.calls.find(([url]) =>
      String(url).endsWith("/api/media/process")
    );
    expect(JSON.parse(request.body).sourceStoragePath).toBe(
      "studio/sources/creator-a/selected-shot.mp4"
    );
  });
});
