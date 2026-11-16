import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader";
import interGlyphs from "../motion/logoGlyphs.v1.json";

const svgLoader = new SVGLoader();

function pointInPoly2D(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function glyphContoursToShapes(glyph, unit) {
  const curves = (glyph.contours || []).map(contour => {
    const nodes = contour.nodes || [];
    if (!nodes.length) return [];
    const path = new THREE.Path();
    const mapX = nx => (glyph.left + (nx / 100) * glyph.side) * unit;
    const mapY = ny => (glyph.top - (ny / 100) * glyph.side) * unit;
    path.moveTo(mapX(nodes[0].x), mapY(nodes[0].y));
    const count = contour.closed ? nodes.length : nodes.length - 1;
    for (let i = 0; i < count; i += 1) {
      const a = nodes[i];
      const b = nodes[(i + 1) % nodes.length];
      path.bezierCurveTo(
        mapX(a.x + (a.out?.[0] || 0)),
        mapY(a.y + (a.out?.[1] || 0)),
        mapX(b.x + (b.in?.[0] || 0)),
        mapY(b.y + (b.in?.[1] || 0)),
        mapX(b.x),
        mapY(b.y)
      );
    }
    const pts = path.getPoints(12);
    if (pts.length >= 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
    return pts;
  }).filter(pts => pts.length >= 3);

  // Largest-area contours become outers first; enclosed inner rings become holes
  const ranked = curves
    .map(pts => ({ pts, absArea: Math.abs(area2D(pts)) }))
    .sort((a, b) => b.absArea - a.absArea);

  const outers = [];
  for (const ring of ranked) {
    const parent = outers.find(o => pointInPoly2D(ring.pts[0], o.pts));
    if (parent) {
      const holePts = [...ring.pts];
      if (area2D(holePts) > 0) holePts.reverse();
      parent.shape.holes.push(new THREE.Path(holePts));
    } else {
      const outerPts = [...ring.pts];
      if (area2D(outerPts) < 0) outerPts.reverse();
      outers.push({ pts: outerPts, shape: new THREE.Shape(outerPts) });
    }
  }
  return outers.map(o => o.shape);
}

/**
 * Extrude crisp Inter Black (900) or Inter SemiBold (600) architectural typography
 * directly from logoGlyphs.v1.json contours with proper hole winding and tracking.
 */
export function buildInterWordmarkGlyphs(
  text,
  {
    weight = "900",
    size = 0.62,
    depth = 0.2,
    bevelSize = 0.015,
    bevelThickness = 0.014,
    bevelSegments = 4,
    letterSpacing = 0.08,
    fallbackFont = null,
  } = {}
) {
  const cleanText = String(text || "BRAND").trim() || "BRAND";
  const fontTable = interGlyphs.weights[String(weight)] || interGlyphs.weights["900"];
  const unit = size / fontTable.unitsPerEm;
  const spaceAdvance = size * 0.34;
  const glyphEntries = [];
  let cursor = 0;

  for (let i = 0; i < cleanText.length; i += 1) {
    const ch = cleanText[i];
    if (/\s/.test(ch)) {
      cursor += spaceAdvance;
      continue;
    }
    const g = fontTable.glyphs[ch] || fontTable.glyphs[ch.toUpperCase()];
    let geometry;
    let adv;
    if (g) {
      const shapes = glyphContoursToShapes(g, unit);
      geometry = new THREE.ExtrudeGeometry(shapes, {
        depth,
        bevelEnabled: bevelSize > 0,
        bevelSize,
        bevelThickness,
        bevelSegments,
        curveSegments: 12,
      });
      geometry.translate(0, 0, -depth * 0.5);
      geometry.computeVertexNormals();
      adv = g.advance * unit;
    } else if (fallbackFont && typeof fallbackFont.generateShapes === "function") {
      geometry = new THREE.ExtrudeGeometry(fallbackFont.generateShapes(ch, size * 0.72), {
        depth,
        curveSegments: 6,
        bevelEnabled: bevelSize > 0,
        bevelSize,
        bevelThickness,
        bevelSegments,
      });
      geometry.translate(0, 0, -depth * 0.5);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      adv = (geometry.boundingBox.max.x - geometry.boundingBox.min.x) + size * 0.12;
    } else {
      cursor += spaceAdvance;
      continue;
    }
    glyphEntries.push({ char: ch, index: i, geometry, x: cursor });
    cursor += adv + (i < cleanText.length - 1 ? size * letterSpacing : 0);
  }

  let minX = Infinity;
  let maxX = -Infinity;
  glyphEntries.forEach(entry => {
    entry.geometry.computeBoundingBox();
    const box = entry.geometry.boundingBox;
    minX = Math.min(minX, entry.x + box.min.x);
    maxX = Math.max(maxX, entry.x + box.max.x);
  });
  const totalWidth = Number.isFinite(maxX - minX) && maxX > minX ? maxX - minX : 1;
  const centerShift = (minX + maxX) * 0.5;
  glyphEntries.forEach(entry => {
    entry.x -= centerShift;
  });
  return { glyphs: glyphEntries, totalWidth };
}

/**
 * Extrude crisp Inter Black/SemiBold typography and merge all glyph buffers
 * into one single aligned THREE.BufferGeometry for general 3D title/callout meshes.
 */
export function buildMergedInterTextGeometry(text, options = {}) {
  const { textAlign = "center", ...glyphOptions } = options;
  const { glyphs, totalWidth } = buildInterWordmarkGlyphs(text, glyphOptions);
  if (!glyphs.length) {
    return new THREE.BufferGeometry();
  }

  const alignOffset =
    textAlign === "left" ? totalWidth * 0.5 : textAlign === "right" ? -totalWidth * 0.5 : 0;

  const chunks = [];
  let totalVerts = 0;
  for (const entry of glyphs) {
    const geom = entry.geometry.index ? entry.geometry.toNonIndexed() : entry.geometry;
    geom.translate(entry.x + alignOffset, 0, 0);
    const pos = geom.getAttribute("position");
    const norm = geom.getAttribute("normal");
    const uv = geom.getAttribute("uv");
    if (pos) {
      totalVerts += pos.count;
      chunks.push({ pos, norm, uv, count: pos.count });
    }
    if (geom !== entry.geometry) geom.dispose();
    entry.geometry.dispose();
  }

  const merged = new THREE.BufferGeometry();
  if (!totalVerts) return merged;

  const posArr = new Float32Array(totalVerts * 3);
  const normArr = new Float32Array(totalVerts * 3);
  const uvArr = new Float32Array(totalVerts * 2);
  let offset3 = 0;
  let offset2 = 0;
  for (const chunk of chunks) {
    posArr.set(chunk.pos.array, offset3);
    if (chunk.norm) normArr.set(chunk.norm.array, offset3);
    if (chunk.uv) uvArr.set(chunk.uv.array, offset2);
    offset3 += chunk.count * 3;
    offset2 += chunk.count * 2;
  }

  merged.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normArr, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Extrude an architectural bevelled chamfered monolith chassis frame + blade wings
 * for custom 3D brand crests without primitive wireframe rings.
 */
export function buildSculpturalCrestGeometries(radius = 1.25) {
  // Precision chamfered diamond/hexagonal architectural outer shroud
  const outerShape = new THREE.Shape();
  const R = radius;
  outerShape.moveTo(0, R * 1.12);
  outerShape.lineTo(R * 0.96, R * 0.42);
  outerShape.lineTo(R * 0.82, -R * 0.62);
  outerShape.lineTo(0, -R * 1.12);
  outerShape.lineTo(-R * 0.82, -R * 0.62);
  outerShape.lineTo(-R * 0.96, R * 0.42);
  outerShape.closePath();

  const innerHole = new THREE.Path();
  const r = radius * 0.78;
  innerHole.moveTo(0, r * 1.08);
  innerHole.lineTo(-r * 0.92, r * 0.4);
  innerHole.lineTo(-r * 0.78, -r * 0.58);
  innerHole.lineTo(0, -r * 1.08);
  innerHole.lineTo(r * 0.78, -r * 0.58);
  innerHole.lineTo(r * 0.92, r * 0.4);
  innerHole.closePath();
  outerShape.holes.push(innerHole);

  const shieldBezel = new THREE.ExtrudeGeometry(outerShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelSize: 0.036,
    bevelThickness: 0.032,
    bevelSegments: 4,
  });
  shieldBezel.translate(0, 0, -0.12);
  shieldBezel.computeVertexNormals();

  // Aerospace swept chevron wing fin (mirrored for left/right turbine chassis)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.95, 0.42);
  wingShape.lineTo(2.15, 0.78);
  wingShape.lineTo(1.88, 0.14);
  wingShape.lineTo(1.22, -0.45);
  wingShape.lineTo(0.84, -0.18);
  wingShape.closePath();

  const rightWing = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.024,
    bevelSegments: 3,
  });
  rightWing.translate(0, 0, -0.07);
  rightWing.computeVertexNormals();

  const leftShape = new THREE.Shape();
  leftShape.moveTo(-0.95, 0.42);
  leftShape.lineTo(-0.84, -0.18);
  leftShape.lineTo(-1.22, -0.45);
  leftShape.lineTo(-1.88, 0.14);
  leftShape.lineTo(-2.15, 0.78);
  leftShape.closePath();

  const leftWing = new THREE.ExtrudeGeometry(leftShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.024,
    bevelSegments: 3,
  });
  leftWing.translate(0, 0, -0.07);
  leftWing.computeVertexNormals();

  return { shieldBezel, leftWing, rightWing };
}

