const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { applyPrecisionVignette } = require('../../frontend/src/components/studioPrecisionGrade');

test.each([.08, .4, .85])('precision vignette matches actual canonical YUV finishing at strength %s', strength => {
  const width = 64, height = 96;
  const python = `
import subprocess,sys,re
from python_media_worker.test_cpu_reference import load_worker_cpu_reference
build_studio_finish_filter=load_worker_cpu_reference('build_studio_finish_filter')['build_studio_finish_filter']
w,h=64,96
finish=build_studio_finish_filter({'enabled':True,'color':{'precisionGrade':True,'vignette':float(sys.argv[1])}})
graph=re.search(r'vignette=angle=PI/[0-9.]+:eval=frame',finish).group(0)
# Start both projections from the same actual limited-range YUV surface.
# Grade LUT quantisation is a separate stage, not a vignette tolerance.
source=bytes([112])*w*h+bytes([98])*(w*h//4)+bytes([165])*(w*h//4)
for filters in ['null',graph]:
 sys.stdout.buffer.write(subprocess.check_output(['ffmpeg','-v','error','-f','rawvideo','-pix_fmt','yuv420p',
  '-s',f'{w}x{h}','-color_range','tv','-colorspace','bt709','-i','pipe:0','-filter_threads','1',
  '-vf',filters,'-frames:v','1','-threads','2','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],input=source))
`;
  const frames = execFileSync(process.env.STUDIO_AUDIO_PREVIEW_PYTHON || 'python3',
    ['-c', python, String(strength)], { cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, CUDA_VISIBLE_DEVICES: '', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' } });
  const reference = frames.subarray(width*height*3);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width*height; p++) pixels.set([...frames.subarray(p*3,p*3+3),255],p*4);
  applyPrecisionVignette(pixels, width, height, strength);
  let maximum = 0, squareError = 0;
  for (let p = 0; p < width * height; p++) for (let c = 0; c < 3; c++) {
    const error = pixels[p * 4 + c] - reference[p * 3 + c];
    maximum = Math.max(maximum, Math.abs(error)); squareError += error * error;
  }
  expect(maximum).toBeLessThanOrEqual(4);
  expect(Math.sqrt(squareError / (width * height * 3))).toBeLessThan(2);
});
