// emailService.js - provider-based email abstraction with simple template tokens.
const { getEmailProvider } = require("./emailProviders");
const ENABLE_EMAIL = process.env.EMAIL_SENDER_MODE !== "disabled";
const { maskEmail } = require("../utils/logSanitizer");

function renderTemplate(tpl, vars) {
  return tpl.replace(/\{{2}\s*([a-zA-Z0-9_]+)\s*\}{2}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : ""
  );
}

async function sendEmail({ to, subject, html, htmlbody, text, headers, sensitive = false }) {
  if (!ENABLE_EMAIL) {
    console.log("[emailService] disabled ->", subject, "to", maskEmail(to));
    return { ok: false, disabled: true };
  }
  const provider = getEmailProvider();
  const finalHtmlBody = htmlbody || html;
  const resp = await provider.send({
    to,
    subject,
    htmlbody: finalHtmlBody,
    text,
    headers,
    sensitive,
  });
  if (!resp || resp.ok === false) {
    try {
      const { recordEmailFailure } = require("./alertingService");
      recordEmailFailure({ to, subject, provider: provider.name, error: resp && resp.error });
    } catch (_) {}
  }
  return resp;
}

function buildLayout(innerHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>body{margin:0;padding:0;background:#09090f;color:#e8e8f2;font-family:Arial,sans-serif} .shell{padding:32px 16px;background:radial-gradient(circle at top,#5b21b6 0%,#111827 42%,#050816 100%)} .box{max-width:560px;margin:0 auto;background:rgba(15,23,42,.94);border:1px solid rgba(139,92,246,.26);border-radius:20px;padding:32px;box-shadow:0 30px 80px rgba(0,0,0,.45)} .brand{display:inline-block;margin-bottom:18px;padding:8px 12px;border-radius:999px;background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.28);color:#c4b5fd;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase} h1{font-size:28px;line-height:1.2;margin:0 0 14px;color:#fff} p{font-size:15px;line-height:1.65;color:#d1d5db;margin:0 0 14px} .button{display:inline-block;margin:18px 0;padding:14px 22px;border-radius:14px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff !important;text-decoration:none;font-weight:700} .linkbox{margin:18px 0;padding:14px 16px;border-radius:14px;background:rgba(17,24,39,.85);border:1px solid rgba(148,163,184,.15);word-break:break-all;color:#cbd5e1;font-size:13px} .note{margin-top:18px;padding-top:18px;border-top:1px solid rgba(148,163,184,.16);font-size:13px;color:#94a3b8} .footer{font-size:12px;color:#7c83a1;margin-top:24px;text-align:center}</style></head><body><div class="shell"><div class="box"><div class="brand">AutoPromote</div>${innerHtml}<div class="footer">© ${new Date().getFullYear()} AutoPromote</div></div></div></body></html>`;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendVerificationEmail({ email, link }) {
  const subject = "Verify your AutoPromote account";
  const vars = { link };
  const textTpl = "Welcome to AutoPromote! Verify your email: {{link}}";
  const htmlInner = `<h1>Welcome!</h1><p>Please verify your email by clicking below:</p><p><a href="${escapeHtml(link)}">Verify Email</a></p>`;
  return sendEmail({
    to: email,
    subject,
    text: renderTemplate(textTpl, vars),
    html: buildLayout(htmlInner),
  });
}

async function sendPasswordResetEmail({ email, link }) {
  const subject = "Reset your AutoPromote password";
  const vars = { link };
  const textTpl =
    "Reset your AutoPromote password.\n\nUse this link within 15 minutes: {{link}}\n\nIf you did not request this, you can ignore this email.";
  const safeLink = escapeHtml(link);
  const htmlInner = `<h1>Reset your AutoPromote password</h1><p>We received a request to reset your password. Use the button below to choose a new one.</p><p><a class="button" href="${safeLink}">Reset Password</a></p><p>This link expires in 15 minutes.</p><div class="linkbox">${safeLink}</div><p class="note">If you did not request this, you can ignore this email.</p>`;
  return sendEmail({
    to: email,
    subject,
    text: renderTemplate(textTpl, vars),
    htmlbody: buildLayout(htmlInner),
    sensitive: true,
  });
}

async function sendWelcomeEmail({ email, name, loginUrl }) {
  const subject = "Welcome to AutoPromote! 🎉";
  const vars = { name: name || "there", loginUrl: loginUrl || "https://autopromote.org" };
  const textTpl =
    "Welcome to AutoPromote!\n\nHi {{name}},\n\nThanks for joining! Visit your dashboard: {{loginUrl}}";
  const htmlInner = `<h1>Welcome to AutoPromote!</h1><p>Hi ${escapeHtml(vars.name)},</p><p>Thanks for joining AutoPromote! We're excited to help you promote your content across multiple platforms.</p><p>Get started by connecting your social media accounts and uploading your first content.</p><p><a href="${escapeHtml(vars.loginUrl)}" style="display:inline-block;background:#667eea;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;margin:16px 0">Go to Dashboard</a></p>`;
  return sendEmail({
    to: email,
    subject,
    text: renderTemplate(textTpl, vars),
    html: buildLayout(htmlInner),
  });
}

async function sendPayoutNotification({ email, name, amount, method, expectedDate }) {
  const subject = `💰 Payout Processed: $${amount}`;
  const vars = {
    name: name || "there",
    amount,
    method: method || "Bank Transfer",
    expectedDate: expectedDate || "3-5 business days",
  };
  const textTpl =
    "Payout Processed: ${{amount}}\n\nHi {{name}},\n\nYour payout has been processed via {{method}}. Expected arrival: {{expectedDate}}.";
  const htmlInner = `<h1>🎉 Payout Processed!</h1><p>Hi ${escapeHtml(vars.name)},</p><div style="background:#d4edda;border-left:4px solid #28a745;padding:12px;margin:20px 0"><strong>Your payout of $${escapeHtml(vars.amount)} has been processed!</strong></div><div style="background:#f8f9fa;padding:15px;border-radius:6px;margin:20px 0"><p><strong>Amount:</strong> $${escapeHtml(vars.amount)}</p><p><strong>Method:</strong> ${escapeHtml(vars.method)}</p><p><strong>Expected Arrival:</strong> ${escapeHtml(vars.expectedDate)}</p></div><p>Keep creating amazing content!</p>`;
  return sendEmail({
    to: email,
    subject,
    text: renderTemplate(textTpl, vars),
    html: buildLayout(htmlInner),
  });
}

async function sendContentPublishedNotification({ email, name, contentTitle, platforms }) {
  const subject = `✅ Content Published: ${contentTitle}`;
  const platformList = (platforms || []).join(", ");
  const vars = { name: name || "there", contentTitle, platforms: platformList };
  const textTpl =
    "Content Published: {{contentTitle}}\n\nHi {{name}},\n\nYour content is now live on: {{platforms}}";
  const htmlInner = `<h1>Content Published Successfully!</h1><p>Hi ${escapeHtml(vars.name)},</p><div style="background:#d4edda;border-left:4px solid #28a745;padding:12px;margin:20px 0"><strong>"${escapeHtml(vars.contentTitle)}"</strong> is now live!</div><p><strong>Published to:</strong> ${escapeHtml(platformList)}</p><p>Track your performance in the Analytics tab.</p>`;
  return sendEmail({
    to: email,
    subject,
    text: renderTemplate(textTpl, vars),
    html: buildLayout(htmlInner),
  });
}

async function sendSecurityAlert({ email, name, action, device, location, timestamp }) {
  const subject = "🔒 Security Alert - New Login Detected";
  const vars = {
    name: name || "there",
    action: action || "Login",
    device: device || "Unknown",
    location: location || "Unknown",
    timestamp: timestamp || new Date().toLocaleString(),
  };
  const textTpl =
    "Security Alert\n\nNew login detected:\nDevice: {{device}}\nLocation: {{location}}\nTime: {{timestamp}}\n\nSecure your account: https://autopromote.org/security";
  const htmlInner = `<h1>🔒 Security Alert</h1><p>Hi ${escapeHtml(vars.name)},</p><div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px;margin:20px 0"><strong>We detected a new login to your account</strong></div><div style="background:#f8f9fa;padding:15px;border-radius:6px;margin:20px 0"><p><strong>Action:</strong> ${escapeHtml(vars.action)}</p><p><strong>Device:</strong> ${escapeHtml(vars.device)}</p><p><strong>Location:</strong> ${escapeHtml(vars.location)}</p><p><strong>Time:</strong> ${escapeHtml(vars.timestamp)}</p></div><p>If this was you, you can ignore this email.</p><p>If you don't recognize this activity:</p><p><a href="https://autopromote.org/security" style="display:inline-block;background:#dc3545;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;margin:16px 0">Secure My Account</a></p>`;
  return sendEmail({
    to: email,
    subject,
    text: renderTemplate(textTpl, vars),
    html: buildLayout(htmlInner),
  });
}

async function sendScheduleReminder({ email, name, contentTitle, scheduledTime, platforms }) {
  const subject = `⏰ Content Publishing Soon: ${contentTitle}`;
  const platformList = (platforms || []).join(", ");
  const vars = { name: name || "there", contentTitle, scheduledTime, platforms: platformList };
  const textTpl =
    "Content Publishing Soon: {{contentTitle}}\n\nHi {{name}},\n\nYour content is scheduled to publish at {{scheduledTime}} on: {{platforms}}";
  const htmlInner = `<h1>⏰ Content Publishing Soon</h1><p>Hi ${escapeHtml(vars.name)},</p><p>Your content <strong>"${escapeHtml(vars.contentTitle)}"</strong> is scheduled to publish at:</p><div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px;margin:20px 0"><strong>${escapeHtml(vars.scheduledTime)}</strong></div><p><strong>Platforms:</strong> ${escapeHtml(platformList)}</p><p>You can edit or cancel this schedule in your dashboard.</p>`;
  return sendEmail({
    to: email,
    subject,
    text: renderTemplate(textTpl, vars),
    html: buildLayout(htmlInner),
  });
}

async function sendUsageLimitWarningEmail({
  email,
  name,
  feature,
  used,
  limit,
  resetLabel,
  dashboardUrl,
}) {
  const subject = `AutoPromote usage limit reached: ${feature || "Publishing"}`;
  const vars = {
    name: name || "there",
    feature: feature || "Publishing",
    used: used == null ? "all" : used,
    limit: limit == null ? "available" : limit,
    resetLabel: resetLabel || "your next billing period",
    dashboardUrl: dashboardUrl || "https://autopromote.org/#/billing",
  };
  const textTpl =
    "Hi {{name}},\n\nYour AutoPromote {{feature}} allowance is currently full ({{used}} / {{limit}} used). Scheduled posts that need this allowance will wait until you have capacity again.\n\nYou can review usage and top up here: {{dashboardUrl}}\n\nThis resets in {{resetLabel}}.";
  const safeUrl = escapeHtml(vars.dashboardUrl);
  const htmlInner = `<h1>${escapeHtml(vars.feature)} limit reached</h1><p>Hi ${escapeHtml(vars.name)},</p><p>Your AutoPromote ${escapeHtml(vars.feature)} allowance is currently full.</p><div style="background:#111827;border:1px solid rgba(250,204,21,.35);border-radius:14px;padding:16px;margin:18px 0"><p style="margin:0;color:#fff"><strong>${escapeHtml(vars.used)} / ${escapeHtml(vars.limit)}</strong> used</p><p style="margin:8px 0 0;color:#cbd5e1">Reset: ${escapeHtml(vars.resetLabel)}</p></div><p>Scheduled posts that need this allowance will wait until you have capacity again.</p><p><a class="button" href="${safeUrl}">Review usage</a></p><div class="linkbox">${safeUrl}</div>`;
  return sendEmail({
    to: email,
    subject,
    text: renderTemplate(textTpl, vars),
    html: buildLayout(htmlInner),
  });
}

async function sendWorkspaceInvitation({
  email,
  inviterName,
  workspaceName,
  role,
  inviteUrl,
  expiresInDays = 7,
}) {
  const safeUrl = escapeHtml(inviteUrl);
  const safeWorkspace = escapeHtml(workspaceName || "an AutoPromote workspace");
  const safeInviter = escapeHtml(inviterName || "A workspace owner");
  const safeRole = escapeHtml(role || "editor");
  const subject = `You were invited to ${workspaceName || "an AutoPromote workspace"}`;
  const text = `${inviterName || "A workspace owner"} invited you to ${workspaceName || "an AutoPromote workspace"} as ${role || "editor"}. Accept within ${expiresInDays} days: ${inviteUrl}`;
  const htmlInner = `<h1>Join ${safeWorkspace}</h1><p>${safeInviter} invited you to collaborate as <strong>${safeRole}</strong>.</p><p><a class="button" href="${safeUrl}">Accept invitation</a></p><div class="linkbox">${safeUrl}</div><p class="note">This invitation expires in ${escapeHtml(expiresInDays)} days and can only be accepted by ${escapeHtml(email)}.</p>`;
  return sendEmail({
    to: email,
    subject,
    text,
    htmlbody: buildLayout(htmlInner),
    sensitive: true,
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPayoutNotification,
  sendContentPublishedNotification,
  sendSecurityAlert,
  sendScheduleReminder,
  sendUsageLimitWarningEmail,
  sendWorkspaceInvitation,
  sendEmail,
};
