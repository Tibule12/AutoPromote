// emailService.js - provider-based email abstraction with simple template tokens.
const { getEmailProvider } = require("./emailProviders");
const ENABLE_EMAIL = process.env.EMAIL_SENDER_MODE !== "disabled";
const { maskEmail } = require("../utils/logSanitizer");

function renderTemplate(tpl, vars) {
  return tpl.replace(/\{{2}\s*([a-zA-Z0-9_]+)\s*\}{2}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : ""
  );
}

async function sendEmail({ to, subject, html, text, headers }) {
  if (!ENABLE_EMAIL) {
    console.log("[emailService] disabled ->", subject, "to", maskEmail(to));
    return { ok: false, disabled: true };
  }
  const provider = getEmailProvider();
  const resp = await provider.send({ to, subject, html, text, headers });
  if (!resp || resp.ok === false) {
    try {
      const { recordEmailFailure } = require("./alertingService");
      recordEmailFailure({ to, subject, provider: provider.name, error: resp && resp.error });
    } catch (_) {}
  }
  return resp;
}

function buildLayout(innerHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{font-family:Arial,sans-serif;background:#fafafa;padding:24px;color:#222} .box{background:#fff;border:1px solid #eee;border-radius:8px;padding:24px;} h1{font-size:20px;margin:0 0 16px;} .footer{font-size:12px;color:#666;margin-top:24px}</style></head><body><div class="box">${innerHtml}<div class="footer">© ${new Date().getFullYear()} AutoPromote</div></div></body></html>`;
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
  const textTpl = "Password reset requested. Reset using: {{link}}";
  const htmlInner = `<h1>Password Reset</h1><p>Click below to reset your password:</p><p><a href="${escapeHtml(link)}">Reset Password</a></p>`;
  return sendEmail({
    to: email,
    subject,
    text: renderTemplate(textTpl, vars),
    html: buildLayout(htmlInner),
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

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPayoutNotification,
  sendContentPublishedNotification,
  sendSecurityAlert,
  sendScheduleReminder,
  sendEmail,
};
