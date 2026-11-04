const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const projectId = "demo-autopromote-community-publishing";
if (
  process.env.COMMUNITY_TEST_PROJECT !== projectId ||
  !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") ||
  require("../src/utils/authAuthority").isHostedRuntime()
)
  throw new Error("Own loopback demo emulator required");
const cache = (file, exports) => {
  const id = require.resolve(path.resolve(__dirname, "..", file));
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
let db,
  service,
  delivery,
  app,
  request,
  calls,
  providerError,
  memberStatus,
  botCanPost,
  lostResponse,
  wrongTarget,
  receipt,
  channel;
const mediaUrl = "https://storage.googleapis.com/demo-autopromote-community-publishing/source.mp4";
const webhook = {
  type: 1,
  id: "123456789012345678",
  channel_id: "223456789012345678",
  guild_id: "323456789012345678",
  application_id: "423456789012345678",
  token: "fixture-only-webhook-token-not-real",
  name: "Announcements",
};
const reply = (json, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => json,
});
before(async () => {
  const { Firestore } = require("firebase-admin/firestore");
  db = new Firestore({ projectId, host: process.env.FIRESTORE_EMULATOR_HOST, ssl: false });
  cache("src/firebaseAdmin.js", { db, admin: {} });
  cache("src/services/billingService.js", { checkConnectionLimit: async () => {} });
  cache("src/authMiddleware.js", (req, res, next) => {
    const uid = { "Bearer owner-fixture": "owner", "Bearer other-fixture": "other" }[
      req.headers.authorization
    ];
    if (!uid) return res.sendStatus(401);
    req.userId = uid;
    req.user = { uid };
    next();
  });
  process.env.GENERIC_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  process.env.DISCORD_CLIENT_ID = webhook.application_id;
  process.env.DISCORD_CLIENT_SECRET = "fixture-only-client-secret";
  process.env.TELEGRAM_BOT_TOKEN = "fixture-only-bot-token";
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith("https://api.telegram.org/")) {
      const method = url.split("/").pop(),
        body = JSON.parse(options.body);
      if (method === "getMe") return reply({ ok: true, result: { id: 999 } });
      if (method === "getChat")
        return reply({
          ok: true,
          result: {
            id: body.chat_id === "101" ? 101 : -10012345,
            title: "Creator channel",
            type: body.chat_id === "101" ? "private" : "channel",
          },
        });
      if (method === "getChatMember")
        return reply({
          ok: true,
          result: {
            status: body.user_id === 999 ? "administrator" : memberStatus,
            can_post_messages: body.user_id === 999 ? botCanPost : true,
          },
        });
      if (method.startsWith("send")) {
        if (lostResponse) throw new Error("fixture connection lost");
        if (providerError) return reply({ ok: false, error_code: providerError }, providerError);
        return reply({
          ok: true,
          result: {
            message_id: 777,
            chat: { id: wrongTarget ? 101 : Number(body.chat_id) },
            ...(body.video ? { video: { file_id: "fixture-video" } } : {}),
            ...(body.photo ? { photo: [{ file_id: "fixture-photo" }] } : {}),
          },
        });
      }
    }
    if (url === "https://discord.com/api/oauth2/token")
      return reply({ access_token: "fixture-access", scope: "identify webhook.incoming", webhook });
    if (url === "https://discord.com/api/v10/oauth2/@me")
      return reply({
        application: { id: webhook.application_id },
        scopes: ["identify"],
        expires: new Date(Date.now() + 3600000).toISOString(),
        user: { id: "501000000000000000", username: "Creator" },
      });
    if (url.startsWith("https://discord.com/api/v10/webhooks/")) {
      if (options.method !== "POST") return reply(webhook);
      if (lostResponse) throw new Error("fixture network loss");
      if (providerError) return reply({ code: "fixture-rejection" }, providerError);
      return reply({
        id: "623456789012345678",
        channel_id: wrongTarget ? "99999999999" : webhook.channel_id,
        attachments: [{ id: "file", size: 16 }],
      });
    }
    if (url === mediaUrl)
      return {
        ok: true,
        headers: new Map([
          ["content-type", "video/mp4"],
          ["content-length", "16"],
        ]),
        body: (async function* () {
          yield Buffer.alloc(16);
        })(),
      };
    throw new Error("Unexpected outbound request blocked by fixture");
  };
  service = require("../src/services/communityPublishing");
  delivery = require("../src/services/communityDelivery");
  const express = require("express");
  app = express();
  app.use(express.json());
  app.use("/destinations", require("../src/routes/communityPublishingRoutes"));
  request = require("supertest");
  await db
    .collection("users")
    .doc("owner")
    .collection("connections")
    .doc("telegram")
    .set({ connected: true, profile: { id: 101 }, meta: { chatId: 101 } });
  await db
    .collection("content")
    .doc("movie")
    .set({ user_id: "owner", type: "video", url: mediaUrl });
});
beforeEach(() => {
  calls = [];
  providerError = null;
  memberStatus = "administrator";
  botCanPost = true;
  lostResponse = false;
  wrongTarget = false;
  receipt = null;
});
after(async () => {
  await db?.terminate();
});
const sends = () =>
  calls.filter(
    c =>
      /\/send(Video|Photo|Message)$/.test(c.url) ||
      (c.options.method === "POST" && c.url.includes("/webhooks/"))
  );
