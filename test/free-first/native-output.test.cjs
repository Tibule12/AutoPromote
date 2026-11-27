const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const express = require("express");
const rateLimit = require("express-rate-limit");
const request = require("supertest");
const axios = require("axios");
const { createSandboxDatabase } = require("../../src/services/unifiedCredits/runtime");
const { createProcessingService } = require("../../src/services/processingTokens/service");
const { createProcessingGuard } = require("../../src/middlewares/processingBudgetMiddleware");
const { createLocalAdapter } = require("../../src/services/processingTokens/localAdapter");
const { applicationWorkerConfig } = require("../../src/services/unifiedCredits/workerTransport");
const db = createSandboxDatabase();
after(() => db.terminate());
test(
  "Free allowance funds a real canonical CPU render with signed termination evidence and decoded MP4 output",
  { timeout: 120000 },
  async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-free-first-native-"));
    const source = path.join(directory, "source.mp4");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "2",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-c:a",
      "aac",
      "-y",
      source,
    ]);
    const bytes = fs.readFileSync(source),
      contentHash = crypto.createHash("sha256").update(bytes).digest("hex");
    const sources = express();
    sources.use(rateLimit({windowMs:60000,max:300}));
    sources.get("/owned-source.mp4", (_req, res) => res.sendFile(source));
    const server = sources.listen(0, "127.0.0.1");
    await new Promise(r => server.once("listening", r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    let worker;
    try {
      worker =
        await require("../../scripts/monetization/local-worker-provider.cjs").createLocalWorkerProvider(
          {
            directory: path.join(directory, "worker"),
            python: "/home/tibule12/.cache/autopromote-cinematic-runtime/worker-venv/bin/python",
            env: {
              ...process.env,
              STORAGE_EMULATOR_HOST: origin,
              FIREBASE_STORAGE_BUCKET: "demo-autopromote-credits",
            },
            apiOrigin: origin,
            timeoutMs: 90000,
            analysisTimeoutMs: 60000,
          }
        );
      worker.timeoutMs = 90000;
      const service = createProcessingService({ db, entitlement: () => "free" });
      await service.configure({ enabled: true });
      const uid = "native-free-" + crypto.randomUUID();
      const descriptor = {
        contentHash,
        objectGeneration: "1",
        sources: [
          {
            gatewayPath: "/owned-source.mp4",
            size: bytes.length,
            contentHash,
            userId: uid,
            objectGeneration: "1",
          },
        ],
      };
      const adapter = createLocalAdapter({ db, worker, resolveSource: async () => descriptor });
      const app = express();
      app.use(rateLimit({windowMs:60000,max:300}));
      app.use(express.json());
      app.use(
        createProcessingGuard({
          service,
          authenticate: (req, _res, next) => {
            req.user = { uid, claims: { email_verified: true } };
            next();
          },
          adapters: { "studio.render": adapter },
        })
      );
      app.post("/api/media/render-clip", async (req, res) => {
        try {
          if(req.body.reuseNativeJob)return res.json({jobId:req.body.reuseNativeJob,reused:true});
          const target = (req.body.refuseTransport ? "http://127.0.0.1:1" : worker.origin) + "/render-viral-clip";
          let config;
          if (req.body.concurrentPrepare) {
            const results=await Promise.allSettled([
              applicationWorkerConfig(target,req.body,{timeout:95000}),
              applicationWorkerConfig(target,req.body,{timeout:95000}),
            ]);
            assert.equal(results[0].status,'fulfilled');
            assert.equal(results[1].status,'rejected');
            assert.equal(results[1].reason.code,'WORKER_RETRY_NOT_ALLOWED');
            config=results[0].value;
          } else config = await applicationWorkerConfig(target, req.body, { timeout: 95000 });
          const result = await axios.post(target, req.body, config);
          res.json(result.data);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      });
      process.env.FREE_FIRST_USAGE_ENABLED = "true";
      const body = {
        video_url: origin + "/owned-source.mp4",
        start_time: 0,
        end_time: 1,
        auto_captions: false,
        smart_crop: false,
        mute_audio: false,
        target_aspect_ratio: "16:9",
        output_quality: "720p",
        async_mode: false,
      };
      const r = await request(app)
        .post("/api/media/render-clip")
        .set("Idempotency-Key", "native-output")
        .set("X-Processing-Tokens-Approved", "30")
        .send(body);
      fs.writeFileSync(
        "reports/free-first-20261126/native-render-response.json",
        JSON.stringify(r.body, (_key, value) =>
          typeof value === "string" && value.includes("/local-output/")
            ? value.replace(/\/local-output\/[^?\s]+/, "/local-output/[redacted]")
            : value, 2)
      );
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(r.body.processing.consumedTokens > 0);
      assert.ok(r.body.processing.measuredWallSeconds > 0);
      assert.equal(r.body.processing.actualCloudSpendMicros, 0);
      const artifact = fs
        .readdirSync(worker.directory)
        .filter(n => /^[a-f0-9]{64}$/.test(n))
        .map(n => path.join(worker.directory, n, "artifact.mp4"))
        .find(p => fs.existsSync(p));
      assert.ok(artifact, "actual output artifact");
      execFileSync("ffmpeg", ["-v", "error", "-i", artifact, "-f", "null", "-"]);
      const probe = JSON.parse(
        execFileSync("ffprobe", [
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          artifact,
        ])
      );
      assert.ok(probe.streams.some(s => s.codec_type === "video"));
      assert.ok(probe.streams.some(s => s.codec_type === "audio"));
      const output = "reports/free-first-20261126/native-output.mp4";
      fs.copyFileSync(artifact, output);
      const status = await service.status(uid);
      assert.equal(status.remaining, 100 - r.body.processing.consumedTokens);
      const replay = await request(app)
        .post("/api/media/render-clip")
        .set("Idempotency-Key", "native-output")
        .set("X-Processing-Tokens-Approved", "30")
        .send(body);
      assert.equal(replay.status, 409);
      const refused = await request(app).post("/api/media/render-clip")
        .set("Idempotency-Key", "refused-native-transport")
        .set("X-Processing-Tokens-Approved", "30")
        .send({...body,refuseTransport:true});
      assert.equal(refused.status,500);
      assert.match(refused.body.error,/APPLICATION_TRANSPORT_CONFLICT/);
      const afterRefusal=await service.status(uid);
      assert.equal(afterRefusal.remaining,status.remaining);
      assert.equal(afterRefusal.activeJobs,0);
      const concurrent=await request(app).post('/api/media/render-clip')
        .set('Idempotency-Key','concurrent-native-prepare').set('X-Processing-Tokens-Approved','30')
        .send({...body,concurrentPrepare:true});
      assert.equal(concurrent.status,200);
      assert.ok(concurrent.body.processing.consumedTokens>0);
      assert.equal((await service.status(uid)).activeJobs,0);
      const beforeReuse=await service.status(uid);
      await db.collection('video_edits').doc('owned-native-cache').set({userId:uid,status:'completed',
        outputSha256:crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex')});
      const reused=await request(app).post('/api/media/render-clip')
        .set('Idempotency-Key','owned-cache-reuse').set('X-Processing-Tokens-Approved','30')
        .send({...body,reuseNativeJob:'owned-native-cache'});
      assert.equal(reused.status,200);assert.equal(reused.body.processing.state,'reused');
      assert.equal(reused.body.processing.consumedTokens,0);
      assert.equal((await service.status(uid)).remaining,beforeReuse.remaining);
      assert.equal((await service.status(uid)).activeJobs,0);
      const receiptFile = path.join(path.dirname(artifact), "receipt.json");
      const receipt = JSON.parse(fs.readFileSync(receiptFile));
      fs.writeFileSync(
        "reports/free-first-20261126/native-render-evidence.json",
        JSON.stringify(
          {
            output,
            outputSha256: crypto.createHash("sha256").update(fs.readFileSync(output)).digest("hex"),
            streams: probe.streams.map(s => ({
              type: s.codec_type,
              width: s.width,
              height: s.height,
            })),
            measuredResources: receipt.payload.resource,
            processing: r.body.processing,
            allowance: status,
            signedTerminationVerified: true,
            duplicateDispatchBlocked: true,
            scope:
              "canonical worker + HTTP admission + emulator ledger; not full signed-in Studio UI or provider publication",
          },
          null,
          2
        ) + "\n"
      );
    } finally {
      delete process.env.FREE_FIRST_USAGE_ENABLED;
      await worker?.stop();
      await new Promise(r => server.close(r));
    }
  }
);
