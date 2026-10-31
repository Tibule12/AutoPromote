import { parseColorCube, buildAdvancedColorCube, applyColorCube, sampleColorCube } from "../studioColorCube";

const identity = "TITLE \"Identity\"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1";

test("valid .cube parses, samples red-fastest order and survives JSON project persistence", () => {
  const lutData = JSON.parse(JSON.stringify(parseColorCube(identity)));
  expect(sampleColorCube(lutData, .2, .4, .8)).toEqual([.2, .4, .8]);
  const cube = buildAdvancedColorCube({ lutData, lutIntensity: 100 });
  const pixels = new Uint8ClampedArray([120, 75, 50, 255]);
  expect(applyColorCube(pixels.slice(), cube)).toEqual(pixels);
});

test("rejects invalid, incomplete, 1D and nonfinite LUTs", () => {
  for (const text of ["LUT_1D_SIZE 2", "LUT_3D_SIZE 33\n0 0 0", identity.replace("0 0 0", "NaN 0 0"),
    identity+"\nDOMAIN_MIN 1 0 0\nDOMAIN_MAX 0 1 1"]) expect(() => parseColorCube(text)).toThrow();
});

test('separable and cross-channel LUT pixels retain the trilinear reference across byte values', () => {
  const warm = parseColorCube(identity);
  warm.data = warm.data.map((value, index) => index % 3 === 0 ? .01 + value*.98 : index % 3 === 1 ? value*.98 : .01+value*.94);
  const cross = buildAdvancedColorCube({ hsl: { hue: 17, saturation: -20 }, curve: { midtones: 12 } }, 9);
  for (const cube of [warm, cross]) {
    const input = new Uint8ClampedArray(4096*4);
    for (let i=0;i<input.length;i+=4) {
      input[i]=(i/4)%256; input[i+1]=(i*17+3)%256; input[i+2]=(i*43+79)%256; input[i+3]=(i*7)%256;
    }
    const reference=input.slice();
    for(let i=0;i<reference.length;i+=4) {
      const rgb=sampleColorCube(cube, input[i]/255,input[i+1]/255,input[i+2]/255);
      for(let c=0;c<3;c++) reference[i+c]=rgb[c]*255;
    }
    expect(applyColorCube(input.slice(),cube)).toEqual(reference);
  }
});

test("curve, global HSL and LUT mix produce actual pixel changes", () => {
  const pixels = new Uint8ClampedArray([90, 55, 35, 255]);
  const curve = buildAdvancedColorCube({ curve: { midtones: 50 } });
  expect(applyColorCube(pixels.slice(), curve)[0]).toBeGreaterThan(90);
  const desaturate = buildAdvancedColorCube({ hsl: { saturation: -100 } });
  const gray = applyColorCube(pixels.slice(), desaturate);
  expect(gray[0]).toBe(gray[1]); expect(gray[1]).toBe(gray[2]);
  const inverted = parseColorCube(identity);
  inverted.data = inverted.data.map(value => 1-value);
  const half = buildAdvancedColorCube({ lutData: inverted, lutIntensity: 50 });
  const mixed = applyColorCube(pixels.slice(), half);
  expect(mixed[0]).toBe(128); expect(mixed[1]).toBe(128); expect(mixed[2]).toBe(128);
  expect(buildAdvancedColorCube({ curve: { shadows: 0 }, hsl: { hue: 0 } })).toBeNull();
});
