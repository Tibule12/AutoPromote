import { openDB } from "idb";

const DATABASE_NAME = "autopromote-viral-studio";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";

const getDatabase = () => {
  if (typeof indexedDB === "undefined") return null;
  return openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (database.objectStoreNames.contains(PROJECT_STORE)) return;
      const store = database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      store.createIndex("updatedAt", "updatedAt");
    },
  });
};

export const listViralStudioProjects = async () => {
  const databasePromise = getDatabase();
  if (!databasePromise) return [];
  const database = await databasePromise;
  const projects = await database.getAll(PROJECT_STORE);
  return projects.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
};

export const saveViralStudioProject = async project => {
  const databasePromise = getDatabase();
  if (!databasePromise) throw new Error("Local project storage is unavailable in this browser.");
  const database = await databasePromise;
  const now = Date.now();
  const record = {
    ...project,
    createdAt: Number(project.createdAt || now),
    updatedAt: now,
  };
  await database.put(PROJECT_STORE, record);
  // Local timelines and Firebase's session share this origin's browser storage.
  // Ask the browser to protect them from storage-pressure eviction. A denied
  // request is not a promise of cloud durability and must not block saving.
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch (_error) { /* Persistence is a best-effort browser decision. */ }
  return record;
};

export const deleteViralStudioProject = async projectId => {
  const databasePromise = getDatabase();
  if (!databasePromise) return;
  const database = await databasePromise;
  await database.delete(PROJECT_STORE, projectId);
};
