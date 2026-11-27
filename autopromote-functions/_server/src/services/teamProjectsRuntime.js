const crypto = require("node:crypto");
const { db, admin } = require("../firebaseAdmin");
const { service: team } = require("./teamWorkspaceRuntime");
const { createTeamProjects } = require("./teamProjects");
const { resolveOwnedStudioMediaSource } = require("./studioSourceService");
const inspectSource = async (uid, storagePath) => {
  const source = await resolveOwnedStudioMediaSource({ storagePath, userId: uid, signRead: false });
  return {
    ownerUid: uid,
    storagePath,
    bucketName: source.bucketName || admin.storage().bucket().name,
    generation: String(source.generation),
    size: source.size,
    contentType: source.contentType,
  };
};
const store = {
  async put(workspace, project, version, bytes) {
    const file = admin
      .storage()
      .bucket()
      .file(`team-projects/${workspace}/${project}/${version}.json`);
    try {
      await file.save(bytes, {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: "application/json", cacheControl: "private, no-store" },
      });
    } catch (error) {
      if (Number(error.code) !== 412) throw error;
    }
    const [metadata] = await file.getMetadata();
    return { path: file.name, generation: String(metadata.generation) };
  },
  async read(archive) {
    const [bytes] = await admin
      .storage()
      .bucket()
      .file(archive.path, { generation: archive.generation })
      .download();
    return bytes;
  },
};
async function cloneSource(source, uid) {
  const bucket = admin.storage().bucket(source.bucketName);
  const pinned = bucket.file(source.storagePath, { generation: source.generation });
  const extension =
    source.storagePath
      .split(".")
      .at(-1)
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 8) || "bin";
  const group = source.contentType.startsWith("video/")
    ? "videos"
    : source.contentType.startsWith("audio/")
      ? "audios"
      : "images";
  const identity = crypto
    .createHash("sha256")
    .update(`${source.bucketName}:${source.storagePath}:${source.generation}`)
    .digest("hex");
  const destination = admin
    .storage()
    .bucket()
    .file(`uploads/${group}/${uid}/team_${identity}.${extension}`);
  try {
    await require("./teamStorageCopy").rewriteCreateOnly(pinned, destination, {
      generation: source.generation,
      contentType: source.contentType,
      metadata: {
        ownerUid: uid,
        teamSourceIdentity: identity,
        purpose: "studio_project",
      },
    });
  } catch (error) {
    if (Number(error.code) !== 412) throw error;
  }
  const [metadata] = await destination.getMetadata();
  if (metadata.metadata?.ownerUid !== uid || metadata.metadata?.teamSourceIdentity !== identity ||
      metadata.metadata?.firebaseStorageDownloadTokens || Number(metadata.size) !== source.size)
    throw Object.assign(new Error("Project media could not be copied safely."), {
      status: 409,
      code: "project_copy_conflict",
    });
  const [url] = await destination.getSignedUrl({
    action: "read",
    expires: Date.now() + 15 * 60000,
  });
  return { storagePath: destination.name, url };
}
module.exports = createTeamProjects({ db, team, store, inspectSource, cloneSource });
