import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import SpotifyTrackSearch from "../SpotifyTrackSearch";

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("calls /api/spotify/status on mount", async () => {
  // Mock the /api/spotify/status call that runs on mount
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ connected: true, status: "connected" }) });
  render(<SpotifyTrackSearch selectedTracks={[]} onChangeTracks={() => {}} />);
  // Wait for the effect to call the status endpoint
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/spotify/status"))
  );
});

test("debounces input and performs search after 200ms", async () => {
  const fakeResults = {
    results: [{ id: "1", name: "Track 1", artists: ["Artist A"], uri: "spotify:track:1" }],
  };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => fakeResults });

  const onChange = jest.fn();
  render(<SpotifyTrackSearch selectedTracks={[]} onChangeTracks={onChange} />);

  const input = screen.getByLabelText(/Search Spotify tracks/i);
  fireEvent.change(input, { target: { value: "Track" } });

  // Not called immediately due to debounce (there may be an initial /api/spotify/status call)
  expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining("/api/spotify/search"));

  // Advance timer to trigger debounce
  act(() => jest.advanceTimersByTime(200));

  // Wait for results to render
  const item = await screen.findByText("Track 1");
  expect(item).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalled();
});

test("keyboard navigation highlights and Enter selects track", async () => {
  const fakeResults = {
    results: [
      { id: "1", name: "Track 1", artists: ["Artist A"], uri: "spotify:track:1" },
      { id: "2", name: "Track 2", artists: ["Artist B"], uri: "spotify:track:2" },
    ],
  };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => fakeResults });

  const onChange = jest.fn();
  render(<SpotifyTrackSearch selectedTracks={[]} onChangeTracks={onChange} />);

  const input = screen.getByLabelText(/Search Spotify tracks/i);
  fireEvent.change(input, { target: { value: "Track" } });
  act(() => jest.advanceTimersByTime(200));

  // results appear
  await screen.findByText("Track 1");

  // Arrow down to highlight first
  fireEvent.keyDown(input, { key: "ArrowDown" });
  const first = screen.getByRole("option", { name: /Track 1/ });
  expect(first).toHaveClass("highlighted");
  expect(first).toHaveAttribute("aria-selected", "true");

  // Arrow down to second
  fireEvent.keyDown(input, { key: "ArrowDown" });
  const second = screen.getByRole("option", { name: /Track 2/ });
  expect(second).toHaveClass("highlighted");

  // Enter should select highlighted (second)
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith([
    { uri: "spotify:track:2", id: "2", name: "Track 2", artists: ["Artist B"] },
  ]);
});

test("Escape clears results and highlight", async () => {
  const fakeResults = {
    results: [{ id: "1", name: "Track 1", artists: ["A"], uri: "spotify:track:1" }],
  };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => fakeResults });
  render(<SpotifyTrackSearch selectedTracks={[]} onChangeTracks={() => {}} />);
  const input = screen.getByLabelText(/Search Spotify tracks/i);
  fireEvent.change(input, { target: { value: "Track" } });
  act(() => jest.advanceTimersByTime(200));
  await screen.findByText("Track 1");

  fireEvent.keyDown(input, { key: "ArrowDown" });
  const first = screen.getByRole("option", { name: /Track 1/ });
  expect(first).toHaveClass("highlighted");

  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("option", { name: /Track 1/ })).toBeNull();
});

test("result item can be focused and Enter adds track", async () => {
  const fakeResults = {
    results: [{ id: "1", name: "Track 1", artists: ["A"], uri: "spotify:track:1" }],
  };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => fakeResults });
  const onChange = jest.fn();
  render(<SpotifyTrackSearch selectedTracks={[]} onChangeTracks={onChange} />);
  const input = screen.getByLabelText(/Search Spotify tracks/i);
  fireEvent.change(input, { target: { value: "Track" } });
  act(() => jest.advanceTimersByTime(200));
  await screen.findByText("Track 1");

  const first = screen.getByRole("option", { name: /Track 1/ });
  first.focus();
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: "Enter" });
  expect(onChange).toHaveBeenCalled();
});

