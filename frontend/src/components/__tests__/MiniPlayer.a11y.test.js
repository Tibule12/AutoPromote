import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MiniPlayer from "../MiniPlayer";

let _realAudio = null;
beforeEach(() => {
  _realAudio = global.Audio;
  global.Audio = function MockAudio() {
    this.play = jest.fn().mockImplementation(() => Promise.resolve());
    this.pause = jest.fn();
    this.addEventListener = (k, fn) => {};
    this.removeEventListener = k => {};
    this.currentTime = 0;
    this.duration = 30;
  };
});
afterEach(() => {
  global.Audio = _realAudio;
});

test("close button is focused on open and Escape closes", () => {
  const onClose = jest.fn();
  render(
    <MiniPlayer track={{ id: "t1", name: "T1", preview_url: "preview://t1" }} onClose={onClose} />
  );

  const close = screen.getByRole("button", { name: /close preview/i });
  expect(close).toHaveFocus();

  const dialog = screen.getByRole("dialog");
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(onClose).toHaveBeenCalled();
});

test("Tab cycles focus inside modal", () => {
  const onClose = jest.fn();
  render(
    <MiniPlayer track={{ id: "t1", name: "T1", preview_url: "preview://t1" }} onClose={onClose} />
  );
  const close = screen.getByRole("button", { name: /close preview/i });
  const play = screen.getByRole("button", { name: /play preview/i });
  const seek = screen.getByLabelText(/seek preview/i);

  expect(close).toHaveFocus();
  const dialog = screen.getByRole("dialog");
  fireEvent.keyDown(dialog, { key: "Tab" });
  // focus should move to play (the next focusable)
  expect(play).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Tab" });
  expect(seek).toHaveFocus();
});
