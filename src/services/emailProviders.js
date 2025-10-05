// emailProviders.js - provider registry & factory
// Supports: console (default), sendgrid (API key), mailgun (API key + domain)

const providers = {
  console: () => ({
    name: 'console',
    async send({ to, subject, html, text, headers }) {
      console.log('\n[email][console] to=%s subject=%s', to, subject);
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
