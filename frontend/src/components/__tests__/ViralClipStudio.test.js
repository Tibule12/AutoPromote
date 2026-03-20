import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ViralClipStudio from "../ViralClipStudio";

jest.mock("../../firebaseClient", () => ({
  storage: {},
}));

jest.mock("firebase/storage", () => ({
  ref: jest.fn(),
  uploadBytes: jest.fn(() => Promise.resolve()),
  getDownloadURL: jest.fn(() => Promise.resolve("https://example.com/mock.mp4")),
}));

jest.mock("firebase/auth", () => ({
  getAuth: jest.fn(() => ({
    currentUser: {
      uid: "test-user",
      getIdToken: jest.fn(() => Promise.resolve("token")),
    },
  })),
}));

jest.mock("html2canvas", () => jest.fn(() => Promise.resolve({ toBlob: cb => cb(new Blob()) })));

describe("ViralClipStudio timeline sequencing", () => {
  const originalConfirm = window.confirm;
  const originalAlert = window.alert;
  const originalPrompt = window.prompt;
  const originalCreateElement = document.createElement.bind(document);
  const originalPlay = window.HTMLMediaElement.prototype.play;

  beforeEach(() => {
    window.confirm = jest.fn(() => false);
    window.alert = jest.fn();
    window.prompt = jest.fn(() => null);
    window.HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
  });

  afterEach(() => {
    window.confirm = originalConfirm;
    window.alert = originalAlert;
    window.prompt = originalPrompt;
    document.createElement = originalCreateElement;
    window.HTMLMediaElement.prototype.play = originalPlay;
    jest.clearAllMocks();
  });

  function setupVideoCreateElementMock() {
    const createdVideos = [];
    document.createElement = jest.fn(tagName => {
      const element = originalCreateElement(tagName);
      if (tagName === "video") {
        Object.defineProperty(element, "duration", {
          configurable: true,
          writable: true,
          value: 12,
        });
        createdVideos.push(element);
      }
      return element;
    });
    return createdVideos;
  }

  function getTimelineOrder(container) {
    return Array.from(container.querySelectorAll(".timeline-scroll-area .timeline-clip-thumb")).map(
      node => node.textContent.replace(/\s+/g, " ").trim()
    );
  }

  function getOverlayTextNode() {
    return document
      .querySelector(".draggable-overlay")
      ?.textContent?.includes("Double Click to Edit")
      ? document.querySelector(".draggable-overlay")
      : null;
  }

  async function appendTimelineClip(input, createdVideos, fileName, fileContents) {
    const initialCount = createdVideos.length;
    fireEvent.change(input, {
      target: { files: [new File([fileContents], fileName, { type: "video/mp4" })] },
    });
    await waitFor(() => expect(createdVideos.length).toBeGreaterThan(initialCount));
    await act(async () => {
      createdVideos[createdVideos.length - 1].onloadedmetadata();
    });
  }

  test("allows appended clips to be reordered in the timeline", async () => {
    const createdVideos = setupVideoCreateElementMock();
    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    const addClipInput = screen.getByTestId("timeline-add-clip-input");

    await appendTimelineClip(addClipInput, createdVideos, "a.mp4", "a");
    await appendTimelineClip(addClipInput, createdVideos, "b.mp4", "b");

    await waitFor(() => {
      expect(screen.getByText("a.mp4")).toBeInTheDocument();
      expect(screen.getByText("b.mp4")).toBeInTheDocument();
    });

    const initialOrder = getTimelineOrder(container).join(" | ");
    expect(initialOrder).toContain("1");
    expect(initialOrder.indexOf("a.mp4")).toBeLessThan(initialOrder.indexOf("b.mp4"));

    const betaThumb = screen.getByText("b.mp4").closest(".timeline-clip-thumb");
    const moveEarlierButton = within(betaThumb).getByTitle("Move clip earlier");
    fireEvent.click(moveEarlierButton);

    await waitFor(() => {
      const reordered = getTimelineOrder(container).join(" | ");
      expect(reordered.indexOf("b.mp4")).toBeLessThan(reordered.indexOf("a.mp4"));
    });
  });

  test("keeps the same timeline clip active after reordering", async () => {
    const createdVideos = setupVideoCreateElementMock();
    const { container } = render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    const addClipInput = screen.getByTestId("timeline-add-clip-input");
    await appendTimelineClip(addClipInput, createdVideos, "a.mp4", "a");
    await appendTimelineClip(addClipInput, createdVideos, "b.mp4", "b");

    const activeBefore = screen.getByText("b.mp4").closest(".timeline-clip-thumb");
    fireEvent.click(activeBefore);
    expect(activeBefore.className).toContain("active");

    const moveEarlierButton = within(activeBefore).getByTitle("Move clip earlier");
    fireEvent.click(moveEarlierButton);

    await waitFor(() => {
      const activeThumb = container.querySelector(
        ".timeline-scroll-area .timeline-clip-thumb.active"
      );
      expect(activeThumb).not.toBeNull();
      expect(activeThumb.textContent).toContain("b.mp4");
    });
  });

  test("allows detected viral moments to be reordered", async () => {
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[
          { id: "clip-1", start: 0, end: 10, duration: 10, reason: "First hook" },
          { id: "clip-2", start: 10, end: 18, duration: 8, reason: "Second hook" },
        ]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    const firstCard = screen.getByTestId("detected-clip-clip-1");
    const secondCard = screen.getByTestId("detected-clip-clip-2");
    expect(firstCard.textContent).toContain("First hook");
    expect(secondCard.textContent).toContain("Second hook");

    fireEvent.click(screen.getByTestId("detected-move-left-clip-2"));

    await waitFor(() => {
      const cards = screen.getAllByTestId(/detected-clip-/);
      expect(cards[0].textContent).toContain("Second hook");
      expect(cards[1].textContent).toContain("First hook");
    });
  });

  test("supports undo and redo for overlay edits", async () => {
    render(
      <ViralClipStudio
        videoUrl="https://example.com/source.mp4"
        clips={[{ id: "clip-1", start: 0, end: 10, duration: 10, reason: "Hook" }]}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onStatusChange={jest.fn()}
        currentMusic={null}
        onMusicChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText(/Add Text/i));
    expect(getOverlayTextNode()).not.toBeNull();

    fireEvent.click(screen.getByTestId("studio-undo-button"));
    await waitFor(() => {
      expect(getOverlayTextNode()).toBeNull();
    });

    fireEvent.click(screen.getByTestId("studio-redo-button"));
    await waitFor(() => {
      expect(getOverlayTextNode()).not.toBeNull();
    });
  });
});