function mapPoint2D(x, y, transform, offsetX, offsetY, scale) {
  const [a, b, c, d, e, f] = transform;
  return new THREE.Vector2(
    (a * x + c * y + e + offsetX) * scale,
    -(b * x + d * y + f + offsetY) * scale
  );
}

function remapPath2D(curvePath, transform, offsetX, offsetY, scale) {
  const pts = curvePath.getPoints(18).map(p => mapPoint2D(p.x, p.y, transform, offsetX, offsetY, scale));
  if (pts.length >= 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) {
    pts.pop();
  }
  return pts;
}

function area2D(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

/**
 * Convert an SVG path string + 2D affine matrix from autopromote-vector-logo.json
 * into extruded, bevelled Three.js geometry in Y-up world coordinates.
 */
export function extrudeBrandSvgPart(pathData, transform, offsetX, offsetY, scale, extrudeOptions) {
  const parsed = svgLoader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${pathData}"/></svg>`);
  if (!parsed.paths.length) return new THREE.BufferGeometry();
  const rawShapes = parsed.paths[0].toShapes();
  const shapes = rawShapes.map(raw => {
    const outerPts = remapPath2D(raw, transform, offsetX, offsetY, scale);
    // Ensure CCW winding for Three.js Y-up front face after matrix reflection
    if (area2D(outerPts) < 0) outerPts.reverse();
    const shape = new THREE.Shape(outerPts);
    for (const hole of raw.holes || []) {
      const holePts = remapPath2D(hole, transform, offsetX, offsetY, scale);
      // Holes must be CW (negative signed area) relative to CCW outer contour
      if (area2D(holePts) > 0) holePts.reverse();
      shape.holes.push(new THREE.Path(holePts));
    }
    return shape;
  });
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    curveSegments: 16,
    bevelEnabled: (extrudeOptions.bevelSize || 0) > 0,
    ...extrudeOptions,
  });
  geometry.computeVertexNormals();
  return geometry;
}

