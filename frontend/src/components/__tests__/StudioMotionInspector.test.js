import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MotionInspector } from "../StudioAdvancedInspectors";

const noop = () => {};

describe("MotionInspector logo layer controls", () => {
  test("edits geometry, timing, alpha-aware effects and motion blur on image layers", () => {
    const onUpdateOverlay = jest.fn();
    const logo = {
      id: "logo",
      type: "image",
      name: "AutoPromote logo",
      x: 50,
      y: 48,
      scale: 1,
      rotation: 0,
      opacity: 1,
      startTime: 0.5,
      duration: 4,
      width: 42,
      height: 18,
      anchorX: 50,
      anchorY: 50,
      motionBlur: { enabled: true, samples: 4, shutter: 0.5 },
      glow: { enabled: true, color: "#8b5cf6", radius: 16, intensity: 0.5 },
      layerShadow: { enabled: true, color: "#000000", blur: 18, opacity: 0.55, x: 0, y: 10 },
    };

    render(
      <MotionInspector
        activeOverlay={logo}
        overlays={[logo]}
        playhead={1.25}
        keyframes={[]}
        onSelectOverlay={noop}
        onUpdateOverlay={onUpdateOverlay}
        onAddKeyframe={noop}
        onUpdateKeyframe={noop}
        onRemoveKeyframe={noop}
        onSeek={noop}
        showMotionPath={false}
        onToggleMotionPath={noop}
        onResetMotion={noop}
      />
    );

    fireEvent.change(screen.getByLabelText("Motion layer in point"), { target: { value: "1.5" } });
    expect(onUpdateOverlay).toHaveBeenCalledWith("startTime", 1.5);
    fireEvent.change(screen.getByLabelText("Motion layer anchor X"), { target: { value: "25" } });
    expect(onUpdateOverlay).toHaveBeenCalledWith("anchorX", 25);
    fireEvent.click(screen.getByLabelText("Enable layer motion blur"));
    expect(onUpdateOverlay).toHaveBeenCalledWith("motionBlur", expect.objectContaining({ enabled: false }));
    fireEvent.change(screen.getByLabelText("Layer glow color"), { target: { value: "#22d3ee" } });
    expect(onUpdateOverlay).toHaveBeenCalledWith("glow", expect.objectContaining({ color: "#22d3ee" }));
    fireEvent.change(screen.getByLabelText("Layer shadow Y offset"), { target: { value: "18" } });
    expect(onUpdateOverlay).toHaveBeenCalledWith("layerShadow", expect.objectContaining({ y: 18 }));
    expect(screen.getByRole("button", { name: /Add transform keyframe at 1.25s/i })).toBeInTheDocument();
  });

  test("exposes custom Bezier easing on a saved transform pose", () => {
    const onUpdateKeyframe = jest.fn();
    const logo = { id: "logo", type: "image", x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 };
    const keyframes = [
      { id: "x", targetId: "logo", property: "x", time: 1, value: 50, easing: "bezier", curve: [0.2, 0.1, 0.8, 0.9] },
      { id: "scale", targetId: "logo", property: "scale", time: 1, value: 1, easing: "bezier", curve: [0.2, 0.1, 0.8, 0.9] },
    ];
    render(
      <MotionInspector activeOverlay={logo} overlays={[logo]} playhead={1} keyframes={keyframes}
        onSelectOverlay={noop} onUpdateOverlay={noop} onAddKeyframe={noop}
        onUpdateKeyframe={onUpdateKeyframe} onRemoveKeyframe={noop} onSeek={noop}
        showMotionPath={false} onToggleMotionPath={noop} onResetMotion={noop} />
    );
    fireEvent.change(screen.getByLabelText("Transform pose at 1.00 seconds Bezier in handle"), {
      target: { value: "0.35" },
    });
    expect(onUpdateKeyframe).toHaveBeenCalledTimes(2);
    expect(onUpdateKeyframe).toHaveBeenCalledWith("x", expect.objectContaining({ curve: [0.2, 0.35, 0.8, 0.9] }));
  });
});
