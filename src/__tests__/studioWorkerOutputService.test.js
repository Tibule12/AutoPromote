const fs = require('node:fs');
const crypto = require('node:crypto');
const {Readable} = require('node:stream');
const mockObjects = new Map(), mockReads = [], mockUploads = jest.fn();
let mockNonce = 0;
const mockBucket = { name:'private-test-bucket', upload:mockUploads,
  file:(name,options) => ({
    getMetadata:async()=>{if(!mockObjects.has(name))throw Object.assign(new Error('absent'),{code:404});return [mockObjects.get(name).metadata];},
    createReadStream:()=>{mockReads.push({name,options});return Readable.from([mockObjects.get(name).bytes]);},
    getSignedUrl:async()=>[`https://storage.googleapis.com/private-test-bucket/${name}?test=${++mockNonce}`],
  }) };
jest.mock('firebase-admin',()=>({storage:()=>({bucket:()=>mockBucket})}));
const {workerBucketOutputPath,persistWorkerBucketOutput} = require('../services/studioWorkerOutputService');
const owner='owner-1',job='viral_job-1',source=`processed/${job}_viral.mp4`,target=`studio/exports/${owner}/${job}/render.mp4`;
const bytes=Buffer.from('actual streamed movie bytes');
const digest=crypto.createHash('sha256').update(bytes).digest('hex');
const input={url:`https://storage.googleapis.com/private-test-bucket/${source}?expired=signature`,userId:owner,jobId:job,expectedSha256:digest};
beforeEach(()=>{
  mockObjects.clear();mockReads.length=0;mockUploads.mockReset();mockNonce=0;
  mockObjects.set(source,{bytes,metadata:{size:String(bytes.length),generation:'123'}});
  mockUploads.mockImplementation(async(file,options)=>{
    expect(options.preconditionOpts).toEqual({ifGenerationMatch:0});
    if(mockObjects.has(options.destination))throw Object.assign(new Error('already exists'),{code:412});
    mockObjects.set(options.destination,{bytes:fs.readFileSync(file),metadata:{size:String(fs.statSync(file).size),generation:'456',metadata:options.metadata.metadata}});
  });
});
test('accepts only the exact configured bucket/job object in either Google URL format',()=>{
  expect(workerBucketOutputPath(input.url,job,mockBucket.name)).toBe(source);
  expect(workerBucketOutputPath(`https://firebasestorage.googleapis.com/v0/b/private-test-bucket/o/${encodeURIComponent(source)}?alt=media&token=test`,job,mockBucket.name)).toBe(source);
});
test.each([
  'http://storage.googleapis.com/private-test-bucket/processed/viral_job-1_viral.mp4',
  'https://storage.googleapis.com/other-bucket/processed/viral_job-1_viral.mp4',
  'https://storage.googleapis.com/private-test-bucket/processed/another-job_viral.mp4',
  'https://storage.googleapis.com/private-test-bucket/processed%252Fviral_job-1_viral.mp4',
  'https://user:pass@storage.googleapis.com/private-test-bucket/processed/viral_job-1_viral.mp4',
])('rejects untrusted bucket URLs without fetching them: %s',async url=>{
  expect(workerBucketOutputPath(url,job,mockBucket.name)).toBeNull();
  await expect(persistWorkerBucketOutput({...input,url})).rejects.toThrow(/configured job object/);
  expect(mockReads).toHaveLength(0);expect(mockUploads).not.toHaveBeenCalled();
});
test('hashes exact generation bytes before create-only owned persistence',async()=>{
  const result=await persistWorkerBucketOutput(input);
  expect(result).toMatchObject({storagePath:target,sha256:digest,bytes:bytes.length,generation:'456'});
  expect(mockReads).toEqual([{name:source,options:{generation:'123'}}]);
  expect(mockObjects.get(target).bytes).toEqual(bytes);
  expect(mockObjects.get(target).metadata.metadata).toMatchObject({ownerUid:owner,jobId:job,sha256:digest,sourceGeneration:'123'});
});
test('repeated adoption renews access without rereading or replacing immutable bytes',async()=>{
  const first=await persistWorkerBucketOutput(input),second=await persistWorkerBucketOutput(input);
  expect(first.url).not.toBe(second.url);expect(mockReads).toHaveLength(1);expect(mockUploads).toHaveBeenCalledTimes(1);
});
test('changed source bytes never become a finished owned export',async()=>{
  mockObjects.get(source).bytes=Buffer.from('different payload same length');
  await expect(persistWorkerBucketOutput(input)).rejects.toThrow(/completed render hash/);
  expect(mockUploads).not.toHaveBeenCalled();expect(mockObjects.has(target)).toBe(false);
});
test('oversize source is rejected before reading or uploading',async()=>{
  mockObjects.get(source).metadata.size=String(2*1024*1024*1024);
  await expect(persistWorkerBucketOutput(input)).rejects.toThrow(/size or generation/);
  expect(mockReads).toHaveLength(0);expect(mockUploads).not.toHaveBeenCalled();
});
test.each([{ownerUid:'other-owner'},{sha256:'a'.repeat(64)}])('an existing conflicting owner/hash cannot be overwritten',async change=>{
  mockObjects.set(target,{bytes,metadata:{size:String(bytes.length),generation:'456',metadata:{ownerUid:owner,jobId:job,sha256:digest,...change}}});
  await expect(persistWorkerBucketOutput(input)).rejects.toThrow(/conflicts/);
  expect(mockReads).toHaveLength(0);expect(mockUploads).not.toHaveBeenCalled();
});
test('a simultaneous matching creator can win while keeping one immutable result',async()=>{
  mockUploads.mockImplementationOnce(async(file,options)=>{
    mockObjects.set(target,{bytes:fs.readFileSync(file),metadata:{size:String(bytes.length),generation:'789',metadata:options.metadata.metadata}});
    throw Object.assign(new Error('already exists'),{code:412});
  });
  expect(await persistWorkerBucketOutput(input)).toMatchObject({sha256:digest,generation:'789'});
});
test('unknown legacy provider/hash remains unmanaged without weakening strict adoption',async()=>{
  expect(await persistWorkerBucketOutput({...input,url:'https://legacy.example/movie.mp4'})).toBeNull();
  expect(await persistWorkerBucketOutput({...input,expectedSha256:null,legacy:true})).toBeNull();
  await expect(persistWorkerBucketOutput({...input,expectedSha256:null})).rejects.toThrow(/identity or hash/);
  expect(mockUploads).not.toHaveBeenCalled();
});
