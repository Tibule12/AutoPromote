import { packageStudioBackup, restoreStudioBackupMedia } from '../studioProjectBackupMedia';

const text = blob => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result);
  reader.onerror = reject; reader.readAsText(blob);
});

test('backup round trip preserves exact local video, artwork and narration bytes and history', async () => {
  const create = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:restored');
  try {
    const file = new File(['real video bytes'], 'result.mp4', { type: 'video/mp4', lastModified: 42 });
    const snapshot = { overlays: [{ id: 'result', file, src: 'blob:expired', startTime: 2.5 }],
      voiceovers: [{ file: new File(['voice bytes'], 'voice.wav', { type: 'audio/wav' }), url: 'blob:voice' }],
      musicTrack: { file: new File(['artwork bytes'], 'art.png', { type: 'image/png' }), url: 'blob:art' } };
    const backup = JSON.parse(await text(await packageStudioBackup({ id: 'project', name: 'Edit',
      snapshot, versions: [{ snapshot }] })));
    expect(backup.mediaFiles).toHaveLength(3);
    expect(backup).not.toHaveProperty('authentication');
    const restored = restoreStudioBackupMedia(backup);
    const result = restored.snapshot.overlays[0];
    expect(result.file).toBeInstanceOf(File);
    expect(await text(result.file)).toBe('real video bytes');
    expect(result.file.name).toBe('result.mp4');
    expect(result.file.lastModified).toBe(42);
    expect(result.src).toBe('blob:restored');
    expect(result.startTime).toBe(2.5);
    expect(restored.versions[0].snapshot.overlays[0].file).toBe(result.file);
    expect(await text(restored.snapshot.voiceovers[0].file)).toBe('voice bytes');
    expect(await text(restored.snapshot.musicTrack.file)).toBe('artwork bytes');
  } finally { create.mockRestore(); }
});

test('existing owned-media backups retain their remote identities without packaging access state', async () => {
  const snapshot = { overlays: [{ src: 'https://example.com/owned.png', sourceStoragePath: 'owned/image.png', file: null }] };
  const backup = JSON.parse(await text(await packageStudioBackup({ id: 'project', name: 'Edit', snapshot,
    versions: [], authentication: 'exclude', renderRecovery: 'exclude' })));
  expect(backup).not.toHaveProperty('mediaFiles');
  expect(backup).not.toHaveProperty('authentication');
  expect(backup).not.toHaveProperty('renderRecovery');
  expect(restoreStudioBackupMedia(backup).snapshot).toEqual(snapshot);
});

test('invalid local references and oversized packages are rejected', async () => {
  expect(() => restoreStudioBackupMedia({ mediaFiles: [], snapshot: {
    file: { __autopromoteMediaFile: 3 } } })).toThrow('reference');
  expect(() => restoreStudioBackupMedia({ mediaFiles: [{ name: 'file', type: 'video/mp4', data: 'bad%' }] })).toThrow('file');
  const large = new File([new Uint8Array(16 * 1024 * 1024)], 'large.mp4');
  await expect(packageStudioBackup({ snapshot: { file: large } })).rejects.toThrow('20 MB');
});
