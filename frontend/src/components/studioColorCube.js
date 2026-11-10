const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));

export const CINEMA_3D_LUT_PRESETS = [
  { id: "kodak_2383", label: "Film Print 2383 (Warm High-Contrast)" },
  { id: "teal_amber", label: "Teal & Amber Blockbuster" },
  { id: "bleach_bypass", label: "Silver Bleach Bypass" },
  { id: "neon_nocturne", label: "Cyber Nocturne (Magenta/Cyan)" },
  { id: "golden_hour", label: "Luminous Golden Hour" },
  { id: "crisp_rec709", label: "Studio Rec.709 Crisp" },
];

export function buildProceduralColorCube(presetId, size = 17) {
  const preset = CINEMA_3D_LUT_PRESETS.find(item => item.id === presetId);
  if (!preset) return null;
  const n = Math.max(2, Math.min(33, Number(size) || 17));
  const data = [];
  const sCurve = (x, amount = 1.2) => {
    const v = clamp(x);
    return clamp(0.5 + Math.tanh((v - 0.5) * amount * 2) / (2 * Math.tanh(amount)));
  };
  for (let bIdx = 0; bIdx < n; bIdx += 1) {
    for (let gIdx = 0; gIdx < n; gIdx += 1) {
      for (let rIdx = 0; rIdx < n; rIdx += 1) {
        let r = rIdx / (n - 1);
        let g = gIdx / (n - 1);
        let b = bIdx / (n - 1);
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const shadowWeight = Math.pow(1 - luma, 1.6);
        const highlightWeight = Math.pow(luma, 1.4);

        if (presetId === "kodak_2383") {
          r = sCurve(r, 1.35) + highlightWeight * 0.045 - shadowWeight * 0.025;
          g = sCurve(g, 1.32) + highlightWeight * 0.015;
          b = sCurve(b, 1.28) + shadowWeight * 0.04 - highlightWeight * 0.03;
        } else if (presetId === "teal_amber") {
          r = sCurve(r, 1.22) + highlightWeight * 0.06 - shadowWeight * 0.045;
          g = sCurve(g, 1.18) + shadowWeight * 0.015 + highlightWeight * 0.01;
          b = sCurve(b, 1.2) + shadowWeight * 0.065 - highlightWeight * 0.05;
        } else if (presetId === "bleach_bypass") {
          const contrastedLuma = sCurve(luma, 1.55);
          r = sCurve(r, 1.45) * 0.48 + contrastedLuma * 0.52;
          g = sCurve(g, 1.45) * 0.48 + contrastedLuma * 0.52;
          b = sCurve(b, 1.48) * 0.52 + contrastedLuma * 0.48 + shadowWeight * 0.02;
        } else if (presetId === "neon_nocturne") {
          r = sCurve(r, 1.25) + highlightWeight * 0.055 + shadowWeight * 0.02;
          g = sCurve(g, 1.18) - shadowWeight * 0.03 + highlightWeight * 0.01;
          b = sCurve(b, 1.32) + shadowWeight * 0.075 + highlightWeight * 0.04;
        } else if (presetId === "golden_hour") {
          r = sCurve(r, 1.15) + highlightWeight * 0.07 + 0.02;
          g = sCurve(g, 1.12) + highlightWeight * 0.035 + 0.008;
          b = sCurve(b, 1.1) - highlightWeight * 0.04 - shadowWeight * 0.015;
        } else if (presetId === "crisp_rec709") {
          const satBoost = 1.16;
          r = sCurve(luma + (r - luma) * satBoost, 1.2);
          g = sCurve(luma + (g - luma) * satBoost, 1.2);
          b = sCurve(luma + (b - luma) * satBoost, 1.2);
        }

        data.push(
          Number(clamp(r).toFixed(6)),
          Number(clamp(g).toFixed(6)),
          Number(clamp(b).toFixed(6))
        );
      }
    }
  }
  return {
    size: n,
    data,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    presetId,
    title: preset.label,
  };
}

