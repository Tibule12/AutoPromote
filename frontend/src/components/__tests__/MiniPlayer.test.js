import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MiniPlayer from "../MiniPlayer";

let _realAudio = null;
beforeEach(() => {
  // mock Audio and capture last instance
  _realAudio = global.Audio;
  global._lastAudio = null;
  global._audioListeners = {};
  function MockAudio(url) {
    global._lastAudio = this;
    this.url = url;
    this.currentTime = 0;
    this.duration = 30;
    this.play = jest.fn().mockImplementation(() => Promise.resolve());
    this.pause = jest.fn();
    this.addEventListener = (k, fn) => {
      global._audioListeners[k] = fn;
    };
    this.removeEventListener = k => {
      delete global._audioListeners[k];
    };
  }
  global.Audio = MockAudio;
});
afterEach(() => {
  global.Audio = _realAudio;
  delete global._lastAudio;
  delete global._audioListeners;
});

test("renders waveform and allows play/pause and seek", async () => {
  const track = { id: "abc", name: "Track ABC", preview_url: "preview://abc.mp3" };
  render(<MiniPlayer track={track} onClose={() => {}} />);

  expect(screen.getByText("Track ABC")).toBeInTheDocument();

  // simulate loadedmetadata to set duration on the component
  global._audioListeners["loadedmetadata"] && global._audioListeners["loadedmetadata"]();

  const play = screen.getByRole("button", { name: /Play preview/i });
  expect(play).toHaveAttribute("aria-label", "Play preview");
  fireEvent.click(play);
  expect(global._lastAudio.play).toHaveBeenCalled();
  // button updates aria-label to reflect new state
  const pauseBtn = screen.getByRole("button", { name: /Pause preview/i });
  expect(pauseBtn).toHaveAttribute("aria-label", "Pause preview");

  const seek = screen.getByLabelText(/seek preview/i);
  // now that duration is set, seeking to 10 should set audio currentTime
  fireEvent.change(seek, { target: { value: 10 } });
  expect(global._lastAudio.currentTime).toBe(10);
});
