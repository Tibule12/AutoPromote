import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import VoiceOverGuide, { VOICE_OVER_TAB_SCRIPTS } from "../VoiceOverGuide";

const ACTIVE_USER_TABS = [
  "profile",
  "cam_combiner",
  "clip_studio",
  "viral_clip_studio",
  "upload",
  "schedules",
  "connections",
  "team",
  "billing",
  "security",
  "notifications",
  "rewards",
  "admin-audit",
  "admin-kyc",
];

describe("VoiceOverGuide", () => {
  const originalSpeechSynthesis = window.speechSynthesis;
  const originalUtterance = window.SpeechSynthesisUtterance;
  let speakMock;
  let cancelMock;

  beforeEach(() => {
    speakMock = jest.fn();
    cancelMock = jest.fn();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      writable: true,
      value: {
        speak: speakMock,
        cancel: cancelMock,
      },
    });
    window.SpeechSynthesisUtterance = function MockUtterance(text) {
      this.text = text;
      this.volume = 1;
      this.rate = 1;
      this.pitch = 1;
      this.onend = null;
      this.onerror = null;
    };
  });

  afterEach(() => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      writable: true,
      value: originalSpeechSynthesis,
    });
    window.SpeechSynthesisUtterance = originalUtterance;
    jest.restoreAllMocks();
  });

  test.each(ACTIVE_USER_TABS)("speaks current tab guidance for %s", tabId => {
    render(<VoiceOverGuide activeTab={tabId} />);
    const button = screen.getByRole("button", { name: "Toggle Voice Guide" });
    expect(button).toHaveTextContent("Explain This Tab");
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);

    expect(speakMock).toHaveBeenCalledTimes(1);
    const spokenText = speakMock.mock.calls[0][0].text;
    expect(spokenText).toBe(VOICE_OVER_TAB_SCRIPTS[tabId]);
    expect(spokenText).not.toBe(VOICE_OVER_TAB_SCRIPTS.default);
    expect(button).toHaveTextContent("Speaking...");
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  test("excludes retired tab keys and stale claims from default scripts", () => {
    for (const retired of ["feed", "community", "live", "earnings", "ads"]) {
      expect(VOICE_OVER_TAB_SCRIPTS[retired]).toBeUndefined();
    }
    const combinedText = Object.values(VOICE_OVER_TAB_SCRIPTS).join("\n");
    expect(combinedText).not.toMatch(/Temporal Orchestrator|Drag and drop posts|\$3 bonus|customize your avatar/i);
  });

  test("supports keyboard activation, tab switch cancellation, unmount cleanup, and ignores stale utterance callbacks", () => {
    const { rerender, unmount } = render(<VoiceOverGuide activeTab="viral_clip_studio" />);
    const button = screen.getByRole("button", { name: "Toggle Voice Guide" });
    expect(button).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(button, { key: "Enter" });
    expect(speakMock).toHaveBeenCalledTimes(1);
    const firstUtterance = speakMock.mock.calls[0][0];
    expect(firstUtterance.text).toMatch(/Viral Clip Studio/i);
    expect(button).toHaveAttribute("aria-pressed", "true");

    // Switching tabs cancels speech and clears active state
    rerender(<VoiceOverGuide activeTab="cam_combiner" />);
    expect(cancelMock).toHaveBeenCalled();
    expect(button).toHaveAttribute("aria-pressed", "false");

    // Start speaking the new tab via Space key
    fireEvent.keyDown(button, { key: " " });
    expect(speakMock).toHaveBeenCalledTimes(2);
    const secondUtterance = speakMock.mock.calls[1][0];
    expect(secondUtterance.text).toMatch(/Cam Combiner/i);
    expect(button).toHaveAttribute("aria-pressed", "true");

    // Stale callback from first utterance must not turn off active playback for second
    act(() => {
      firstUtterance.onend?.();
    });
    expect(button).toHaveAttribute("aria-pressed", "true");

    // Real end callback clears playing state
    act(() => {
      secondUtterance.onend?.();
    });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("Explain This Tab");

    unmount();
    expect(cancelMock).toHaveBeenCalled();
  });

  test("merges scripts overrides with current defaults", () => {
    const { rerender } = render(
      <VoiceOverGuide
        activeTab="custom_tab"
        scripts={{ custom_tab: "Custom tab guide." }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle Voice Guide" }));
    expect(speakMock.mock.calls[0][0].text).toBe("Custom tab guide.");

    rerender(
      <VoiceOverGuide
        activeTab="billing"
        scripts={{ custom_tab: "Custom tab guide." }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle Voice Guide" }));
    expect(speakMock.mock.calls[1][0].text).toBe(VOICE_OVER_TAB_SCRIPTS.billing);
  });
});
