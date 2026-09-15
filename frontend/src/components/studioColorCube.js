const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));

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
  return (!!advanced.lutData && advanced.lutIntensity > 0) ||
    [...Object.values(advanced.curve || {}), ...Object.values(advanced.hsl || {})].some(value => Number(value) !== 0);
}

export function buildAdvancedColorCube(advanced = {}, size = 33) {
  if (!hasAdvancedGrade(advanced)) return null;
  const c = advanced.curve || {}, hsl = advanced.hsl || {};
  const knots = [0, clamp(.25 + Number(c.shadows || 0)/500), clamp(.5 + Number(c.midtones || 0)/500),
    clamp(.75 + Number(c.highlights || 0)/500), 1];
  const curve = value => {
    const position = clamp(value)*4, lo = Math.min(3, Math.floor(position)), mix = position-lo;
    return knots[lo]*(1-mix)+knots[lo+1]*mix;
  };
  const hue = Number(hsl.hue || 0)/200; // -180 to +180 degrees
  const saturation = 1+Number(hsl.saturation || 0)/100;
  const luminance = Number(hsl.luminance || 0)/200;
  const cube = { size, data: [] }, imported = advanced.lutData;
  const strength = imported ? clamp(Number(advanced.lutIntensity ?? 100)/100) : 0;
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

export function applyColorCube(pixels, cube) {
  const output = [0, 0, 0];
  for (let i = 0; i < pixels.length; i += 4) {
    sampleColorCube(cube, pixels[i]/255, pixels[i+1]/255, pixels[i+2]/255, output);
    pixels[i] = output[0]*255; pixels[i+1] = output[1]*255; pixels[i+2] = output[2]*255;
  }
  return pixels;
}
