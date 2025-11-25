// emailProviders.js - provider registry & factory
// Supports: console (default), sendgrid (API key), mailgun (API key + domain),
//           resend (API key), mailtrap (SMTP)

const { maskEmail } = require('../utils/logSanitizer');
const providers = {
  console: () => ({
    name: 'console',
    async send({ to, subject, html, text, headers }) {
    console.log('\n[email][console] to=%s subject=%s', maskEmail(to), subject);
      if (text) console.log('[email][text]', text.slice(0,800));
      if (html) console.log('[email][html]', html.slice(0,800));
      return { ok:true, provider: 'console' };
    }
  }),
  sendgrid: () => {
    const key = process.env.SENDGRID_API_KEY;
    if (!key) throw new Error('missing SENDGRID_API_KEY');
    let sg;
    try { sg = require('@sendgrid/mail'); } catch(e){ throw new Error('sendgrid package not installed'); }
    sg.setApiKey(key);
    return {
      name: 'sendgrid',
      async send({ to, subject, html, text, headers }) {
        try {
          await sg.send({ to, from: process.env.EMAIL_FROM || 'no-reply@autopromote.local', subject, html, text, headers });
          return { ok:true, provider:'sendgrid' };
        } catch(e){
          console.warn('[email][sendgrid] error', e.message);
          return { ok:false, error:e.message, provider:'sendgrid' };
        }
      }
    };
  },
  resend: () => {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('missing RESEND_API_KEY');
    let Resend;
    try { ({ Resend } = require('resend')); } catch(e){ throw new Error('resend package not installed'); }
    const client = new Resend(key);
    return {
      name: 'resend',
      async send({ to, subject, html, text, headers }) {
        try {
          const from = process.env.EMAIL_FROM || 'AutoPromote <no-reply@autopromote.dev>';
          await client.emails.send({ from, to, subject, html, text, headers });
          return { ok:true, provider:'resend' };
        } catch(e){
          console.warn('[email][resend] error', e.message);
          return { ok:false, error:e.message, provider:'resend' };
        }
      }
    };
  },
  mailtrap: () => {
    const user = process.env.MAILTRAP_USER;
    const pass = process.env.MAILTRAP_PASS;
    if (!user || !pass) throw new Error('missing MAILTRAP_USER/MAILTRAP_PASS');
    let nodemailer;
    try { nodemailer = require('nodemailer'); } catch(e){ throw new Error('nodemailer package not installed'); }
    const transporter = nodemailer.createTransport({
      host: process.env.MAILTRAP_HOST || 'sandbox.smtp.mailtrap.io',
      port: parseInt(process.env.MAILTRAP_PORT || '2525', 10),
      auth: { user, pass }
    });
    return {
      name: 'mailtrap',
      async send({ to, subject, html, text, headers }) {
        try {
          await transporter.sendMail({
            from: process.env.EMAIL_FROM || 'AutoPromote <no-reply@mailtrap.autopromote.dev>',
            to,
            subject,
            html,
            text,
            headers
          });
          return { ok:true, provider:'mailtrap' };
        } catch(e){
          console.warn('[email][mailtrap] error', e.message);
          return { ok:false, error:e.message, provider:'mailtrap' };
        }
      }
    };
  },
  mailgun: () => {
    const key = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    if (!key || !domain) throw new Error('missing MAILGUN_API_KEY/MAILGUN_DOMAIN');
    let formData;
    try { formData = require('form-data'); } catch(e){ throw new Error('form-data package not installed'); }
    const fetch = require('node-fetch');
    return {
      name: 'mailgun',
      async send({ to, subject, html, text, headers }) {
        const auth = Buffer.from(`api:${key}`).toString('base64');
        const body = new URLSearchParams();
        body.append('from', process.env.EMAIL_FROM || `AutoPromote <no-reply@${domain}>`);
        body.append('to', to);
        body.append('subject', subject);
        if (text) body.append('text', text);
        if (html) body.append('html', html);
        try {
          const resp = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
            method: 'POST',
            headers: { Authorization: `Basic ${auth}` },
            body
          });
          const ok = resp.status >=200 && resp.status <300;
            return { ok, status: resp.status, provider: 'mailgun' };
        } catch(e){ return { ok:false, error:e.message, provider:'mailgun' }; }
      }
    };
  }
};

function getEmailProvider() {
  const mode = (process.env.EMAIL_PROVIDER || 'console').toLowerCase();
  const factory = providers[mode] || providers.console;
  try { return factory(); } catch(e){ console.warn('[email] provider init failed, fallback to console:', e.message); return providers.console(); }
}

module.exports = { getEmailProvider };