const send = (platform, overrides = {}) =>
  delivery.deliver({
    uid: "owner",
    contentId: "movie",
    platform,
    payload: { destinationId: channel.id, message: "New release" },
    onSubmissionAccepted: async r => {
      receipt = r;
    },
    ...overrides,
  });

test("destination routes reject anonymous users and never disclose credentials", async () => {
  assert.equal((await request(app).get("/destinations/telegram")).status, 401);
  const result = await request(app)
    .get("/destinations/discord")
    .set("Authorization", "Bearer owner-fixture");
  assert.equal(result.status, 200);
  assert(!JSON.stringify(result.body).includes(webhook.token));
});
test("Telegram verifies human admin and bot posting permission without sending", async () => {
  channel = await service.addTelegramDestination("owner", "@creatorchannel");
  assert.equal(channel.targetId, "-10012345");
  assert.equal(sends().length, 0);
  const r = await send("telegram");
  assert.equal(r.success, true);
  const sent = JSON.parse(sends()[0].options.body);
  assert.equal(sent.chat_id, "-10012345");
  assert.equal(sent.video, mediaUrl);
  assert.notEqual(sent.chat_id, "101");
  assert.equal(receipt.messageId, "777");
});
test("Telegram rejects unrelated users and missing bot permission", async () => {
  memberStatus = "member";
  await assert.rejects(service.addTelegramDestination("owner", "@creatorchannel"), /administer/);
  memberStatus = "administrator";
  botCanPost = false;
  await assert.rejects(service.addTelegramDestination("owner", "@creatorchannel"), /permission/);
  assert.equal(sends().length, 0);
});
test("Telegram permissions are rechecked at dispatch", async () => {
  channel = await service.addTelegramDestination("owner", "@creatorchannel");
  botCanPost = false;
  await assert.rejects(send("telegram"), /permission/);
  assert.equal(sends().length, 0);
});
test("a selected destination cannot be borrowed from another AutoPromote user", async () => {
  channel = await service.addTelegramDestination("owner", "@creatorchannel");
  await db
    .collection("users")
    .doc("other")
    .collection("connections")
    .doc("telegram")
    .set({ connected: true, profile: { id: 202 } });
  await assert.rejects(send("telegram", { uid: "other" }), /not authorised/);
  assert.equal(sends().length, 0);
});
test("Discord consent requests webhook access and rejects forged/expired/wrong-provider state", async () => {
  const started = await service.prepareDiscord("owner");
  const url = new URL(started.authUrl);
  assert.equal(url.searchParams.get("scope"), "identify webhook.incoming");
  await assert.rejects(service.completeDiscord({ state: "owner:popup", code: "fixture" }));
  const state = url.searchParams.get("state");
  await db
    .collection("oauth_states")
    .doc(state)
    .update({ expiresAt: Date.now() - 1 });
  await assert.rejects(service.completeDiscord({ state, code: "fixture" }));
  await db
    .collection("oauth_states")
    .doc(state)
    .update({ expiresAt: Date.now() + 1000, platform: "telegram" });
  await assert.rejects(service.completeDiscord({ state, code: "fixture" }));
  assert.equal(calls.length, 0);
});
test("Discord callback atomically consumes state, encrypts the webhook and returns no secrets", async () => {
  const started = await service.prepareDiscord("owner");
  const state = new URL(started.authUrl).searchParams.get("state");
  const results = await Promise.allSettled([
    service.completeDiscord({ state, code: "fixture" }),
    service.completeDiscord({ state, code: "fixture" }),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  channel = results.find(r => r.status === "fulfilled").value;
  const stored = (await service.destinations("owner", "discord").doc(channel.id).get()).data();
  assert.notEqual(stored.encryptedWebhookToken, webhook.token);
  assert.equal(calls.filter(c => c.url.includes("oauth2/token")).length, 1);
  assert(
    !JSON.stringify(await service.listDestinations("owner", "discord")).includes(webhook.token)
  );
});
test("Discord uploads actual bytes with wait=true and requires a real channel/message receipt", async () => {
  channel = (await service.listDestinations("owner", "discord"))[0];
  const result = await send("discord");
  assert.equal(result.postId, "623456789012345678");
  assert.equal(sends().length, 1);
  assert(sends()[0].url.endsWith("?wait=true"));
  const multipart = sends()[0].options.body.toString();
  assert(multipart.includes('name="files[0]"'));
  assert(multipart.includes('"allowed_mentions":{"parse":[]}'));
  assert.equal(receipt.messageId, result.messageId);
});
for (const platform of ["telegram", "discord"]) {
  test(`${platform}: provider rejection cannot be reported as published`, async () => {
    channel = (await service.listDestinations("owner", platform))[0];
    providerError = 403;
    await assert.rejects(send(platform), e => e.errorClass === "auth");
    assert.equal(receipt, null);
  });
  test(`${platform}: a wrong-channel response is not success`, async () => {
    channel = (await service.listDestinations("owner", platform))[0];
    wrongTarget = true;
    await assert.rejects(send(platform), e => e.errorClass === "publication_unconfirmed");
    assert.equal(receipt.messageId, undefined);
  });
  test(`${platform}: lost response and API restart cannot resubmit`, async () => {
    channel = (await service.listDestinations("owner", platform))[0];
    lostResponse = true;
    await assert.rejects(send(platform), e => e.errorClass === "publication_unconfirmed");
    const saved = receipt;
    assert(saved.binding);
    lostResponse = false;
    await assert.rejects(
      send(platform, { submissionReceipt: saved }),
      e => e.errorClass === "publication_unconfirmed"
    );
    assert.equal(sends().length, 1);
  });
  test(`${platform}: persisted success recovers without another publication`, async () => {
    channel = (await service.listDestinations("owner", platform))[0];
    const first = await send(platform);
    const saved = receipt;
    const recovered = await send(platform, { submissionReceipt: saved });
    assert.deepEqual(first, recovered);
    assert.equal(sends().length, 1);
  });
}
test("Discord explicit link mode skips attachment download; native mode never silently degrades", async () => {
  channel = (await service.listDestinations("owner", "discord"))[0];
  await send("discord", {
    payload: { destinationId: channel.id, deliveryMode: "link", message: "Release" },
  });
  assert.equal(calls.filter(c => c.url === mediaUrl).length, 0);
  assert(JSON.parse(sends()[0].options.body).content.includes(mediaUrl));
});
test("a manipulated media URL is rejected before any provider send", async () => {
  channel = (await service.listDestinations("owner", "discord"))[0];
  await assert.rejects(
    send("discord", {
      payload: { destinationId: channel.id, media_url: "https://attacker.invalid/source.mp4" },
    }),
    /owned media/
  );
  assert.equal(sends().length, 0);
});
test("Telegram connection states are private, owner-bound, platform-bound and single-use", async () => {
  const state = crypto.randomBytes(24).toString("hex");
  const ref = db.collection("oauth_states").doc(state);
  await ref.set({ uid: "new-owner", platform: "telegram", expiresAt: Date.now() + 10000 });
  const msg = { chat: { id: 303, type: "private" }, from: { id: 303, username: "NewCreator" } };
  await assert.rejects(
    service.consumeTelegramConnection(state, { ...msg, chat: { id: -999, type: "group" } })
  );
  const result = await Promise.allSettled([
    service.consumeTelegramConnection(state, msg),
    service.consumeTelegramConnection(state, msg),
  ]);
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await db.doc("users/new-owner/connections/telegram").get()).data().profile.id, 303);
  assert.equal((await ref.get()).exists, false);
});
test("Telegram delivers photos and text through the corresponding native methods", async () => {
  channel = (await service.listDestinations("owner", "telegram"))[0];
  await db.collection("content").doc("photo").set({
    user_id: "owner",
    type: "image",
    url: "https://storage.googleapis.com/demo-autopromote-community-publishing/photo.png",
  });
  await send("telegram", { contentId: "photo" });
  assert(sends()[0].url.endsWith("/sendPhoto"));
  await send("telegram", { contentId: null });
  assert(sends()[1].url.endsWith("/sendMessage"));
});
test("Discord oversized declared media fails before a send intent or provider POST", async () => {
  channel = (await service.listDestinations("owner", "discord"))[0];
  const previousFetch = global.fetch;
  global.fetch = async (url, opts) =>
    url === mediaUrl
      ? { ok: true, headers: new Map([["content-length", String(11 * 1024 * 1024)]]), body: null }
      : previousFetch(url, opts);
  try {
    await assert.rejects(send("discord"), /10 MiB/);
    assert.equal(sends().length, 0);
    assert.equal(receipt, null);
  } finally {
    global.fetch = previousFetch;
  }
});
test("Discord streaming media is bounded even when its length is absent", async () => {
  channel = (await service.listDestinations("owner", "discord"))[0];
  const previousFetch = global.fetch;
  global.fetch = async (url, opts) =>
    url === mediaUrl
      ? {
          ok: true,
          headers: new Map([["content-type", "video/mp4"]]),
          body: (async function* () {
            yield Buffer.alloc(6 * 1024 * 1024);
            yield Buffer.alloc(6 * 1024 * 1024);
          })(),
        }
      : previousFetch(url, opts);
  try {
    await assert.rejects(send("discord"), /10 MiB/);
    assert.equal(sends().length, 0);
    assert.equal(receipt, null);
  } finally {
    global.fetch = previousFetch;
  }
});
test("Discord authorisation fails closed without token encryption", async () => {
  const saved = process.env.GENERIC_TOKEN_ENCRYPTION_KEY;
  delete process.env.GENERIC_TOKEN_ENCRYPTION_KEY;
  try {
    await assert.rejects(service.prepareDiscord("owner"), /configuration/);
    assert.equal(calls.length, 0);
  } finally {
    process.env.GENERIC_TOKEN_ENCRYPTION_KEY = saved;
  }
});
test("old destinations do not resurrect after connecting a different provider account", async () => {
  await db
    .collection("users")
    .doc("owner")
    .collection("connections")
    .doc("discord")
    .update({ "meta.id": "different-provider-account" });
  assert.deepEqual(await service.listDestinations("owner", "discord"), []);
});

