// emailService.js - provider-based email abstraction with simple template tokens.
const { getEmailProvider } = require('./emailProviders');
const ENABLE_EMAIL = process.env.EMAIL_SENDER_MODE !== 'disabled';

function renderTemplate(tpl, vars) {
  return tpl.replace(/\{{2}\s*([a-zA-Z0-9_]+)\s*\}{2}/g, (_,k)=> vars[k] != null ? String(vars[k]) : '');
}

async function sendEmail({ to, subject, html, text, headers }) {
  if (!ENABLE_EMAIL) {
    console.log(`[emailService] disabled -> ${subject} to ${to}`);
    return { ok:false, disabled:true };
  }
  const provider = getEmailProvider();
  const resp = await provider.send({ to, subject, html, text, headers });
  if (!resp || resp.ok === false) {
    try { const { recordEmailFailure } = require('./alertingService'); recordEmailFailure({ to, subject, provider: provider.name, error: resp && resp.error }); } catch(_){ }
  }
  return resp;
}

function buildLayout(innerHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{font-family:Arial,sans-serif;background:#fafafa;padding:24px;color:#222} .box{background:#fff;border:1px solid #eee;border-radius:8px;padding:24px;} h1{font-size:20px;margin:0 0 16px;} .footer{font-size:12px;color:#666;margin-top:24px}</style></head><body><div class="box">${innerHtml}<div class="footer">© ${new Date().getFullYear()} AutoPromote</div></div></body></html>`;
}

async function sendVerificationEmail({ email, link }) {
  const subject = 'Verify your AutoPromote account';
  const vars = { link };
  const textTpl = 'Welcome to AutoPromote! Verify your email: {{link}}';
  const htmlInner = `<h1>Welcome!</h1><p>Please verify your email by clicking below:</p><p><a href="${link}">Verify Email</a></p>`;
  return sendEmail({ to: email, subject, text: renderTemplate(textTpl, vars), html: buildLayout(htmlInner) });
}

async function sendPasswordResetEmail({ email, link }) {
  const subject = 'Reset your AutoPromote password';
  const vars = { link };
  const textTpl = 'Password reset requested. Reset using: {{link}}';
  const htmlInner = `<h1>Password Reset</h1><p>Click below to reset your password:</p><p><a href="${link}">Reset Password</a></p>`;
  return sendEmail({ to: email, subject, text: renderTemplate(textTpl, vars), html: buildLayout(htmlInner) });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendEmail };