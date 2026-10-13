import { saveViralStudioProject } from "../viralStudioProjectStore";
import { openDB } from "idb";

const mockPut = jest.fn();
jest.mock("idb", () => ({ openDB: jest.fn(async () => ({ put: mockPut })) }));

test("a denied persistence request does not discard the successfully saved editable project", async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  const previousIndexedDB = Object.getOwnPropertyDescriptor(window, "indexedDB");
  const persist = jest.fn().mockRejectedValue(new Error("Browser declined persistence"));
  Object.defineProperty(navigator, "storage", { configurable: true, value: { persist } });
  Object.defineProperty(window, "indexedDB", { configurable: true, value: {} });
  mockPut.mockResolvedValue(undefined);
  openDB.mockResolvedValue({ put: mockPut });
  try {
    const project = { id: "saved-edit", snapshot: { timeline: [{ id: "cut-one" }] } };
    const saved = await saveViralStudioProject(project);
    expect(saved.snapshot).toEqual(project.snapshot);
    expect(mockPut).toHaveBeenCalledWith("projects", saved);
    expect(persist).toHaveBeenCalledTimes(1);
  } finally {
    if (previousIndexedDB) Object.defineProperty(window, "indexedDB", previousIndexedDB);
    else delete window.indexedDB;
    if (previousStorage) Object.defineProperty(navigator, "storage", previousStorage);
    else delete navigator.storage;
  }
});
