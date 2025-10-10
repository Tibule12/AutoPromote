const { db } = require('../firebaseAdmin');

describe('Firestore Connectivity', () => {
  it('should write and read a test document', async () => {
    const testRef = db.collection('connectivity_test').doc('testDoc');
    const testData = { value: 'hello', ts: Date.now() };
    await testRef.set(testData);
    const doc = await testRef.get();
    expect(doc.exists).toBe(true);
    expect(doc.data().value).toBe('hello');
  });

  afterAll(async () => {
    await db.collection('connectivity_test').doc('testDoc').delete();
    if (db && db.terminate) {
      await db.terminate().catch(() => {});
    }
  });
});