export function parseColorCube(text) {
  let size = 0;
  const data = [];
  let domainMin = [0, 0, 0], domainMax = [1, 1, 1];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line || /^TITLE\s/i.test(line)) continue;
    const [key, ...values] = line.split(/\s+/);
    if (key === "LUT_3D_SIZE") size = Number(values[0]);
    else if (key === "DOMAIN_MIN") domainMin = values.map(Number);
    else if (key === "DOMAIN_MAX") domainMax = values.map(Number);
    else {
      const row = line.split(/\s+/).map(Number);
      if (row.length !== 3 || row.some(value => !Number.isFinite(value))) throw new Error("Only valid 3D .cube LUTs are supported.");
      data.push(...row);
    }
  }
  if (!Number.isInteger(size) || size < 2 || size > 65 || data.length !== size ** 3 * 3 ||
      domainMin.length !== 3 || domainMax.length !== 3 || domainMin.some((value, i) =>
        !Number.isFinite(value) || !Number.isFinite(domainMax[i]) || domainMax[i] <= value)) {
    throw new Error("The LUT must contain a complete 2–65 point 3D cube and a valid domain.");
  }
  return { size, data, domainMin, domainMax };
}

// .cube stores red fastest, then green, then blue. Match FFmpeg trilinear sampling.
export function sampleColorCube(cube, r, g, b, output = [0, 0, 0]) {
  const n = cube.size, max = n - 1;
  const x = clamp(r) * max, y = clamp(g) * max, z = clamp(b) * max;
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const x1 = Math.min(max, x0+1), y1 = Math.min(max, y0+1), z1 = Math.min(max, z0+1);
  const dx = x-x0, dy = y-y0, dz = z-z0, data = cube.data;
  const i000 = ((z0*n+y0)*n+x0)*3, i100 = ((z0*n+y0)*n+x1)*3;
  const i010 = ((z0*n+y1)*n+x0)*3, i110 = ((z0*n+y1)*n+x1)*3;
  const i001 = ((z1*n+y0)*n+x0)*3, i101 = ((z1*n+y0)*n+x1)*3;
  const i011 = ((z1*n+y1)*n+x0)*3, i111 = ((z1*n+y1)*n+x1)*3;
  for (let c = 0; c < 3; c++) {
    const a = data[i000+c]*(1-dx)+data[i100+c]*dx;
    const b0 = data[i010+c]*(1-dx)+data[i110+c]*dx;
    const d = data[i001+c]*(1-dx)+data[i101+c]*dx;
    const e = data[i011+c]*(1-dx)+data[i111+c]*dx;
    output[c] = (a*(1-dy)+b0*dy)*(1-dz)+(d*(1-dy)+e*dy)*dz;
  }
  return output;
}

export function hasAdvancedGrade(advanced = {}) {
  const lutObj = advanced.lutData || advanced.lut;
  const intensity = Number(advanced.lutIntensity ?? 100);
  return (!!lutObj && intensity > 0) ||
    [...Object.values(advanced.curve || {}), ...Object.values(advanced.hsl || {})].some(value => Number(value) !== 0);
}