/** Extract a concise 1-2 character sculptural monogram from any brand name. */
export function extractBrandMonogram(brandText) {
  const cleaned = String(brandText || "").trim();
  if (!cleaned) return "A";
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  const camel = words[0].replace(/([a-z])([A-Z])/g, "$1 $2").split(" ");
  if (camel.length >= 2) {
    return (camel[0][0] + camel[1][0]).toUpperCase();
  }
  return words[0].slice(0, 1).toUpperCase();
}

/** Generate a wide anamorphic horizontal lens-streak texture for 3D impact glints. */
export function createAnamorphicStreakTexture(glowColor = "#00d7fa") {
  const width = 512;
  const height = 128;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const c = new THREE.Color(glowColor);
  const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;

  // Outer stretched cyan/brand glow ellipse tapering smoothly to zero before edges
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(1, (height / width) * 0.9);
  const outer = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 0.48);
  outer.addColorStop(0, "rgba(255,255,255,0.95)");
  outer.addColorStop(0.16, `rgba(${rgb}, 0.65)`);
  outer.addColorStop(0.5, `rgba(${rgb}, 0.16)`);
  outer.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(0, 0, width * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Thin crisp horizontal core filament
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(1, (height / width) * 0.24);
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 0.46);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.35, `rgba(${rgb}, 0.72)`);
  core.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, width * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Build a smooth closed 3D elliptical orbital filament path around a target center. */
export function buildOrbitalRibbonTube(radiusX, radiusY, radiusZ, phaseOffset, centerY, tubeRadius) {
  const points = [];
  const steps = 64;
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        radiusX * Math.cos(angle),
        centerY + radiusY * Math.sin(angle + phaseOffset),
        radiusZ * Math.sin(angle)
      )
    );
  }
  const curve = new THREE.CatmullRomCurve3(points, true);
  return new THREE.TubeGeometry(curve, 144, tubeRadius, 10, true);
}

/** Generate a soft radial glow texture for volumetric 3D bokeh/spark dust motes. */
export function createGlowBokehTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.28, "rgba(220,235,255,0.75)");
  grad.addColorStop(0.62, "rgba(168,85,247,0.22)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
