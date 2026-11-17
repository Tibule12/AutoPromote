import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import VideoScopes from "../VideoScopes";

function makeMockCanvasContexts(pixelRgba) {
  const outputCtx = {
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    arc: jest.fn(),
    fillStyle: "",
    strokeStyle: "",
    shadowColor: "",
    shadowBlur: 0,
    lineWidth: 1,
    globalAlpha: 1,
  };
  const sampleCtx = {
    drawImage: jest.fn(),
    getImageData: jest.fn(() => ({ data: pixelRgba })),
  };
  return { outputCtx, sampleCtx };
}

describe("VideoScopes", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    ["luma", "Luma histogram live"],
    ["waveform", /Waveform live · IRE/],
    ["vectorscope", /Vectorscope live · Skin/],
    ["parade", "RGB parade live"],
  ])("renders %s scope telemetry from active canvas source", (mode, expectedStatus) => {
    const pixelRgba = new Uint8ClampedArray(64 * 36 * 4);
    for (let i = 0; i < pixelRgba.length; i += 4) {
      pixelRgba[i] = 200;
      pixelRgba[i + 1] = 150;
      pixelRgba[i + 2] = 110;
      pixelRgba[i + 3] = 255;
    }
    const { outputCtx, sampleCtx } = makeMockCanvasContexts(pixelRgba);

    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function getCtx(_type, opts) {
      return opts && opts.willReadFrequently ? sampleCtx : outputCtx;
    });

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 64;
    sourceCanvas.height = 36;
    const canvasRef = { current: sourceCanvas };

    render(<VideoScopes canvasRef={canvasRef} mode={mode} />);
    const container = screen.getByTestId("studio-video-scopes");
    expect(container).toHaveTextContent(expectedStatus);
    expect(sampleCtx.drawImage).toHaveBeenCalled();
  });
});
