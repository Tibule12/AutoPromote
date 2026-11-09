import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import Studio3DPanel from "./Studio3DPanel";
import { STUDIO_3D_TEMPLATES, createStudio3DScene } from "./studio3DModel";

test.each(STUDIO_3D_TEMPLATES)("adds %s as a timeline object", template => {
  const onChange = jest.fn();
  render(<Studio3DPanel scenes={[]} onChange={onChange} onSelect={jest.fn()} playhead={3.5} duration={60} />);
  const button = screen.getByTitle(`Add ${template.name} at playhead`);
  if (["audio_reactive_text", "floating_callout"].includes(template.id)) {
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onChange).not.toHaveBeenCalled();
    return;
  }
  fireEvent.click(button);
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
  expect(screen.getByRole("note").textContent).toContain("audio response");
  expect(screen.getByRole("note").textContent).toContain("720p");
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

test("unavailable final-render controls cannot create misleading edits while supported controls remain editable", () => {
  const scene = createStudio3DScene("cinematic_title", 0, "render-controls");
  scene.fontFamily = "serif";
  scene.keyframes = [{ id: "pose", time: 1, easing: "linear", values: { x: 50 } }];
  const onChange = jest.fn();
  render(<Studio3DPanel scenes={[scene]} focusId={scene.id} onChange={onChange} onSelect={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
  for (const name of ["Font family", "Weight", "Easing", "Background", "Quality", "Light direction", "Audio response", "Shadows", "Reflections"]) {
    expect(screen.getByLabelText(name)).toBeDisabled();
  }
  expect(screen.getByLabelText("Font family")).toHaveValue("serif");
  expect(screen.getByLabelText("Alignment")).toBeEnabled();
  expect(screen.getByLabelText("Enabled")).toBeEnabled();
  expect(screen.getByLabelText("Pose 1 easing")).toBeEnabled();
  expect(screen.getByLabelText("Entrance").querySelector('[value="pulse"]')).toBeDisabled();
  expect(screen.getByLabelText("Hold").querySelector('[value="pulse"]')).toBeDisabled();
  expect(screen.getByLabelText("Exit").querySelector('[value="dolly"]')).toBeDisabled();
  expect(screen.getByLabelText("Exit").querySelector('[value="fade"]')).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Pose 1 easing"), { target: { value: "ease_out" } });
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ fontFamily: "serif",
    keyframes: [expect.objectContaining({ easing: "ease_out" })] })]);
  expect(screen.getByRole("note")).not.toHaveTextContent("opacity is also missing");
});
