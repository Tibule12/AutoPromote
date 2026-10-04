import React, { useEffect, useRef } from "react";

export default function StudioControlMenu({ className = "", label, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dismiss = event => {
      if (ref.current?.open && !ref.current.contains(event.target)) ref.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return (
    <details
      ref={ref}
      className={`studio-control-menu ${className}`}
      onKeyDown={event => {
        if (event.key === "Escape") {
          ref.current.open = false;
          ref.current.querySelector("summary").focus();
        }
      }}
      onClick={event => {
        if (event.target.closest("button") && !event.target.closest("button").disabled)
          ref.current.open = false;
      }}
    >
      <summary>{label}</summary>
      {children}
    </details>
  );
}
