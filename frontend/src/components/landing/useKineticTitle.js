import { useCallback, useEffect, useRef } from "react";

// Responsive, accessible HTML text remains outside the graphics renderer.
// Native Web Animations provide finite matte/blur/scale reveals, not a perpetual loop.
export default function useKineticTitle(ref, reduced) {
  const animations = useRef([]);
  const visible = useRef(true);
  const reveal = useCallback(() => {
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    if (reduced || !ref.current) return;
    ref.current.querySelectorAll("[data-kinetic-line]").forEach((line, index) => {
      if (!line.animate) return;
      const emphasis = index === 1;
      const animation = line.animate(
        [
          {
            transform: `translateY(${emphasis ? 72 : 38}px) scale(${emphasis ? 1.12 : 0.98})`,
            filter: `blur(${emphasis ? 12 : 5}px)`,
            clipPath: "inset(0 0 100% 0)",
            opacity: 0,
          },
          {
            transform: "translateY(-1px) scale(0.995)",
            filter: "blur(0px)",
            clipPath: "inset(0 0 0% 0)",
            opacity: 1,
            offset: 0.86,
          },
          {
            transform: "translateY(0) scale(1)",
            filter: "blur(0px)",
            clipPath: "inset(0 0 0% 0)",
            opacity: 1,
          },
        ],
        {
          duration: emphasis ? 1450 : 1100,
          delay: index * 330,
          easing: "cubic-bezier(.16,1,.3,1)",
          fill: "both",
        }
      );
      if (!visible.current || document.hidden) animation.pause();
      animations.current.push(animation);
    });
    const gradient = ref.current.querySelector(".lp-gradient-text");
    if (gradient?.animate)
      animations.current.push(
        gradient.animate([{ backgroundPosition: "100% 50%" }, { backgroundPosition: "0% 50%" }], {
          duration: 1800,
          delay: 330,
          easing: "cubic-bezier(.16,1,.3,1)",
          fill: "both",
        })
      );
  }, [ref, reduced]);
  useEffect(() => {
    reveal();
    const sync = () =>
      animations.current.forEach(animation => {
        // Pausing a finished, forwards-filled animation and playing it again
        // rewinds it. Preserve completed text when the visitor returns to it.
        if (!visible.current || document.hidden) {
          if (animation.playState === "running") animation.pause();
        }
        else if (animation.playState === "paused") animation.play();
      });
    const observer =
      window.IntersectionObserver &&
      new IntersectionObserver(([entry]) => {
        visible.current = entry.isIntersecting;
        sync();
      });
    if (observer && ref.current) observer.observe(ref.current);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      animations.current.forEach(animation => animation.cancel());
      animations.current = [];
    };
  }, [ref, reveal]);
  return reveal;
}
