import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";

import {
  CreativeToolRail,
  StudioWorkspaceModeSwitch,
  getViralStudioToolsForMode,
  normalizeViralStudioWorkspaceMode,
} from "../ViralStudioChrome";

const tools = [
  { id: "director", label: "Director", icon: "D" },
  { id: "moments", label: "Moments", icon: "M" },
  { id: "cut", label: "Cut", icon: "C" },
  { id: "captions", label: "Captions", icon: "CC" },
  { id: "broll", label: "B-roll", icon: "B" },
  { id: "export", label: "Export", icon: "E" },
];

describe("ViralStudioChrome", () => {
  test("keeps Creator Studio as the safe default workspace", () => {
    expect(normalizeViralStudioWorkspaceMode("unknown")).toBe("creator");
    expect(getViralStudioToolsForMode(tools, "creator")).toEqual(tools);
  });

  test("Quick Create reduces visible controls without changing the shared tools", () => {
    expect(getViralStudioToolsForMode(tools, "quick").map(tool => tool.id)).toEqual([
      "director",
      "moments",
      "captions",
      "broll",
      "export",
    ]);
    expect(tools).toHaveLength(6);
  });

  test('Quick exposes Director and lets the user open every advanced tool without switching modes', () => {
    const onSelect = jest.fn();
    const {rerender}=render(<CreativeToolRail tools={tools} mode="quick" activeTool="moments" onSelect={onSelect} />);
    expect(screen.getByRole('button',{name:'Director'})).toBeInTheDocument();
    const more=screen.getByRole('button',{name:'All tools'});
    expect(more).toHaveAttribute('aria-expanded','false');
    fireEvent.click(more);
    fireEvent.click(screen.getByRole('button',{name:'Cut'}));
    expect(onSelect).toHaveBeenCalledWith('cut');
    rerender(<CreativeToolRail tools={tools} mode="quick" activeTool="cut" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button',{name:'Fewer tools'}));
    expect(screen.getByRole('button',{name:'Cut'})).toHaveAttribute('aria-pressed','true');
  });

  test("switches modes and exposes the right creative rail", () => {
    const onChange = jest.fn();
    const onSelect = jest.fn();
    const { rerender } = render(
      <>
        <StudioWorkspaceModeSwitch mode="creator" onChange={onChange} />
        <CreativeToolRail tools={tools} mode="quick" activeTool="captions" onSelect={onSelect} />
      </>
    );

    fireEvent.click(screen.getByRole("tab", { name: "Signature Lab" }));
    expect(onChange).toHaveBeenCalledWith("signature");

    const rail = screen.getByRole("navigation", { name: "Creative tools" });
    expect(within(rail).queryByRole("button", { name: "Cut" })).not.toBeInTheDocument();
    fireEvent.click(within(rail).getByRole("button", { name: "Captions" }));
    expect(onSelect).toHaveBeenCalledWith("captions");

    rerender(
      <CreativeToolRail tools={tools} mode="signature" activeTool="moments" onSelect={onSelect} />
    );
    expect(screen.getByRole("button", { name: "Cut" })).toBeInTheDocument();
  });
});
