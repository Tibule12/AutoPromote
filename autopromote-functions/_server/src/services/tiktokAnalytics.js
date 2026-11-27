// TikTok can encode public post IDs as JSON numbers beyond JS safe integers.
// Quote only integers inside the documented ID array before JSON parsing.
function parsePublishStatus(text) {
  return JSON.parse(
    text.replace(
      /("publicaly_available_post_id"\s*:\s*\[)([\d\s",]*)(\])/g,
      (_, prefix, ids, suffix) =>
        prefix + ids.replace(/(^|,)\s*(\d+)(?=\s*(?:,|$))/g, '$1"$2"') + suffix
    )
  );
}

async function resolvePublicVideoId(publishId, request) {
  if (typeof publishId !== "string" || !publishId || publishId.length > 200)
    throw new Error("No TikTok upload reference is available");
  const data = parsePublishStatus(await request(publishId));
  if (data.error?.code && data.error.code !== "ok")
    throw Object.assign(
      new Error(data.error.message || "TikTok publication status request failed"),
      {
        code: data.error.code,
      }
    );
  const state = data.data;
  if (!["PUBLISH_COMPLETE", "SUCCESS"].includes(state?.status))
    throw Object.assign(
      new Error(
        `TikTok publication is ${state?.status || "unconfirmed"}; statistics are not ready.`
      ),
      {
        code: "PUBLICATION_NOT_CONFIRMED",
      }
    );
  const ids = state.publicaly_available_post_id;
  const id = Array.isArray(ids) ? ids[0] : ids;
  if (typeof id !== "string" || !/^[0-9]{10,30}$/.test(id))
    throw Object.assign(new Error("TikTok has not returned a public video ID"), {
      code: "PUBLIC_VIDEO_ID_MISSING",
    });
  return id;
}

module.exports = { parsePublishStatus, resolvePublicVideoId };
