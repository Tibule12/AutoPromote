import { forwardRef, useImperativeHandle, useRef } from "react";
import MotionAssetLayer from "./MotionAssetLayer";
import { cue, SEQUENCE_DURATION } from "./editingSequence";
import { MOTION_ASSETS } from "./motionAssetManifest";

const MotionGraphicsLayer = forwardRef(function MotionGraphicsLayer({ enabled }, ref) {
  const holder = useRef(null),
    word = useRef(null),
    assets = useRef([]);
  const previousWord = useRef("");
  useImperativeHandle(ref, () => ({
    seek(time) {
      if (!holder.current) return;
      holder.current.dataset.time = time.toFixed(3);
      holder.current.style.setProperty("--film-progress", time / SEQUENCE_DURATION);
      const text =
        time < 7.8
          ? "EVERY ANGLE."
          : time < 12.4
            ? "IN SYNC."
            : time < 16
              ? "MAKE THE CUT."
              : time < 21.5
                ? "ONE MOMENT."
                : "NEW AUDIENCES.";
      if (text !== previousWord.current) {
        word.current.textContent = text;
        previousWord.current = text;
      }
      const start =
        time < 7.8 ? 3.5 : time < 12.4 ? 7.8 : time < 16 ? 12.4 : time < 21.5 ? 16 : 21.5;
      holder.current.style.setProperty("--graphic-reveal", cue(time, start, start + 0.85));
      holder.current.style.setProperty("--graphic-sweep", cue(time, start, start + 1.4));
      assets.current.forEach(asset => asset?.seek(time));
    },
    setActive(value) {
      assets.current.forEach(asset => asset?.setActive(value));
    },
  }));
  return (
    <div ref={holder} className="lp-motion-graphics" aria-hidden="true" data-enabled={enabled}>
      <div className="lp-graphic-word-mask">
        <span ref={word}>EVERY ANGLE.</span>
      </div>
      <div className="lp-graphic-light-sweep" />
      <div className="lp-graphic-progress" />
      <svg className="lp-composition-marks" viewBox="0 0 1000 760" fill="none">
        <path d="M40 90V40H90M910 40H960V90M40 670V720H90M910 720H960V670" />
        <path className="lp-motion-stroke" d="M40 380H110M890 380H960" />
      </svg>
      {MOTION_ASSETS.map((asset, index) => (
        <MotionAssetLayer
          key={asset.id}
          asset={asset}
          enabled={enabled}
          ref={value => {
            assets.current[index] = value;
          }}
        />
      ))}
    </div>
  );
});
export default MotionGraphicsLayer;
