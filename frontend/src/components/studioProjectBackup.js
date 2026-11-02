import { validateStudioProjectDocument } from "./studioProjectDocument";

const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

// A backup restores the ordinary project, never authentication or render state.
// Media access is re-authorized by the existing server resolver before saving.
export const readStudioProjectBackup = async file => {
  if (!file || file.size > MAX_BACKUP_BYTES) throw new Error("Choose a project backup smaller than 20 MB.");
  const project = JSON.parse(await file.text());
  if (!project || !/^viral-project-[A-Za-z0-9_-]+$/.test(project.id || "") ||
      typeof project.name !== "string" || project.name.length > 80 ||
      !project.snapshot?.studioDocument || project.snapshot.studioDocument.projectId !== project.id) {
    throw new Error("This file is not a supported editable Studio project backup.");
  }
  validateStudioProjectDocument(project.snapshot.studioDocument);
  if (project.versions !== undefined && (!Array.isArray(project.versions) || project.versions.length > 12)) {
    throw new Error("Invalid project version history.");
  }
  const paths = new Set();
  const visit = (value, depth = 0) => {
    if (depth > 40) throw new Error("The project backup is too deeply nested.");
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(item => visit(item, depth + 1)); return; }
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Invalid project backup field.");
      if (["storagePath", "sourceStoragePath", "assetStoragePath"].includes(key) && typeof item === "string" && item) paths.add(item);
      else visit(item, depth + 1);
    }
  };
  visit(project.snapshot);
  visit(project.versions || []);
  if (!paths.size || paths.size > 100) throw new Error("This backup needs saved, owned Studio media.");
  return {
    project: { id: project.id, name: project.name, createdAt: project.createdAt,
      snapshot: project.snapshot, versions: project.versions || [] },
    mediaPaths: [...paths],
  };
};
