// Detection works in source-pixel centres; the solo monitor uses CSS object-position.
export function soloTrackingCoordinates(position, sourceAspect, outputAspect, zoom = 1) {
  const width = Math.min(1, outputAspect/sourceAspect)/zoom;
  const height = Math.min(1, sourceAspect/outputAspect)/zoom;
  return {
    anchor: { x: width*50+(1-width)*position.x, y: height*50+(1-height)*position.y },
    toPosition: mark => ({ ...mark,
      x: width >= .99999 ? position.x : Math.max(0, Math.min(100, (mark.x-width*50)/(1-width))),
      y: height >= .99999 ? position.y : Math.max(0, Math.min(100, (mark.y-height*50)/(1-height))),
    }),
  };
}

// Keep detector coordinates in source space so changing the delivery aspect
// does not reuse a centered landscape object-position as a portrait face path.
export function reprojectDetectedReframeKeys(keyframes, outputAspect, zoom = 1) {
  return keyframes.map(mark => {
    const focus = mark.sourceFocus;
    if (!focus || ![focus.x, focus.y, focus.aspect].every(Number.isFinite) || focus.aspect <= 0) return mark;
    const coordinates = soloTrackingCoordinates(mark, focus.aspect, outputAspect, zoom);
    const position = coordinates.toPosition(focus);
    return { ...mark, x: position.x, y: position.y };
  });
}
