const { db } = require("../src/firebaseAdmin");

test("the isolated content query supports field projection without changing stored projects", async () => {
  const collection = db.collection("release_projection_fixture");
  const source = { owner: "owner", title: "Saved project", editor_timeline: { layers: ["retained"] } };
  await collection.doc("mine").set(source);
  await collection.doc("other").set({ ...source, owner: "other" });
  try {
    const snapshot = await collection.where("owner", "==", "owner").select("title").get();
    expect(snapshot.docs.map(doc => [doc.id, doc.data()])).toEqual([["mine", { title: "Saved project" }]]);
    expect((await snapshot.docs[0].ref.get()).data()).toEqual(source);
    expect((await collection.doc("mine").get()).data()).toEqual(source);
  } finally {
    await collection.doc("mine").delete();
    await collection.doc("other").delete();
  }
});
