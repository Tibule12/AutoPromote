// emailProviders.js - provider registry & factory
// Supports: console (default), smtp (Zoho, Gmail, etc.), mailtrap

const { maskEmail } = require("../utils/logSanitizer");

const providers = {
  console: () => ({
    name: "console",
    async send({ to, subject, html, text }) {
      console.log("\n[email][console] to=%s subject=%s", maskEmail(to), subject);
      if (text) console.log("[email][text]", text.slice(0, 800));
      if (html) console.log("[email][html]", html.slice(0, 800));
      return { ok: true, provider: "console" };
    },
  }),

  smtp: () => {
    // Generic SMTP provider (works for Zoho, Gmail, Outlook, etc.)
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || "465", 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    
    if (!host || !user || !pass) {
       throw new Error("missing SMTP_HOST/SMTP_USER/SMTP_PASS for smtp provider");
    }

    let nodemailer;
    try {
      nodemailer = require("nodemailer");
    } catch (e) {
      throw new Error("nodemailer package not installed");
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    return {
      name: "smtp",
      async send({ to, subject, html, text }) {
        try {
          const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM || user,
            to,
            subject,
            html,
            text,
          });
          return { ok: true, provider: "smtp", id: info.messageId };
        } catch (e) {
          console.error("[email][smtp] error:", e.message);
          return { ok: false, error: e.message, provider: "smtp" };
        }
      },
    };
  },
  
  // Zoho alias for smtp (backward compatibility if enviroment uses 'zoho')
  zoho: () => {
    // Reuse smtp implementation but ensure host is zoho if not set? 
    // Actually, best to just use the smtp provider logic which reads env vars.
    // If user set EMAIL_PROVIDER=zoho, we map it to smtp implementation 
    // but we can ensure defaults if needed. For now, just alias it.
    return providers.smtp();
  }
};

function getEmailProvider() {
  const providerName = (process.env.EMAIL_PROVIDER || "console").toLowerCase();
  
  const factory = providers[providerName];
  if (!factory) {
    console.warn(`[email] provider '${providerName}' not found in registry, using console`);
    return providers.console();
  }
  
  try {
    return factory();
  } catch (e) {
    console.error(`[email] failed to init provider '${providerName}':`, e.message);
    return providers.console();
  }
}

module.exports = { getEmailProvider };
