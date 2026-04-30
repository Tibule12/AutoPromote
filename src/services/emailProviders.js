// emailProviders.js - provider registry & factory
// Supports: console (default), ZeptoMail API, and legacy SMTP fallback

const { maskEmail } = require("../utils/logSanitizer");

const providers = {
  console: () => ({
    name: "console",
    async send({ to, subject, htmlbody, text, sensitive }) {
      console.log("\n[email][console] to=%s subject=%s", maskEmail(to), subject);
      if (!sensitive) {
        if (text) console.log("[email][text]", text.slice(0, 800));
        if (htmlbody) console.log("[email][html]", htmlbody.slice(0, 800));
      } else {
        console.log("[email][console] body suppressed for sensitive message");
      }
      return { ok: true, provider: "console" };
    },
  }),

  zeptomail: () => {
    const apiUrl = process.env.ZEPTOMAIL_API_URL;
    const apiKey = process.env.ZEPTOMAIL_API_KEY;
    const fromEmail = process.env.ZEPTOMAIL_FROM_EMAIL;
    const fromName = process.env.ZEPTOMAIL_FROM_NAME;

    if (!apiUrl || !apiKey || !fromEmail || !fromName) {
      throw new Error(
        "missing ZEPTOMAIL_API_URL/ZEPTOMAIL_API_KEY/ZEPTOMAIL_FROM_EMAIL/ZEPTOMAIL_FROM_NAME"
      );
    }

    return {
      name: "zeptomail",
      async send({ to, subject, htmlbody }) {
        try {
          const fetchImpl = globalThis.fetch || require("node-fetch");
          const response = await fetchImpl(apiUrl, {
            method: "POST",
            headers: {
              Authorization: `Zoho-enczapikey ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: {
                address: fromEmail,
                name: fromName,
              },
              to: [
                {
                  email_address: {
                    address: to,
                  },
                },
              ],
              subject,
              htmlbody,
            }),
          });

          const rawBody = await response.text();
          let parsedBody = null;
          try {
            parsedBody = rawBody ? JSON.parse(rawBody) : null;
          } catch (_) {
            parsedBody = rawBody || null;
          }

          if (!response.ok) {
            const message =
              (parsedBody &&
                (parsedBody.message ||
                  parsedBody.error?.message ||
                  parsedBody.data?.[0]?.message ||
                  parsedBody.data?.[0]?.errors?.[0]?.message)) ||
              `HTTP ${response.status}`;
            console.error(
              "[email][zeptomail] error status=%s message=%s",
              response.status,
              message
            );
            return { ok: false, error: message, provider: "zeptomail", status: response.status };
          }

          const messageId =
            parsedBody?.data?.[0]?.message_id || parsedBody?.request_id || parsedBody?.message;
          return { ok: true, provider: "zeptomail", id: messageId || null };
        } catch (e) {
          console.error("[email][zeptomail] error:", e.message);
          return { ok: false, error: e.message, provider: "zeptomail" };
        }
      },
    };
  },

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
      async send({ to, subject, htmlbody, text }) {
        try {
          const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM || user,
            to,
            subject,
            html: htmlbody,
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
    return providers.zeptomail();
  },
};

function getEmailProvider() {
  const providerName = (
    process.env.EMAIL_PROVIDER ||
    (process.env.ZEPTOMAIL_API_KEY && process.env.ZEPTOMAIL_API_URL ? "zeptomail" : "console")
  ).toLowerCase();

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
