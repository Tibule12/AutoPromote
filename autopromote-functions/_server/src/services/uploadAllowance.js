// Account allowances live in server-owned user_billing, never user-editable profiles.
function effectiveUploadLimit(baseLimit, billingData = {}) {
  const value = billingData.uploadAllowance?.monthlyLimit;
  return Number.isInteger(value) && value >= 1 && value <= 10000
    ? Math.max(baseLimit, value)
    : baseLimit;
}

async function setUploadAllowance(
  db,
  { userId, adminId, monthlyLimit, reason, publishedVideoHours, monthlyPlatformPosts }
) {
  if (
    !Number.isInteger(monthlyLimit) ||
    monthlyLimit < 1 ||
    monthlyLimit > 10000 ||
    typeof reason !== "string" ||
    reason.trim().length < 8 ||
    reason.trim().length > 300 ||
    (publishedVideoHours !== undefined && publishedVideoHours !== 24) ||
    (monthlyPlatformPosts !== undefined &&
      (!Number.isInteger(monthlyPlatformPosts) ||
        monthlyPlatformPosts < 1 ||
        monthlyPlatformPosts > 10000))
  ) {
    throw Object.assign(
      new Error(
        "Enter a whole-number monthly allowance (1–10000) and a reason (8–300 characters)."
      ),
      { status: 400 }
    );
  }
  const user = db.collection("users").doc(userId);
  const billing = db.collection("user_billing").doc(userId);
  const audit = db.collection("audit_logs").doc();
  return db.runTransaction(async transaction => {
    const [userDoc, billingDoc] = await Promise.all([
      transaction.get(user),
      transaction.get(billing),
    ]);
    if (!userDoc.exists) throw Object.assign(new Error("User not found"), { status: 404 });
    const previous = billingDoc.data()?.uploadAllowance || null;
    const allowance = {
      monthlyLimit,
      reason: reason.trim(),
      updatedBy: adminId,
      updatedAt: new Date().toISOString(),
    };
    const update = { uploadAllowance: allowance };
    if (monthlyPlatformPosts !== undefined)
      update.publishingAllowance = { ...allowance, monthlyLimit: monthlyPlatformPosts };
    if (publishedVideoHours === 24)
      update.storageRetention = {
        publishedVideoHours: 24,
        updatedBy: adminId,
        updatedAt: allowance.updatedAt,
      };
    transaction.set(billing, update, { merge: true });
    transaction.set(audit, {
      action: "set_upload_allowance",
      adminId,
      targetId: userId,
      previous,
      allowance,
      ...(update.storageRetention ? { storageRetention: update.storageRetention } : {}),
      ...(update.publishingAllowance ? { publishingAllowance: update.publishingAllowance } : {}),
      timestamp: allowance.updatedAt,
    });
    return allowance;
  });
}

module.exports = { effectiveUploadLimit, setUploadAllowance };
