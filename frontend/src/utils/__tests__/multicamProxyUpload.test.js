import { uploadOwnedMulticamProxy } from "../multicamProxyUpload";
import { uploadMulticamSourceResumable } from "../multicamResumableUpload";
jest.mock("../multicamResumableUpload", () => ({ uploadMulticamSourceResumable: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
it.each([["temp/multicam", "camera_original"], ["temp/multicam-sync-audio", "camera_original"], ["temp/multicam-clean-sync-audio", "external_audio"]])("uploads %s with canonical purpose %s", async (folder, purpose) => {
  const receipt = { url: "https://storage.example/proof?token=test", storagePath: "temp/multicam-ingest/owner/proof", cacheKey: "generation-one", deleteAfter: "2026-11-23T00:00:00Z" };
  uploadMulticamSourceResumable.mockResolvedValue(receipt);
  const user = { getIdToken: jest.fn().mockResolvedValue("fresh-user-token") }, file = new File(["proxy"], "proof.webm"), signal = new AbortController().signal;
  expect(await uploadOwnedMulticamProxy({ apiBaseUrl: "https://api.example", user, file, folder, signal })).toBe(receipt);
  const options = uploadMulticamSourceResumable.mock.calls[0][0];
  expect(options).toMatchObject({ apiBaseUrl: "https://api.example", file, purpose, signal });
  await expect(options.getToken(true)).resolves.toBe("fresh-user-token");
  expect(user.getIdToken).toHaveBeenCalledWith(true);
});
it("rejects a proxy without an owner-verifiable object identity", async () => {
  uploadMulticamSourceResumable.mockResolvedValue({ url: "https://storage.example/legacy" });
  await expect(uploadOwnedMulticamProxy({ user: {}, folder: "temp/multicam" })).rejects.toThrow("verified Storage identity");
});
