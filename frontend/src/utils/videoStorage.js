// Frontend video storage using IndexedDB
// This keeps videos locally on the user's browser without uploading to cloud

const DB_NAME = "AutoPromoteVideoDB";
const STORE_NAME = "videos";
const DB_VERSION = 1;

export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = event => reject("IndexedDB error: " + event.target.error);

    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = event => resolve(event.target.result);
  });
};

export const saveVideoToLocal = async (blob, ideaText) => {
  const db = await initDB();
  const id = Date.now().toString();
  const videoData = {
    id,
    idea: ideaText,
    blob: blob,
    createdAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(videoData);

    request.onsuccess = () => resolve(id);
    request.onerror = e => reject(e.target.error);
  });
};

export const getLocalVideos = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort by newest first
      const results = request.result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      resolve(results);
    };
    request.onerror = e => reject(e.target.error);
  });
};

export const deleteLocalVideo = async id => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = e => reject(e.target.error);
  });
};
