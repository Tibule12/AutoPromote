import { listViralStudioProjects, saveViralStudioProject } from "../viralStudioProjectStore";
import { openDB } from "idb";

const mockPut = jest.fn();
const mockGetAll = jest.fn();
jest.mock("idb", () => ({ openDB: jest.fn(async () => ({ put: mockPut, getAll: mockGetAll })) }));

test("a denied persistence request does not discard the successfully saved editable project", async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  const previousIndexedDB = Object.getOwnPropertyDescriptor(window, "indexedDB");
  const persist = jest.fn().mockRejectedValue(new Error("Browser declined persistence"));
  Object.defineProperty(navigator, "storage", { configurable: true, value: { persist } });
  Object.defineProperty(window, "indexedDB", { configurable: true, value: {} });
  mockPut.mockResolvedValue(undefined);
  openDB.mockResolvedValue({ put: mockPut, getAll: mockGetAll });
  try {
    const project = { id: "saved-edit", snapshot: { timeline: [{ id: "cut-one" }] } };
    const saved = await saveViralStudioProject(project);
    expect(saved.snapshot).toEqual(project.snapshot);
    expect(mockPut).toHaveBeenCalledWith("projects", saved);
    expect(persist).toHaveBeenCalledTimes(1);

    const ownedSaved = await saveViralStudioProject(
      { id: "acct-a-proj", snapshot: {} },
      { ownerUid: "uid-alice" }
    );
    expect(ownedSaved.ownerUid).toBe("uid-alice");

    mockGetAll.mockResolvedValue([
      { id: "alice-1", ownerUid: "uid-alice", updatedAt: 300 },
      { id: "bob-1", ownerUid: "uid-bob", updatedAt: 400 },
      { id: "legacy-1", updatedAt: 100 },
    ]);
    const aliceList = await listViralStudioProjects({ ownerUid: "uid-alice" });
    expect(aliceList.map(p => p.id)).toEqual(["alice-1", "legacy-1"]);
    const anonList = await listViralStudioProjects();
    expect(anonList.map(p => p.id)).toEqual(["legacy-1"]);
  } finally {
    if (previousIndexedDB) Object.defineProperty(window, "indexedDB", previousIndexedDB);
    else delete window.indexedDB;
    if (previousStorage) Object.defineProperty(navigator, "storage", previousStorage);
    else delete navigator.storage;
  }
});
