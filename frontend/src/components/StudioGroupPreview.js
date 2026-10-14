import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { studioGroupTree, evaluateStudioGroupTransform } from './studioGroups';
import { studioLayerMaskSvg } from './studioMaskGeometry';

function GroupCanvas({ group, pose: t, rank, visible, children }) {
  const node = useRef(null), [size, setSize] = useState(null);
  useLayoutEffect(() => {
    const update = () => {
      const width = node.current?.clientWidth, height = node.current?.clientHeight;
      if (width > 0 && height > 0) setSize(current => current?.width === width && current?.height === height ? current : { width, height });
    };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update); observer.observe(node.current);
    return () => observer.disconnect();
  }, []);
  const svg = size && studioLayerMaskSvg(group.mask, 0, 0, size.width, size.height, size.height / 720);
  const maskImage = svg ? `url("data:image/svg+xml,${encodeURIComponent(svg)}")` : undefined;
  return <div ref={node} data-studio-group-id={group.id} data-studio-group-pose={JSON.stringify(t)}
    style={{ position: 'absolute', inset: 0, transformOrigin: '50% 50%',
      transform: `translate(${t.x}%, ${t.y}%) rotate(${t.rotation}deg) scale(${t.scale})`,
      opacity: t.opacity, overflow: 'hidden', isolation: 'isolate', pointerEvents: 'none', zIndex: rank,
      display: visible ? undefined : 'none',
      mixBlendMode: group.blendMode || 'normal', maskImage, WebkitMaskImage: maskImage,
      maskSize: '100% 100%', WebkitMaskSize: '100% 100%', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}>
    {children}
  </div>;
}

// Keep child coordinates and keyframes local to a full programme canvas.
// Composite a group's children before applying its opacity and parent transform.
export default function StudioGroupPreview({ compounds, order, keyframes = [], time = 0, getTime, children }) {
  const tree = studioGroupTree(compounds, order);
  const [frame, setFrame] = useState(time), clock = useRef(getTime);
  clock.current = getTime;
  const animated = keyframes.some(key => tree.byId.has(key.targetId)) || tree.groups.some(group => group.timing), hasClock = typeof getTime === 'function';
  useEffect(() => { setFrame(time); }, [time]);
  useEffect(() => {
    if (!animated || !hasClock) return undefined;
    let raf, previous;
    const update = () => {
      const now = Math.round(Number(clock.current?.()) * 90000) / 90000;
      if (Number.isFinite(now) && now !== previous) { previous = now; setFrame(now); }
      raf = requestAnimationFrame(update);
    };
    update(); return () => cancelAnimationFrame(raf);
  }, [animated, hasClock]);
  if (!tree.groups.length) return children;
  const layers = new Map(), other = [], known = new Set(order);
  const collect = elements => React.Children.forEach(elements, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment || child.type === React.Suspense) {
      collect(child.props.children); return;
    }
    const id = child.props['data-studio-layer-id'] || child.props.scenes?.[0]?.id;
    if (id && known.has(id)) layers.set(id, child); else other.push(child);
  });
  collect(children);
  const rank = new Map(order.map((id, index) => [id, 100 + index]));
  const render = id => {
    const group = tree.byId.get(id);
    if (!group) return layers.has(id) ? <React.Suspense key={id} fallback={null}>{layers.get(id)}</React.Suspense> : null;
    const t = evaluateStudioGroupTransform(group, keyframes, frame);
    const visible = !group.timing || (frame >= group.timing.startTime && frame < group.timing.startTime + group.timing.duration);
    return <GroupCanvas key={id} group={group} pose={t} visible={visible} rank={rank.get(tree.leaves(id)[0])}>
      {group.layerIds.map(render)}
    </GroupCanvas>;
  };
  return <>{tree.roots.map(render)}{React.Children.toArray(other)}</>;
}
