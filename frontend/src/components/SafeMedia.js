import React, { forwardRef, useEffect, useRef } from "react";
import { applySafeMediaSource, applySafeMediaPoster } from "../utils/security";

const assignRef = (targetRef, value) => {
  if (!targetRef) return;
  if (typeof targetRef === "function") {
    targetRef(value);
    return;
  }
  targetRef.current = value;
};

const createSafeMediaComponent = tagName => {
  const SafeMediaComponent = forwardRef(({ src, poster, ...props }, forwardedRef) => {
    const localRef = useRef(null);

    useEffect(() => {
      applySafeMediaSource(localRef.current, src);
    }, [src]);

    useEffect(() => {
      applySafeMediaPoster(localRef.current, poster);
    }, [poster]);

    return React.createElement(tagName, {
      ...props,
      ref: node => {
        localRef.current = node;
        assignRef(forwardedRef, node);
      },
    });
  });
  SafeMediaComponent.displayName = `Safe${tagName.charAt(0).toUpperCase()}${tagName.slice(1)}`;
  return SafeMediaComponent;
};

export const SafeImage = createSafeMediaComponent("img");
export const SafeVideo = createSafeMediaComponent("video");
export const SafeAudio = createSafeMediaComponent("audio");
