const TopNav = ({ onSignIn }) => (
  <header className="ap-top-nav">
    <a href="/" className="ap-logo" aria-label="AutoPromote home">
      AutoPromote
    </a>
    <nav className="ap-nav-links" aria-label="Primary">
      <a href="#features">Features</a>
      <a href="#workflow">Workflow</a>
      <a href="#proof">Proof</a>
      <a href="#pricing">Pricing</a>
    </nav>
    <button onClick={onSignIn} className="ap-btn ap-btn-ghost">
      Sign In
    </button>
  </header>
);

export default TopNav;
