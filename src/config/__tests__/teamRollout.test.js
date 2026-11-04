const { teamCollaborationAvailable } = require("../teamRollout");

const local = {
  NODE_ENV: "test",
  TEAM_WORKSPACE_QA: "true",
  GCLOUD_PROJECT: "demo-autopromote-credits",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
};

test("only the explicitly enabled loopback demo admits Team collaboration", () => {
  expect(teamCollaborationAvailable({})).toBe(false);
  expect(teamCollaborationAvailable(local)).toBe(true);
});

test.each([
  { NODE_ENV: "production" },
  { RENDER: "true" },
  { RENDER_SERVICE_ID: "render-service" },
  { K_SERVICE: "cloud-run-service" },
  { FUNCTION_TARGET: "api" },
  { GCLOUD_PROJECT: "autopromote-cc6d3" },
  { FIRESTORE_EMULATOR_HOST: "emulator.example:8080" },
  { FIRESTORE_EMULATOR_HOST: "127.0.0.1.attacker.example:8080" },
  { TEAM_WORKSPACE_QA: "false" },
])("production or incomplete isolation cannot enable Team: %j", override => {
  expect(teamCollaborationAvailable({ ...local, ...override })).toBe(false);
});
