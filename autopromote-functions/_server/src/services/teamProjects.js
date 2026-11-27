const crypto = require("node:crypto");
const { digest } = require("./teamWorkspace");
const fail = (status, code, message = code) => {
  throw Object.assign(new Error(message), { status, code });
};
const MAX_BYTES = 20 * 1024 * 1024;
function inspectBackup(backup) {
  const text = JSON.stringify(backup);
  if (
    !text ||
    Buffer.byteLength(text) > MAX_BYTES ||
    !/^viral-project-[A-Za-z0-9_-]+$/.test(backup?.id || "") ||
    typeof backup.name !== "string" ||
    !backup.name ||
    backup.name.length > 80 ||
    backup.snapshot?.studioDocument?.projectId !== backup.id ||
    (backup.versions || []).length > 12
  )
    fail(400, "invalid_project_backup");
  try {
    const validate =
      require("../generated/studioDirectorReplayKernel.cjs").validateStudioProjectDocument;
    validate(backup.snapshot.studioDocument);
    for (const version of backup.versions || [])
      if (version.snapshot?.studioDocument) validate(version.snapshot.studioDocument);
  } catch (_) {
    fail(400, "invalid_project_document", "The native Studio project document is invalid.");
  }
  const paths = new Set();
  function visit(value, depth = 0) {
    if (depth > 40) fail(400, "invalid_project_backup");
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        fail(400, "invalid_project_backup");
      if (
        ["storagePath", "sourceStoragePath", "assetStoragePath"].includes(key) &&
        typeof item === "string" &&
        item
      )
        paths.add(item);
      // Prepared model jobs have separate ownership/provenance contracts.
      // Refuse sharing rather than forge them during a personal copy.
      if (/(?:jobId|artifactId|artifactRef|cacheKey)$/i.test(key) && item)
        fail(
          409,
          "project_asset_not_portable",
          "This project includes server-bound generated assets. Share its finished movie instead; the original project is preserved."
        );
      visit(item, depth + 1);
    }
  }
  visit(backup.snapshot);
  visit(backup.versions || []);
  if (!paths.size || paths.size > 20) fail(400, "project_media_limit");
  return { text, paths: [...paths] };
}

function createTeamProjects({
  db,
  team,
  store,
  inspectSource,
  cloneSource,
  now = () => Date.now(),
}) {
  const editor = context => {
    if (!["owner", "admin", "editor"].includes(context.role)) fail(403, "workspace_read_only");
  };
  const projectRef = (context, id) => {
    if (!/^viral-project-[A-Za-z0-9_-]{1,110}$/.test(id || "")) fail(400, "invalid_project");
    return context.ref.collection("projects").doc(id);
  };
  async function lock(workspaceId, uid, id, release = false) {
    return db.runTransaction(async tx => {
      const context = await team.access(workspaceId, uid, tx);
      editor(context);
      const ref = projectRef(context, id),
        snapshot = await tx.get(ref);
      if (!snapshot.exists) fail(404, "project_not_found");
      const current = snapshot.data().lock;
      if (current && current.uid !== uid && current.expiresAt > now())
        fail(409, "project_checked_out", "Another teammate is editing this project.");
      tx.update(ref, { lock: release ? null : { uid, expiresAt: now() + 30 * 60000 } });
      return { ok: true };
    });
  }
  async function save(workspaceId, uid, backup, expectedRevision, targetId) {
    const context = await team.access(workspaceId, uid);
    editor(context);
    const { text, paths } = inspectBackup(backup),
      ref = projectRef(context, targetId || backup.id);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) fail(400, "revision_required");
    const manifest = [];
    for (const path of paths) manifest.push(await inspectSource(uid, path));
    if (manifest.reduce((sum, item) => sum + item.size, 0) > 500 * 1024 * 1024)
      fail(400, "project_media_limit");
    const hash = digest(text),
      versionId = `${expectedRevision + 1}_${hash}`;
    // Content-addressed, create-only private storage. A failed/stale save can
    // leave an unreferenced archive, never overwrite a retained version.
    const archive = await store.put(workspaceId, backup.id, versionId, Buffer.from(text));
    return db.runTransaction(async tx => {
      const current = await team.access(workspaceId, uid, tx);
      editor(current);
      const snapshot = await tx.get(ref),
        old = snapshot.data();
      if ((old?.revision || 0) !== expectedRevision)
        fail(409, "project_changed", "A newer version exists. Refresh before saving.");
      if (old && (old.lock?.uid !== uid || old.lock.expiresAt <= now()))
        fail(409, "project_checkout_required");
      const version = {
        id: versionId,
        revision: expectedRevision + 1,
        archive,
        hash,
        manifest,
        savedBy: uid,
        at: new Date(now()).toISOString(),
      };
      const record = {
        name: backup.name,
        revision: version.revision,
        updatedAt: version.at,
        lock: null,
        versions: [...(old?.versions || []), version].slice(-12),
      };
      tx.set(ref, record);
      tx.create(current.ref.collection("activity").doc(), {
        actorUid: uid,
        action: "project_shared",
        subject: ref.id,
        revision: version.revision,
        at: version.at,
      });
      return { id: ref.id, ...record };
    });
  }
  async function personalCopy(workspaceId, uid, id, versionId) {
    const context = await team.access(workspaceId, uid);
    editor(context);
    const snapshot = await projectRef(context, id).get();
    const version = snapshot.data()?.versions?.find(item => item.id === versionId);
    if (!version) fail(404, "project_version_not_found");
    const bytes = await store.read(version.archive);
    if (digest(bytes.toString()) !== version.hash) fail(409, "project_archive_changed");
    const backup = JSON.parse(bytes.toString());
    inspectBackup(backup);
    const replacements = new Map();
    for (const source of version.manifest) {
      const current = await inspectSource(source.ownerUid, source.storagePath);
      if (digest(current) !== digest(source)) fail(409, "project_source_changed");
      replacements.set(source.storagePath, await cloneSource(source, uid));
    }
    const urls = new Map();
    const collectUrls = value => {
      if (!value || typeof value !== "object") return;
      const replacement = replacements.get(
        value.storagePath || value.sourceStoragePath || value.assetStoragePath
      );
      if (replacement)
        for (const key of ["url", "src", "assetUrl"])
          if (typeof value[key] === "string") urls.set(value[key], replacement.url);
      Object.values(value).forEach(collectUrls);
    };
    collectUrls(backup);
    // A fresh identity prevents replacing a personal project with the same ID.
    const copyId = `viral-project-team-${crypto.randomUUID()}`;
    const replace = value => {
      if (typeof value === "string") {
        if (replacements.has(value)) return replacements.get(value).storagePath;
        if (urls.has(value)) return urls.get(value);
      }
      if (Array.isArray(value)) return value.map(replace);
      if (!value || typeof value !== "object") return value;
      const output = Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, replace(item)])
      );
      for (const key of ["storagePath", "sourceStoragePath", "assetStoragePath"]) {
        const source = replacements.get(output[key]);
        if (source) {
          output[key] = source.storagePath;
          for (const urlKey of ["url", "src", "assetUrl"])
            if (typeof output[urlKey] === "string") output[urlKey] = source.url;
        }
      }
      if (output.projectId === backup.id) output.projectId = copyId;
      return output;
    };
    const copy = replace(backup);
    copy.id = copyId;
    // Check membership again after copying. Never return media to a removed member.
    await team.access(workspaceId, uid);
    return copy;
  }
  return { save, lock, personalCopy };
}
module.exports = { createTeamProjects, inspectBackup };
