// src/utils/indexedDB.js
import { openDB } from "idb";

const DB_NAME = "AutoPromoteVideoDB";
const STORE_NAME = "generated_videos";

export async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    },
  });
}

export async function saveVideoToLocal(videoBlob, title, description = "") {
  const db = await initDB();
  const id = await db.add(STORE_NAME, {
    title,
    description,
    blob: videoBlob,
    createdAt: new Date(),
  });
  return id;
}

export async function getAllVideos() {
  const db = await initDB();
  return db.getAll(STORE_NAME);
}

export async function deleteVideo(id) {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
}
