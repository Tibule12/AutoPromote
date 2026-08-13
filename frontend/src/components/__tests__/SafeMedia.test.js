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
