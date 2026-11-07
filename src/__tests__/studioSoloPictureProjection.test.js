const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  studioSoloPictureProjection,
} = require("../../frontend/src/components/studioSoloPictureProjection");

test("solo preview projects the canonical source, Director crop and inset frame in their actual order", () => {
  const cases = [
    { x: 0.74, zoom: 1, directorZoom: 1.099, inset: 2.5 },
    { x: 0.27, zoom: 1.45, directorZoom: 1.102, inset: 5 },
    { x: 0.82, zoom: 1.1, directorZoom: 1, inset: 0 },
  ];
  const python = `
import json,sys,subprocess,tempfile
from pathlib import Path
import numpy as np
from PIL import Image
from python_media_worker.test_cpu_reference import load_worker_cpu_reference
worker=load_worker_cpu_reference('build_reframe_segment_filter','build_main_video_frame_filter')
build_reframe_segment_filter=worker['build_reframe_segment_filter']
build_main_video_frame_filter=worker['build_main_video_frame_filter']
out=[]
with tempfile.TemporaryDirectory() as d:
 for item in json.loads(sys.argv[1]):
  # A single real source marker; its centre independently exposes the actual
  # worker's crop translation, rather than echoing a JS projection formula.
  centre=round(640+(item['x']-.5)*880)
  pixels=np.zeros((720,1280,3),dtype=np.uint8);pixels[350:371,centre-10:centre+11]=255
  source=str(Path(d)/'source.png');Image.fromarray(pixels).save(source)
  graph=build_reframe_segment_filter(1280,720,720,1280,{'mode':'speaker_track','zoom':item['directorZoom'],
   'solo_keyframes':[{'time':0,'x':item['x']*100,'y':50}]},item['zoom'])
  frame={'main_frame':{'enabled':item['inset']>0,'inset_percent':item['inset'],'border_radius_percent':10}}
  last=build_main_video_frame_filter(frame,720,1280)
  if last:graph+=';'+last.replace('[0:v]','[vout]');label='[v_main_frame]'
  else:label='[vout]'
  raw=subprocess.check_output(['ffmpeg','-v','error','-loop','1','-i',source,'-filter_complex_threads','1',
   '-filter_complex',graph,'-map',label,'-frames:v','1','-threads','2','-pix_fmt','rgb24','-f','rawvideo','-'])
  image=np.frombuffer(raw,np.uint8).reshape(1280,720,3);ys,xs=np.where(image.min(axis=2)>220)
  if len(xs)<5:raise ValueError('Marker not visible')
  out.append({'sourceX':centre,'sourceY':360,'x':float(xs.mean()),'y':float(ys.mean())})
print(json.dumps(out))
`;
  const reference = JSON.parse(
    execFileSync(
      process.env.STUDIO_AUDIO_PREVIEW_PYTHON || "python3",
      ["-c", python, JSON.stringify(cases)],
      {
        cwd: path.resolve(__dirname, "../.."),
        encoding: "utf8",
        env: {
          ...process.env,
          CUDA_VISIBLE_DEVICES: "",
          OMP_NUM_THREADS: "1",
          OPENBLAS_NUM_THREADS: "1",
        },
      }
    )
  );
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i],
      inset = Math.round((720 * item.inset) / 100),
      innerWidth = (720 - 2 * inset) & ~1,
      innerHeight = (1280 - 2 * inset) & ~1;
    const projection = studioSoloPictureProjection({
      sourceWidth: 1280,
      sourceHeight: 720,
      canvasWidth: innerWidth,
      canvasHeight: innerHeight,
      aspect: "9:16",
      resolution: "720p",
      x: item.x,
      y: 0.5,
      zoom: item.zoom,
      directorZoom: item.directorZoom,
      frame: { enabled: item.inset > 0, insetPercent: item.inset },
    });
    expect(
      Math.abs(
        inset + projection.x + (reference[i].sourceX / 1280) * projection.width - reference[i].x
      )
    ).toBeLessThan(2);
    expect(
      Math.abs(
        inset + projection.y + (reference[i].sourceY / 720) * projection.height - reference[i].y
      )
    ).toBeLessThan(2);
  }
}, 30000);
