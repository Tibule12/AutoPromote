// Preserve local Files in JSON backups without fetching any remote URL.
const MARKER = '__autopromoteMediaFile';
const LIMIT = 20 * 1024 * 1024;
const forbidden = key => ['__proto__', 'prototype', 'constructor'].includes(key);

const OFFLINE_REF_MARKER = '__autopromoteOfflineMediaRef';

export async function packageStudioBackup(
  saved,
  { includeVersions = true, allowOfflineRelinkManifest = false } = {}
) {
  const files = [], references = new WeakMap(), contents = new Map();
  let encodedBytes = 0;
  let usedOfflineRelink = false;
  async function visit(value, depth = 0) {
    if (depth > 40) throw new Error('The project backup is too deeply nested.');
    if (value instanceof Blob) {
      if (references.has(value)) {
        const refVal = references.get(value);
        return typeof refVal === 'object' ? { [OFFLINE_REF_MARKER]: refVal } : { [MARKER]: refVal };
      }
      const name = value.name || 'media';
      const overSingleCap = value.size > Math.floor(LIMIT * 3 / 4);
      if (overSingleCap) {
        if (!allowOfflineRelinkManifest) {
          throw new Error('Project backup exceeds 20 MB. Export first to save its owned media.');
        }
        const descriptor = {
          name,
          size: Number(value.size || 0),
          type: value.type || '',
          lastModified: Number(value.lastModified || 0),
          relinkRequired: true,
        };
        references.set(value, descriptor);
        usedOfflineRelink = true;
        return { [OFFLINE_REF_MARKER]: descriptor };
      }
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
        reader.onerror = () => reject(new Error('A local project file could not be read.'));
        reader.readAsDataURL(value);
      });
      const identity = `${name}\n${value.type}\n${value.lastModified || 0}\n${data}`;
      let index = contents.get(identity);
      if (index === undefined) {
        if (encodedBytes + data.length > LIMIT || files.length >= 256) {
          if (!allowOfflineRelinkManifest) {
            throw new Error('Project backup exceeds 20 MB. Export first to save its owned media.');
          }
          const descriptor = {
            name,
            size: Number(value.size || 0),
            type: value.type || '',
            lastModified: Number(value.lastModified || 0),
            relinkRequired: true,
          };
          references.set(value, descriptor);
          usedOfflineRelink = true;
          return { [OFFLINE_REF_MARKER]: descriptor };
        }
        encodedBytes += data.length;
        index = files.length;
        files.push({ name, type: value.type, lastModified: value.lastModified || 0, data });
        contents.set(identity, index);
      }
      references.set(value, index);
      return { [MARKER]: index };
    }
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      const result = [];
      for (const item of value) result.push(await visit(item, depth + 1));
      return result;
    }
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (forbidden(key)) throw new Error('Invalid project backup field.');
      result[key] = await visit(item, depth + 1);
    }
    return result;
  }
  const project = await visit({ id: saved.id, name: saved.name, createdAt: saved.createdAt,
    snapshot: saved.snapshot, versions: includeVersions ? saved.versions || [] : [] });
  const payload = {
    ...project,
    ...(files.length ? { mediaFiles: files } : {}),
    ...(usedOfflineRelink ? { relinkManifestRequired: true } : {}),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)],
    { type: 'application/json' });
  if (blob.size > LIMIT) throw new Error('Project backup exceeds 20 MB.');
  return blob;
}

export function restoreStudioBackupMedia(project) {
  if (project.mediaFiles !== undefined && (!Array.isArray(project.mediaFiles) || project.mediaFiles.length > 256)) {
    throw new Error('Invalid project media package.');
  }
  let encodedBytes = 0;
  const files = (project.mediaFiles || []).map(item => {
    if (!item || typeof item.name !== 'string' || item.name.length > 255 ||
        typeof item.type !== 'string' || item.type.length > 100 || typeof item.data !== 'string' ||
        item.data.length % 4 || /[^A-Za-z0-9+/=]/.test(item.data) || !/^[^=]*={0,2}$/.test(item.data))
      throw new Error('Invalid project media file.');
    encodedBytes += item.data.length;
    if (encodedBytes > LIMIT) throw new Error('Project backup exceeds 20 MB.');
    const bytes = Uint8Array.from(atob(item.data), char => char.charCodeAt(0));
    return new File([bytes], item.name, { type: item.type,
      lastModified: Number.isFinite(item.lastModified) ? item.lastModified : 0 });
  });
  const urls = new Map();
  function visit(value, depth = 0) {
    if (depth > 40) throw new Error('The project backup is too deeply nested.');
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(item => visit(item, depth + 1));
    if (Object.prototype.hasOwnProperty.call(value, MARKER)) {
      const index = value[MARKER];
      if (Object.keys(value).length !== 1 || !Number.isInteger(index) || !files[index]) throw new Error('Invalid project media reference.');
      return files[index];
    }
    if (Object.prototype.hasOwnProperty.call(value, OFFLINE_REF_MARKER)) {
      return null;
    }
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (forbidden(key)) throw new Error('Invalid project backup field.');
      if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, OFFLINE_REF_MARKER) && key === 'file') {
        result.file = null;
        result.offlineRelinkRef = { ...item[OFFLINE_REF_MARKER] };
        result.status = 'unavailable';
      } else {
        result[key] = visit(item, depth + 1);
      }
    }
    if (result.file instanceof Blob) for (const key of ['url', 'src']) {
      if (typeof result[key] === 'string' && result[key].startsWith('blob:')) {
        if (!urls.has(result.file)) urls.set(result.file, URL.createObjectURL(result.file));
        result[key] = urls.get(result.file);
      }
    }
    return result;
  }
  try { return { ...project, snapshot: visit(project.snapshot), versions: visit(project.versions || []) }; }
  catch (error) { for (const url of urls.values()) URL.revokeObjectURL(url); throw error; }
}