export function buildAdvancedColorCube(advanced = {}, size = 33) {
  if (!hasAdvancedGrade(advanced)) return null;
  const c = advanced.curve || {}, hsl = advanced.hsl || {};
  const normCurveVal = v => {
    const num = Number(v || 0);
    return Math.abs(num) > 0 && Math.abs(num) <= 1 ? num * 100 : num;
  };
  const knots = [0, clamp(.25 + normCurveVal(c.shadows)/500), clamp(.5 + normCurveVal(c.midtones)/500),
    clamp(.75 + normCurveVal(c.highlights)/500), 1];
  const curve = value => {
    const position = clamp(value)*4, lo = Math.min(3, Math.floor(position)), mix = position-lo;
    return knots[lo]*(1-mix)+knots[lo+1]*mix;
  };
  const hue = Number(hsl.hue || 0)/200; // -180 to +180 degrees
  const saturation = 1+Number(hsl.saturation || 0)/100;
  const luminance = Number(hsl.luminance || 0)/200;
  const cube = { size, data: [] }, imported = advanced.lutData || advanced.lut;
  const rawIntensity = Number(advanced.lutIntensity ?? 100);
  const strength = imported ? clamp(rawIntensity > 0 && rawIntensity <= 1 ? rawIntensity : rawIntensity/100) : 0;
  for (let blue = 0; blue < size; blue++) for (let green = 0; green < size; green++) for (let red = 0; red < size; red++) {
    let rgb = [curve(red/(size-1)), curve(green/(size-1)), curve(blue/(size-1))];
    const high = Math.max(...rgb), low = Math.min(...rgb), delta = high-low;
    let light = (high+low)/2, sat = delta === 0 ? 0 : delta/(1-Math.abs(2*light-1));
    let angle = delta === 0 ? 0 : high === rgb[0] ? ((rgb[1]-rgb[2])/delta)%6 : high === rgb[1] ? (rgb[2]-rgb[0])/delta+2 : (rgb[0]-rgb[1])/delta+4;
    angle = ((angle/6+hue)%1+1)%1;
    light = clamp(light+luminance); sat = clamp(sat*saturation);
    const chroma = (1-Math.abs(2*light-1))*sat, secondary = chroma*(1-Math.abs((angle*6)%2-1)), m = light-chroma/2;
    rgb = [[chroma,secondary,0],[secondary,chroma,0],[0,chroma,secondary],[0,secondary,chroma],[secondary,0,chroma],[chroma,0,secondary]][Math.min(5,Math.floor(angle*6))].map(v => v+m);
    if (strength) {
      const input = rgb.map((value,i) => (value-(imported.domainMin?.[i] ?? 0))/((imported.domainMax?.[i] ?? 1)-(imported.domainMin?.[i] ?? 0)));
      const mapped = sampleColorCube(imported, ...input);
      rgb = rgb.map((value,i) => value*(1-strength)+mapped[i]*strength);
    }
    cube.data.push(...rgb.map(value => Number(clamp(value).toFixed(7))));
  }
  return cube;
}

const separableCubes = new WeakMap();
function separableColorTables(cube) {
  const cached = separableCubes.get(cube);
  if (cached?.data === cube.data && cached.size === cube.size) return cached.tables;
  const n = cube.size, data = cube.data;
  let separable = true;
  // Canonical cubes are immutable. A channel-independent LUT has exactly the
  // same trilinear result as three one-dimensional byte lookup tables.
  for (let b = 0; b < n && separable; b++) for (let g = 0; g < n && separable; g++) for (let r = 0; r < n; r++) {
    const i = ((b*n+g)*n+r)*3;
    if (data[i] !== data[r*3] || data[i+1] !== data[g*n*3+1] || data[i+2] !== data[b*n*n*3+2]) {
      separable = false; break;
    }
  }
  const tables = separable ? [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)] : null;
  if (tables) for (let i = 0; i < 256; i++) {
    tables[0][i] = sampleColorCube(cube, i/255, 0, 0)[0]*255;
    tables[1][i] = sampleColorCube(cube, 0, i/255, 0)[1]*255;
    tables[2][i] = sampleColorCube(cube, 0, 0, i/255)[2]*255;
  }
  separableCubes.set(cube, {data, size:n, tables});
  return tables;
}

export function applyColorCube(pixels, cube) {
  const tables = separableColorTables(cube);
  if (tables) {
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = tables[0][pixels[i]]; pixels[i+1] = tables[1][pixels[i+1]]; pixels[i+2] = tables[2][pixels[i+2]];
    }
    return pixels;
  }
  const output = [0, 0, 0];
  for (let i = 0; i < pixels.length; i += 4) {
    sampleColorCube(cube, pixels[i]/255, pixels[i+1]/255, pixels[i+2]/255, output);
    pixels[i] = output[0]*255; pixels[i+1] = output[1]*255; pixels[i+2] = output[2]*255;
  }
  return pixels;
}
