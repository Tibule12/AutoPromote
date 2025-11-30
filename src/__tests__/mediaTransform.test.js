const { enqueueMediaTransformTask, processNextMediaTransformTask } = require('../services/mediaTransform');
const { db } = require('../firebaseAdmin');
const admin = require('../firebaseAdmin').admin;
const fs = require('fs');
const stream = require('stream');

jest.mock('child_process', () => ({
  spawn: jest.fn(() => {
    const events = require('events');
    const emitter = new events.EventEmitter();
    process.nextTick(() => emitter.emit('close', 0));
    emitter.stderr = { on: () => {} };
    return emitter;
  })
}));

describe('mediaTransform', () => {
  it('enqueues and processes a transform task (mocked ffmpeg/storage)', async () => {
    // Mock fetch to return a Readable stream in res.body
    global.fetch = jest.fn(async (url) => ({ ok: true, body: stream.Readable.from(['binarydata']) }));
    // Mock admin.storage bucket upload and file getSignedUrl
    const bucket = { upload: jest.fn(async () => {}), file: jest.fn(() => ({ getSignedUrl: jest.fn(async () => ['https://signed-url.example.com']) })), name: 'test-bucket' };
    admin.storage = jest.fn(() => ({ bucket: () => bucket }));

    // Enqueue a task
    const task = await enqueueMediaTransformTask({ contentId: 'test-content', uid: 'user1', meta: { trimStart: 0, trimEnd: 1 }, url: 'https://example.com/media.mp4' });
    expect(task).toBeDefined();
    // Process the queued task
    const res = await processNextMediaTransformTask();
    expect(res).toBeDefined();
    expect(res.processedUrl).toBeDefined();
  }, 20000);
});
