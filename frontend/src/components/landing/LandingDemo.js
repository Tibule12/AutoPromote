import { useEffect, useRef } from "react";
import LandingIcon from "./LandingIcon";
import ProductTourPlayer from "./ProductTourPlayer";

export default function LandingDemo({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="lp-demo-dialog"
      aria-labelledby="demo-heading"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="lp-demo-heading">
        <div>
          <p className="lp-eyebrow">REAL AUTOPROMOTE FOOTAGE</p>
          <h2 id="demo-heading">Your footage. Your edit. Your next release.</h2>
        </div>
        <button type="button" className="lp-demo-close" onClick={onClose} aria-label="Close demo">
          <LandingIcon name="close" />
        </button>
      </div>
      <ProductTourPlayer />
    </dialog>
  );
}
