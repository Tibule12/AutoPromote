// Run all major platform feature tests in one suite
const request = require("supertest");
const app = require("../server");
let server;
let agent;
const { db } = require("../firebaseAdmin");

describe("All Platform Features Integration", () => {
  beforeAll(done => {
    server = app.listen(0, () => {
      agent = request.agent(server);
      done();
    });
  });
  afterAll(async () => {
    if (db && db.terminate) await db.terminate().catch(() => {});
    jest.clearAllTimers();
    if (server && server.close) await new Promise(resolve => server.close(resolve));
  });

  require("./contentUpload.integration.test");
  require("./platform.features.integration.test");
  // Add other test files here as needed
});