test("repaired Firestore Rules deny client reads and forged destination credentials", async () => {
  const { initializeTestEnvironment, assertFails } = require("@firebase/rules-unit-testing");
  const { doc, getDoc, setDoc } = require("firebase/firestore");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { host, port: Number(port) },
  });
  try {
    const client = env.authenticatedContext("owner", { email_verified: true }).firestore();
    const ref = doc(
      client,
      "users/owner/connections/discord/publishingDestinations/" + service.idOf(webhook.channel_id)
    );
    await assertFails(getDoc(ref));
    await assertFails(
      setDoc(ref, { encryptedWebhookToken: "client-forgery", targetId: "attacker-channel" })
    );
  } finally {
    await env.cleanup();
  }
});

test("Queue marks a matching owned schedule published only from a concrete provider receipt", async () => {
  const destinationId = service.idOf(webhook.channel_id);
  await db.doc("promotion_schedules/owned-schedule").set({
    user_id: "owner",
    contentId: "movie",
    platform: "discord",
    status: "executed",
    isActive: false,
    result: { taskId: "delivery-task" },
    platformSpecificSettings: { destinationId },
  });
  const task = {
    id: "delivery-task",
    uid: "owner",
    contentId: "movie",
    platform: "discord",
    payload: { scheduleId: "owned-schedule" },
  };
  await service.recordScheduleOutcome(
    { ...task, uid: "other" },
    { success: true, destinationId, messageId: "123" }
  );
  assert.equal(
    (await db.doc("promotion_schedules/owned-schedule").get()).data().status,
    "executed"
  );
  await service.recordScheduleOutcome(task, { success: true, destinationId, messageId: "123" });
  assert.equal(
    (await db.doc("promotion_schedules/owned-schedule").get()).data().status,
    "completed"
  );
});
test("a late provider receipt records history without resuming a paused schedule", async () => {
  const ref = db.doc("promotion_schedules/owned-schedule");
  await ref.update({ status: "paused" });
  await service.recordScheduleOutcome(
    {
      id: "delivery-task",
      uid: "owner",
      contentId: "movie",
      platform: "discord",
      payload: { scheduleId: "owned-schedule" },
    },
    { success: true, destinationId: service.idOf(webhook.channel_id), messageId: "123" }
  );
  assert.equal((await ref.get()).data().status, "paused");
});

