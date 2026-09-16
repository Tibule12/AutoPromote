import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import Studio3DPanel from "./Studio3DPanel";
import { STUDIO_3D_TEMPLATES, createStudio3DScene } from "./studio3DModel";

test.each(STUDIO_3D_TEMPLATES)("adds %s as a timeline object", template => {
  const onChange = jest.fn();
  render(<Studio3DPanel scenes={[]} onChange={onChange} onSelect={jest.fn()} playhead={3.5} duration={60} />);
  fireEvent.click(screen.getByTitle(`Add ${template.name} at playhead`));
  expect(onChange.mock.calls[0][0][0]).toMatchObject({ template: template.id, startTime: 3.5, duration: 5 });
});

test("edits controls, duplicates, resets, deletes and requests real HQ preview", () => {
  const scene = createStudio3DScene("neon_logo", 2, "logo-1");
  const onChange = jest.fn();
  const onGeneratePreview = jest.fn();
  render(<Studio3DPanel scenes={[scene]} onChange={onChange} focusId="logo-1" onSelect={jest.fn()} onGeneratePreview={onGeneratePreview} />);
  fireEvent.change(screen.getByDisplayValue("AutoPromote"), { target: { value: "New title" } });
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ text: "New title" })]);
  fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
  expect(screen.getByText("Extrusion")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Add pose keyframe/ }));
  expect(onChange.mock.lastCall[0][0].keyframes).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
  expect(onChange.mock.lastCall[0]).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Reset preset" }));
  expect(onChange.mock.lastCall[0][0].text).toBe("AutoPromote");
  fireEvent.click(screen.getByRole("button", { name: "Generate HQ 3D Preview" }));
  expect(onGeneratePreview).toHaveBeenCalledWith(expect.objectContaining({ id: "logo-1" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

test("exposes the completed HQ ident as a separate downloadable motion video", () => {
  const scene = createStudio3DScene("neon_logo", 0, "logo-download");
  render(<Studio3DPanel
    scenes={[scene]}
    onChange={jest.fn()}
    focusId="logo-download"
    onSelect={jest.fn()}
    previewState={{ status: "completed", url: "https://storage.googleapis.com/private-proof/logo.mp4" }}
  />);

  expect(screen.getByLabelText("HQ 3D preview").getAttribute("src")).toBe("https://storage.googleapis.com/private-proof/logo.mp4");
  const download = screen.getByRole("link", { name: "Download standalone motion" });
  expect(download.getAttribute("href")).toBe("https://storage.googleapis.com/private-proof/logo.mp4");
  expect(download.getAttribute("download")).toBe("autopromote-neon_logo-motion.mp4");
  expect(screen.getByText(/separate rendered animation/i)).toBeTruthy();
});
