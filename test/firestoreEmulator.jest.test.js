const { randomUUID } = require('node:crypto');
const { Firestore } = require('@google-cloud/firestore');

const host = process.env.FIRESTORE_EMULATOR_HOST;
const emulatorTest = host ? test : test.skip;

emulatorTest('the emulator-backed runner exposes a real Firestore transaction endpoint', async () => {
  // This check must never access an actual cloud project.
  expect(host).toMatch(/^(?:127\.0\.0\.1|localhost):\d+$/);
  const db = new Firestore({ projectId: 'demo-autopromote-ci' });
  const document = db.collection('emulator_smoke_checks').doc(randomUUID());
  try {
    await document.set({ count: 1, purpose: 'local-ci-fixture' });
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(document);
      transaction.update(document, { count: snapshot.get('count') + 1 });
    });
    expect((await document.get()).data()).toEqual({ count: 2, purpose: 'local-ci-fixture' });
    await document.delete();
    expect((await document.get()).exists).toBe(false);
  } finally {
    await document.delete();
    await db.terminate();
  }
});