test("a read-only workspace member cannot authorise a new publishing destination", async () => {
  await db.doc("workspaces/team-fixture").set({ ownerUid: "owner" });
  await db.doc("workspaces/team-fixture/members/other").set({ role: "viewer", status: "active" });
  const response = await request(app)
    .post("/destinations/telegram")
    .set("Authorization", "Bearer other-fixture")
    .set("X-Workspace-Id", "team-fixture")
    .send({ chatId: "@creatorchannel" });
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

async function freshDiscord(uid = "owner") {
  const request = await service.prepareDiscord(uid);
  return { state: new URL(request.authUrl).searchParams.get("state"), code: "fixture-code" };
}
test("Discord distinguishes expired, replayed and malformed connection links", async () => {
  const request = await freshDiscord();
  await db
    .collection("oauth_states")
    .doc(request.state)
    .update({ expiresAt: Date.now() - 1 });
  await assert.rejects(
    service.completeDiscord(request),
    error => service.describeDiscordFailure(error).code === "state_expired"
  );
  await db.collection("oauth_states").doc(request.state).delete();
  await assert.rejects(
    service.completeDiscord(request),
    error => service.describeDiscordFailure(error).code === "state_unavailable"
  );
  await assert.rejects(
    service.completeDiscord({ state: "forged:owner", code: "fixture" }),
    error => service.describeDiscordFailure(error).code === "invalid_request"
  );
  assert.equal(calls.length, 0);
});
test("Discord reports changed client binding without exchanging a code", async () => {
  const request = await freshDiscord();
  await db.collection("oauth_states").doc(request.state).update({ clientId: "different-client" });
  await assert.rejects(
    service.completeDiscord(request),
    error => service.describeDiscordFailure(error).code === "client_changed"
  );
  assert.equal(calls.length, 0);
});
test("Discord token rejection exposes only an allowlisted provider code", async () => {
  const request = await freshDiscord(),
    original = global.fetch;
  global.fetch = async () =>
    reply({ error: "invalid_client", error_description: "private-fixture-code-and-secret" }, 401);
  try {
    await assert.rejects(service.completeDiscord(request), error => {
      const detail = service.describeDiscordFailure(error);
      assert.equal(detail.code, "token_exchange");
      assert.equal(detail.providerCode, "invalid_client");
      assert(!JSON.stringify(detail).includes("private-fixture"));
      return true;
    });
  } finally {
    global.fetch = original;
  }
});
test("Discord webhook/identity contract failures retain their actual stage", async () => {
  const original = global.fetch;
  for (const [response, expected] of [
    [{ access_token: "fixture", scope: "identify webhook.incoming" }, "webhook_missing"],
    [
      {
        access_token: "fixture",
        scope: "identify webhook.incoming",
        webhook: { ...webhook, application_id: "other-client" },
      },
      "webhook_application",
    ],
    [{ access_token: "fixture", scope: "identify webhook.incoming", webhook }, "identity_lookup"],
  ]) {
    const request = await freshDiscord();
    global.fetch = async (url, options) => {
      if (url.endsWith("/oauth2/@me")) {
        const grant = await (await original(url, options)).json();
        return reply({ ...grant, user: { id: "invalid-identity" } });
      }
      return reply(response);
    };
    try {
      await assert.rejects(
        service.completeDiscord(request),
        error => service.describeDiscordFailure(error).code === expected
      );
    } finally {
      global.fetch = original;
    }
  }
});
test("untrusted exception fields cannot leak callback codes, tokens or descriptions", () => {
  const secret = "private-fixture-callback-and-token";
  const detail = service.describeDiscordFailure({
    message: secret,
    discordCode: secret,
    oauthError: secret,
  });
  assert.equal(detail.code, "callback_failed");
  assert(!JSON.stringify(detail).includes(secret));
});

test("nullable webhook app ID and omitted scope echo require a verified live OAuth grant", async () => {
  const original = global.fetch,
    seen = [];
  const hook = { ...webhook, application_id: null };
  global.fetch = async (url, options) => {
    seen.push({ url, method: options?.method || "GET" });
    if (url.endsWith("/oauth2/token"))
      return reply({ access_token: "fixture-access", webhook: hook });
    if (url.includes("/webhooks/")) return reply(hook);
    return original(url, options);
  };
  try {
    const d = await service.completeDiscord(await freshDiscord("nullable-hook-owner"));
    const stored = (
      await service.destinations("nullable-hook-owner", "discord").doc(d.id).get()
    ).data();
    assert.equal(stored.verificationVersion, 2);
    assert.equal(stored.oauthApplicationId, webhook.application_id);
    assert.notEqual(stored.encryptedWebhookToken, webhook.token);
    assert(!JSON.stringify(d).includes(webhook.token));
    assert.equal(
      (await service.resolveDestination("nullable-hook-owner", "discord", { destinationId: d.id }))
        .targetId,
      webhook.channel_id
    );
    assert(seen.some(x => x.url.endsWith("/oauth2/@me") && x.method === "GET"));
    assert.equal(seen.filter(x => x.url.includes("/webhooks/")).length, 2);
    assert.equal(seen.filter(x => x.method === "POST").length, 1); // Token exchange only; no message.
  } finally {
    global.fetch = original;
  }
});

for (const [label, patch, expected] of [
  ["different application", { application: { id: "923456789012345678" } }, "grant_application"],
  ["malformed scope list", { scopes: null }, "grant_scopes"],
  ["missing identity scope", { scopes: ["webhook.incoming"] }, "grant_scopes"],
  ["expired grant", { expires: "2000-01-01T00:00:00Z" }, "grant_expired"],
  ["invalid expiry", { expires: "invalid" }, "grant_expired"],
  ["missing human identity", { user: null }, "identity_lookup"],
]) {
  test(`Discord rejects ${label} before storing a nullable-app webhook`, async () => {
    const uid = "invalid-grant-" + expected + "-" + label.replaceAll(" ", "-");
    const original = global.fetch;
    global.fetch = async (url, options) => {
      const data = await (await original(url, options)).json();
      if (url.endsWith("/oauth2/token"))
        return reply({ ...data, webhook: { ...webhook, application_id: null } });
      return reply(url.endsWith("/oauth2/@me") ? { ...data, ...patch } : data);
    };
    try {
      await assert.rejects(
        service.completeDiscord(await freshDiscord(uid)),
        error => service.describeDiscordFailure(error).code === expected
      );
      assert.equal((await service.destinations(uid, "discord").get()).size, 0);
      assert.equal(calls.filter(x => x.url.includes("/webhooks/")).length, 0);
    } finally {
      global.fetch = original;
    }
  });
}

test("Discord rejects changed live webhook channel, guild, application, ID or type", async () => {
  const original = global.fetch;
  for (const patch of [
    { channel_id: "923456789012345678" },
    { guild_id: "923456789012345678" },
    { application_id: "923456789012345678" },
    { id: "923456789012345678" },
    { type: 2 },
  ]) {
    const uid = "bad-live-hook-" + Object.keys(patch)[0];
    global.fetch = async (url, options) =>
      url.includes("/webhooks/") ? reply({ ...webhook, ...patch }) : original(url, options);
    try {
      await assert.rejects(
        service.completeDiscord(await freshDiscord(uid)),
        error => service.describeDiscordFailure(error).code === "webhook_binding"
      );
      assert.equal((await service.destinations(uid, "discord").get()).size, 0);
    } finally {
      global.fetch = original;
    }
  }
});

test("dispatch requires the stored OAuth application binding and preserves legacy fail-closed behaviour", async () => {
  const uid = "nullable-hook-owner",
    id = service.idOf(webhook.channel_id);
  const ref = service.destinations(uid, "discord").doc(id),
    saved = (await ref.get()).data();
  const original = global.fetch;
  global.fetch = async () => reply({ ...webhook, application_id: null });
  try {
    await ref.set({ ...saved, oauthApplicationId: "other-client" });
    await assert.rejects(
      service.resolveDestination(uid, "discord", { destinationId: id }),
      /changed/
    );
    const legacy = { ...saved };
    delete legacy.verificationVersion;
    delete legacy.oauthApplicationId;
    await ref.set(legacy);
    await assert.rejects(
      service.resolveDestination(uid, "discord", { destinationId: id }),
      /changed/
    );
    await ref.set(saved);
    assert.equal(
      (await service.resolveDestination(uid, "discord", { destinationId: id })).targetId,
      webhook.channel_id
    );
  } finally {
    global.fetch = original;
    await ref.set(saved);
  }
});
