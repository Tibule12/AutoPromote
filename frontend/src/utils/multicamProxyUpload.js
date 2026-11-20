import { uploadMulticamSourceResumable } from "./multicamResumableUpload";

// Proxies need the same server-owned metadata and retained identity as originals.
export async function uploadOwnedMulticamProxy({ apiBaseUrl, user, file, folder, onProgress, signal }) {
  const result = await uploadMulticamSourceResumable({ apiBaseUrl, file, signal, onProgress,
    purpose: folder === "temp/multicam-clean-sync-audio" ? "external_audio" : "camera_original",
    getToken: forceRefresh => user.getIdToken(forceRefresh === true),
  });
  if (!result.url || !result.storagePath) throw new Error("Proof upload has no verified Storage identity");
  return result;
}
