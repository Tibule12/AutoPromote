import React from "react";
import { render, waitFor } from "@testing-library/react";
import { SafeImage } from "../SafeMedia";

describe("SafeMedia", () => {
  it("sanitizes image sources before writing them to the DOM", async () => {
    const { container, rerender } = render(
      <SafeImage src="javascript:<svg onload='alert(1)'>" alt="Unsafe preview" />
    );
    const image = container.querySelector("img");

    await waitFor(() => expect(image).not.toHaveAttribute("src"));

    rerender(<SafeImage src="https://cdn.example.com/proof.jpg" alt="Safe preview" />);
    await waitFor(() => expect(image).toHaveAttribute("src", "https://cdn.example.com/proof.jpg"));
  });
});

test("video sources and posters reject script URLs while preserving valid previews", async () => {
  const { SafeVideo } = require("../SafeMedia");
  const { container, rerender } = render(
    <SafeVideo src="javascript:alert(1)" poster="data:text/html;base64,PHNjcmlwdD4=" />
  );
  const video = container.querySelector("video");
  expect(video).not.toHaveAttribute("src");
  expect(video).not.toHaveAttribute("poster");
  rerender(
    <SafeVideo src="https://cdn.example.com/video.mp4" poster="https://cdn.example.com/frame.jpg" />
  );
  await waitFor(() => expect(video).toHaveAttribute("src", "https://cdn.example.com/video.mp4"));
  expect(video).toHaveAttribute("poster", "https://cdn.example.com/frame.jpg");
  rerender(<SafeVideo src="javascript:alert(1)" />);
  await waitFor(() => expect(video).not.toHaveAttribute("src"));
  expect(video).not.toHaveAttribute("poster");
});
