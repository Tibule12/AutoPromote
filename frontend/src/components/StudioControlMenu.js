import React, { useEffect, useRef } from "react";

export default function StudioControlMenu({ className = "", label, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const menu = ref.current;
    if (!menu.classList.contains("studio-view-options")) return undefined;
    const popup = menu.querySelector(".preview-display-controls");
    if (!popup) return undefined;
    const position = () => {
      if (!menu.open) return;
      // A narrow monitor can put the trigger less than one popup-width from
      // the screen edge. Keep the readable menu inside the viewport even when
      // its ancestors intentionally allow it to overlap adjacent panels.
      const previous = parseFloat(popup.style.getPropertyValue("--studio-menu-shift-x")) || 0;
      const box = popup.getBoundingClientRect();
      const left = box.left - previous;
      const right = box.right - previous;
      const shift = left < 12 ? 12 - left : Math.min(0, window.innerWidth - 12 - right);
      popup.style.setProperty("--studio-menu-shift-x", `${shift}px`);
    };
    menu.addEventListener("toggle", position);
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    observer?.observe(menu);
    const panel = menu.closest(".preview-panel");
    if (panel) observer?.observe(panel);
    return () => {
      menu.removeEventListener("toggle", position);
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
      observer?.disconnect();
    };
  }, []);
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
        if (event.key === "Escape" && ref.current.open) {
          event.preventDefault();
          event.stopPropagation();
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
