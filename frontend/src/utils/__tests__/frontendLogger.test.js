import { send } from "../frontendLogger";

describe("frontendLogger", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async () => ({ ok: true }));
  });
  afterEach(() => jest.resetAllMocks());

  it("falls back to console when disabled", async () => {
    const old = process.env.REACT_APP_ENABLE_FRONTEND_LOGGING;
    process.env.REACT_APP_ENABLE_FRONTEND_LOGGING = "0";
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    await send("info", "hi", { a: 1 });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    process.env.REACT_APP_ENABLE_FRONTEND_LOGGING = old;
  });

  it("posts when enabled", async () => {
    const old = process.env.REACT_APP_ENABLE_FRONTEND_LOGGING;
    process.env.REACT_APP_ENABLE_FRONTEND_LOGGING = "1";
    await send("info", "hi", { a: 1 });
    expect(global.fetch).toHaveBeenCalled();
    process.env.REACT_APP_ENABLE_FRONTEND_LOGGING = old;
  });
});