test("preview button opens mini-player and play toggles", async () => {
  const fakeResults = {
    results: [
      {
        id: "1",
        name: "Track 1",
        artists: ["A"],
        uri: "spotify:track:1",
        preview_url: "preview://1.mp3",
      },
    ],
  };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => fakeResults });
  // mock Audio implementation and capture instance
  const _realAudio = global.Audio;
  global._lastAudio = null;
  function MockAudio(url) {
    global._lastAudio = this;
    this.url = url;
    this.currentTime = 0;
    this.duration = 30;
    this.play = jest.fn().mockResolvedValue();
    this.pause = jest.fn();
    this.addEventListener = jest.fn();
    this.removeEventListener = jest.fn();
  }
  global.Audio = MockAudio;

  render(<SpotifyTrackSearch selectedTracks={[]} onChangeTracks={() => {}} />);
  const input = screen.getByLabelText(/Search Spotify tracks/i);
  fireEvent.change(input, { target: { value: "Track" } });
  act(() => jest.advanceTimersByTime(200));
  await screen.findByText("Track 1");

  const previewBtn = screen.getByRole("button", { name: /Preview Track 1/i });
  expect(previewBtn).toBeInTheDocument();
  fireEvent.click(previewBtn);

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toBeInTheDocument();

  const play = screen.getByRole("button", { name: /Play preview/i });
  fireEvent.click(play);
  expect(global._lastAudio.play).toHaveBeenCalled();
  // cleanup mock instance and restore global Audio
  delete global._lastAudio;
  global.Audio = _realAudio;
});

test("announces add/remove via ARIA live region (stateful parent)", async () => {
  const fakeResults = {
    results: [{ id: "1", name: "Track 1", artists: ["A"], uri: "spotify:track:1" }],
  };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => fakeResults });

  // wrapper to hold selectedTracks state like a parent component
  function Wrapper() {
    const [selected, setSelected] = React.useState([]);
    return (
      <div>
        <button
          aria-label="Inject test selected track"
          onClick={() =>
            setSelected([{ uri: "spotify:track:1", id: "1", name: "Track 1", artists: ["A"] }])
          }
        >
          Inject
        </button>
        <SpotifyTrackSearch selectedTracks={selected} onChangeTracks={setSelected} />
      </div>
    );
  }

  render(<Wrapper />);
  const input = screen.getByLabelText(/Search Spotify tracks/i);
  fireEvent.change(input, { target: { value: "Track" } });
  act(() => jest.advanceTimersByTime(200));

  const addBtn = await screen.findByRole("button", { name: /Add Track 1 to selected tracks/i });
  fireEvent.click(addBtn);
  // live region should contain the announcement
  expect(screen.getByText(/Track 1 added to selection/i)).toBeInTheDocument();

  // Some parent setups might render the selected list asynchronously.
  // Ensure a selected item is present by programmatically setting it, then remove it.
  const inject = screen.getByLabelText("Inject test selected track");
  if (inject) {
    fireEvent.click(inject);
  }
  const remove = await screen.findByLabelText(/Remove Track 1/i);
  fireEvent.click(remove);
  expect(screen.getByText(/Track 1 removed from selection/i)).toBeInTheDocument();
});

test("announces add/remove via ARIA live region", async () => {
  const fakeResults = {
    results: [{ id: "1", name: "Track 1", artists: ["A"], uri: "spotify:track:1" }],
  };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => fakeResults });
  const onChange = jest.fn();
  render(<SpotifyTrackSearch selectedTracks={[]} onChangeTracks={onChange} />);
  const input = screen.getByLabelText(/Search Spotify tracks/i);
  fireEvent.change(input, { target: { value: "Track" } });
  act(() => jest.advanceTimersByTime(200));
  const addBtn = await screen.findByRole("button", { name: /Add Track 1 to selected tracks/i });
  fireEvent.click(addBtn);
  // live region should contain the announcement
  expect(screen.getByText(/Track 1 added to selection/i)).toBeInTheDocument();

  // Because parent owns `selectedTracks`, we only assert the add announcement and that onChange was called.
  expect(onChange).toHaveBeenCalled();
});
