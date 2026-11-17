import { studioSourceLeaseRefreshDelay, studioSourceStoragePath, studioSourcePlaybackUrl } from "../studioSourceAccess";

const now = 1792848000000;
const signed = expiry => `https://storage.googleapis.com/owned/source.mp4?GoogleAccessId=owner&Signature=signature&Expires=${expiry}`;

test("renews temporary source access one minute before expiry", () => {
  expect(studioSourceLeaseRefreshDelay(signed(now / 1000 + 3600), now)).toBe(3540000);
});
test("expired and imminently expiring source links recover immediately", () => {
  expect(studioSourceLeaseRefreshDelay(signed(1792783090), now)).toBe(0);
  expect(studioSourceLeaseRefreshDelay(signed(now / 1000 + 30), now)).toBe(0);
});
test.each(["", "blob:source", "https://example.com/source.mp4", signed("invalid"), signed("0"),
  "https://example.com/source.mp4?Expires=1792840000"])("ignores nonleased or malformed access: %s", url => {
  expect(studioSourceLeaseRefreshDelay(url, now)).toBeNull();
});
test("keeps browser timer delay inside its signed32-bit limit", () => {
  expect(studioSourceLeaseRefreshDelay(signed(now / 1000 + 86400000), now)).toBe(2147483647);
});

test('infers only recognized Storage source paths without treating a URL as ownership',()=>{
  const path='studio/sources/owner/video.mp4';
  expect(studioSourceStoragePath(`https://storage.googleapis.com/bucket/${path}?Signature=test`)).toBe(path);
  expect(studioSourceStoragePath(`https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodeURIComponent(path)}?alt=media`)).toBe(path);
  expect(studioSourceStoragePath({storagePath:path,url:'https://example.com/source.mp4'})).toBe(path);
  for(const url of ['https://example.com/bucket/'+path,'http://storage.googleapis.com/bucket/'+path,
    'https://storage.googleapis.com/bucket/generated_clips/result.mp4','not a URL'])
    expect(studioSourceStoragePath(url)).toBeNull();
});
test('defers expired owned source decoders while preserving unrelated outputs and valid access',()=>{
  const source=`https://storage.googleapis.com/bucket/studio/sources/owner/video.mp4?GoogleAccessId=owner&Signature=test&Expires=${now/1000-1}`;
  expect(studioSourcePlaybackUrl(source,now)).toBeNull();
  const valid=source.replace(String(now/1000-1),String(now/1000+3600));
  expect(studioSourcePlaybackUrl(valid,now)).toBe(valid);
  const result=source.replace('studio/sources/owner/video.mp4','generated_clips/result.mp4');
  expect(studioSourcePlaybackUrl(result,now)).toBe(result);
});
