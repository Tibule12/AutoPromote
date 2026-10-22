import './AutoPromoteLogo.css';

// The owner's supplied gradient identity, with its original pixels embedded in
// a tight SVG viewport. A light backing keeps its dark lettering legible.
export default function AutoPromoteLogo({ compact = false }) {
  return <span className={`ap-brand-logo${compact ? ' ap-brand-logo--compact' : ''}`}>
    <img src="/brand/autopromote-gradient.svg" alt="AutoPromote" width="1200" height="269" draggable="false" />
  </span>;
}
