import React, { useLayoutEffect, useRef, useState } from 'react';
import { perspectiveCssMatrix } from './studioPerspective';

export default function StudioPerspectiveSurface({ value, progress, children }) {
  const ref = useRef(null), [size, setSize] = useState([1, 1]);
  const enabled = !!value;
  useLayoutEffect(() => {
    const update = () => { const el=ref.current; if (el) setSize([Math.max(1,el.clientWidth),Math.max(1,el.clientHeight)]); };
    if (!enabled) return undefined;
    update(); const observer=typeof ResizeObserver==='function'?new ResizeObserver(update):null; if (ref.current) observer?.observe(ref.current);
    return () => observer?.disconnect();
  }, [enabled]);
  if (!value) return children;
  return <div ref={ref} data-testid="studio-perspective-surface" style={{width:'100%',height:'100%',
    transformOrigin:'0 0',transform:perspectiveCssMatrix(value,progress,...size)}}>{children}</div>;
}
