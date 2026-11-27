const {
  directorProvider,
  createDirectorTransport,
  requireDirectorAccess,
} = require("../src/services/studioDirectorProvider");
jest.mock("../src/services/billingService", () => ({ getEffectiveTierSnapshot: jest.fn() }));
const { getEffectiveTierSnapshot } = require("../src/services/billingService");
test("provider selection preserves local mode, refuses unknown providers and needs a configured key", () => {
  expect(directorProvider({})).toBeNull();
  expect(directorProvider({ OPENAI_KEY: "key" })).toEqual({
    provider: "openai",
    model: "gpt-4o-mini",
  });
  expect(directorProvider({ STUDIO_DIRECTOR_PROVIDER: "disabled", OPENAI_KEY: "key" })).toBeNull();
  expect(directorProvider({ STUDIO_DIRECTOR_PROVIDER: "typo", OPENAI_KEY: "key" })).toBeNull();
  expect(directorProvider({ STUDIO_DIRECTOR_LOCAL_PLANNER: "true", OPENAI_KEY: "key" })).toEqual({
    provider: "ollama",
    model: "phi3:latest",
  });
});
test("transport preserves JSON schema/messages and bounds on-demand requests without leaking private prompts into usage metadata", async () => {
  const complete = jest
      .fn()
      .mockResolvedValue({
        choices: [{ finish_reason: "stop", message: { content: '{"name":"Move"}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    controller = new AbortController();
  const transport = createDirectorTransport({
    userId: "owner",
    signal: controller.signal,
    complete,
  });
  expect(complete).not.toHaveBeenCalled();
  const schema = {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  };
  const messages = [{ role: "user", content: "private brief JSON" }];
  const r = await transport({
    model: "gpt-4o-mini",
    messages,
    format: schema,
    options: { num_predict: 180, temperature: 0.2 },
  });
  expect(r.data.message.content).toBe('{"name":"Move"}');
  const [payload, meta] = complete.mock.calls[0];
  expect(payload.response_format.json_schema).toMatchObject({ strict: true, schema });
  expect(payload.messages).toBe(messages);
  expect(meta).toMatchObject({
    userId: "owner",
    feature: "studioDirector",
    timeout: 90000,
    maxContentLength: 131072,
  });
  expect(meta.promptSnippet).toBeUndefined();
  controller.abort();
  expect(meta.signal.aborted).toBe(true);
  expect(complete).toHaveBeenCalledTimes(1);
});
test.each([
  { finish_reason: "length", message: { content: '{"name":' } },
  { finish_reason: "stop", message: { refusal: "no" } },
  { finish_reason: "stop", message: { content: null } },
])("incomplete or refused provider output never becomes a proposal", async choice => {
  const complete = jest.fn().mockResolvedValue({ choices: [choice] });
  await expect(
    createDirectorTransport({ complete })({ model: "gpt-4o-mini", format: "json" })
  ).rejects.toMatchObject({ status: 422 });
  expect(complete).toHaveBeenCalledTimes(1);
});
test.each([
  ["free", 200],
  ["plus", 200],
  ["premium", 200],
])("existing %s access is enforced before inference", async (tier, status) => {
  getEffectiveTierSnapshot.mockResolvedValue({ tierId: tier, testerAccess: null });
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() },
    next = jest.fn();
  await requireDirectorAccess({ user: { uid: "owner" } }, res, next);
  if (status === 200) expect(next).toHaveBeenCalledTimes(1);
  else {
    expect(res.status).toHaveBeenCalledWith(status);
    expect(next).not.toHaveBeenCalled();
  }
});
