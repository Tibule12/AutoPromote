const TopNav = ({ onSignIn }) => (
  <header className="ap-top-nav">
    <a href="/" className="ap-logo" aria-label="AutoPromote home">
      <span className="ap-logo-mark" aria-hidden="true">
        ▶
      </span>
      <span className="ap-logo-copy">
        <strong>AutoPromote</strong>
        <small>Creator OS</small>
      </span>
    </a>
    <nav className="ap-nav-links" aria-label="Primary">
      <a href="#product-tour">Product Tour</a>
      <a href="#pricing">Pricing</a>
    </nav>
    <div className="ap-nav-actions">
      <span className="ap-nav-status">
        <i aria-hidden="true" />
        Workspace live
      </span>
      <button onClick={onSignIn} className="ap-btn ap-btn-ghost">
        Sign In
      </button>
    </div>
  </header>
);

export default TopNav;
