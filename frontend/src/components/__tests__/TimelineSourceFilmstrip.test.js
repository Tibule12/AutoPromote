import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import TimelineSourceFilmstrip from "../TimelineSourceFilmstrip";

test("a failed source stops sampling that source and leaves the timeline usable", async () => {
  const create = document.createElement.bind(document);
  const load = jest.fn();
  jest.spyOn(document, "createElement").mockImplementation((name, ...args) => {
    const node = create(name, ...args);
    if (name === "video")
      node.load = () => {
        if (node.hasAttribute("src")) {
          load();
          setTimeout(() => node.dispatchEvent(new Event("error")), 0);
        }
      };
    return node;
  });
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({});
  try {
    const { container } = render(
      <TimelineSourceFilmstrip
        frames={[
          { id: "first", src: "/unavailable.mp4", previewTime: 1, left: 0, width: 50 },
          { id: "second", src: "/unavailable.mp4", previewTime: 2, left: 50, width: 50 },
        ]}
      />
    );
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  } finally {
    jest.restoreAllMocks();
  }
});

test("filmstrip uses one separate muted decoder, bounds source seeks and releases it on unmount", async () => {
  const create = document.createElement.bind(document);
  const decoders = [],
    seeks = [];
  jest.spyOn(document, "createElement").mockImplementation((name, ...args) => {
    const node = create(name, ...args);
    if (name !== "video") return node;
    decoders.push(node);
    Object.defineProperties(node, {
      duration: { value: 10 },
      readyState: { value: 2 },
      videoWidth: { value: 1920 },
      videoHeight: { value: 1080 },
      currentTime: {
        get: () => seeks[seeks.length - 1] || 0,
        set: value => {
          seeks.push(value);
          setTimeout(() => node.dispatchEvent(new Event("seeked")), 0);
        },
      },
    });
    node.load = jest.fn(() => setTimeout(() => node.dispatchEvent(new Event("loadedmetadata")), 0));
    return node;
  });
  const draw = jest.fn();
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ fillRect: jest.fn(), drawImage: draw });
  jest
    .spyOn(HTMLCanvasElement.prototype, "toDataURL")
    .mockReturnValue("data:image/jpeg;base64,test");
  try {
    const { container, unmount } = render(
      <TimelineSourceFilmstrip
        frames={[
          { id: "end", src: "/podcast.mp4", previewTime: 100, left: 0, width: 50 },
          { id: "start", src: "/podcast.mp4", previewTime: -10, left: 50, width: 50 },
        ]}
      />
    );
    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(2));
    expect(decoders).toHaveLength(1);
    expect(decoders[0].muted).toBe(true);
    expect(decoders[0].preload).toBe("auto");
    expect(seeks).toEqual([9.96, 0]);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(container.querySelector("video")).toBeNull();
    unmount();
    expect(decoders[0].hasAttribute("src")).toBe(false);
  } finally {
    jest.restoreAllMocks();
  }
});
