const admin = require("firebase-admin");
const { sendEmail } = require("./emailService");

const DEFAULT_SCAN_LIMIT = parseInt(process.env.RENDER_NOTIFICATION_SCAN_LIMIT || "50", 10) || 50;

function toIsoString(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

async function getUserEmail(userId) {
  if (!userId) return null;
  try {
    const userRecord = await admin.auth().getUser(userId);
    if (userRecord?.email) return userRecord.email;
  } catch (_error) {
    // Fall through to Firestore profile lookup.
  }

  try {
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    const data = userDoc.exists ? userDoc.data() || {} : {};
    return data.email || data.profile?.email || null;
  } catch (_error) {
    return null;
  }
}

function resolveRenderUrl(data = {}) {
  const result = data.result || {};
  return data.outputUrl || data.output_url || result.url || result.output_url || result.firebase_output_url || null;
}

async function notifyCompletedMulticamRenders() {
  if (process.env.MEDIA_RENDER_EMAILS_ENABLED === "false") return;

  const firestore = admin.firestore();
  const snapshot = await firestore
    .collection("video_edits")
    .where("type", "==", "multicam_render")
    .limit(DEFAULT_SCAN_LIMIT)
    .get()
    .catch(error => {
      console.error("[RenderNotify] Could not scan completed multicam renders:", error.message);
      return { docs: [] };
    });

  for (const doc of snapshot.docs || []) {
    const data = doc.data() || {};
    if (data.status !== "completed") continue;
    if (data.completionEmailSentAt || data.completionEmailSkippedAt) continue;

    const outputUrl = resolveRenderUrl(data);
    if (!outputUrl) continue;

    const email = await getUserEmail(data.userId);
    if (!email) {
      await doc.ref.set(
        {
          completionEmailSkippedAt: new Date().toISOString(),
          completionEmailSkipReason: "missing_user_email",
        },
        { merge: true }
      );
      continue;
    }

    const expiresAt = toIsoString(data.expiresAt || data.result?.expiresAt || data.result?.expires_at);
    const dashboardUrl = process.env.DASHBOARD_URL || process.env.FRONTEND_URL || "https://autopromote.app";
    const expiryLine = expiresAt
      ? `This download is kept for 4 days and expires around ${new Date(expiresAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC.`
      : "This download is kept for 4 days.";

    try {
      await sendEmail({
        to: email,
        subject: "Your AutoPromote Cam Combiner master is ready",
        text: `Your Cam Combiner master is ready.\n\nDownload: ${outputUrl}\n\n${expiryLine}\n\nYou can also find it in AutoPromote under Saved Cam Combiner masters: ${dashboardUrl}`,
        html: `
          <p>Your Cam Combiner master is ready.</p>
          <p><a href="${outputUrl}">Download your master</a></p>
          <p>${expiryLine}</p>
          <p>You can also sign back in and find it under <strong>Saved Cam Combiner masters</strong>.</p>
          <p><a href="${dashboardUrl}">Open AutoPromote</a></p>
        `,
      });

      await doc.ref.set(
        {
          completionEmailSentAt: new Date().toISOString(),
          completionEmailTo: email,
        },
        { merge: true }
      );
    } catch (error) {
      console.error(`[RenderNotify] Failed to email render ${doc.id}:`, error.message);
    }
  }
}

module.exports = { notifyCompletedMulticamRenders };
