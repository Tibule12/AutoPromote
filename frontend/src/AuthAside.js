import React from 'react';

const ASIDE_CONTENT = {
  default: {
    title: 'Welcome to AutoPromote',
    subtitle: 'Launch and scale your creator brand faster with automation and insight.',
    bullets: [
      { title: 'Unified publishing', body: 'Schedule once and push to every connected channel.' },
      { title: 'Real-time analytics', body: 'Track performance with dashboards crafted for creators.' },
      { title: 'Audience intelligence', body: 'Spot trends before they peak and stay ahead.' }
    ],
    footnote: 'Enterprise partner? Email support@autopromote.org.'
  },
  admin: {
    title: 'Admin Command',
    subtitle: 'Securely manage teams, approvals, and moderation from a single console.',
    bullets: [
      { title: 'Access controls', body: 'Review roles, permissions, and elevated accounts in seconds.' },
      { title: 'Incident response', body: 'Triaged alerts and audit logs keep every action transparent.' },
      { title: 'Growth insights', body: 'Curate campaigns and surface opportunities for top creators.' }
    ],
    footnote: 'Need access? Contact security@autopromote.org.'
  }
};

const AuthAside = ({ variant = 'default' }) => {
  const content = ASIDE_CONTENT[variant] || ASIDE_CONTENT.default;

  return (
    <aside className="auth-aside">
      <div>
        <h3>{content.title}</h3>
        <p>{content.subtitle}</p>
        <ul className="auth-benefits">
          {content.bullets.map((item, index) => (
            <li key={index}>
              <strong>{item.title}</strong>
              <span>{item.body}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="auth-footnote">{content.footnote}</div>
    </aside>
  );
};

export default AuthAside;
