// The installed older Storage client forwards copy options differently from
// newer releases. Bind the actual rewrite query explicitly: never overwrite
// a destination and never silently switch to the latest source generation.
async function rewriteCreateOnly(source, destination, { generation, contentType, metadata }) {
  if (!/^[0-9]{1,32}$/.test(String(generation)) || !destination.bucket?.name || !destination.name)
    throw new Error("Invalid private project media copy");
  let token;
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await new Promise((resolve, reject) => source.request({
      method: "POST",
      uri: `/rewriteTo/b/${encodeURIComponent(destination.bucket.name)}/o/${encodeURIComponent(destination.name)}`,
      qs: { sourceGeneration: String(generation), ifGenerationMatch: 0, ...(token ? { rewriteToken: token } : {}) },
      json: { contentType, cacheControl: "private, no-store", metadata },
      timeout: 60000,
    }, (error, value) => error ? reject(error) : resolve(value)));
    if (response.done === true) return;
    if (typeof response.rewriteToken !== "string" || !response.rewriteToken) throw new Error("Private project copy did not return a continuation");
    token = response.rewriteToken;
  }
  throw new Error("Private project copy did not finish. Retry without overwriting the original.");
}
module.exports = { rewriteCreateOnly };
