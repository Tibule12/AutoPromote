const express = require("express"),
  request = require("supertest");
jest.mock("../src/authMiddleware", () => (req, res, next) => {
  if (req.get("Authorization") !== "Bearer owner") return res.sendStatus(401);
  req.user = { uid: "owner" };
  next();
});
jest.mock("../src/services/studioDirectorCreativePlanner", () => ({
  createCreativePlanner: jest.fn(),
  localInference: jest.fn(),
}));
jest.mock("../src/services/studioDirectorProvider", () => ({
  ...jest.requireActual("../src/services/studioDirectorProvider"),
  requireDirectorAccess: jest.fn((req, res, next) => next()),
}));
const { requireDirectorAccess } = require("../src/services/studioDirectorProvider");
const { createCreativePlanner } = require("../src/services/studioDirectorCreativePlanner");
const app = express();
app.use(express.json());
app.use("/plan", require("../src/routes/studioDirectorCreativeRoutes"));
afterEach(() => {
  delete process.env.STUDIO_DIRECTOR_LOCAL_PLANNER;
  delete process.env.STUDIO_DIRECTOR_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_KEY;
  jest.clearAllMocks();
});
test("both capability status and planning require normal authentication", async () => {
  expect((await request(app).get("/plan")).status).toBe(401);
  expect((await request(app).post("/plan").send({})).status).toBe(401);
  expect(createCreativePlanner).not.toHaveBeenCalled();
});
test("feature is unavailable by default and never invokes inference", async () => {
  expect(
    (await request(app).get("/plan").set("Authorization", "Bearer owner")).body.available
  ).toBe(false);
  expect(
    (await request(app).post("/plan").set("Authorization", "Bearer owner").send({})).status
  ).toBe(503);
  expect(createCreativePlanner).not.toHaveBeenCalled();
});
test("enabled planning returns the model plan without applying edits or inventing a fallback", async () => {
  process.env.STUDIO_DIRECTOR_LOCAL_PLANNER = "true";
  const planner = jest.fn().mockResolvedValue({ fingerprint: "a".repeat(64) });
  createCreativePlanner.mockReturnValue(planner);
  const response = await request(app)
    .post("/plan")
    .set("Authorization", "Bearer owner")
    .send({ brief: "Move" });
  expect(response.status).toBe(200);
  expect(response.body.plan.fingerprint).toBe("a".repeat(64));
  expect(planner).toHaveBeenCalledWith({ brief: "Move" });
});
test("invalid provider output is refused without a recipe fallback", async () => {
  process.env.STUDIO_DIRECTOR_LOCAL_PLANNER = "true";
  createCreativePlanner.mockReturnValue(
    jest.fn().mockRejectedValue(Object.assign(new Error("Invalid storyboard"), { status: 422 }))
  );
  const response = await request(app).post("/plan").set("Authorization", "Bearer owner").send({});
  expect(response.status).toBe(422);
  expect(response.body.error).toBe("Invalid storyboard");
});

test("configured production provider is available and scoped to the authenticated caller", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  const planner = jest.fn().mockResolvedValue({ fingerprint: "b".repeat(64) });
  createCreativePlanner.mockReturnValue(planner);
  const status = await request(app).get("/plan").set("Authorization", "Bearer owner");
  expect(status.body).toMatchObject({ available: true, provider: "openai" });
  expect(createCreativePlanner).not.toHaveBeenCalled();
  const response = await request(app)
    .post("/plan")
    .set("Authorization", "Bearer owner")
    .send({ brief: "Move" });
  expect(response.status).toBe(200);
  expect(requireDirectorAccess).toHaveBeenCalled();
  expect(createCreativePlanner).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: "openai",
      model: "gpt-4o-mini",
      transport: expect.any(Function),
    })
  );
});
test("access denial prevents any provider request", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  requireDirectorAccess.mockImplementationOnce((req, res) =>
    res.status(403).json({ error: "Not included" })
  );
  expect(
    (await request(app).post("/plan").set("Authorization", "Bearer owner").send({})).status
  ).toBe(403);
  expect(createCreativePlanner).not.toHaveBeenCalled();
});
test("explicit disable takes precedence over an existing provider key", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.STUDIO_DIRECTOR_PROVIDER = "disabled";
  expect(
    (await request(app).get("/plan").set("Authorization", "Bearer owner")).body.available
  ).toBe(false);
  expect((await request(app).post("/plan").set("Authorization", "Bearer owner")).status).toBe(503);
  expect(createCreativePlanner).not.toHaveBeenCalled();
});
