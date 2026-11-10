import { uploadSourceFileViaBackend, uploadTemporaryVideoSource } from "../sourceUpload";
import { uploadBytesResumable, ref, getDownloadURL } from "firebase/storage";
import { auth } from '../../firebaseClient';
import { createHash } from 'crypto';
import { uploadMulticamSourceResumable } from "../multicamResumableUpload";

jest.mock("../../firebaseClient", () => ({
  auth: { currentUser: { uid: "secure-user" } },
  storage: { name: "test-storage" },
}));

jest.mock("firebase/storage", () => ({
  getDownloadURL: jest.fn(),
  ref: jest.fn((_storage, path) => ({ fullPath: path })),
  uploadBytesResumable: jest.fn(),
}));

jest.mock("../multicamResumableUpload", () => ({
  uploadMulticamSourceResumable: jest.fn(),
}));

describe("temporary source uploads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.currentUser = { uid: 'secure-user' };
    getDownloadURL.mockResolvedValue('https://example.com/audio.wav');
    ref.mockImplementation((_storage, path) => ({ fullPath: path }));
    uploadBytesResumable.mockImplementation((_fileRef, file, metadata) => {
      const task = {
        snapshot: { metadata: { size: file.size } },
        on: (_event, onProgress, _onError, onComplete) => {
          onProgress({ bytesTransferred: file.size, totalBytes: file.size });
          onComplete();
        },
      };
      task.uploadMetadata = metadata;
      return task;
    });
  });

  it('binds imported audio to its actual bytes and owner in upload metadata and returned identity', async () => {
    const file = new File(['actual sound bytes'], 'sound.wav', { type: 'audio/wav' });
    const digest = createHash('sha256').update('actual sound bytes').digest('hex');
    const result = await uploadSourceFileViaBackend({ file, token: 'token', mediaType: 'audio' });
    expect(result).toMatchObject({ ownerUid: 'secure-user', contentHash: digest });
    expect(result.storagePath).toMatch(/^uploads\/audios\/secure-user\//);
    expect(uploadBytesResumable.mock.calls[0][2].customMetadata).toMatchObject({ ownerUid: 'secure-user', contentHash: digest });
  });

  it('rejects an account switch during upload without attributing bytes to the new account or falling back', async () => {
    const file = new File(['actual sound bytes'], 'sound.wav', { type: 'audio/wav' });
    const fetchSpy = jest.spyOn(global, 'fetch');
    getDownloadURL.mockImplementation(async () => { auth.currentUser = { uid: 'other-user' }; return 'https://example.com/audio.wav'; });
    try {
      await expect(uploadSourceFileViaBackend({ file, token: 'token', mediaType: 'audio' })).rejects.toThrow('sign-in changed');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });

  it('falls back once when bytes finish but the Storage URL lookup stalls, and ignores a late lookup failure', async () => {
    jest.useFakeTimers();
    let rejectLookup;
    getDownloadURL.mockImplementation(() => new Promise((_resolve, reject) => { rejectLookup = reject; }));
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true,
      json: async () => ({ url: 'http://localhost/owned/image.png', storagePath: 'owned/image.png' }) });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const pending = uploadSourceFileViaBackend({ file: new File(['image'], 'image.png', { type: 'image/png' }), token: 'owner-token', timeoutMs: 60000 });
      await Promise.resolve();
      jest.advanceTimersByTime(14999);
      expect(fetchSpy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      await expect(pending).resolves.toMatchObject({ storagePath: 'owned/image.png' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer owner-token');
      rejectLookup(Error('late metadata failure'));
      await Promise.resolve();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally { fetchSpy.mockRestore(); warn.mockRestore(); jest.useRealTimers(); }
  });

  it('honours a shorter caller deadline during URL lookup and clears its timer on success', async () => {
    jest.useFakeTimers();
    getDownloadURL.mockImplementationOnce(() => new Promise(() => {}));
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true,
      json: async () => ({ url: 'http://localhost/owned/image.png' }) });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const file = new File(['image'], 'image.png', { type: 'image/png' });
      const pending = uploadSourceFileViaBackend({ file, token: 'owner-token', timeoutMs: 1000 });
      await Promise.resolve();
      jest.advanceTimersByTime(999); expect(fetchSpy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1); await pending;
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      getDownloadURL.mockResolvedValueOnce('http://localhost/firebase/image.png');
      await expect(uploadSourceFileViaBackend({ file, token: 'owner-token' })).resolves.toMatchObject({ uploadMode: 'firebase_resumable' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally { fetchSpy.mockRestore(); warn.mockRestore(); jest.useRealTimers(); }
  });

  it("uploads a viral scan to the signed-in user's temporary path with owner metadata", async () => {
    const file = new File(["secure-video"], "My clip.mp4", { type: "video/mp4" });
    const onProgress = jest.fn();

    const result = await uploadTemporaryVideoSource({
      file,
      purpose: "viral_scan",
      onProgress,
    });

    expect(result.storagePath).toMatch(/^temp_scans\/secure-user\/\d+_My_clip\.mp4$/);
    expect(ref).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^temp_scans\/secure-user\//)
    );
    expect(uploadBytesResumable).toHaveBeenCalledWith(
      expect.anything(),
      file,
      expect.objectContaining({
        contentType: "video/mp4",
        customMetadata: expect.objectContaining({
          ownerUid: "secure-user",
          sourcePurpose: "viral_scan",
        }),
      })
    );
    expect(onProgress).toHaveBeenCalledWith(file.size, file.size);
  });

  it("rejects unknown temporary upload purposes", async () => {
    const file = new File(["secure-video"], "clip.mp4", { type: "video/mp4" });
    await expect(
      uploadTemporaryVideoSource({ file, purpose: "unknown" })
    ).rejects.toThrow("Invalid temporary upload purpose");
    expect(uploadBytesResumable).not.toHaveBeenCalled();
  });

  it("uses the secure resumable path for a full Studio podcast larger than 500 MB", async () => {
    const file = new File(["video"], "full-podcast.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { configurable: true, value: 2_611_147_007 });
    const getToken = jest.fn(() => Promise.resolve("fresh-token"));
    const onProgress = jest.fn();
    uploadMulticamSourceResumable.mockResolvedValue({
      url: "https://storage.example/full-podcast.mp4",
      storagePath: "temp/multicam-ingest/secure-user/full-podcast.mp4",
      size: file.size,
    });

    const result = await uploadSourceFileViaBackend({
      file,
      token: "token",
      getToken,
      mediaType: "video",
      purpose: "studio_source",
      onProgress,
    });

    expect(uploadMulticamSourceResumable).toHaveBeenCalledWith(
      expect.objectContaining({
        file,
        token: "token",
        getToken,
        purpose: "studio_source",
        onProgress,
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        storagePath: "temp/multicam-ingest/secure-user/full-podcast.mp4",
        uploadMode: "studio_resumable",
      })
    );
    expect(uploadBytesResumable).not.toHaveBeenCalled();
  });

  it('keeps a small Studio video in durable ingestion rather than general uploads',async()=>{
    const file=new File(['small recorded shot'],'shot.mp4',{type:'video/mp4'});
    uploadMulticamSourceResumable.mockResolvedValue({storagePath:'studio/sources/secure-user/shot.mp4',size:file.size});
    const result=await uploadSourceFileViaBackend({file,token:'token',mediaType:'video',purpose:'studio_project'});
    expect(result.uploadMode).toBe('studio_resumable');expect(uploadBytesResumable).not.toHaveBeenCalled();
    expect(uploadMulticamSourceResumable).toHaveBeenCalledWith(expect.objectContaining({file,purpose:'studio_project'}));
  });

  it("uses the durable resumable path for a large project library video", async () => {
    const file = new File(["video"], "scene-take.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { configurable: true, value: 750_000_000 });
    uploadMulticamSourceResumable.mockResolvedValue({
      url: "https://storage.example/scene-take.mp4",
      storagePath: "studio/sources/secure-user/scene-take.mp4",
      size: file.size,
    });

    const result = await uploadSourceFileViaBackend({
      file,
      token: "token",
      mediaType: "video",
      purpose: "studio_project",
    });

    expect(uploadMulticamSourceResumable).toHaveBeenCalledWith(
      expect.objectContaining({ file, token: "token", purpose: "studio_project" })
    );
    expect(result.storagePath).toBe("studio/sources/secure-user/scene-take.mp4");
    expect(uploadBytesResumable).not.toHaveBeenCalled();
  });
});

describe('small authored Studio assets',()=>{
 beforeEach(()=>{jest.clearAllMocks();auth.currentUser={uid:'secure-user'};});
 it.each(['image','audio'])('uses bounded authenticated upload and byte identity for Studio %s assets',async mediaType=>{
  const file=new File(['native authored asset'],mediaType==='image'?'art.png':'music.wav',{type:mediaType==='image'?'image/png':'audio/wav'});
  const fetchSpy=jest.spyOn(global,'fetch').mockResolvedValue({ok:true,status:201,json:async()=>({url:'http://127.0.0.1/owned',storagePath:`uploads/${mediaType}s/secure-user/asset`,size:file.size})});
  try{const result=await uploadSourceFileViaBackend({file,token:'signed-owner-token',mediaType,purpose:'studio_project'});expect(result).toMatchObject({ownerUid:'secure-user',contentHash:createHash('sha256').update('native authored asset').digest('hex')});expect(fetchSpy).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({method:'POST',headers:expect.objectContaining({Authorization:'Bearer signed-owner-token'}),body:file,signal:expect.anything()}));expect(uploadBytesResumable).not.toHaveBeenCalled();expect(getDownloadURL).not.toHaveBeenCalled();}finally{fetchSpy.mockRestore();}
 });
 it('refuses a switched owner after a Studio artwork request completes',async()=>{
  const fetchSpy=jest.spyOn(global,'fetch').mockImplementation(async()=>{auth.currentUser={uid:'different-owner'};return{ok:true,status:201,json:async()=>({url:'http://127.0.0.1/owned'})};});
  try{await expect(uploadSourceFileViaBackend({file:new File(['art'],'art.png',{type:'image/png'}),token:'token',mediaType:'image',purpose:'studio_project'})).rejects.toThrow('sign-in changed');expect(uploadBytesResumable).not.toHaveBeenCalled();}finally{fetchSpy.mockRestore();}
 });
 it('retains the SDK path for an existing larger Studio asset',async()=>{
  const file=new File(['large'],'large.wav',{type:'audio/wav'});Object.defineProperty(file,'size',{value:16*1024*1024+1});getDownloadURL.mockResolvedValue('http://127.0.0.1/large');uploadBytesResumable.mockImplementation(()=>({snapshot:{metadata:{size:file.size}},on:(_e,_p,_r,done)=>done()}));
  await uploadSourceFileViaBackend({file,token:'token',mediaType:'audio',purpose:'studio_project'});expect(uploadBytesResumable).toHaveBeenCalled();expect(getDownloadURL).toHaveBeenCalled();
 });
 it('keeps an authenticated backend refusal terminal without trying a second transport',async()=>{
  const fetchSpy=jest.spyOn(global,'fetch').mockResolvedValue({ok:false,status:403,json:async()=>({error:'Not allowed',code:'FORBIDDEN'})});
  try{await expect(uploadSourceFileViaBackend({file:new File(['art'],'art.png',{type:'image/png'}),token:'token',mediaType:'image',purpose:'studio_project'})).rejects.toMatchObject({code:'FORBIDDEN',httpStatus:403});expect(uploadBytesResumable).not.toHaveBeenCalled();}finally{fetchSpy.mockRestore();}
 });
});
